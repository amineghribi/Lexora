"""
Diagnostic: dump ALL links and page structure from medset.
Run this instead, then paste the output back to me.
"""

import json
from playwright.sync_api import sync_playwright

BASE = "https://web.medset.tn"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    context = browser.new_context(viewport={"width": 1400, "height": 900}, locale="fr-TN")
    page = context.new_page()

    print(f"\n  Opening {BASE}/certifs/standard — please log in.\n")
    page.goto(f"{BASE}/certifs/standard")

    input("  Log in, then press Enter...\n")

    # ── Dump all links ──
    links = page.eval_on_selector_all(
        "a[href]",
        "els => els.map(e => ({href: e.href, text: e.innerText.trim()}))"
    )
    print(f"\n  ── ALL LINKS ({len(links)}) ──\n")
    for l in links:
        if l["text"]:
            print(f"  [{l['text'][:60]}]  {l['href']}")

    # ── Dump page URL and title ──
    print(f"\n  Current URL: {page.url}")
    print(f"  Title: {page.title()}")

    # ── Dump visible text (first 3000 chars) ──
    text = page.inner_text("body")
    print(f"\n  ── PAGE TEXT (first 3000 chars) ──\n")
    print(text[:3000])

    # ── Also try visiting courses/standard/1 directly ──
    print(f"\n  ── Trying {BASE}/courses/standard/1/Cardiologie ──\n")
    try:
        page.goto(f"{BASE}/courses/standard/1/Cardiologie", wait_until="networkidle", timeout=15000)
        page.wait_for_timeout(1000)
        print(f"  URL after nav: {page.url}")
        links2 = page.eval_on_selector_all(
            "a[href]",
            "els => els.map(e => ({href: e.href, text: e.innerText.trim()}))"
        )
        print(f"  Links found: {len(links2)}")
        for l in links2:
            if l["text"] and "choice" in l["href"]:
                print(f"  [{l['text'][:60]}]  {l['href']}")
    except Exception as e:
        print(f"  Error: {e}")

    browser.close()
