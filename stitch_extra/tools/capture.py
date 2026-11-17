#!/usr/bin/env python3
"""Capture déterministe pour mockdiff.

Trois pièges du protocole précédent sont traités ici :
  1. Chromium suit le thème de l'OS -> thème clair forcé (preferredColorScheme=1).
  2. --screenshot + --virtual-time-budget peut produire une image blanche qui « score »
     quand la maquette est claire -> l'image est contrôlée et la capture est relancée,
     puis refusée si elle reste quasi vide.
  3. Aucune attente de rendu React -> on attend la stabilisation du DOM avant la capture.

Usage :
  python3 tools/capture.py --url http://127.0.0.1:5233/preview.html --out /tmp/app.png \
      --width 1174 --height 1200
"""
import argparse
import subprocess
import sys
import time

from PIL import Image, ImageStat

CHROME = "chromium"


def snap(url, out, w, h, wait_ms, tries=3):
    for i in range(1, tries + 1):
        subprocess.run(
            [CHROME, "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
             "--force-color-profile=srgb", "--blink-settings=preferredColorScheme=1",
             f"--window-size={w},{h}", f"--virtual-time-budget={wait_ms}",
             f"--screenshot={out}", url],
            check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        if not _blank(out):
            return True
        time.sleep(0.6)
    return False


def _blank(path, min_std=3.0, min_colors=12):
    try:
        im = Image.open(path).convert("RGB")
    except Exception:
        return True
    if im.size[0] < 50 or im.size[1] < 50:
        return True
    small = im.resize((160, 160))
    std = sum(ImageStat.Stat(small).stddev) / 3
    colors = len(small.getcolors(maxcolors=160 * 160) or [])
    return std < min_std or colors < min_colors


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--width", type=int, default=1174)
    ap.add_argument("--height", type=int, default=1200)
    ap.add_argument("--wait", type=int, default=20000, help="virtual-time-budget en ms")
    a = ap.parse_args()
    ok = snap(a.url, a.out, a.width, a.height, a.wait)
    if not ok:
        print("CAPTURE_VIDE: image quasi blanche après 3 essais, aucune mesure ne doit être tirée")
        sys.exit(2)
    print(f"capture ok: {a.out} ({a.width}x{a.height}, thème clair forcé)")


if __name__ == "__main__":
    main()
