from pathlib import Path
from PIL import Image
import hashlib
import json

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'art/blender'
rows = []
for slug in ['shen-qingwu', 'ji-yunting', 'a-lan', 'he-xu', 'liu-chengyin']:
    for variant in ['', 'four-views/']:
        source = ROOT / f'public/assets/cast/{variant}{slug}.png'
        with Image.open(source) as im:
            im.load()
            rows.append({'source': source.relative_to(ROOT).as_posix(), 'sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'size': list(im.size), 'decoded': True})
            if variant:
                for index, label in enumerate(['Front', 'ThreeQuarter', 'Side', 'Back']):
                    crop = im.crop((round(index * im.width / 4), 0, round((index + 1) * im.width / 4), im.height))
                    crop.save(OUT / f'references/{slug}_{label}.png')
source = ROOT / 'public/assets/scenes/detective-room.png'
with Image.open(source) as im:
    im.load()
    rows.append({'source': source.relative_to(ROOT).as_posix(), 'sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'size': list(im.size), 'decoded': True})
(OUT / 'reference-manifest.json').write_text(json.dumps(rows, indent=2), encoding='utf-8')
print(f'Decoded and hashed {len(rows)} sources; wrote 20 reference crops')
