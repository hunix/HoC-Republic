#!/usr/bin/env python3
"""Render a first no-audio HoC-Republic proof-demo MP4 from local proof artifacts."""

from __future__ import annotations

import json
import os
import textwrap
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / "docs" / "hoc" / "outreach" / "demo-assets"
FRAME_DIR = ASSET_DIR / "video-frames"
OUT_VIDEO = ASSET_DIR / "hoc-republic-proof-demo-v0.mp4"
PROOF_JSON = ASSET_DIR / "hoc-republic-digital-genome-proof.json"
DIAGRAM = ASSET_DIR / "hoc-republic-proof-flow.png"

W, H = 1920, 1080
BG = (10, 14, 23)
PANEL = (18, 26, 42)
GREEN = (118, 230, 170)
BLUE = (123, 188, 255)
TEXT = (234, 240, 248)
MUTED = (158, 172, 194)
GOLD = (246, 196, 89)
RED = (244, 132, 132)


def font(size: int, mono: bool = False) -> ImageFont.FreeTypeFont:
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf" if mono else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationMono-Regular.ttf" if mono else "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
    ]
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()

TITLE = font(74)
SUB = font(42)
BODY = font(34)
SMALL = font(26)
MONO = font(31, mono=True)
MONO_SMALL = font(24, mono=True)


def wrap(text: str, width: int) -> list[str]:
    lines: list[str] = []
    for paragraph in text.split("\n"):
        if not paragraph:
            lines.append("")
            continue
        lines.extend(textwrap.wrap(paragraph, width=width))
    return lines


def draw_wrapped(draw: ImageDraw.ImageDraw, text: str, xy: tuple[int, int], font_obj, fill=TEXT, width=58, spacing=12) -> int:
    x, y = xy
    for line in wrap(text, width):
        draw.text((x, y), line, font=font_obj, fill=fill)
        y += font_obj.size + spacing
    return y


def rounded_panel(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], fill=PANEL, outline=(38, 55, 82)) -> None:
    draw.rounded_rectangle(box, radius=26, fill=fill, outline=outline, width=2)


def base(title: str, subtitle: str | None = None) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)
    draw.rectangle((0, 0, W, 10), fill=GREEN)
    draw.text((90, 74), title, font=TITLE, fill=TEXT)
    if subtitle:
        draw.text((94, 160), subtitle, font=SUB, fill=MUTED)
    draw.text((90, 1008), "HoC-Republic · open-source agent-civilization simulation · critique wanted", font=SMALL, fill=MUTED)
    return img, draw


def save_frame(index: int, img: Image.Image, seconds: int = 4) -> None:
    FRAME_DIR.mkdir(parents=True, exist_ok=True)
    img.save(FRAME_DIR / f"frame_{index:03d}.png")


def slide_title(index: int) -> None:
    img, draw = base("HoC-Republic", "A tiny open-source AI republic, shown as inspectable code")
    rounded_panel(draw, (90, 250, 1830, 870))
    draw.text((150, 310), "Not AGI. Not artificial life.", font=SUB, fill=GOLD)
    draw_wrapped(
        draw,
        "This proof demo shows a narrow, source-backed mechanic: digital-genome parent selection, crossover, mutation, resource gating, and a Birth event inside the simulation.",
        (150, 390),
        BODY,
        width=75,
    )
    draw_wrapped(
        draw,
        "The goal is to invite researchers and builders to clone it, test it, and propose better benchmarks.",
        (150, 595),
        BODY,
        fill=GREEN,
        width=74,
    )
    save_frame(index, img)


def slide_command(index: int) -> None:
    img, draw = base("1. Reproduce the proof", "One command writes JSON and Markdown artifacts")
    rounded_panel(draw, (120, 260, 1800, 830), fill=(7, 11, 18), outline=(69, 96, 130))
    commands = [
        "$ pnpm demo:proof",
        "Wrote docs/hoc/outreach/demo-assets/hoc-republic-digital-genome-proof.json",
        "Wrote docs/hoc/outreach/demo-assets/hoc-republic-digital-genome-proof.md",
        "{",
        '  "resourceGateOpen": true,',
        '  "birthCreated": true,',
        '  "poolSizeAfter": 3',
        "}",
    ]
    y = 320
    for line in commands:
        color = GREEN if line.startswith("$") else TEXT
        draw.text((180, y), line, font=MONO, fill=color)
        y += 58
    save_frame(index, img)


def slide_metrics(index: int, proof: dict) -> None:
    img, draw = base("2. What the run shows", "Digital lineage as a bounded software simulation")
    rounded_panel(draw, (100, 240, 1820, 880))
    rows = [
        ("Topology", " → ".join(map(str, proof["topology"]))),
        ("Expected weights", str(proof["expectedWeightCount"])),
        ("Parent A", f"fitness {proof['parentA']['fitness']}"),
        ("Parent B", f"fitness {proof['parentB']['fitness']}"),
        ("Direct child", f"generation {proof['directChild']['generation']}, fitness {proof['directChild']['fitness']}"),
        ("Birth event", "created" if proof["genomeTick"]["birthCreated"] else "not created"),
    ]
    x1, x2, y = 165, 670, 320
    for label, value in rows:
        draw.text((x1, y), label, font=BODY, fill=MUTED)
        draw.text((x2, y), value, font=BODY, fill=TEXT if label != "Birth event" else GREEN)
        y += 72
    birth = proof["genomeTick"].get("birthEvent") or {}
    description = birth.get("description", "No Birth event was emitted in this run.")
    draw_wrapped(draw, f"Event log: {description}", (165, 785), SMALL, fill=GOLD, width=112)
    save_frame(index, img)


def slide_diagram(index: int) -> None:
    img, draw = base("3. Proof flow", "The demo exercises repository modules rather than mocked behavior")
    if DIAGRAM.exists():
        diagram = Image.open(DIAGRAM).convert("RGB")
        diagram.thumbnail((1600, 700), Image.LANCZOS)
        x = (W - diagram.width) // 2
        y = 260
        rounded_panel(draw, (x - 35, y - 35, x + diagram.width + 35, y + diagram.height + 35), fill=(248, 250, 252), outline=(92, 128, 180))
        img.paste(diagram, (x, y))
    else:
        draw_wrapped(draw, "Diagram asset not found.", (160, 330), BODY, fill=RED)
    save_frame(index, img)


def slide_limits(index: int) -> None:
    img, draw = base("4. What this does — and does not — claim", "Credibility first, virality second")
    rounded_panel(draw, (90, 250, 880, 850))
    rounded_panel(draw, (1040, 250, 1830, 850))
    draw.text((150, 315), "This proves", font=SUB, fill=GREEN)
    draw_wrapped(draw, "A runnable TypeScript module can create parent genomes, evaluate fitness, select parents, cross over, mutate, pass a resource gate, and log an offspring Birth event.", (150, 400), BODY, width=32)
    draw.text((1100, 315), "This does not claim", font=SUB, fill=RED)
    draw_wrapped(draw, "Consciousness, personhood, biological reproduction, AGI, or real-world authority. It is an inspectable simulation artifact for critique and benchmarking.", (1100, 400), BODY, width=32)
    save_frame(index, img)


def slide_close(index: int) -> None:
    img, draw = base("Clone it. Break it. Benchmark it.", "Researchers and builders: critique wanted")
    rounded_panel(draw, (140, 280, 1780, 815))
    draw_wrapped(
        draw,
        "The next serious question is measurement: does memory improve coherence, does governance state change decisions, and does lineage produce useful specialization?",
        (210, 350),
        BODY,
        width=70,
    )
    draw.text((210, 600), "Repository: https://github.com/hunix/HoC", font=MONO, fill=BLUE)
    draw.text((210, 665), "Demo command: pnpm demo:proof", font=MONO, fill=GREEN)
    save_frame(index, img)


def main() -> None:
    proof = json.loads(PROOF_JSON.read_text())
    if FRAME_DIR.exists():
        for child in FRAME_DIR.glob("*.png"):
            child.unlink()
    slide_title(1)
    slide_command(2)
    slide_metrics(3, proof)
    slide_diagram(4)
    slide_limits(5)
    slide_close(6)
    concat_file = ASSET_DIR / "video-frames.txt"
    with concat_file.open("w", encoding="utf-8") as f:
        for frame in sorted(FRAME_DIR.glob("frame_*.png")):
            f.write(f"file '{frame.resolve()}'\n")
            f.write("duration 4\n")
        f.write(f"file '{sorted(FRAME_DIR.glob('frame_*.png'))[-1].resolve()}'\n")
    print(concat_file)
    print(OUT_VIDEO)


if __name__ == "__main__":
    main()
