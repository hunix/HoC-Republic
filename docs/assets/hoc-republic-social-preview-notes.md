# HoC-Republic social preview validation notes

The first generated preview used unavailable DejaVu font paths and fell back to Pillow’s small bitmap font, making the title and body text unreadable. The generator was corrected to use installed Liberation Sans and Noto Sans CJK font files.

The regenerated `docs/assets/hoc-republic-social-preview.png` is 1280×640 pixels, approximately 93 KB, and visually suitable for GitHub social sharing. It presents the project name, the phrase **The Republic of OpenClaws**, the technical positioning **Recursive AI-agent orchestration**, a concise description, the canonical development gateway command, a diagram of parent agent → tools/OpenClaw/Republic, and the repository URL.
