from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

out = Path(__file__).with_name('producthunt-thumbnail.png')
size = 1024
img = Image.new('RGB', (size, size), '#0B1020')
draw = ImageDraw.Draw(img)
center = (size // 2, size // 2)

for r, color, width in [
    (430, '#1E3A8A', 8),
    (340, '#2563EB', 6),
    (250, '#7C3AED', 5),
    (180, '#F59E0B', 10),
]:
    x0, y0 = center[0] - r, center[1] - r
    x1, y1 = center[0] + r, center[1] + r
    draw.ellipse((x0, y0, x1, y1), outline=color, width=width)

nodes = [
    (512, 132), (778, 244), (878, 512), (778, 780),
    (512, 892), (246, 780), (146, 512), (246, 244)
]
for x, y in nodes:
    draw.line((center[0], center[1], x, y), fill='#334155', width=5)
for x, y in nodes:
    draw.ellipse((x-34, y-34, x+34, y+34), fill='#111827', outline='#60A5FA', width=6)
    draw.ellipse((x-12, y-12, x+12, y+12), fill='#FBBF24')

draw.ellipse((300, 300, 724, 724), fill='#111827', outline='#F59E0B', width=14)
draw.ellipse((350, 350, 674, 674), fill='#172554', outline='#60A5FA', width=6)

font_path_bold = '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf'
font_path_regular = '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf'
font_big = ImageFont.truetype(font_path_bold, 158)
font_mid = ImageFont.truetype(font_path_bold, 58)
font_small = ImageFont.truetype(font_path_regular, 34)

def centered_text(text, y, font, fill):
    bbox = draw.textbbox((0, 0), text, font=font)
    x = (size - (bbox[2] - bbox[0])) // 2
    draw.text((x, y), text, font=font, fill=fill)

centered_text('HoC', 382, font_big, '#FFFFFF')
centered_text('REPUBLIC', 540, font_mid, '#FBBF24')
centered_text('AI Agent Civilization', 620, font_small, '#BFDBFE')

img.save(out, optimize=True)
print(out)
