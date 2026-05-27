"""
make_images.py - Generate placeholder images for the site.
Run: python make_images.py
"""
import sys, struct, zlib

def make_png(width, height, bg_rgb, text_lines=None, text_rgb=(255,255,255)):
    """Create a minimal PNG using only stdlib. No Pillow required."""
    r, g, b = bg_rgb
    row = bytes([0] + [r, g, b] * width)
    raw = row * height
    compressed = zlib.compress(raw)

    def chunk(name, data):
        c = name + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)

    sig = b'\x89PNG\r\n\x1a\n'
    ihdr_data = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    ihdr = chunk(b'IHDR', ihdr_data)
    idat = chunk(b'IDAT', compressed)
    iend = chunk(b'IEND', b'')
    return sig + ihdr + idat + iend

import os

base = "D:/Projects/minecraft-tools"

# Try Pillow first, fall back to raw PNG
try:
    from PIL import Image, ImageDraw, ImageFont
    USE_PILLOW = True
    print("Using Pillow for image generation")
except ImportError:
    USE_PILLOW = False
    print("Pillow not available, using raw PNG (no text)")

def save_placeholder(path, width, height, bg, label, accent=(204, 0, 0)):
    if USE_PILLOW:
        img = Image.new("RGB", (width, height), bg)
        draw = ImageDraw.Draw(img)
        # Try to use a system font, fall back to default
        try:
            font_large = ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf", max(24, width // 12))
            font_small = ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf", max(16, width // 20))
        except Exception:
            font_large = ImageFont.load_default()
            font_small = font_large
        # Draw accent bar at top
        draw.rectangle([0, 0, width, max(6, height // 60)], fill=accent)
        # Draw label centered
        bbox = draw.textbbox((0, 0), label, font=font_large)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        draw.text(((width - tw) // 2, (height - th) // 2), label, fill=(232, 232, 232), font=font_large)
        img.save(path, "PNG")
    else:
        data = make_png(width, height, bg)
        with open(path, "wb") as f:
            f.write(data)

# og-image: 1200x630
save_placeholder(
    f"{base}/assets/img/og-image.png",
    1200, 630,
    (26, 26, 26),
    "BlockForge"
)
print("og-image.png written")

# Showcase placeholders: 600x600
showcases = [
    ("portrait.png",        "Portrait Mural"),
    ("logo.png",            "Game Logo"),
    ("mob-art.png",         "Mob Art"),
    ("landscape.png",       "Landscape"),
    ("character-sprite.png","Character Sprite"),
    ("map-art.png",         "Map Art"),
]

for fname, label in showcases:
    save_placeholder(
        f"{base}/assets/img/showcase/{fname}",
        600, 600,
        (42, 42, 42),
        label
    )
    print(f"showcase/{fname} written")

print("Done.")
