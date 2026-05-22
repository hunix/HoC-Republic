from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import math

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "assets" / "hoc-republic-social-preview.png"
W, H = 1280, 640

# Colors derived from the project documentation palette.
BG_TOP = (12, 13, 18)
BG_BOTTOM = (32, 20, 23)
ORANGE = (255, 90, 54)
ORANGE_LIGHT = (255, 138, 107)
CREAM = (255, 245, 232)
MUTED = (197, 184, 176)
LINE = (255, 129, 90, 120)
CARD = (28, 28, 36, 230)
BLUE = (93, 164, 255)
GREEN = (101, 218, 158)
PURPLE = (183, 132, 255)

def font(size: int, bold: bool = False):
    candidates = [
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/usr/share/fonts/opentype/noto/NotoSansCJKsc-Bold.otf" if bold else "/usr/share/fonts/opentype/noto/NotoSansCJKsc-Regular.otf",
    ]
    for candidate in candidates:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()

def rounded_rect(draw, xy, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)

def draw_node(draw, center, label, color, radius=58):
    x, y = center
    draw.ellipse((x-radius, y-radius, x+radius, y+radius), fill=(color[0], color[1], color[2], 42), outline=color, width=4)
    # Simple OpenClaw-like claws.
    for angle in (-32, 0, 32):
        rad = math.radians(angle - 90)
        x2 = x + math.cos(rad) * (radius - 16)
        y2 = y + math.sin(rad) * (radius - 16)
        draw.line((x, y, x2, y2), fill=color, width=6)
        draw.ellipse((x2-6, y2-6, x2+6, y2+6), fill=color)
    draw.text((x, y+radius+16), label, fill=CREAM, font=font(24, True), anchor="mm")

# Gradient background.
img = Image.new("RGB", (W, H), BG_TOP)
pixels = img.load()
for y in range(H):
    t = y / max(H - 1, 1)
    r = int(BG_TOP[0] * (1 - t) + BG_BOTTOM[0] * t)
    g = int(BG_TOP[1] * (1 - t) + BG_BOTTOM[1] * t)
    b = int(BG_TOP[2] * (1 - t) + BG_BOTTOM[2] * t)
    for x in range(W):
        pixels[x, y] = (r, g, b)

draw = ImageDraw.Draw(img, "RGBA")

# Background civic grid and orbit lines.
for x in range(-120, W + 120, 120):
    draw.line((x, 0, x + 320, H), fill=(255, 255, 255, 12), width=1)
for y in range(40, H, 80):
    draw.line((0, y, W, y), fill=(255, 255, 255, 10), width=1)
for i, radius in enumerate((180, 260, 340)):
    draw.ellipse((855-radius, 320-radius, 855+radius, 320+radius), outline=(255, 90, 54, 28 - i * 5), width=2)

# Main text panel.
rounded_rect(draw, (64, 68, 756, 570), 34, CARD, outline=(255, 90, 54, 90), width=2)
draw.text((104, 116), "HoC-Republic", fill=CREAM, font=font(72, True))
draw.text((108, 196), "The Republic of OpenClaws", fill=ORANGE_LIGHT, font=font(38, True))

headline = "Agents as citizens\nthat create, govern,\nand reproduce"
draw.multiline_text((104, 246), headline, fill=CREAM, font=font(46, True), spacing=8)

subtitle = "Work • art/code/music • research\nconstitution • elections • families\nsix-store memory • digital genomes"
draw.multiline_text((108, 416), subtitle, fill=MUTED, font=font(27), spacing=8)

# Quick-start strip.
rounded_rect(draw, (104, 510, 716, 542), 16, (255, 90, 54, 36), outline=(255, 90, 54, 96), width=1)
draw.text((410, 526), "pnpm dev onboard  ->  pnpm dev gateway run", fill=CREAM, font=font(23, True), anchor="mm")

# Diagram area: parent agent to citizens/tools/memory/republic.
parent = (900, 205)
citizen = (1044, 330)
tools = (816, 372)
republic = (988, 492)
for a, b, color in [(parent, citizen, ORANGE), (parent, tools, BLUE), (citizen, republic, GREEN), (tools, republic, PURPLE)]:
    draw.line((a[0], a[1], b[0], b[1]), fill=(color[0], color[1], color[2], 160), width=5)
    # arrowhead near endpoint
    dx, dy = b[0] - a[0], b[1] - a[1]
    length = math.hypot(dx, dy) or 1
    ux, uy = dx / length, dy / length
    px, py = b[0] - ux * 72, b[1] - uy * 72
    left = (px - uy * 10, py + ux * 10)
    right = (px + uy * 10, py - ux * 10)
    tip = (px + ux * 18, py + uy * 18)
    draw.polygon([left, right, tip], fill=color)

draw_node(draw, parent, "Parent Agent", ORANGE, 70)
draw_node(draw, citizen, "Citizen", GREEN, 58)
draw_node(draw, tools, "Work", BLUE, 54)
draw_node(draw, republic, "Republic", PURPLE, 62)

# Footer link.
draw.text((640, 610), "github.com/hunix/HoC-Republic", fill=(255, 245, 232, 210), font=font(24, True), anchor="mm")

OUT.parent.mkdir(parents=True, exist_ok=True)
img.save(OUT, optimize=True)
print(OUT)
