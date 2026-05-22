#!/usr/bin/env python3
"""
HoC Professional PDF Generator v2
Templates: research-paper, dashboard, report, one-pager, brochure
Uses ReportLab for premium PDF generation with charts, tables, and images
"""
import json, os, sys, datetime, urllib.request, subprocess, textwrap

from reportlab.lib.pagesizes import letter, A4
from reportlab.lib.units import inch, cm
from reportlab.lib.colors import HexColor, black, white, Color
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT, TA_JUSTIFY
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Image,
                                 Table, TableStyle, PageBreak, KeepTogether,
                                 HRFlowable, Frame, PageTemplate)
from reportlab.graphics.shapes import Drawing, Rect, String, Circle, Line
from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.graphics.charts.piecharts import Pie
from reportlab.graphics.charts.linecharts import HorizontalLineChart

# ── Parse args from JSON file ───────────────────────────────────
_args_path = "/tmp/_gen_args.json"
if os.path.exists(_args_path):
    with open(_args_path, "r") as f:
        args = json.load(f)
elif len(sys.argv) > 1:
    args = json.loads(sys.argv[1])
else:
    args = {}
slide_data_raw = args.get("slide_data", "[]")
branding_raw = args.get("branding", "{}")
title_text = args.get("title", "Untitled Document")
out_path = args.get("out_path", "/workspace/document.pdf")
template_name = args.get("template", "report")
images_raw = args.get("images", "[]")

try:    sections = json.loads(slide_data_raw)
except: sections = []
if isinstance(sections, dict):
    sections = sections.get("sections", sections.get("slides", []))

try:    brand_data = json.loads(branding_raw)
except: brand_data = {}

try:    images_list = json.loads(images_raw)
except: images_list = []

# ── SVG→PNG Conversion ─────────────────────────────────────────
def svg_to_png(svg_path, png_path=None, width=800):
    if not png_path: png_path = svg_path.rsplit(".", 1)[0] + ".png"
    try:
        import cairosvg
        cairosvg.svg2png(url=svg_path, write_to=png_path, output_width=width)
        return png_path
    except ImportError: pass
    try:
        r = subprocess.run(["rsvg-convert", "-w", str(width), svg_path, "-o", png_path],
                           capture_output=True, timeout=10)
        if r.returncode == 0: return png_path
    except: pass
    return None

def download_image(url, dest):
    try:
        urllib.request.urlretrieve(url, dest)
        is_svg = dest.lower().endswith(".svg")
        if not is_svg:
            with open(dest, "rb") as f:
                is_svg = b"<svg" in f.read(256)
        if is_svg:
            png = svg_to_png(dest, dest.rsplit(".", 1)[0] + ".png")
            if png: return png
        return dest
    except: return None

# ── Template Configs ────────────────────────────────────────────
TEMPLATES = {
    "research-paper": {
        "accent": "#1a365d", "accent2": "#2563eb",
        "bg": "#ffffff", "text": "#1a1a1a", "muted": "#64748b",
        "heading_font": "Times-Bold", "body_font": "Times-Roman",
        "body_size": 12, "page_size": letter,
    },
    "dashboard": {
        "accent": "#0f172a", "accent2": "#3b82f6",
        "bg": "#f8fafc", "text": "#0f172a", "muted": "#64748b",
        "heading_font": "Helvetica-Bold", "body_font": "Helvetica",
        "body_size": 10, "page_size": A4,
    },
    "report": {
        "accent": "#0f172a", "accent2": "#3b82f6",
        "bg": "#ffffff", "text": "#1a1a1a", "muted": "#94a3b8",
        "heading_font": "Helvetica-Bold", "body_font": "Helvetica",
        "body_size": 11, "page_size": letter,
    },
    "one-pager": {
        "accent": "#7c3aed", "accent2": "#a855f7",
        "bg": "#ffffff", "text": "#1a1a1a", "muted": "#64748b",
        "heading_font": "Helvetica-Bold", "body_font": "Helvetica",
        "body_size": 10, "page_size": letter,
    },
    "brochure": {
        "accent": "#059669", "accent2": "#10b981",
        "bg": "#ffffff", "text": "#1a1a1a", "muted": "#6b7280",
        "heading_font": "Helvetica-Bold", "body_font": "Helvetica",
        "body_size": 11, "page_size": letter,
    },
}

tpl = TEMPLATES.get(template_name, TEMPLATES["report"])
ACCENT = HexColor(tpl["accent"])
ACCENT2 = HexColor(tpl["accent2"])
TEXT_COLOR = HexColor(tpl["text"])
MUTED = HexColor(tpl["muted"])
COMPANY = brand_data.get("company_name", "")
LOGO_URL = brand_data.get("logo_url", "")
TODAY = datetime.date.today().strftime("%B %d, %Y")

# ── Custom Styles ───────────────────────────────────────────────
styles = getSampleStyleSheet()

styles.add(ParagraphStyle("DocTitle", parent=styles["Title"],
    fontName=tpl["heading_font"], fontSize=28, textColor=ACCENT,
    spaceAfter=20, alignment=TA_CENTER))

styles.add(ParagraphStyle("DocSubtitle", parent=styles["Normal"],
    fontName=tpl["body_font"], fontSize=14, textColor=MUTED,
    spaceAfter=12, alignment=TA_CENTER))

if "BodyText" in styles:
    styles["BodyText"].fontName = "Inter"
    styles["BodyText"].fontSize = 10
    styles["BodyText"].leading = 16
    styles["BodyText"].textColor = TEXT_COLOR
else:
    styles.add(ParagraphStyle("BodyText", parent=styles["Normal"], 
        fontName="Inter", fontSize=10, leading=16, textColor=TEXT_COLOR, spaceAfter=8))

styles.add(ParagraphStyle("SectionHead", parent=styles["Heading1"],
    fontName=tpl["heading_font"], fontSize=18, textColor=ACCENT,
    spaceBefore=24, spaceAfter=10, borderWidth=0))

styles.add(ParagraphStyle("SubHead", parent=styles["Heading2"],
    fontName=tpl["heading_font"], fontSize=14, textColor=ACCENT2,
    spaceBefore=16, spaceAfter=8))

if "BodyText" in styles:
    styles["BodyText"].fontName = tpl["body_font"]
    styles["BodyText"].fontSize = tpl["body_size"]
    styles["BodyText"].textColor = TEXT_COLOR
    styles["BodyText"].leading = tpl["body_size"] * 1.5
    styles["BodyText"].spaceAfter = 8
    styles["BodyText"].alignment = TA_JUSTIFY
else:
    styles.add(ParagraphStyle("BodyText", parent=styles["Normal"],
        fontName=tpl["body_font"], fontSize=tpl["body_size"],
        textColor=TEXT_COLOR, leading=tpl["body_size"] * 1.5,
        spaceAfter=8, alignment=TA_JUSTIFY))

styles.add(ParagraphStyle("BulletItem", parent=styles["Normal"],
    fontName=tpl["body_font"], fontSize=tpl["body_size"],
    textColor=TEXT_COLOR, leftIndent=20, bulletIndent=10,
    spaceAfter=4))

styles.add(ParagraphStyle("Caption", parent=styles["Normal"],
    fontName=tpl["body_font"], fontSize=9, textColor=MUTED,
    alignment=TA_CENTER, spaceAfter=12))

styles.add(ParagraphStyle("KPIValue", parent=styles["Normal"],
    fontName=tpl["heading_font"], fontSize=32, textColor=ACCENT,
    alignment=TA_CENTER, spaceAfter=4))

styles.add(ParagraphStyle("KPILabel", parent=styles["Normal"],
    fontName=tpl["body_font"], fontSize=10, textColor=MUTED,
    alignment=TA_CENTER, spaceAfter=8))

styles.add(ParagraphStyle("Footer", parent=styles["Normal"],
    fontName=tpl["body_font"], fontSize=8, textColor=MUTED,
    alignment=TA_CENTER))

# ── Helper Functions ────────────────────────────────────────────
def make_chart_drawing(chart_data, chart_type="bar", width=400, height=200):
    """Generate a ReportLab drawing with a chart."""
    d = Drawing(width, height)
    labels = chart_data.get("labels", [])
    values = chart_data.get("values", [])
    if not labels or not values: return None

    colors_hex = chart_data.get("colors", [tpl["accent"], tpl["accent2"], "#22c55e", "#f59e0b", "#ef4444", "#06b6d4"])
    colors = [HexColor(c) for c in colors_hex[:len(labels)]]

    if chart_type == "pie":
        chart = Pie()
        chart.x = width/2 - 80; chart.y = 10
        chart.width = 160; chart.height = 160
        chart.data = values
        chart.labels = labels
        for i, c in enumerate(colors[:len(values)]):
            chart.slices[i].fillColor = c
            chart.slices[i].strokeColor = white
            chart.slices[i].strokeWidth = 2
        d.add(chart)
    elif chart_type == "line":
        chart = HorizontalLineChart()
        chart.x = 50; chart.y = 20
        chart.width = width - 80; chart.height = height - 40
        chart.data = [values]
        chart.categoryAxis.categoryNames = labels
        chart.lines[0].strokeColor = ACCENT
        chart.lines[0].strokeWidth = 2
        chart.valueAxis.valueMin = 0
        d.add(chart)
    else:  # bar
        chart = VerticalBarChart()
        chart.x = 50; chart.y = 20
        chart.width = width - 80; chart.height = height - 40
        chart.data = [values]
        chart.categoryAxis.categoryNames = labels
        for i, c in enumerate(colors[:len(values)]):
            chart.bars[0].fillColor = ACCENT
        chart.valueAxis.valueMin = 0
        d.add(chart)

    return d

def parse_content(content):
    """Parse content into flowables (paragraphs, bullets)."""
    flowables = []
    for line in str(content).split("\\n"):
        stripped = line.strip()
        if not stripped: continue
        if stripped[:2] in ("1.", "2.", "3.", "4.", "5.", "6.", "7.", "8.", "9."):
            flowables.append(Paragraph(f"<seq/>. {stripped[2:].strip()}", styles["BulletItem"]))
        elif stripped.startswith(("-", "•", "*")):
            text = stripped.lstrip("-•* ")
            flowables.append(Paragraph(f"• {text}", styles["BulletItem"]))
        elif stripped.startswith(">"):
            p = Paragraph(f"<i>{stripped[1:].strip()}</i>", styles["BodyText"])
            flowables.append(p)
        else:
            flowables.append(Paragraph(stripped, styles["BodyText"]))
    return flowables

# ── Page number callback ────────────────────────────────────────
def add_page_number(canvas, doc_template):
    canvas.saveState()
    canvas.setFont(tpl["body_font"], 8)
    canvas.setFillColor(MUTED)
    page_num = canvas.getPageNumber()
    text = f"{COMPANY}  •  {TODAY}  •  Page {page_num}" if COMPANY else f"{TODAY}  •  Page {page_num}"
    canvas.drawCentredString(letter[0]/2 if tpl["page_size"] == letter else A4[0]/2, 0.5*inch, text)
    # Header line
    w = letter[0] if tpl["page_size"] == letter else A4[0]
    canvas.setStrokeColor(HexColor(tpl["accent"]))
    canvas.setLineWidth(0.5)
    canvas.line(0.75*inch, tpl["page_size"][1] - 0.6*inch, w - 0.75*inch, tpl["page_size"][1] - 0.6*inch)
    canvas.restoreState()

# ── Build Document ──────────────────────────────────────────────
doc = SimpleDocTemplate(
    out_path,
    pagesize=tpl["page_size"],
    topMargin=0.85*inch,
    bottomMargin=0.75*inch,
    leftMargin=0.75*inch,
    rightMargin=0.75*inch,
)

story = []

# ── Cover Page ──────────────────────────────────────────────────
if template_name != "one-pager":
    # Logo
    if LOGO_URL:
        logo = download_image(LOGO_URL, "/tmp/_pdf_logo.png")
        if logo and os.path.exists(logo):
            try:
                story.append(Image(logo, width=1.5*inch, height=1.5*inch))
            except: pass

    story.append(Spacer(1, 1.5*inch))

    # Accent bar
    d = Drawing(doc.width, 4)
    d.add(Rect(0, 0, doc.width, 4, fillColor=ACCENT, strokeColor=None))
    story.append(d)
    story.append(Spacer(1, 20))

    story.append(Paragraph(title_text, styles["DocTitle"]))

    # Subtitle
    sub = ""
    if sections and sections[0].get("subtitle"):
        sub = sections[0]["subtitle"]
    elif template_name == "dashboard":
        sub = f"Executive Dashboard  •  {TODAY}"
    elif template_name == "research-paper":
        sub = "Research Paper"
    if sub:
        story.append(Paragraph(sub, styles["DocSubtitle"]))

    story.append(Spacer(1, 10))

    # Second accent bar
    d2 = Drawing(doc.width, 4)
    d2.add(Rect(0, 0, doc.width, 4, fillColor=ACCENT, strokeColor=None))
    story.append(d2)
    story.append(Spacer(1, 30))

    # Metadata
    meta = []
    if COMPANY: meta.append(f"<b>Organization:</b> {COMPANY}")
    meta.append(f"<b>Date:</b> {TODAY}")
    meta.append(f"<b>Template:</b> {template_name.replace('-', ' ').title()}")
    for m in meta:
        story.append(Paragraph(m, styles["Caption"]))

    story.append(PageBreak())
else:
    # One-pager: compact header
    story.append(Paragraph(title_text, styles["DocTitle"]))
    d = Drawing(doc.width, 3)
    d.add(Rect(0, 0, doc.width, 3, fillColor=ACCENT, strokeColor=None))
    story.append(d)
    story.append(Spacer(1, 12))

# ── Build Sections ──────────────────────────────────────────────
for si, section in enumerate(sections):
    layout = section.get("layout", "content")
    s_title = section.get("title", "")
    s_content = section.get("content", "")

    # Section heading
    if s_title and layout not in ("title",):
        level = section.get("level", 1)
        style_key = "SectionHead" if level <= 1 else "SubHead"
        story.append(Paragraph(s_title, styles[style_key]))

    # Content
    if layout in ("content", "section"):
        story.extend(parse_content(s_content))

    elif layout in ("stats", "kpi", "dashboard"):
        stats = section.get("stats", [])
        if not stats and s_content:
            for part in s_content.split("|"):
                kv = part.strip().split(":")
                if len(kv) >= 2:
                    stats.append({"label": kv[0].strip(), "value": kv[1].strip()})
        if stats:
            # KPI cards as a table
            ncols = min(len(stats), 4)
            val_row = [Paragraph(str(s.get("value", "—")), styles["KPIValue"]) for s in stats[:ncols]]
            lbl_row = [Paragraph(s.get("label", ""), styles["KPILabel"]) for s in stats[:ncols]]
            kpi_table = Table([val_row, lbl_row], colWidths=[doc.width/ncols]*ncols)
            kpi_table.setStyle(TableStyle([
                ("GRID", (0,0), (-1,-1), 0.5, HexColor("#e2e8f0")),
                ("BACKGROUND", (0,0), (-1,0), HexColor("#f8fafc")),
                ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
                ("TOPPADDING", (0,0), (-1,-1), 12),
                ("BOTTOMPADDING", (0,0), (-1,-1), 12),
            ]))
            story.append(kpi_table)
            story.append(Spacer(1, 12))

    elif layout == "chart":
        chart_type = section.get("chart_type", "bar")
        chart_data = section.get("chart_data", {})
        drawing = make_chart_drawing(chart_data, chart_type, width=int(doc.width), height=220)
        if drawing:
            story.append(drawing)
        story.append(Spacer(1, 8))
        if s_content:
            story.extend(parse_content(s_content))

    elif layout == "table":
        headers = section.get("headers", [])
        rows = section.get("rows", [])
        if not headers and s_content:
            for line in s_content.split("\\n"):
                cells = [c.strip() for c in line.split("|") if c.strip()]
                if cells:
                    if not headers: headers = cells
                    else: rows.append(cells)
        if headers:
            data = [headers] + rows
            ncols = len(headers)
            col_w = doc.width / ncols
            t = Table(data, colWidths=[col_w]*ncols)
            t.setStyle(TableStyle([
                ("BACKGROUND", (0,0), (-1,0), ACCENT),
                ("TEXTCOLOR", (0,0), (-1,0), white),
                ("FONTNAME", (0,0), (-1,0), tpl["heading_font"]),
                ("FONTSIZE", (0,0), (-1,0), 10),
                ("ALIGN", (0,0), (-1,-1), "CENTER"),
                ("FONTNAME", (0,1), (-1,-1), tpl["body_font"]),
                ("FONTSIZE", (0,1), (-1,-1), 9),
                ("ROWBACKGROUNDS", (0,1), (-1,-1), [white, HexColor("#f8fafc")]),
                ("GRID", (0,0), (-1,-1), 0.5, HexColor("#e2e8f0")),
                ("TOPPADDING", (0,0), (-1,-1), 6),
                ("BOTTOMPADDING", (0,0), (-1,-1), 6),
            ]))
            story.append(t)
            story.append(Spacer(1, 12))

    elif layout == "image":
        img_url = section.get("image_url", "")
        caption = section.get("caption", "")
        if img_url:
            img_path = download_image(img_url, f"/tmp/_pdf_img_{si}.png")
            if img_path and os.path.exists(img_path):
                try:
                    story.append(Image(img_path, width=5*inch, height=3*inch, kind="proportional"))
                except: pass
        if caption:
            story.append(Paragraph(caption, styles["Caption"]))
        if s_content:
            story.extend(parse_content(s_content))

    elif layout == "two_column":
        parts = s_content.split("|||") if "|||" in str(s_content) else [str(s_content), ""]
        col_data = [[Paragraph(parts[0].strip(), styles["BodyText"]),
                      Paragraph(parts[1].strip() if len(parts) > 1 else "", styles["BodyText"])]]
        t = Table(col_data, colWidths=[doc.width/2 - 5]*2, spaceBefore=8)
        t.setStyle(TableStyle([
            ("VALIGN", (0,0), (-1,-1), "TOP"),
            ("LEFTPADDING", (0,0), (-1,-1), 8),
            ("RIGHTPADDING", (0,0), (-1,-1), 8),
        ]))
        story.append(t)

    elif layout == "callout":
        icon = section.get("icon", "ℹ️")
        d = Drawing(doc.width, 2)
        d.add(Rect(0, 0, 3, 40, fillColor=ACCENT, strokeColor=None))
        story.append(d)
        story.append(Paragraph(f"<b>{icon}</b> {s_content}", styles["BodyText"]))
        story.append(Spacer(1, 8))

    elif layout == "references":
        refs = section.get("references", [])
        if not refs and s_content:
            refs = [r.strip() for r in s_content.split("\\n") if r.strip()]
        for ri, ref in enumerate(refs):
            story.append(Paragraph(f"[{ri+1}] {ref}", styles["BulletItem"]))

    else:
        story.extend(parse_content(s_content))

# ── Extra Images ────────────────────────────────────────────────
for img in images_list:
    url = img.get("url", "")
    caption = img.get("caption", "")
    if url:
        path = download_image(url, f"/tmp/_pdf_extra_{images_list.index(img)}.png")
        if path and os.path.exists(path):
            try:
                story.append(Image(path, width=5*inch, height=3*inch, kind="proportional"))
            except: pass
        if caption:
            story.append(Paragraph(caption, styles["Caption"]))

# ── Build ───────────────────────────────────────────────────────
doc.build(story, onFirstPage=add_page_number, onLaterPages=add_page_number)
print(f"PDF saved: {out_path} (template: {template_name}, {len(sections)} sections)")
