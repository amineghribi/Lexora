"""
medset_session.py - ONE long-lived session: log in once, never close the browser.

Run:   python medset_session.py
Then:  log in in the window (new token) and leave it open - everything else is automatic.
       Optional commands in THIS terminal (the browser window stays open):

  status      what has been captured, how many quizzes exist, template found?
  test        re-download the quiz you opened and compare with what the site loaded
  dl 20       download the next 20 missing quizzes   (dl all = everything)
  quit        close the browser (this ends the login - only do it when finished)

AUTO MODE: once you are logged in it works out the quiz request by itself (reads the
site's own JS + tests request shapes) and downloads everything. No clicking on quizzes. Progress: session_data/log.txt
To pause: create an empty file session_data/STOP.

Downloads go to session_data/downloads/<J>/<speciality>/<topic>/<year>_<exam>_<mode>.json
Re-running dl skips files that already exist, so you can stop and continue.
Credentials are kept in memory only; saved request files have them masked.
"""

import csv
import hashlib
import json
import queue
import random
import re
import sys
import threading
from pathlib import Path
from urllib.parse import urlparse, parse_qsl, urlencode, unquote, quote

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
PROFILE = HERE / "medset_profile"
DATA = HERE / "session_data"
CAP = DATA / "captured"
DL = DATA / "downloads"
BASE = "https://web.medset.tn/"

MASK_KEYS = {"token", "password", "pass", "pwd", "username", "user", "email"}
DROP_HEADERS = {"host", "content-length", "origin", "referer", "user-agent",
                "cookie", "connection", "accept-encoding", "accept-language"}
MODES = {"certified", "uncertified"}

CAP.mkdir(parents=True, exist_ok=True)
DL.mkdir(parents=True, exist_ok=True)

S = {"n": 0, "reqs": [], "quiz_list": None, "seen": set()}


# ───────────────────────── helpers ─────────────────────────
def mask(o):
    if isinstance(o, dict):
        return {k: ("***" if k.lower() in MASK_KEYS else mask(v)) for k, v in o.items()}
    if isinstance(o, list):
        return [mask(x) for x in o]
    return o


def mask_post(post):
    if not post:
        return post
    try:
        return json.dumps(mask(json.loads(post)), ensure_ascii=False)
    except Exception:
        return re.sub(r"((?:token|password|username)=)[^&]*", r"\1***", post, flags=re.I)


def count_records(b):
    if isinstance(b, list):
        return len(b)
    if isinstance(b, dict):
        for k in ("data", "results", "items", "records", "questions", "rows"):
            if isinstance(b.get(k), list):
                return len(b[k])
    return 0


def clean(s):
    return re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", s).strip(" .")[:80] or "_"


def enumerate_quizzes(ql):
    out = []
    for j, specs in (ql or {}).items():
        if not isinstance(specs, dict):
            continue
        for spec, topics in specs.items():
            if not isinstance(topics, dict):
                continue
            for topic, years in topics.items():
                if not isinstance(years, dict):
                    continue
                for year, exams in years.items():
                    if not isinstance(exams, list):
                        continue
                    for em in exams:
                        m = re.match(r"^(.*)-(certified|uncertified)$", str(em))
                        if m:
                            out.append(dict(j=j, spec=spec, topic=topic, year=str(year),
                                            exam=m.group(1), mode=m.group(2)))
    return out


def vocab(quizzes):
    return {
        "j": {q["j"] for q in quizzes}, "spec": {q["spec"] for q in quizzes},
        "topic": {q["topic"] for q in quizzes}, "year": {q["year"] for q in quizzes},
        "exam": {q["exam"] for q in quizzes}, "mode": set(MODES),
    }


def role_of(v, V):
    if not isinstance(v, str):
        return None
    for r in ("mode", "year", "exam", "spec", "topic", "j"):
        if v in V[r]:
            return r
    m = re.match(r"^(.*)-(certified|uncertified)$", v)
    if m and m.group(1) in V["exam"]:
        return "exam_mode"
    return None


def sub(v, q, V):
    if not isinstance(v, str):
        return v
    r = role_of(v, V)
    if r == "exam_mode":
        return f"{q['exam']}-{q['mode']}"
    if r:
        return q[r]
    for sep in ("|", "/"):
        if sep in v:
            parts = v.split(sep)
            if any(role_of(p, V) for p in parts):
                return sep.join(sub(p, q, V) for p in parts)
    return v


def sub_obj(o, q, V):
    if isinstance(o, dict):
        return {k: sub_obj(v, q, V) for k, v in o.items()}
    if isinstance(o, list):
        return [sub_obj(x, q, V) for x in o]
    if isinstance(o, bool):
        return o
    if isinstance(o, int) and str(o) in V["year"]:
        return int(q["year"])
    return sub(o, q, V)


def leaves(o):
    if isinstance(o, dict):
        for v in o.values():
            yield from leaves(v)
    elif isinstance(o, list):
        for v in o:
            yield from leaves(v)
    else:
        yield o


def roles_in_template(tpl, V):
    strings = [unquote(s) for s in urlparse(tpl["url"]).path.split("/")]
    strings += [v for _, v in parse_qsl(urlparse(tpl["url"]).query)]
    post = tpl.get("post")
    if post:
        try:
            strings += [x for x in leaves(json.loads(post))]
        except Exception:
            strings += [v for _, v in parse_qsl(post)]
    found = {}
    for s in strings:
        if isinstance(s, int):
            s = str(s)
        if not isinstance(s, str):
            continue
        for p in ([s] + re.split(r"[|/]", s)) if ("|" in s or "/" in s) else [s]:
            r = role_of(p, V)
            if r == "exam_mode":
                m = re.match(r"^(.*)-(certified|uncertified)$", p)
                found.setdefault("exam", m.group(1))
                found.setdefault("mode", m.group(2))
            elif r:
                found.setdefault(r, p)
    return found


def build(tpl, q, V):
    u = urlparse(tpl["url"])
    path = "/".join(quote(sub(unquote(s), q, V), safe="") for s in u.path.split("/"))
    query = urlencode([(k, sub(v, q, V)) for k, v in parse_qsl(u.query, keep_blank_values=True)])
    url = f"{u.scheme}://{u.netloc}{path}" + (f"?{query}" if query else "")
    body = None
    if tpl.get("post"):
        try:
            body = json.dumps(sub_obj(json.loads(tpl["post"]), q, V), ensure_ascii=False)
        except Exception:
            body = urlencode([(k, sub(v, q, V)) for k, v in parse_qsl(tpl["post"], keep_blank_values=True)])
    return url, body


def is_quiz_resp(r):
    return ((urlparse(r["url"]).hostname or "").endswith("medset.tn")
            and "quiz" in r["url"]
            and not re.search(r"quiz-list|exams-list|sessions", r["url"])
            and r["status"] == 200 and count_records(r["body"]) > 0)


def auth_req():
    c = [r for r in S["reqs"] if r["url"].rstrip("/").endswith("quiz/quiz-list") and r.get("post")]
    return c[-1] if c else None


def find_template():
    if S.get("probe_tpl"):
        return S["probe_tpl"]
    c = [r for r in S["reqs"] if is_quiz_resp(r)]
    return c[-1] if c else None


def quiz_path(q):
    return DL / clean(q["j"]) / clean(q["spec"]) / clean(q["topic"]) / f"{q['year']}_{clean(q['exam'])}_{q['mode']}.json"


# ───────────────────────── main ─────────────────────────
class Tee:
    def __init__(self, *streams):
        self.streams = streams

    def write(self, x):
        for st in self.streams:
            try:
                st.write(x)
                st.flush()
            except Exception:
                pass

    def flush(self):
        pass


def main():
    try:
        sys.stdout.reconfigure(errors="replace")
    except Exception:
        pass
    sys.stdout = Tee(sys.stdout, open(DATA / "log.txt", "a", encoding="utf-8"))
    stop_file = DATA / "STOP"
    if stop_file.exists():
        stop_file.unlink()
    auto = {"started": False}
    cmds = queue.Queue()

    def reader():
        while True:
            line = sys.stdin.readline()
            if not line:
                break
            cmds.put(line.strip())

    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            str(PROFILE), headless=False,
            viewport={"width": 1400, "height": 900}, locale="fr-TN")
        page = ctx.pages[0] if ctx.pages else ctx.new_page()

        def on_response(resp):
            try:
                req = resp.request
                if not (urlparse(resp.url).hostname or "").endswith("medset.tn"):
                    return
                if req.resource_type not in ("xhr", "fetch"):
                    return
                if "json" not in (resp.headers.get("content-type") or ""):
                    return
                key = hashlib.sha1(f"{req.method}|{resp.url}|{req.post_data}".encode()).hexdigest()
                if key in S["seen"]:
                    return
                S["seen"].add(key)
                body = resp.json()
                rec = {"method": req.method, "url": resp.url, "post": req.post_data,
                       "headers": dict(req.headers), "status": resp.status, "body": body}
                S["reqs"].append(rec)
                if resp.url.rstrip("/").endswith("quiz/quiz-list") and isinstance(body, dict):
                    S["quiz_list"] = body.get("quiz_list")
                S["n"] += 1
                safe = {"request": {"method": req.method, "url": resp.url,
                                    "post": mask_post(req.post_data)},
                        "status": resp.status,
                        "body": None if "login" in resp.url else body}
                (CAP / f"{S['n']:04d}.json").write_text(
                    json.dumps(safe, ensure_ascii=False, indent=2), encoding="utf-8")
                print(f"  [seen] {req.method} {resp.url}  ({count_records(body)} records)")
            except Exception as e:
                print(f"  [warn] {e}")

        ctx.on("page", lambda pg: pg.on("response", on_response))
        page.on("response", on_response)
        page.goto(BASE)

        print(__doc__)
        print("  >>> Log in in the browser window now. Do NOT close it.\n")
        threading.Thread(target=reader, daemon=True).start()

        JS = """async ([url, method, headers, body]) => {
            try {
              const r = await fetch(url, {method, headers, body: body || undefined});
              const t = await r.text();
              return {status: r.status, text: t};
            } catch (e) { return {status: 0, text: String(e)}; } }"""

        def fetch_quiz(tpl, q, V):
            url, body = build(tpl, q, V)
            headers = {k: v for k, v in tpl["headers"].items()
                       if k.lower() not in DROP_HEADERS and not k.lower().startswith(("sec-", ":"))}
            return page.evaluate(JS, [url, tpl["method"], headers, body])

        def clean_headers(h):
            return {k: v for k, v in h.items()
                    if k.lower() not in DROP_HEADERS and not k.lower().startswith(("sec-", ":"))}

        def scan_js():
            try:
                snippets = page.evaluate("""async () => {
                    const urls = performance.getEntriesByType('resource').map(e => e.name)
                        .filter(u => /\\.js(\\?|$)/.test(u) && u.includes('medset'));
                    const out = [];
                    for (const u of [...new Set(urls)]) {
                        try {
                            const t = await (await fetch(u)).text();
                            const re = /.{0,200}(quiz|Quiz).{0,200}/g; let m, c = 0;
                            while ((m = re.exec(t)) && c < 12 && out.length < 120) { out.push(u + ' :: ' + m[0]); c++; }
                        } catch (e) {}
                    }
                    return out; }""")
                (DATA / "js_snippets.txt").write_text("\n".join(snippets), encoding="utf-8")
                print(f"  saved {len(snippets)} JS snippets to session_data/js_snippets.txt")
            except Exception as e:
                print(f"  [warn] JS scan failed: {e}")

        def probe():
            a = auth_req()
            quizzes = enumerate_quizzes(S["quiz_list"])
            if not a or not quizzes:
                return None
            try:
                auth = json.loads(a["post"])
            except Exception:
                return None
            q = quizzes[0]
            url = re.sub(r"quiz/quiz-list/?$", "quiz", a["url"])
            hdrs = clean_headers(a["headers"])
            pipe = f"{q['mode']}|{q['year']}|{q['exam']}|{q['spec']}|{q['topic']}"
            em = f"{q['exam']}-{q['mode']}"
            # Site code (main.js): getQuiz posts {username, token, path}; path = mode/year/exam/spec/topic
            cands = [{"path": f"{q['mode']}/{q['year']}/{q['exam']}/{q['spec']}/{q['topic']}"}]
            print(f"  PROBE: trying {len(cands)} request shapes on {url} with a known quiz "
                  f"({q['spec']} / {q['topic']} / {q['year']} {q['exam']}-{q['mode']})")
            for i, extra in enumerate(cands, 1):
                body = json.dumps({**auth, **extra}, ensure_ascii=False)
                r = page.evaluate(JS, [url, "POST", hdrs, body])
                parsed = None
                try:
                    parsed = json.loads(r["text"])
                except Exception:
                    pass
                n = count_records(parsed) if parsed is not None else 0
                ok = False
                if n:
                    rec = parsed if isinstance(parsed, list) else next(
                        (parsed[k] for k in ("data", "results", "items", "records", "questions", "rows")
                         if isinstance(parsed.get(k), list)), [])
                    ok = bool(rec) and isinstance(rec[0], dict) and any(
                        k in rec[0] for k in ("title", "rightAnswers", "question"))
                print(f"    [{i}/{len(cands)}] {list(extra.keys())} -> {r['status']} "
                      f"{n} records {'<== HIT' if ok else r['text'][:80].replace(chr(10), ' ')}")
                if ok:
                    print("  PROBE: found the working request shape.")
                    return {"method": "POST", "url": url, "post": body,
                            "headers": a["headers"], "status": 200, "body": parsed}
                page.wait_for_timeout(600)
            print("  PROBE: no shape worked - send me log.txt and js_snippets.txt.")
            return None

        def spa_goto(q):
            # In-app navigation (no page reload, so the in-memory login survives).
            path = "/quiz/{}/{}/{}/{}/{}".format(
                q["mode"], q["year"], quote(q["exam"], safe=""),
                quote(q["spec"], safe=""), quote(q["topic"], safe=""))
            page.evaluate("""(p) => { history.pushState({}, '', p);
                window.dispatchEvent(new PopStateEvent('popstate', {state: {}})); }""", path)

        def wait_new_quiz(before, secs=10):
            for _ in range(int(secs * 2)):
                page.wait_for_timeout(500)
                new = [r for r in S["reqs"][before:] if is_quiz_resp(r)]
                if new:
                    return new[-1]
            return None

        def save_quiz(q, data):
            path = quiz_path(q)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps({"meta": q, "questions": data}, ensure_ascii=False, indent=2),
                            encoding="utf-8")
            idx = DL / "_index.csv"
            new_idx = not idx.exists()
            with idx.open("a", newline="", encoding="utf-8-sig") as fh:
                w = csv.writer(fh)
                if new_idx:
                    w.writerow(["j", "spec", "topic", "year", "exam", "mode", "n_records"])
                w.writerow([q["j"], q["spec"], q["topic"], q["year"], q["exam"], q["mode"], count_records(data)])

        def cmd_nav(arg):
            quizzes = enumerate_quizzes(S["quiz_list"])
            if not quizzes:
                print("  Quiz list not captured yet.")
                return
            todo, keys = [], set()
            for q in quizzes:
                k = (q["spec"], q["topic"], q["year"], q["exam"], q["mode"])
                if k in keys:
                    continue
                keys.add(k)
                if not quiz_path(q).exists():
                    todo.append(q)
            todo = todo if arg == "all" else todo[: int(arg or 20)]
            print(f"  NAV: opening {len(todo)} quiz pages inside the app (slow but safe)...")
            fails = 0
            for i, q in enumerate(todo, 1):
                if stop_file.exists():
                    print("  STOP file found - paused.")
                    return
                before = len(S["reqs"])
                spa_goto(q)
                r = wait_new_quiz(before)
                if not r:
                    fails += 1
                    print(f"  [{i}/{len(todo)}] no response {q['spec']} / {q['topic']} / {q['year']} {q['exam']}-{q['mode']}")
                    if fails >= 3:
                        print("  3 in a row with no response -> stopped. Look at the browser: if it shows the login page, the session expired (log in again with a new token and rerun).")
                        return
                    continue
                fails = 0
                save_quiz(q, r["body"])
                print(f"  [{i}/{len(todo)}] ok {count_records(r['body']):>3} q  {q['spec']} / {q['topic']} / {q['year']} {q['exam']}-{q['mode']}")
                page.wait_for_timeout(int(random.uniform(800, 1800)))
            print("  nav batch finished.")

        def get_ctx():
            quizzes = enumerate_quizzes(S["quiz_list"])
            if not quizzes:
                print("  Quiz list not captured yet. Make sure you are logged in and the page that "
                      "lists specialities/quizzes has loaded (try opening one quiz).")
                return None
            tpl = find_template()
            if not tpl:
                print("  No quiz request seen yet. Open ONE quiz in the browser until its questions show.")
                return None
            return quizzes, vocab(quizzes), tpl

        def cmd_status():
            quizzes = enumerate_quizzes(S["quiz_list"])
            tpl = find_template()
            done = sum(1 for q in quizzes if quiz_path(q).exists())
            print(f"  calls seen: {S['n']} | quiz list: {'yes, ' + str(len(quizzes)) + ' quizzes' if quizzes else 'NOT yet'}"
                  f" | quiz template: {tpl['url'] if tpl else 'NOT yet'} | downloaded: {done}")

        def cmd_test():
            g = get_ctx()
            if not g:
                return False
            quizzes, V, tpl = g
            found = roles_in_template(tpl, V)
            need = ("spec", "topic", "year", "exam", "mode")
            print(f"  template: {tpl['method']} {tpl['url']}")
            print(f"  post (masked): {mask_post(tpl['post'])}")
            print(f"  roles found in it: {found}")
            if not all(k in found for k in need):
                print("  [!] Could not map every field (spec/topic/year/exam/mode). Send me this output.")
                return False
            q = next((x for x in quizzes if all(x[k] == found[k] for k in need)), None)
            if not q:
                print("  [!] That quiz is not in the quiz list. Send me this output.")
                return False
            r = fetch_quiz(tpl, q, V)
            try:
                n = count_records(json.loads(r["text"]))
            except Exception:
                n = -1
            ok = n == count_records(tpl["body"])
            print(f"  rebuilt request -> status {r['status']}, {n} records; the site itself loaded "
                  f"{count_records(tpl['body'])} records  ->  {'MATCH' if ok else 'MISMATCH, send me this output'}")
            return ok

        def cmd_dl(arg):
            g = get_ctx()
            if not g:
                return
            quizzes, V, tpl = g
            found = roles_in_template(tpl, V)
            has_j = "j" in found
            todo, seen_keys = [], set()
            for q in quizzes:
                k = (q["spec"], q["topic"], q["year"], q["exam"], q["mode"]) + ((q["j"],) if has_j else ())
                if k in seen_keys:
                    continue
                seen_keys.add(k)
                if not quiz_path(q).exists():
                    todo.append(q)
            limit = len(todo) if arg == "all" else int(arg or 20)
            todo = todo[:limit]
            print(f"  downloading {len(todo)} quizzes...")
            fails = 0
            idx = DL / "_index.csv"
            new_idx = not idx.exists()
            for i, q in enumerate(todo, 1):
                if stop_file.exists():
                    print("  STOP file found - paused. Type dl all to continue.")
                    return
                r = fetch_quiz(tpl, q, V)
                if r["status"] in (401, 403):
                    print(f"  [!] {r['status']}: session rejected. Stopped. (Browser stays open - log in again, then retry dl.)")
                    return
                try:
                    data = json.loads(r["text"])
                except Exception:
                    data = None
                if r["status"] != 200 or data is None:
                    fails += 1
                    print(f"  [{i}/{len(todo)}] FAIL {r['status']} {q['spec']} / {q['topic']} / {q['year']} {q['exam']}-{q['mode']}")
                    if fails >= 3:
                        print("  3 failures in a row -> stopped. Send me the last lines.")
                        return
                    continue
                fails = 0
                path = quiz_path(q)
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(json.dumps({"meta": q, "questions": data}, ensure_ascii=False, indent=2),
                                encoding="utf-8")
                n = count_records(data)
                with idx.open("a", newline="", encoding="utf-8-sig") as fh:
                    w = csv.writer(fh)
                    if new_idx:
                        w.writerow(["j", "spec", "topic", "year", "exam", "mode", "n_records"])
                        new_idx = False
                    w.writerow([q["j"], q["spec"], q["topic"], q["year"], q["exam"], q["mode"], n])
                print(f"  [{i}/{len(todo)}] ok {n:>3} q  {q['spec']} / {q['topic']} / {q['year']} {q['exam']}-{q['mode']}")
                page.wait_for_timeout(int(random.uniform(400, 1000)))
            left = sum(1 for q in quizzes if not quiz_path(q).exists())
            print(f"  batch finished. Still missing: {left}")

        while True:
            try:
                page.wait_for_timeout(300)
            except Exception:
                print("\n  Browser window was closed - session ended.")
                break
            if not auto["started"] and S["quiz_list"] and auth_req():
                auto["started"] = True
                page.wait_for_timeout(2500)
                print("\n  AUTO: logged in + quiz list captured -> working out the quiz request by itself...")
                try:
                    if not find_template():
                        S["probe_tpl"] = probe()
                    if not find_template():
                        qs0 = enumerate_quizzes(S["quiz_list"])
                        print("  AUTO: opening one quiz page inside the app (no reload) to see its request...")
                        before = len(S["reqs"])
                        spa_goto(qs0[0])
                        wait_new_quiz(before, 12)
                    if find_template():
                        if S.get("probe_tpl") or cmd_test():
                            print("  AUTO: fast download of everything (leave the window open).")
                            cmd_dl("all")
                        else:
                            print("  AUTO: fast replay did not match -> slower in-app navigation for everything.")
                            cmd_nav("all")
                    else:
                        print("  AUTO: no quiz request seen. Window stays open - send me session_data/log.txt.")
                except Exception as e:
                    print(f"  [error] {e}  (browser is still open)")
            try:
                line = cmds.get_nowait()
            except queue.Empty:
                continue
            parts = line.split()
            if not parts:
                continue
            try:
                if parts[0] == "status":
                    cmd_status()
                elif parts[0] == "test":
                    cmd_test()
                elif parts[0] == "dl":
                    cmd_dl(parts[1] if len(parts) > 1 else "20")
                elif parts[0] == "nav":
                    cmd_nav(parts[1] if len(parts) > 1 else "20")
                elif parts[0] == "quit":
                    break
                else:
                    print("  commands: status | test | dl [N|all] | nav [N|all] | quit")
            except Exception as e:
                print(f"  [error] {e}  (browser is still open)")

        try:
            ctx.close()
        except Exception:
            pass


if __name__ == "__main__":
    main()
