"""Read original tutorial body lines from declared blue palette glyphs."""
import json
from pathlib import Path
import re
import sys

from ui.vision import MenuVision, consensus

def read(vision, image):
    image = image.convert('RGB')
    mask = vision.Image.new('L', image.size, 255)
    mask.putdata([0 if p == (92,124,188) else 255 for p in image.getdata()])
    pixels = mask.load()
    bands=[]
    for y in range(768):
        count=sum(pixels[x,y] == 0 for x in range(1024))
        if 4 <= count <= 450:
            if bands and y-bands[-1][-1] <= 2: bands[-1].append(y)
            else: bands.append([y])
    lines=[]
    for band in bands:
        if not 6 <= band[-1]-band[0] <= 22: continue
        crop=mask.crop((0,band[0],1024,band[-1]+1))
        bbox=vision.ImageOps.invert(crop).getbbox()
        if bbox is None: continue
        crop=vision.ImageOps.expand(crop.crop(bbox),8,255)
        try:
            text=consensus([re.sub(r'[^A-Z0-9 ]','',vision.text(crop.resize((crop.width*s,crop.height*s),vision.Image.Resampling.NEAREST))) for s in (2,3,4)])
        except Exception as error:
            text='OCR ERROR '+str(error)
        lines.append({'y':band[0],'text':text})
    return lines
