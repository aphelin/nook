"""
Writes apps/web/src/lib/initial-glyphs.ts: the outlines of Funnel Display at 800 for the letters and
digits an initial can be, so a face or a disc can draw its initial as a path. Text is placed with
its baseline on a whole pixel, so a letter drawn as text jumps against its shape while the shape
grows on hover; a path scales with the shape exactly.

Outlines are in ems, y down, with the baseline at 0 and the pen at 0; `advance` is the width the
text would have taken, so a path can be centred where `text-anchor="middle"` centred the text.

  python3 scripts/initial-glyphs.py [font.woff2]

With no font given it takes the Latin Funnel Display that `next dev` or `next build` fetched into
apps/web/.next. Needs fontTools and brotli (pip install fonttools brotli).
"""

import glob
import os
import subprocess
import sys

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "apps/web/src/lib/initial-glyphs.ts")
WEIGHT = 800
# A–Z, 0–9 and the Latin-1 capitals a name can start with.
CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞ"


def find_font():
    for path in glob.glob(os.path.join(ROOT, "apps/web/.next/**/media/*.woff2"), recursive=True):
        font = TTFont(path)
        family = font["name"].getDebugName(1) or ""
        if "Funnel Display" in family and all(ord(c) in font.getBestCmap() for c in "AZ09"):
            return path
    sys.exit("No Latin Funnel Display woff2 under apps/web/.next: run the web app once, or pass the font's path.")


def num(v):
    s = f"{v:.3f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else find_font()
    font = TTFont(path)
    if "fvar" in font:
        font = instantiateVariableFont(font, {"wght": WEIGHT})
    upm = font["head"].unitsPerEm
    cmap = font.getBestCmap()
    glyphs = font.getGlyphSet()
    rows = []
    for ch in CHARS:
        name = cmap.get(ord(ch))
        if not name:
            continue
        pen = SVGPathPen(glyphs, ntos=num)
        # Font units, y up, to ems, y down.
        glyphs[name].draw(TransformPen(pen, (1 / upm, 0, 0, -1 / upm, 0, 0)))
        rows.append(f'  "{ch}": {{ d: "{pen.getCommands()}", advance: {num(glyphs[name].width / upm)} }},')
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(
            "// Written by scripts/initial-glyphs.py from Funnel Display at 800; do not edit by hand.\n"
            "// Each outline is in ems, y down, baseline at 0; `advance` is the width the text would take.\n"
            "export const INITIAL_GLYPHS: Readonly<Record<string, { d: string; advance: number }>> = {\n"
            + "\n".join(rows)
            + "\n};\n"
        )
    # In the repo's own style, so the lint's formatting check passes on it as written.
    subprocess.run(["pnpm", "exec", "prettier", "--write", OUT], cwd=os.path.join(ROOT, "apps/web"), check=True, capture_output=True)
    print(f"{len(rows)} glyphs from {os.path.basename(path)} -> {os.path.relpath(OUT, ROOT)} ({os.path.getsize(OUT)} bytes)")


main()
