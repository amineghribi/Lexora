#!/usr/bin/env python3
"""mockdiff — mesure l'écart entre une maquette Stitch et une implémentation.

    python tools/mockdiff.py <mockup screen.png> <implementation.png> [--out DIR]

Sortie : un score RMSE normalisé (0 = identique), un score de structure (bords),
et une planche côte à côte + carte de différence dans DIR.

Ce n'est pas un test binaire : c'est la mesure qui remplace « ça a l'air pareil ».
Deux images de tailles différentes sont ramenées à la même largeur et alignées en
haut ; la hauteur comparée est la plus petite des deux.
"""
import sys
from pathlib import Path

try:
    from PIL import Image, ImageChops, ImageFilter
except ImportError:
    sys.exit("Pillow requis : pip install pillow")


def load(path, width):
    im = Image.open(path).convert("RGB")
    if im.width != width:
        h = round(im.height * width / im.width)
        im = im.resize((width, h), Image.LANCZOS)
    return im


def rmse(a, b):
    diff = ImageChops.difference(a, b)
    hist = diff.convert("L").histogram()
    total = sum(hist)
    acc = sum((i * i) * n for i, n in enumerate(hist))
    return (acc / total) ** 0.5


def edges(im):
    return im.convert("L").filter(ImageFilter.FIND_EDGES)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) < 2:
        sys.exit(__doc__)
    out_dir = Path("mockdiff-out")
    if "--out" in sys.argv:
        out_dir = Path(sys.argv[sys.argv.index("--out") + 1])
    out_dir.mkdir(parents=True, exist_ok=True)

    mock_path, impl_path = args[0], args[1]
    mock0, impl0 = Image.open(mock_path), Image.open(impl_path)
    width = min(mock0.width, impl0.width, 900)   # largeur de comparaison
    mock, impl = load(mock_path, width), load(impl_path, width)
    box_h = min(mock.height, impl.height)
    mock, impl = mock.crop((0, 0, width, box_h)), impl.crop((0, 0, width, box_h))

    r_pix = rmse(mock, impl)
    r_edge = rmse(edges(mock), edges(impl))
    score_pix = max(0.0, 100 * (1 - r_pix / 128))     # échelle indicative
    score_edge = max(0.0, 100 * (1 - r_edge / 64))

    diff = ImageChops.difference(mock, impl)
    heat = diff.convert("L").point(lambda v: min(255, v * 3))

    stem = Path(impl_path).stem
    diff.save(out_dir / f"{stem}-diff.png")
    sheet = Image.new("RGB", (width * 3 + 24, box_h), "white")
    for i, im in enumerate((mock, impl, heat.convert("RGB"))):
        sheet.paste(im, (i * (width + 12), 0))
    sheet.save(out_dir / f"{stem}-side-by-side.png")

    print(f"maquette       : {mock_path} ({mock0.width}x{mock0.height})")
    print(f"implémentation : {impl_path} ({impl0.width}x{impl0.height})")
    print(f"comparaison    : {width}x{box_h} px")
    print(f"RMSE pixels    : {r_pix:.1f} / 255  → score {score_pix:.0f}/100")
    print(f"RMSE structures: {r_edge:.1f}       → score {score_edge:.0f}/100")
    print(f"planche        : {out_dir / f'{stem}-side-by-side.png'}")
    return 0 if r_pix < 40 else 1


if __name__ == "__main__":
    sys.exit(main())
