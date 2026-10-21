"""Capture the actual private X11 root through Pillow's direct XCB transport."""
import sys
from pathlib import Path
from PIL import ImageGrab
image=ImageGrab.grab(xdisplay=sys.argv[1])
if image.size!=(1024,768):raise ValueError('Unexpected original display geometry')
image.save(Path(sys.argv[2]))
