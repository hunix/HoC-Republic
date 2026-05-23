from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

OUT_DIR = Path(__file__).parent
W, H = 1270, 760
BG = '#0B1020'
PANEL = '#111827'
BLUE = '#60A5FA'
GOLD = '#FBBF24'
PURPLE = '#A78BFA'
GREEN = '#34D399'
TEXT = '#F8FAFC'
MUTED = '#CBD5E1'

font_bold = '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf'
font_regular = '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf'
TITLE = ImageFont.truetype(font_bold, 58)
SUBTITLE = ImageFont.truetype(font_regular, 28)
LABEL = ImageFont.truetype(font_bold, 24)
SMALL = ImageFont.truetype(font_regular, 22)
TINY = ImageFont.truetype(font_regular, 18)


def rounded_rect(draw, box, radius, fill, outline=None, width=2):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def centered(draw, xy, text, font, fill):
    x, y = xy
    bbox = draw.textbbox((0, 0), text, font=font)
    draw.text((x - (bbox[2] - bbox[0]) / 2, y - (bbox[3] - bbox[1]) / 2), text, font=font, fill=fill)


def draw_header(draw, title, subtitle):
    draw.text((70, 52), title, font=TITLE, fill=TEXT)
    draw.text((72, 122), subtitle, font=SUBTITLE, fill=MUTED)
    draw.line((70, 174, 1200, 174), fill='#1E293B', width=3)


def draw_node(draw, x, y, w, h, label, color):
    rounded_rect(draw, (x, y, x + w, y + h), 18, PANEL, color, 3)
    # Wrap rough by splitting explicit newlines only; labels are pre-sized.
    lines = label.split('\n')
    total = len(lines) * 25
    for i, line in enumerate(lines):
        centered(draw, (x + w / 2, y + h / 2 - total / 2 + 17 + i * 25), line, SMALL, TEXT)


def arrow(draw, start, end, color='#64748B'):
    draw.line((*start, *end), fill=color, width=4)
    ex, ey = end
    sx, sy = start
    dx, dy = ex - sx, ey - sy
    # Simple arrowhead for mostly horizontal/vertical lines
    if abs(dx) >= abs(dy):
        sign = 1 if dx > 0 else -1
        pts = [(ex, ey), (ex - sign * 16, ey - 9), (ex - sign * 16, ey + 9)]
    else:
        sign = 1 if dy > 0 else -1
        pts = [(ex, ey), (ex - 9, ey - sign * 16), (ex + 9, ey - sign * 16)]
    draw.polygon(pts, fill=color)


def card_architecture():
    img = Image.new('RGB', (W, H), BG)
    draw = ImageDraw.Draw(img)
    draw_header(draw, 'HoC-Republic', 'Open-source AI agents organized as a digital civilization')

    # Main panels
    rounded_rect(draw, (65, 220, 395, 640), 26, '#0F172A', BLUE, 3)
    rounded_rect(draw, (470, 220, 805, 640), 26, '#0F172A', PURPLE, 3)
    rounded_rect(draw, (880, 220, 1205, 640), 26, '#0F172A', GOLD, 3)

    centered(draw, (230, 255), 'Runtime', LABEL, BLUE)
    centered(draw, (637, 255), 'Republic', LABEL, PURPLE)
    centered(draw, (1042, 255), 'Recursive Birth', LABEL, GOLD)

    draw_node(draw, 105, 305, 250, 70, 'OpenClaw\nGateway', BLUE)
    draw_node(draw, 105, 410, 250, 70, 'Agent\nRuntime', BLUE)
    draw_node(draw, 105, 515, 250, 70, 'Plugin +\nMessaging', BLUE)
    arrow(draw, (230, 375), (230, 410), BLUE)
    arrow(draw, (230, 480), (230, 515), BLUE)

    draw_node(draw, 512, 302, 250, 62, 'AI Citizens', PURPLE)
    draw_node(draw, 512, 392, 250, 62, 'Six-layer Memory', PURPLE)
    draw_node(draw, 512, 482, 250, 62, 'Governance + Work', PURPLE)
    draw_node(draw, 512, 572, 250, 62, 'Families + Artifacts', PURPLE)
    arrow(draw, (637, 364), (637, 392), PURPLE)
    arrow(draw, (637, 454), (637, 482), PURPLE)
    arrow(draw, (637, 544), (637, 572), PURPLE)

    draw_node(draw, 920, 302, 245, 62, 'Digital Genomes', GOLD)
    draw_node(draw, 920, 392, 245, 62, 'Crossover + Mutation', GOLD)
    draw_node(draw, 920, 482, 245, 62, 'Fitness + Resource Gate', GOLD)
    draw_node(draw, 920, 572, 245, 62, 'Specialized Child Agents', GOLD)
    arrow(draw, (1042, 364), (1042, 392), GOLD)
    arrow(draw, (1042, 454), (1042, 482), GOLD)
    arrow(draw, (1042, 544), (1042, 572), GOLD)

    arrow(draw, (355, 445), (512, 333), '#94A3B8')
    arrow(draw, (762, 603), (920, 333), '#94A3B8')
    arrow(draw, (920, 603), (762, 333), '#94A3B8')

    draw.text((72, 685), 'Run locally. Inspect the source. Propose reproducible Republic demos.', font=SUBTITLE, fill=GOLD)
    img.save(OUT_DIR / 'producthunt-gallery-architecture-card.png', optimize=True)


def card_genome():
    img = Image.new('RGB', (W, H), BG)
    draw = ImageDraw.Draw(img)
    draw_header(draw, 'Digital-Genome Child Agents', 'A rigorous simulation flow for lineage, specialization, and safety gates')

    # Family side
    draw_node(draw, 80, 265, 235, 85, 'Parent Citizen A\ntraits + memory', BLUE)
    draw_node(draw, 80, 430, 235, 85, 'Parent Citizen B\nrole + profile', BLUE)
    draw_node(draw, 385, 347, 230, 85, 'Eligibility +\npolicy checks', PURPLE)
    arrow(draw, (315, 307), (385, 370), BLUE)
    arrow(draw, (315, 472), (385, 410), BLUE)

    # Pipeline
    steps = [
        ('Genome\nselection', 665, 250, PURPLE),
        ('Crossover', 665, 370, GOLD),
        ('Mutation', 665, 490, GOLD),
        ('Resource +\nfitness gate', 865, 370, GREEN),
        ('Child agent\nprofile', 1060, 250, BLUE),
        ('Lineage +\ntask output', 1060, 490, BLUE),
    ]
    for label, x, y, color in steps:
        draw_node(draw, x, y, 150, 80, label, color)

    arrow(draw, (615, 390), (665, 290), PURPLE)
    arrow(draw, (740, 330), (740, 370), GOLD)
    arrow(draw, (740, 450), (740, 490), GOLD)
    arrow(draw, (815, 410), (865, 410), GREEN)
    arrow(draw, (1015, 390), (1060, 290), GREEN)
    arrow(draw, (1135, 330), (1135, 490), BLUE)

    # Rejection lane
    rounded_rect(draw, (862, 540, 1018, 612), 16, '#1F2937', '#EF4444', 3)
    centered(draw, (940, 575), 'Reject or halt', SMALL, '#FCA5A5')
    arrow(draw, (940, 450), (940, 540), '#EF4444')

    # Footer statement
    rounded_rect(draw, (70, 660, 1200, 715), 18, '#111827', '#334155', 2)
    draw.text((95, 675), 'The hook is unusual, but the claim is precise: digital inheritance, not biological DNA.', font=SUBTITLE, fill=TEXT)

    img.save(OUT_DIR / 'producthunt-gallery-genome-birth-card.png', optimize=True)


if __name__ == '__main__':
    card_architecture()
    card_genome()
    print(OUT_DIR / 'producthunt-gallery-architecture-card.png')
    print(OUT_DIR / 'producthunt-gallery-genome-birth-card.png')
