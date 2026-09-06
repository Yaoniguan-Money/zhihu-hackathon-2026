from pathlib import Path
from PIL import Image, ImageOps, ImageDraw, ImageFont
import argparse
parser=argparse.ArgumentParser();parser.add_argument('directory');parser.add_argument('--name',default='contact-sheet.jpg');args=parser.parse_args()
d=Path(args.directory)
names=['Front','ThreeQuarterFront','Side','ThreeQuarterBack','Back']
files=[d/(n+'.png') for n in names if (d/(n+'.png')).exists()]
if not files:files=sorted(d.glob('*.png'))
canvas=Image.new('RGB',(340*len(files),470),'#e7e1d9');draw=ImageDraw.Draw(canvas)
for i,path in enumerate(files):
    with Image.open(path) as im:canvas.paste(ImageOps.contain(im.convert('RGB'),(340,430)),(340*i,30))
    draw.text((340*i+14,10),path.stem,fill='#342f29')
canvas.save(d/args.name,quality=93)
print(d/args.name)
