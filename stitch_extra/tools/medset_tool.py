"""
medset_tool.py - persistent-login capture tool for web.medset.tn

The browser profile is stored in ./medset_profile, so you log in ONCE and every
later run is already logged in (cookies + localStorage survive).

Usage (from the QCM folder):
    python medset_tool.py login     # first time only: log in, press Enter
    python medset_tool.py capture   # browse by hand; every API response is saved
    python medset_tool.py visit     # opens every URL in choice_urls.txt automatically

Output (all next to this script):
    captured/0001.json ...   one file per distinct API call:
                             {"request": {method,url,query,post,headers}, "status", "body"}
    captured/index.csv       one line per call (n, method, url, post, status, n_records)

Auth tokens in saved request headers are cut to 12 chars. Nothing sensitive is
written to disk, and the live session is only kept inside ./medset_profile.
"""

import csv
import hashlib
import json
import sys
from pathlib import Path
from urllib.parse import urlparse, parse_qs

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
PROFILE = HERE / "medset_profile"
OUT = HERE / "captured"
URLS = HERE / "choice_urls.txt"
BASE = "https://web.medset.tn/"
SENSITIVE = {"authorization", "cookie", "token", "x-auth-token", "x-access-token"}

OUT.mkdir(exist_ok=True)
INDEX = OUT / "index.csv"


def count_records(body):
    if isinstance(body, list):
        return len(body)
    if isinstance(body, dict):
        for k in ("data", "results", "items", "records", "questions", "rows"):
            if isinstance(body.get(k), list):
                return len(body[k])
    return 0


def load_seen():
    seen, n = set(), 0
    for f in OUT.glob("[0-9][0-9][0-9][0-9].json"):
        try:
            d = json.loads(f.read_text(encoding="utf-8"))
            r = d["request"]
            seen.add(hashlib.sha1(f"{r['method']}|{r['url']}|{r['post']}".encode()).hexdigest())
            n = max(n, int(f.stem))
        except Exception:
            pass
    return seen, n


def run(mode):
    seen, counter = load_seen()
    state = {"n": counter}

    if not INDEX.exists():
        with INDEX.open("w", newline="", encoding="utf-8-sig") as fh:
            csv.writer(fh).writerow(["n", "method", "url", "post", "status", "n_records"])

    def on_response(resp):
        try:
            req = resp.request
            host = urlparse(resp.url).hostname or ""
            if not host.endswith("medset.tn"):
                return
            if req.resource_type not in ("xhr", "fetch"):
                return
            if resp.status in (401, 403):
                print(f"  [!] {resp.status} on {resp.url} - session expired? run: python medset_tool.py login")
                return
            if "json" not in (resp.headers.get("content-type") or ""):
                return
            key = hashlib.sha1(f"{req.method}|{resp.url}|{req.post_data}".encode()).hexdigest()
            if key in seen:
                return
            body = resp.json()
            seen.add(key)
            state["n"] += 1
            n = state["n"]
            headers = {}
            for k, v in req.headers.items():
                headers[k] = (v[:12] + "...CUT") if k.lower() in SENSITIVE else v
            rec = {
                "request": {
                    "method": req.method,
                    "url": resp.url,
                    "query": parse_qs(urlparse(resp.url).query),
                    "post": req.post_data,
                    "headers": headers,
                },
                "status": resp.status,
                "body": body,
            }
            (OUT / f"{n:04d}.json").write_text(
                json.dumps(rec, ensure_ascii=False, indent=2), encoding="utf-8")
            nrec = count_records(body)
            with INDEX.open("a", newline="", encoding="utf-8-sig") as fh:
                csv.writer(fh).writerow([n, req.method, resp.url, req.post_data, resp.status, nrec])
            print(f"  [saved] {n:04d}  {req.method} {resp.url}  ({nrec} records)")
        except Exception as e:
            print(f"  [warn] {e}")

    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            str(PROFILE), headless=False,
            viewport={"width": 1400, "height": 900}, locale="fr-TN")
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        ctx.on("page", lambda pg: pg.on("response", on_response))
        page.on("response", on_response)

        page.goto(BASE)

        if mode == "login":
            input("\n  Log in in the browser window, then press Enter here...\n")
            print("  Session saved in ./medset_profile - you will stay logged in.")

        elif mode == "capture":
            print("\n  Already logged in (profile reused). Browse the quizzes you want.")
            input("  Every API response is being saved. Press Enter here to stop...\n")

        elif mode == "visit":
            urls = [u.strip() for u in URLS.read_text(encoding="utf-8").splitlines() if u.strip()]
            print(f"\n  Visiting {len(urls)} URLs from choice_urls.txt\n")
            for i, u in enumerate(urls, 1):
                print(f"  [{i}/{len(urls)}] {u}")
                try:
                    page.goto(u, wait_until="domcontentloaded", timeout=30000)
                    try:
                        page.wait_for_load_state("networkidle", timeout=8000)
                    except Exception:
                        pass
                    page.wait_for_timeout(1500)
                except Exception as e:
                    print(f"    [warn] {e}")
            input("\n  Done. Press Enter to close...\n")

        ctx.close()

    print(f"\n  Total saved calls: {state['n']}  ->  {OUT}\n")


if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] not in ("login", "capture", "visit"):
        print(__doc__)
        sys.exit(1)
    run(sys.argv[1])
