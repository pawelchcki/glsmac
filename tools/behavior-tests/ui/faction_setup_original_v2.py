#!/usr/bin/env python3
"""Observe the label independently of adjoining editable text and its caret."""
import hashlib
from pathlib import Path
import subprocess
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from protocol import ProtocolError
from ui import faction_setup_original as original
from ui.vision import VisionError


def plain_label(text):
    if ':' not in text:
        raise VisionError('name label delimiter was not observed')
    label = text.split(':', 1)[0].strip()
    if not label or any(char in label for char in '{}^|$'):
        raise VisionError('unsupported or ambiguous name-label glyph')
    depth = 0
    for char in label:
        if char == '(':
            depth += 1
        elif char == ')':
            depth -= 1
        if depth < 0:
            raise VisionError('unbalanced name-label punctuation')
    if depth:
        raise VisionError('unbalanced name-label punctuation')
    return label


class FactionVision(original.FactionVision):
    def region(self, image, box, black=False):
        if box == (347, 688, 1007, 708) and not black:
            # Stop at the shortest actual region containing a complete label.
            # Long editable strings/carets must not influence label OCR. No
            # expected words or punctuation substitutions supply an answer.
            for right in range(442, 523, 8):
                try:
                    text = super().region(image, (347, 688, right, 708))
                    plain_label(text)
                    return text
                except VisionError:
                    continue
            raise VisionError('no complete unambiguous isolated name label')
        return super().region(image, box, black)


def main():
    baseline = original.fingerprint
    original.FactionVision = FactionVision
    original.fingerprint = lambda: hashlib.sha256(
        bytes.fromhex(baseline()) + Path(__file__).read_bytes()).hexdigest()
    original.main()


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, ProtocolError, VisionError, subprocess.SubprocessError) as error:
        print(f'Original isolated-label capture failed: {error}', file=sys.stderr)
        sys.exit(1)
