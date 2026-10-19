"""Read visible menu text and selection, independently of scenario expectations.

The two apps draw their own controls. Color segmentation finds text bands;
Tesseract reads their contents. No list of expected labels supplies answers.
Screenshots and OCR diagnostics stay in the ignored artifacts directory.
"""

from copy import deepcopy
import ctypes as c
import ctypes.util
from collections import Counter
import io
import hashlib
from pathlib import Path
import re
import statistics


def normalize(text):
    return re.sub(r"\s+", " ", text.upper()).strip()


def consensus(readings):
    label, votes = Counter(readings).most_common(1)[0]
    if not label or votes < 2:
        raise VisionError(f"OCR passes disagree: {readings}")
    return label


class VisionError(RuntimeError):
    pass


class MenuVision:
    def __init__(self):
        from PIL import Image, ImageEnhance, ImageOps
        self.Image, self.ImageEnhance, self.ImageOps = Image, ImageEnhance, ImageOps
        tess = ctypes.util.find_library("tesseract")
        lept = ctypes.util.find_library("leptonica") or ctypes.util.find_library("lept")
        if not tess or not lept:
            raise VisionError("UI capture requires libtesseract, Leptonica and English tessdata")
        self.tess, self.lept = c.CDLL(tess), c.CDLL(lept)
        signatures = [
            (self.tess, "TessBaseAPICreate", [], c.c_void_p),
            (self.tess, "TessBaseAPIInit3", [c.c_void_p, c.c_char_p, c.c_char_p], c.c_int),
            (self.tess, "TessBaseAPISetImage2", [c.c_void_p, c.c_void_p], None),
            (self.tess, "TessBaseAPISetPageSegMode", [c.c_void_p, c.c_int], None),
            (self.tess, "TessBaseAPIGetUTF8Text", [c.c_void_p], c.c_void_p),
            (self.tess, "TessBaseAPIGetDatapath", [c.c_void_p], c.c_char_p),
            (self.tess, "TessDeleteText", [c.c_void_p], None),
            (self.tess, "TessBaseAPIDelete", [c.c_void_p], None),
            (self.tess, "TessVersion", [], c.c_char_p),
            (self.lept, "pixReadMem", [c.c_void_p, c.c_size_t], c.c_void_p),
            (self.lept, "pixDestroy", [c.POINTER(c.c_void_p)], None),
        ]
        for library, name, arguments, result in signatures:
            function = getattr(library, name)
            function.argtypes, function.restype = arguments, result
        self.observations = {}
        self.handle = self.tess.TessBaseAPICreate()
        if self.tess.TessBaseAPIInit3(self.handle, None, b"eng"):
            self.close()
            raise VisionError("Tesseract could not load English tessdata")
        self.tess.TessBaseAPISetPageSegMode(self.handle, 7)  # one text line
        model = Path(self.tess.TessBaseAPIGetDatapath(self.handle).decode()) / "eng.traineddata"
        self.model_sha256 = hashlib.sha256(model.read_bytes()).hexdigest()

    @property
    def version(self):
        return self.tess.TessVersion().decode()

    def close(self):
        if self.handle:
            self.tess.TessBaseAPIDelete(self.handle)
            self.handle = None

    def text(self, image):
        encoded = io.BytesIO()
        image.save(encoded, format="PNG")
        data = encoded.getvalue()
        pix = c.c_void_p(self.lept.pixReadMem(data, len(data)))
        if not pix:
            raise VisionError("Leptonica could not read the captured image")
        try:
            self.tess.TessBaseAPISetImage2(self.handle, pix)
            pointer = self.tess.TessBaseAPIGetUTF8Text(self.handle)
            if not pointer:
                raise VisionError("Tesseract did not return text")
            try:
                return normalize(c.string_at(pointer).decode("utf-8"))
            finally:
                self.tess.TessDeleteText(pointer)
        finally:
            self.lept.pixDestroy(c.byref(pix))

    def read(self, path):
        image = self.Image.open(path).convert("RGB").resize((1024, 768))
        # Reuse only complete observations of identical rendered pixels. The
        # cache holds hashes/results, never images, labels from expectations or
        # entries inferred from a previous action. Every capture is still read.
        key = hashlib.sha256(image.tobytes()).digest()
        if key not in self.observations:
            observed = self.read_image(image, path)
            if len(self.observations) >= 128:
                self.observations.pop(next(iter(self.observations)))
            self.observations[key] = observed
        return deepcopy(self.observations[key])

    def read_image(self, image, path):
        pixels = image.load()
        counts, selected = [], []
        # This is a declared observation region, not an expected menu layout.
        # Actual text positions determine mouse targets in each application.
        left, right = 685, 985
        glyphs = {}
        for y in range(768):
            count = bright = 0
            for x in range(left, right):
                red, green, blue = pixels[x, y]
                # Original palette colors and reproduction RGBA colors. Keep
                # a narrow tolerance so translucent scenery cannot add glyphs.
                normal = any(abs(red - r) <= 5 and abs(green - g) <= 5 and abs(blue - b) <= 5
                             for r, g, b in ((84, 172, 148), (94, 162, 137)))
                active = any(abs(red - r) <= 5 and abs(green - g) <= 5 and abs(blue - b) <= 5
                             for r, g, b in ((176, 232, 188), (193, 240, 204)))
                title = abs(red - 231) <= 5 and abs(green - 235) <= 5 and abs(blue - 231) <= 5
                if normal or active or title:
                    count += 1
                    bright += active or title
                    glyphs.setdefault(y, []).append(x)
            counts.append(count)
            selected.append(bright)
        bands = []
        for y, count in enumerate(counts):
            if count >= 3:
                if bands and y - bands[-1][-1] <= 3:
                    bands[-1].append(y)
                else:
                    bands.append([y])
        rows = []
        for band in bands:
            top, bottom = band[0], band[-1]
            if not 7 <= bottom - top <= 28 or sum(counts[y] for y in band) < 65:
                continue
            middle = (top + bottom) // 2
            dark = sum(red < 80 and green < 115 and blue < 85 and green > red + 5
                       for red, green, blue in (pixels[x, middle] for x in range(left, right)))
            if dark < (right - left) * 0.45:
                continue  # ornamental frames and background are not controls
            # Require agreement across image preparations. Tight margins and
            # scaling can otherwise confuse small digits in either app's font.
            readings = []
            columns = [x for y in band for x in glyphs.get(y, [])]
            text_left, text_right = max(left, min(columns) - 6), min(right, max(columns) + 7)
            for padding, scale in ((3, 3), (5, 3), (7, 2)):
                crop = image.crop((text_left, max(0, top - padding), text_right, min(768, bottom + padding + 1)))
                crop = self.ImageEnhance.Contrast(self.ImageOps.grayscale(crop)).enhance(2)
                crop = crop.resize((crop.width * scale, crop.height * scale), self.Image.Resampling.LANCZOS)
                readings.append(self.text(crop))
            label = consensus(readings)
            if not label or not any(character.isalpha() for character in label):
                raise VisionError(f"Unreadable menu control at y={middle}; inspect {path}")
            rows.append({"text": label, "selected": sum(selected[y] for y in band) > 100,
                         "x": (text_left + text_right) // 2, "y": middle})
        if len(rows) < 2:
            raise VisionError(f"No supported sliding menu visible; inspect {path}")
        gaps = [rows[index + 1]["y"] - rows[index]["y"] for index in range(len(rows) - 1)]
        has_title = len(gaps) > 1 and gaps[0] > statistics.median(gaps[1:]) * 1.2
        caption = rows[0]["text"] if has_title else None
        entries = rows[1:] if has_title else rows
        output = {"kind": "sliding-menu", "caption": caption,
                  "entries": [row["text"] for row in entries],
                  "selected": [row["text"] for row in entries if row["selected"]]}
        if len(output["selected"]) != 1:
            raise VisionError(f"Expected one visible highlighted choice; inspect {path}")
        return output, entries
