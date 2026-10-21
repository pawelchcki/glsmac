"""Independent original menu glyph/row observations, without expected labels."""
from collections import Counter
import ctypes
from ui.vision import MenuVision, VisionError, consensus
from ui.ingame_menu_contract import normalize


class IngameMenuVision:
    # Declared 1024x768 observation geometry and original palette classes.
    PURPLE = (103, 91, 181)
    FONTS = {(176, 212, 235): 'light', (0, 0, 0): 'dark'}

    def __init__(self):
        self.vision = MenuVision()
        setter = self.vision.tess.TessBaseAPISetVariable
        setter.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_char_p]
        setter.restype = ctypes.c_int
        # Supported source labels are ASCII; braces are outside this contract.
        alphabet = b'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,()/\\+-&:;!?\'"_=%*<>@#'
        if not setter(self.vision.handle, b'tessedit_char_whitelist', alphabet):
            raise VisionError('Could not establish menu OCR alphabet')

    def close(self): self.vision.close()

    def text(self, mask):
        if not any(value == 0 for value in mask.getdata()):
            raise VisionError('No complete menu glyphs')
        mask = self.vision.ImageOps.expand(mask, border=6, fill=255)
        readings = [normalize(self.vision.text(mask.resize((mask.width*s, mask.height*s)))) for s in (3, 4, 5)]
        return consensus(readings)

    def headers(self, image):
        # Texture presence prevents blank map crops from supplying OCR noise.
        crop = image.crop((0, 344, 139, 518))
        if sum(pixel == (11, 18, 24) for pixel in crop.getdata()) < 4000:
            return None
        result = []
        for index in range(9):
            crop = image.crop((5, 349+18*index, 134, 367+18*index))
            active = sum(r > 180 and g > 80 and b < 70 for r, g, b in crop.getdata()) > 100
            mask = self.vision.Image.new('L', crop.size, 255)
            for y in range(crop.height):
                for x in range(crop.width):
                    pixel = crop.getpixel((x, y))
                    if pixel == ((0, 0, 0) if active else (176, 212, 235)):
                        mask.putpixel((x, y), 0)
            result.append(dict(label=self.text(mask), active=active))
        if sum(row['active'] for row in result) > 1:
            raise VisionError('Multiple active original menu headers')
        return result

    def child(self, image):
        pixels = image.load(); left = 140; runs = []
        # Use complete horizontal runs at the actual child origin. A bounding
        # box around every purple pixel would include unrelated HUD controls.
        for y in range(768):
            if pixels[left, y] != self.PURPLE: continue
            right = left
            while right < 950 and pixels[right, y] == self.PURPLE: right += 1
            if right-left >= 80: runs.append((y, right))
        if not runs: return None
        right = Counter(end for _, end in runs).most_common(1)[0][0]
        ys = [y for y, end in runs if end == right]; top = min(ys)
        # Glyphs interrupt wide horizontal runs, including on the last row.
        # Follow the uninterrupted two-colour background at the left edge
        # instead; no row count or expected label determines the extent.
        palette = {self.PURPLE, (28, 80, 99)}
        bottom = top
        while bottom < image.height and pixels[left, bottom] in palette:
            bottom += 1
        if any(y >= bottom for y in ys):
            raise VisionError('Disconnected original child menu background')
        bands = []
        for y in range(top, bottom):
            # A single descender pixel remains part of the actual glyph. A
            # three-pixel cutoff clips short labels such as lower-case Map.
            if any(pixels[x, y] in self.FONTS for x in range(left, right)):
                if bands and y-bands[-1][-1] <= 3: bands[-1].append(y)
                else: bands.append([y])
        if not bands: raise VisionError('Original child rectangle has no readable rows')
        rows = []; expected_slot = 0
        for band in bands:
            slot = (band[0]-top)//20
            if slot < expected_slot: raise VisionError('Overlapping original menu rows')
            while expected_slot < slot:
                rows.append(dict(separator=True)); expected_slot += 1
            mask = self.vision.Image.new('L', (right-left, band[-1]-band[0]+1), 255)
            tones = Counter(); columns = Counter()
            for y in band:
                for x in range(left, right):
                    tone = self.FONTS.get(pixels[x, y])
                    if tone:
                        mask.putpixel((x-left, y-band[0]), 0); tones[tone] += 1; columns[x-left] += 1
            if len(tones) != 1: raise VisionError('Mixed unknown original menu text class')
            gaps = []; start = None
            for x in range(min(columns), max(columns)+1):
                if not columns[x]:
                    if start is None: start = x
                elif start is not None: gaps.append((x-start, start, x)); start = None
            widest = max(gaps, default=(0, 0, 0))
            split = widest[1] if widest[0] >= 12 else mask.width
            label = self.text(mask.crop((0, 0, split, mask.height)))
            rows.append(dict(label=label, tone=next(iter(tones)))); expected_slot += 1
        return rows

    def read(self, image):
        if image.size != (1024, 768):
            raise VisionError('Unexpected original menu viewport')
        # The root Escape route can open a centered Quit dialog while leaving
        # the map's selected-unit label visible behind it. It is not a map
        # checkpoint. Recognize its actual frame independently of its wording.
        if all(image.getpixel(point) == colour for point, colour in (
                ((160, 260), (80, 104, 104)), ((160, 270), (48, 94, 80)),
                ((500, 263), (13, 23, 36)))):
            raise VisionError('Unexpected centered original confirmation')
        headers = self.headers(image)
        child = self.child(image)
        if headers is None:
            if child is not None: raise VisionError('Child menu without its actual parent')
            return None
        if child is None: return dict(headers=headers, child=None)
        active = [i for i, header in enumerate(headers) if header['active']]
        if len(active) != 1: raise VisionError('Child menu lacks a unique highlighted parent')
        return dict(headers=headers, child=dict(header_index=active[0], rows=child))
