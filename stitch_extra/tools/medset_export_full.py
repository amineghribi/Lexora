"""
Medset FULL export v2.
Log in once → go to the page that LISTS all series → press Enter →
it discovers every series link and downloads them ALL automatically.

Usage:
    python medset_export_full.py
"""

import json
import re
from pathlib import Path
from urllib.parse import urljoin, urlparse

import pandas as pd
from playwright.sync_api import sync_playwright

BASE_URL = "https://web.medset.tn/"
OUT_DIR = Path("exported_data")
OUT_DIR.mkdir(exist_ok=True)


def safe_name(text: str, max_len: int = 80) -> str:
    text = re.sub(r"[^a-zA-Z0-9_-]+", "_", text).strip("_")
    return text[:max_len] or "data"


def save_records(records: list, name: str):
    (OUT_DIR / f"{name}.json").write_text(
        json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    try:
        df = pd.json_normalize(records)
        df.to_csv(OUT_DIR / f"{name}.csv", index=False, encoding="utf-8-sig")
    except Exception as e:
        print(f"  [warn] CSV failed for {name}: {e}")
    print(f"  [saved] {name}  ({len(records)} rows)")


def extract_records(data):
    """Pull a list of dicts out of an API response however it's shaped."""
    if isinstance(data, list) and data and isinstance(data[0], dict):
        return data
    if isinstance(data, dict):
        for key in ("data", "results", "items", "records", "rows", "list",
                     "questions", "quizzes", "series"):
            val = data.get(key)
            if isinstance(val, list) and val and isinstance(val[0], dict):
                return val
    return None


with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    context = browser.new_context(viewport={"width": 1400, "height": 900}, locale="fr-TN")
    page = context.new_page()

    print(f"\n  Opening {BASE_URL} — please log in manually.\n")
    page.goto(BASE_URL)

    print("  → Log in, then navigate to the page that LISTS all the series")
    print("    (specialities, years, etc.).")
    print("  When you're on that listing page, come back and press Enter.\n")
    input("  Press Enter when you're on the listing page...\n")

    # ── Step 1: discover all links that look like quizzes ──
    links = page.eval_on_selector_all(
        "a[href]",
        """els => els.map(e => ({
            href: e.href,
            text: e.innerText.trim()
        }))"""
    )

    # Also capture any API calls the listing page already made
    api_urls = set()

    # Filter to likely quiz/series links
    quiz_links = []
    for link in links:
        href = link["href"]
        text = link["text"]
        low = href.lower()
        if any(k in low for k in ("quiz", "serie", "series", "qcm", "examen",
                                   "question", "ec n", "ecn", "partie", "chapitre")):
            quiz_links.append(link)

    # If nothing matched by keyword, show everything so we can pick
    if not quiz_links:
        print("\n  No obvious quiz links found. Here's everything on the page:\n")
        for i, l in enumerate(links):
            if l["text"]:
                print(f"    [{i}] {l['text'][:80]}  →  {l['href']}")
        print()
        choice = input("  Type the numbers of the series links to download (comma-separated), or 'all': ").strip()
        if choice.lower() == "all":
            quiz_links = [l for l in links if l["text"]]
        else:
            indices = [int(x.strip()) for x in choice.split(",")]
            quiz_links = [links[i] for i in indices]
    else:
        print(f"\n  Found {len(quiz_links)} quiz links:\n")
        for l in quiz_links:
            print(f"    • {l['text'][:60]}  →  {l['href']}")

    confirm = input(f"\n  Download all {len(quiz_links)}? (y/n): ").strip().lower()
    if confirm != "y":
        print("  Aborted.")
        browser.close()
        exit()

    # ── Step 2: visit each link and capture the quiz JSON ──
    captured_count = 0
    for i, link in enumerate(quiz_links):
        url = link["href"]
        label = safe_name(link["text"] or f"series_{i}")

        print(f"\n  [{i+1}/{len(quiz_links)}] {label}")

        collected = []

        def on_response(response, collected=collected):
            try:
                ctype = response.headers.get("content-type", "")
                if "json" not in ctype:
                    return
                rurl = response.url.lower()
                if any(s in rurl for s in (".js", ".css", ".png", ".map",
                                            "google", "sentry", "analytics")):
                    return
                body = response.json()
                recs = extract_records(body)
                if recs:
                    collected.extend(recs)
            except Exception:
                pass

        page.on("response", on_response)

        try:
            page.goto(url, wait_until="networkidle", timeout=30000)
            page.wait_for_timeout(1500)  # give JS time to render
        except Exception as e:
            print(f"    [warn] navigation issue: {e}")

        page.remove_listener("response", on_response)

        # De-duplicate by title+answers
        if collected:
            seen = set()
            unique = []
            for r in collected:
                key = json.dumps(r, sort_keys=True, ensure_ascii=False)
                if key not in seen:
                    seen.add(key)
                    unique.append(r)
            save_records(unique, f"{i:03d}_{label}")
            captured_count += 1
        else:
            print(f"    [warn] no data captured for {label}")

    browser.close()

print(f"\n  Done. {captured_count}/{len(quiz_links)} series saved in: {OUT_DIR.resolve()}\n")
