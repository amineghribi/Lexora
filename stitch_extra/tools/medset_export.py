"""
Medset data exporter.
Opens a real browser → you log in manually → navigate to the pages you want →
it captures every API response and saves it as JSON + CSV.

Usage:
    python medset_export.py
"""

import json
import re
import time
from pathlib import Path
from urllib.parse import urlparse

import pandas as pd
from playwright.sync_api import sync_playwright

BASE_URL = "https://web.medset.tn/"
OUT_DIR = Path("exported_data")
OUT_DIR.mkdir(exist_ok=True)

captured = []  # list of {"url": ..., "json": ...}


def safe_name(text: str, max_len: int = 60) -> str:
    text = re.sub(r"[^a-zA-Z0-9_-]+", "_", text).strip("_")
    return text[:max_len] or "data"


def try_save(item: dict, index: int):
    url = item["url"]
    data = item["json"]

    # Only keep things that look like records (lists of objects, or {data: [...]} etc.)
    records = None
    if isinstance(data, list) and data and isinstance(data[0], dict):
        records = data
    elif isinstance(data, dict):
        for key in ("data", "results", "items", "records", "rows", "list"):
            val = data.get(key)
            if isinstance(val, list) and val and isinstance(val[0], dict):
                records = val
                break

    if not records:
        return

    path_part = urlparse(url).path.strip("/").replace("/", "_") or "root"
    name = f"{index:03d}_{safe_name(path_part)}"

    # JSON
    (OUT_DIR / f"{name}.json").write_text(
        json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    # CSV (flatten nested values so nothing is lost)
    try:
        df = pd.json_normalize(records)
        df.to_csv(OUT_DIR / f"{name}.csv", index=False, encoding="utf-8-sig")
    except Exception as e:
        print(f"  [warn] CSV failed for {name}: {e}")

    print(f"  [saved] {name}  ({len(records)} rows)  ← {url}")


def is_api_url(url: str) -> bool:
    """Heuristic: skip static assets, keep likely API calls."""
    skip = (".js", ".css", ".png", ".jpg", ".svg", ".ico", ".woff", ".woff2",
            ".gif", ".mp4", ".webp", ".map", "google-analytics", "sentry")
    if any(s in url.lower() for s in skip):
        return False
    return True


with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)  # visible browser
    context = browser.new_context(
        viewport={"width": 1400, "height": 900},
        locale="fr-TN",
    )
    page = context.new_page()

    # Capture every JSON response the site makes
    def on_response(response):
        try:
            if not is_api_url(response.url):
                return
            ctype = response.headers.get("content-type", "")
            if "json" not in ctype:
                return
            body = response.json()
            if body:  # skip empty
                captured.append({"url": response.url, "json": body})
        except Exception:
            pass

    page.on("response", on_response)

    print(f"\n  Opening {BASE_URL} — please log in manually.\n")
    page.goto(BASE_URL)

    print("  Once logged in, navigate through the pages that contain the data you need.")
    print("  When done, come back to THIS terminal and press Enter.\n")
    input("  Press Enter when finished...\n")

    # One more sweep: grab anything already rendered as tables on the current page
    try:
        tables = page.query_selector_all("table")
        for i, tbl in enumerate(tables):
            headers = [th.inner_text().strip() for th in tbl.query_selector_all("th")]
            rows = []
            for tr in tbl.query_selector_all("tr"):
                cells = [td.inner_text().strip() for td in tr.query_selector_all("td")]
                if cells:
                    rows.append(cells)
            if rows:
                df = pd.DataFrame(rows, columns=headers if headers and len(headers) == len(rows[0]) else None)
                df.to_csv(OUT_DIR / f"table_{i}.csv", index=False, encoding="utf-8-sig")
                print(f"  [saved] table_{i}.csv  ({len(rows)} rows)  ← visible table on page")
    except Exception as e:
        print(f"  [warn] table scrape failed: {e}")

    browser.close()

# De-duplicate by URL and save
seen_urls = set()
unique = []
for item in captured:
    key = item["url"].split("?")[0]
    if key not in seen_urls:
        seen_urls.add(key)
        unique.append(item)

print(f"\n  Captured {len(unique)} unique API responses.\n")

for idx, item in enumerate(unique):
    try_save(item, idx)

print(f"\n  Done. All files saved in: {OUT_DIR.resolve()}\n")
