"""Losslessly encode the existing licensed TTFs as WOFF2 (fonttools + brotli)."""
from pathlib import Path
from fontTools.ttLib import TTFont

root = Path(__file__).resolve().parent.parent / 'public' / 'fonts'
for source in sorted(root.glob('font-*.ttf')):
    font = TTFont(source)
    font.flavor = 'woff2'
    target = source.with_suffix('.woff2')
    font.save(target)
    print(f'{source.name}: {source.stat().st_size} -> {target.stat().st_size} bytes')
