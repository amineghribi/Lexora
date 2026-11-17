"""
Medset export v8 — keep browser open, use fetch() from inside the page.
No closing browser, no requests library, session stays alive.
"""

import json
import re
import time
from pathlib import Path
from urllib.parse import quote, unquote

import pandas as pd
from playwright.sync_api import sync_playwright

BASE = "https://web.medset.tn"
OUT_DIR = Path("exported_data")
OUT_DIR.mkdir(exist_ok=True)

YEARS = [str(y) for y in range(2018, 2027)]
EXAMS = ["FMM", "FMSF", "FMS", "FMT"]
MODES = ["uncertified", "certified"]
URL_FILE = Path("choice_urls.txt")


def safe_name(text: str, max_len: int = 120) -> str:
    text = re.sub(r"[^a-zA-Z0-9_-]+", "_", text).strip("_")
    return text[:max_len] or "data"


def save_records(records: list, name: str):
    (OUT_DIR / f"{name}.json").write_text(
        json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    try:
        df = pd.json_normalize(records)
        df.to_csv(OUT_DIR / f"{name}.csv", index=False, encoding="utf-8-sig")
    except Exception:
        pass


def extract_records(data):
    if isinstance(data, list) and data and isinstance(data[0], dict):
        return data
    if isinstance(data, dict):
        for key in ("data", "results", "items", "records", "questions"):
            val = data.get(key)
            if isinstance(val, list) and val and isinstance(val[0], dict):
                return val
    return None


# ── Parse choice URLs ──
topics = []
for line in URL_FILE.read_text(encoding="utf-8").splitlines():
    line = line.strip()
    if not line:
        continue
    m = re.match(r".*/choice/standard/(\d+)/(.+?)/(.+)$", line)
    if m:
        topics.append((m.group(1), unquote(m.group(2)), unquote(m.group(3))))
topics = list(dict.fromkeys(topics))

total_urls = len(MODES) * len(YEARS) * len(EXAMS) * len(topics)
print(f"\n  {len(topics)} topics × {len(YEARS)} years × {len(EXAMS)} exams × {len(MODES)} modes = {total_urls} URLs\n")

# ── Step 1: open browser, log in, discover the API pattern ──
with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    context = browser.new_context(viewport={"width": 1400, "height": 900}, locale="fr-TN")
    page = context.new_page()

    print(f"  Opening {BASE} — please log in.\n")
    page.goto(BASE)
    input("  Log in, then press Enter...\n")

    # ── Step 2: discover API by visiting one quiz page ──
    print("\n  Discovering API pattern...")
    api_urls = []

    def on_response(response):
        try:
            url = response.url
            ctype = response.headers.get("content-type", "")
            if "json" in ctype and not any(s in url for s in (".js", ".css", ".png", "google", "sentry")):
                api_urls.append(url)
        except Exception:
            pass

    page.on("response", on_response)

    test_topic = topics[0]  # (std, spec, topic)
    test_path = f"/quiz/uncertified/2021/FMM/{quote(test_topic[1], safe='')}/{quote(test_topic[2], safe='')}"
    print(f"  Visiting: {BASE}{test_path}")
    page.goto(f"{BASE}{test_path}", wait_until="networkidle", timeout=20000)
    page.wait_for_timeout(2000)
    page.remove_listener("response", on_response)

    print(f"\n  Found {len(api_urls)} API URLs:")
    for u in api_urls:
        print(f"    {u}")

    # ── Step 3: figure out the API URL pattern ──
    # Common patterns:
    #   /api/quiz/uncertified/2021/FMM/Cardiologie/Topic
    #   /api/v1/quiz/...
    # Let's find one that matches our quiz path
    api_pattern = None
    for u in api_urls:
        if "quiz" in u.lower():
            api_pattern = u
            break

    if not api_pattern and api_urls:
        api_pattern = api_urls[0]

    print(f"\n  Using API pattern: {api_pattern}")

    if not api_pattern:
        print("\n  Could not find API URL. Try navigating to a quiz manually,")
        print("  then re-run and check the output above.")
        input("  Press Enter to close...")
        browser.close()
        exit()

    # Build the base API URL by replacing the test quiz path
    # e.g., if api_pattern contains the spec/topic, we can reconstruct
    test_spec_encoded = quote(test_topic[1], safe='')
    test_topic_encoded = quote(test_topic[2], safe='')

    if test_spec_encoded in api_pattern and test_topic_encoded in api_pattern:
        # Pattern: .../quiz/{mode}/{year}/{exam}/{spec}/{topic}
        api_base = api_pattern.replace(
            f"uncertified/2021/FMM/{test_spec_encoded}/{test_topic_encoded}",
            "{mode}/{year}/{exam}/{spec}/{topic}"
        )
        # Also try with decoded versions
        if api_base == api_pattern:
            api_base = api_pattern.replace(
                f"/{test_topic[1]}/{test_topic[2]}",
                "/{spec}/{topic}"
            )
            if "{spec}" in api_base:
                # Replace mode/year/exam part too
                api_base = re.sub(
                    r"/(uncertified|certified)/\d{4}/[A-Z]+/",
                    "/{mode}/{year}/{exam}/",
                    api_base
                )
            else:
                api_base = None
    else:
        api_base = None

    if not api_base:
        # Fallback: try common API base URLs
        for pattern in [
            f"{BASE}/api/quiz/{{mode}}/{{year}}/{{exam}}/{{spec}}/{{topic}}",
            f"{BASE}/api/v1/quiz/{{mode}}/{{year}}/{{exam}}/{{spec}}/{{topic}}",
            f"{BASE}/api/quizzes/{{mode}}/{{year}}/{{exam}}/{{spec}}/{{topic}}",
        ]:
            test_url = pattern.format(
                mode="uncertified", year="2021", exam="FMM",
                spec=test_spec_encoded, topic=test_topic_encoded
            )
            result = page.evaluate(f"""
                async () => {{
                    try {{
                        const r = await fetch("{test_url}");
                        if (r.ok) {{
                            const ct = r.headers.get("content-type") || "";
                            if (ct.includes("json")) {{
                                return await r.json();
                            }}
                        }}
                        return null;
                    }} catch(e) {{
                        return null;
                    }}
                }}
            """)
            if result and extract_records(result):
                api_base = pattern
                print(f"  Found API base: {pattern}")
                break

    if not api_base:
        print("\n  Could not determine API base URL.")
        print("  The discovered URLs above may help — paste them to me.")
        input("  Press Enter to close...")
        browser.close()
        exit()

    # ── Step 4: bulk fetch using fetch() from inside the browser ──
    print(f"\n  API template: {api_base}")
    print(f"  Starting bulk download of {total_urls} URLs...\n")

    saved = 0
    skipped = 0
    failed = 0
    idx = 0
    start_time = time.time()

    for mode in MODES:
        for year in YEARS:
            for exam in EXAMS:
                for (std, spec, topic) in topics:
                    idx += 1

                    api_url = api_base.format(
                        mode=mode, year=year, exam=exam,
                        spec=quote(spec, safe=''), topic=quote(topic, safe='')
                    )
                    name = safe_name(f"{std}_{mode}_{year}_{exam}_{spec}_{topic}")

                    result = page.evaluate(f"""
                        async () => {{
                            try {{
                                const r = await fetch("{api_url}");
                                if (!r.ok) return {{status: r.status, data: null}};
                                const data = await r.json();
                                return {{status: r.status, data: data}};
                            }} catch(e) {{
                                return {{status: 0, data: null, error: String(e)}};
                            }}
                        }}
                    """)

                    if result["status"] == 404:
                        skipped += 1
                    elif result["status"] == 401 or result["status"] == 403:
                        print(f"\n  AUTH ERROR ({result['status']}) — session may have expired!")
                        print(f"  Saved so far: {saved}")
                        input("  Press Enter to close...")
                        browser.close()
                        exit()
                    elif result["data"]:
                        records = extract_records(result["data"])
                        if records:
                            seen = set()
                            unique = []
                            for r in records:
                                key = json.dumps(r, sort_keys=True, ensure_ascii=False)
                                if key not in seen:
                                    seen.add(key)
                                    unique.append(r)
                            save_records(unique, name)
                            saved += 1
                        else:
                            skipped += 1
                    else:
                        failed += 1

                    if idx % 200 == 0:
                        elapsed = time.time() - start_time
                        rate = idx / elapsed if elapsed > 0 else 0
                        eta = (total_urls - idx) / rate if rate > 0 else 0
                        print(f"  {idx}/{total_urls}  (saved={saved}, skipped={skipped}, "
                              f"failed={failed})  [{rate:.0f} req/s, ETA {eta/60:.0f} min]")

    elapsed = time.time() - start_time
    print(f"\n  {'='*50}")
    print(f"  DONE in {elapsed/60:.1f} minutes")
    print(f"  Saved:   {saved} quizzes")
    print(f"  Skipped: {skipped}")
    print(f"  Failed:  {failed}")
    print(f"  Files in: {OUT_DIR.resolve()}")
    print(f"  {'='*50}")

    input("\n  Press Enter to close browser...")
    browser.close()
