/**
 * Intelligence Tools — Vision, document understanding, search, embeddings, translation, code review
 * Handles: image_analyze, pdf_extract, file_search, git_diff_review, vector_store, translate
 */

import type { ToolInput, ToolHandlerMap, ToolSummaryMap, SandboxContext } from "./types.js";

export function createIntelligenceToolsHandlers(ctx: SandboxContext): ToolHandlerMap {
  const { sandboxExec, sandboxWriteFile } = ctx;

  return {
    // ─── Image Analysis (Vision/OCR) ─────────────────────────────
    image_analyze: async (input: ToolInput) => {
      const action = (input.action as string) || "describe";
      const imgPath = (input.image_path as string) || "";
      if (!imgPath) {
        return "Error: image_path is required";
      }
      const imgB = (input.image_b as string) || "";
      const lang = (input.lang as string) || "eng";
      const outPath = (input.output_path as string) || "";

      // Ensure dependencies
      const check = await sandboxExec(
        "python3 -c 'from PIL import Image; print(\"ok\")' 2>/dev/null",
        "/workspace",
        5,
      );
      if (check.exitCode !== 0) {
        await sandboxExec("pip install Pillow pytesseract numpy 2>&1 | tail -3", "/workspace", 30);
      }

      let pyScript = `from PIL import Image\nimport json, sys, os\n`;

      switch (action) {
        case "measure":
          pyScript += `img = Image.open("${imgPath}")
w, h = img.size
info = {"width": w, "height": h, "format": img.format, "mode": img.mode, "file_size_bytes": os.path.getsize("${imgPath}"), "dpi": img.info.get("dpi", "N/A")}
print(f"📐 Image: {w}×{h} {img.format or 'unknown'}")
print(f"Mode: {img.mode} | Size: {info['file_size_bytes']/1024:.1f}KB | DPI: {info['dpi']}")`;
          break;
        case "ocr":
          pyScript += `import pytesseract
img = Image.open("${imgPath}")
text = pytesseract.image_to_string(img, lang="${lang}")
print("📝 OCR Result:\\n")
print(text[:10000])`;
          break;
        case "colors":
          pyScript += `import numpy as np
img = Image.open("${imgPath}").convert("RGB").resize((150, 150))
pixels = np.array(img).reshape(-1, 3)
from collections import Counter
counts = Counter(map(tuple, pixels.tolist()))
top = counts.most_common(10)
print("🎨 Dominant Colors:")
for color, cnt in top:
    hex_c = '#{:02x}{:02x}{:02x}'.format(*color)
    pct = cnt / len(pixels) * 100
    print(f"  {hex_c} — {pct:.1f}%")`;
          break;
        case "metadata":
          pyScript += `img = Image.open("${imgPath}")
print("📋 Image Metadata:")
print(f"  Format: {img.format}")
print(f"  Size: {img.size[0]}×{img.size[1]}")
print(f"  Mode: {img.mode}")
for k, v in (img.info or {}).items():
    if isinstance(v, bytes):
        print(f"  {k}: <{len(v)} bytes>")
    else:
        print(f"  {k}: {str(v)[:200]}")
exif = img.getexif() if hasattr(img, 'getexif') else {}
if exif:
    print("\\nEXIF Data:")
    for tag_id, val in list(exif.items())[:30]:
        print(f"  Tag {tag_id}: {str(val)[:100]}")`;
          break;
        case "compare":
          if (!imgB) {
            return "Error: image_b required for compare action";
          }
          pyScript += `import numpy as np
imgA = Image.open("${imgPath}").convert("RGB")
imgB = Image.open("${imgB}").convert("RGB").resize(imgA.size)
arrA, arrB = np.array(imgA), np.array(imgB)
diff = np.abs(arrA.astype(int) - arrB.astype(int))
mse = np.mean(diff**2)
changed_pct = (diff.sum(axis=2) > 30).sum() / (arrA.shape[0]*arrA.shape[1]) * 100
print(f"🔍 Image Comparison:")
print(f"  Image A: ${imgPath} ({imgA.size[0]}×{imgA.size[1]})")
print(f"  Image B: ${imgB} ({imgB.size[0]}×{imgB.size[1]})")
print(f"  MSE: {mse:.2f}")
print(f"  Pixels changed: {changed_pct:.1f}%")
print(f"  Identical: {'Yes' if mse < 0.1 else 'No'}")
# Save diff image
diff_img = Image.fromarray(np.clip(diff * 3, 0, 255).astype(np.uint8))
diff_path = "${outPath}" or "/workspace/diff_result.png"
diff_img.save(diff_path)
print(f"  Diff image: {diff_path}")`;
          break;
        case "describe":
          pyScript += `img = Image.open("${imgPath}")
w, h = img.size
mode = img.mode
colors_count = len(set(list(img.convert("RGB").resize((50,50)).getdata())))
print(f"🖼️ Image Description:")
print(f"  Dimensions: {w}×{h} pixels")
print(f"  Format: {img.format or 'unknown'}, Mode: {mode}")
print(f"  Color diversity: ~{colors_count} unique colors (sampled)")
print(f"  Aspect ratio: {w/h:.2f}")
brightness = sum(img.convert("L").getdata()) / (w*h)
print(f"  Avg brightness: {brightness:.0f}/255 ({'dark' if brightness < 85 else 'medium' if brightness < 170 else 'bright'})")
# For full description, would need a vision LLM — this provides structural analysis`;
          break;
        case "objects":
          pyScript += `img = Image.open("${imgPath}")
# Basic edge detection for object-like regions
import numpy as np
gray = np.array(img.convert("L"))
# Simple Sobel-like edge detector
dx = np.abs(np.diff(gray, axis=1))
dy = np.abs(np.diff(gray, axis=0))
edge_density = (dx.mean() + dy.mean()) / 2
print(f"🔎 Object Analysis:")
print(f"  Edge density: {edge_density:.1f} (higher = more objects/detail)")
print(f"  Image complexity: {'high' if edge_density > 30 else 'medium' if edge_density > 15 else 'low'}")
# Count connected regions via thresholding
thresh = gray > 128
regions = 0
for r in range(0, gray.shape[0], 50):
    for c in range(0, gray.shape[1], 50):
        block = thresh[r:r+50, c:c+50]
        if block.size and block.mean() not in (0.0, 1.0):
            regions += 1
print(f"  Estimated distinct regions: ~{regions}")
print("\\n  ⚠️ For accurate object detection, use a vision model (YOLO/CLIP)")`;
          break;
        case "faces":
          pyScript += `try:
    import cv2
    img_cv = cv2.imread("${imgPath}")
    gray = cv2.cvtColor(img_cv, cv2.COLOR_BGR2GRAY)
    cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
    faces = cascade.detectMultiScale(gray, 1.1, 5)
    print(f"👤 Face Detection: Found {len(faces)} face(s)")
    for i, (x, y, w, h) in enumerate(faces):
        print(f"  Face {i+1}: position=({x},{y}) size={w}×{h}")
except ImportError:
    print("⚠️ OpenCV not installed. Install: pip install opencv-python-headless")`;
          break;
        case "classify":
          pyScript += `img = Image.open("${imgPath}")
import numpy as np
arr = np.array(img.convert("RGB"))
avg_color = arr.mean(axis=(0,1))
brightness = arr.mean()
edge = np.abs(np.diff(np.array(img.convert("L")), axis=1)).mean()
categories = []
if brightness < 60: categories.append("dark/night")
elif brightness > 200: categories.append("bright/overexposed")
if edge < 10: categories.append("flat/minimalist")
elif edge > 40: categories.append("detailed/complex")
if avg_color[0] > avg_color[2] + 30: categories.append("warm-toned")
elif avg_color[2] > avg_color[0] + 30: categories.append("cool-toned")
w, h = img.size
if w > h * 1.5: categories.append("panoramic")
elif h > w * 1.5: categories.append("portrait-oriented")
else: categories.append("square-ish")
print(f"🏷️ Classification: {', '.join(categories) or 'standard'}")
print(f"  Avg RGB: ({avg_color[0]:.0f}, {avg_color[1]:.0f}, {avg_color[2]:.0f})")
print(f"  Brightness: {brightness:.0f}/255")
print(f"  Detail level: {edge:.1f}")`;
          break;
        default:
          return `Unknown action: ${action}. Use: describe, ocr, objects, compare, colors, metadata, measure, faces, classify`;
      }

      await sandboxWriteFile("/tmp/_img_analyze.py", pyScript);
      const result = await sandboxExec("python3 /tmp/_img_analyze.py 2>&1", "/workspace", 60);
      let output = result.stdout.slice(0, 10000);
      if (outPath && result.exitCode === 0) {
        await sandboxWriteFile(outPath, output);
        output += `\n\n📁 Saved to: ${outPath}`;
      }
      return output || `Error: ${result.stderr.slice(0, 500)}`;
    },

    // ─── PDF Intelligence ────────────────────────────────────────
    pdf_extract: async (input: ToolInput) => {
      const action = (input.action as string) || "text";
      const filePath = (input.file_path as string) || "";
      const outPath = (input.output_path as string) || "";
      const pageRange = (input.page_range as string) || "all";
      const searchQuery = (input.query as string) || "";
      const mergeFiles = (input.files as string) || "";
      const _outFmt = (input.output_format as string) || "markdown";

      if (!filePath && !["merge"].includes(action)) {
        return "Error: file_path required";
      }

      // Ensure pdfplumber
      const check = await sandboxExec(
        "python3 -c 'import pdfplumber; print(\"ok\")' 2>/dev/null",
        "/workspace",
        5,
      );
      if (check.exitCode !== 0) {
        await sandboxExec(
          "pip install pdfplumber PyPDF2 tabulate 2>&1 | tail -3",
          "/workspace",
          30,
        );
      }

      let pyScript = `import pdfplumber, json, sys, os\n`;

      switch (action) {
        case "text":
          pyScript += `pdf = pdfplumber.open("${filePath}")
total = len(pdf.pages)
print(f"📄 PDF: ${filePath} ({total} pages)\\n")
pages = range(total)
${
  pageRange !== "all"
    ? `pages = [int(p)-1 for p in "${pageRange}".replace("-", " ").split() if p.isdigit()]
if "-" in "${pageRange}":
    parts = "${pageRange}".split("-")
    pages = range(int(parts[0])-1, int(parts[1]))`
    : ""
}
for i in pages:
    if 0 <= i < total:
        text = pdf.pages[i].extract_text() or ""
        print(f"--- Page {i+1} ---")
        print(text[:5000])
        print()`;
          break;
        case "tables":
          pyScript += `pdf = pdfplumber.open("${filePath}")
print(f"📊 Tables from: ${filePath}\\n")
table_count = 0
for i, page in enumerate(pdf.pages):
    tables = page.extract_tables()
    for j, table in enumerate(tables):
        table_count += 1
        print(f"Table {table_count} (page {i+1}):")
        if table and table[0]:
            headers = table[0]
            print(" | ".join(str(h or "").strip() for h in headers))
            print("-" * 60)
            for row in table[1:20]:
                print(" | ".join(str(c or "").strip() for c in row))
        print()
print(f"Total: {table_count} table(s) extracted")`;
          break;
        case "metadata":
          pyScript += `pdf = pdfplumber.open("${filePath}")
meta = pdf.metadata or {}
print(f"📋 PDF Metadata: ${filePath}")
print(f"  Pages: {len(pdf.pages)}")
for k, v in meta.items():
    print(f"  {k}: {str(v)[:200]}")
# Size
size_mb = os.path.getsize("${filePath}") / 1048576
print(f"  File size: {size_mb:.2f} MB")`;
          break;
        case "images":
          pyScript += `pdf = pdfplumber.open("${filePath}")
out_dir = "${outPath}" or "/workspace/pdf_images"
os.makedirs(out_dir, exist_ok=True)
img_count = 0
for i, page in enumerate(pdf.pages):
    for j, img in enumerate(page.images):
        img_count += 1
        print(f"  Image {img_count}: page {i+1}, pos=({img.get('x0',0):.0f},{img.get('top',0):.0f}), size={img.get('width',0):.0f}×{img.get('height',0):.0f}")
print(f"\\n📸 Found {img_count} image reference(s)")
if img_count > 0:
    print(f"Output dir: {out_dir}")`;
          break;
        case "search":
          if (!searchQuery) {
            return "Error: query required for search action";
          }
          pyScript += `pdf = pdfplumber.open("${filePath}")
query = "${searchQuery.replace(/"/g, '\\"')}"
matches = []
for i, page in enumerate(pdf.pages):
    text = page.extract_text() or ""
    idx = text.lower().find(query.lower())
    while idx != -1:
        context = text[max(0,idx-50):idx+len(query)+50]
        matches.append({"page": i+1, "position": idx, "context": context.strip()})
        idx = text.lower().find(query.lower(), idx+1)
print(f"🔍 Search: '{query}' in ${filePath}")
print(f"Found {len(matches)} match(es)\\n")
for m in matches[:30]:
    print(f"  Page {m['page']}: ...{m['context']}...")`;
          break;
        case "split":
          pyScript += `from PyPDF2 import PdfReader, PdfWriter
reader = PdfReader("${filePath}")
out_dir = "${outPath}" or "/workspace/pdf_pages"
os.makedirs(out_dir, exist_ok=True)
for i in range(len(reader.pages)):
    writer = PdfWriter()
    writer.add_page(reader.pages[i])
    out = os.path.join(out_dir, f"page_{i+1:03d}.pdf")
    with open(out, "wb") as f:
        writer.write(f)
print(f"✂️ Split ${filePath} into {len(reader.pages)} pages → {out_dir}/")`;
          break;
        case "merge":
          if (!mergeFiles) {
            return "Error: files required for merge (comma-separated)";
          }
          pyScript += `from PyPDF2 import PdfWriter, PdfReader
writer = PdfWriter()
files = "${mergeFiles}".split(",")
total = 0
for f in files:
    f = f.strip()
    reader = PdfReader(f)
    total += len(reader.pages)
    for page in reader.pages:
        writer.add_page(page)
out = "${outPath}" or "/workspace/merged.pdf"
with open(out, "wb") as f:
    writer.write(f)
print(f"📎 Merged {len(files)} PDFs ({total} pages) → {out}")`;
          break;
        case "ocr":
          pyScript += `# OCR scanned PDFs using pdf2image + tesseract
try:
    from pdf2image import convert_from_path
    import pytesseract
    images = convert_from_path("${filePath}", dpi=200)
    print(f"📝 OCR: ${filePath} ({len(images)} pages)\\n")
    for i, img in enumerate(images[:20]):
        text = pytesseract.image_to_string(img)
        print(f"--- Page {i+1} ---")
        print(text[:5000])
        print()
except ImportError:
    print("⚠️ Install: pip install pdf2image pytesseract")
    print("Also needs: apt-get install poppler-utils tesseract-ocr")`;
          break;
        case "pages":
          if (!pageRange || pageRange === "all") {
            return "Error: page_range required for pages action";
          }
          pyScript += `from PyPDF2 import PdfReader, PdfWriter
reader = PdfReader("${filePath}")
writer = PdfWriter()
# Parse range
range_str = "${pageRange}"
pages = set()
for part in range_str.split(","):
    part = part.strip()
    if "-" in part:
        a, b = part.split("-")
        pages.update(range(int(a), int(b)+1))
    else:
        pages.add(int(part))
for p in sorted(pages):
    if 1 <= p <= len(reader.pages):
        writer.add_page(reader.pages[p-1])
out = "${outPath}" or "/workspace/extracted_pages.pdf"
with open(out, "wb") as f:
    writer.write(f)
print(f"📄 Extracted pages {sorted(pages)} → {out}")`;
          break;
        default:
          return `Unknown action: ${action}. Use: text, tables, images, metadata, ocr, pages, search, split, merge`;
      }

      await sandboxWriteFile("/tmp/_pdf_extract.py", pyScript);
      const result = await sandboxExec("python3 /tmp/_pdf_extract.py 2>&1", "/workspace", 120);
      return `${result.stdout.slice(0, 12000)}${result.exitCode !== 0 ? `\n\n⚠️ ${result.stderr.slice(0, 500)}` : ""}`;
    },

    // ─── File Search (ripgrep + find + glob) ─────────────────────
    file_search: async (input: ToolInput) => {
      const action = (input.action as string) || "content";
      const pattern = (input.pattern as string) || "";
      const dir = (input.directory as string) || "/workspace";
      const inc = (input.include as string) || "";
      const exc = (input.exclude as string) || "node_modules,.git,dist,__pycache__,.next";
      const caseSensitive = input.case_sensitive === true;
      const contextLines = (input.context_lines as number) || 2;
      const maxResults = (input.max_results as number) || 50;
      const replacement = (input.replacement as string) || "";
      const dryRun = input.dry_run !== false;

      const excludeFlags = exc
        .split(",")
        .map((e) => `--exclude-dir='${e.trim()}'`)
        .join(" ");

      switch (action) {
        case "content": {
          if (!pattern) {
            return "Error: pattern required for content search";
          }
          const caseFlag = caseSensitive ? "" : "-i";
          const incFlag = inc ? `--include='${inc}'` : "";
          const r = await sandboxExec(
            `grep -rn ${caseFlag} ${incFlag} ${excludeFlags} -C ${contextLines} '${pattern.replace(/'/g, "'\\''")}' '${dir}' 2>/dev/null | head -${maxResults * 5}`,
            "/workspace",
            30,
          );
          const lines = r.stdout.trim().split("\n").filter(Boolean);
          if (!lines.length || !r.stdout.trim()) {
            return `🔍 No matches for: ${pattern}`;
          }
          return `🔍 Content search: "${pattern}"\n\n\`\`\`\n${r.stdout.slice(0, 10000)}\n\`\`\`\n\n${lines.length}+ matching lines`;
        }
        case "name": {
          if (!pattern) {
            return "Error: pattern required for name search";
          }
          const caseArg = caseSensitive ? "-name" : "-iname";
          const r = await sandboxExec(
            `find '${dir}' ${exc
              .split(",")
              .map((e) => `-not -path '*/${e.trim()}/*'`)
              .join(" ")} ${caseArg} '${pattern}' -type f 2>/dev/null | head -${maxResults}`,
            "/workspace",
            15,
          );
          const files = r.stdout.trim().split("\n").filter(Boolean);
          if (!files.length) {
            return `📂 No files matching: ${pattern}`;
          }
          return `📂 Files matching "${pattern}":\n\n${files.map((f) => `  ${f}`).join("\n")}\n\n${files.length} file(s) found`;
        }
        case "recent": {
          const days = (input.context_lines as number) || 7;
          const r = await sandboxExec(
            `find '${dir}' ${exc
              .split(",")
              .map((e) => `-not -path '*/${e.trim()}/*'`)
              .join(
                " ",
              )} -type f -mtime -${days} -printf '%T@ %p\\n' 2>/dev/null | sort -rn | head -${maxResults} | awk '{print $2}'`,
            "/workspace",
            15,
          );
          const files = r.stdout.trim().split("\n").filter(Boolean);
          if (!files.length) {
            return `📅 No files modified in last ${days} days`;
          }
          return `📅 Recently modified (last ${days} days):\n\n${files.map((f) => `  ${f}`).join("\n")}\n\n${files.length} file(s)`;
        }
        case "large": {
          const r = await sandboxExec(
            `find '${dir}' ${exc
              .split(",")
              .map((e) => `-not -path '*/${e.trim()}/*'`)
              .join(" ")} -type f -printf '%s %p\\n' 2>/dev/null | sort -rn | head -${maxResults}`,
            "/workspace",
            15,
          );
          const lines = r.stdout.trim().split("\n").filter(Boolean);
          if (!lines.length) {
            return "📦 No files found";
          }
          const formatted = lines
            .map((l) => {
              const [size, ...rest] = l.split(" ");
              const mb = parseInt(size) / 1048576;
              return `  ${mb > 1 ? `${mb.toFixed(1)}MB` : `${(parseInt(size) / 1024).toFixed(0)}KB`}  ${rest.join(" ")}`;
            })
            .join("\n");
          return `📦 Largest files:\n\n${formatted}`;
        }
        case "duplicates": {
          const r = await sandboxExec(
            `find '${dir}' ${exc
              .split(",")
              .map((e) => `-not -path '*/${e.trim()}/*'`)
              .join(
                " ",
              )} -type f -exec md5sum {} + 2>/dev/null | sort | awk 'seen[$1]++ { print }' | head -${maxResults}`,
            "/workspace",
            30,
          );
          if (!r.stdout.trim()) {
            return "✅ No duplicate files found";
          }
          return `🔁 Duplicate files:\n\n\`\`\`\n${r.stdout.slice(0, 5000)}\n\`\`\``;
        }
        case "type": {
          const ext = pattern || "*";
          const r = await sandboxExec(
            `find '${dir}' ${exc
              .split(",")
              .map((e) => `-not -path '*/${e.trim()}/*'`)
              .join(" ")} -type f -name '*.${ext}' 2>/dev/null | head -${maxResults}`,
            "/workspace",
            15,
          );
          if (!r.stdout.trim()) {
            return `No .${ext} files found`;
          }
          const files = r.stdout.trim().split("\n").filter(Boolean);
          return `📁 .${ext} files (${files.length}):\n\n${files.map((f) => `  ${f}`).join("\n")}`;
        }
        case "replace": {
          if (!pattern || !replacement) {
            return "Error: pattern and replacement required";
          }
          if (dryRun) {
            const r = await sandboxExec(
              `grep -rln ${caseSensitive ? "" : "-i"} ${inc ? `--include='${inc}'` : ""} ${excludeFlags} '${pattern.replace(/'/g, "'\\''")}' '${dir}' 2>/dev/null | head -20`,
              "/workspace",
              15,
            );
            const files = r.stdout.trim().split("\n").filter(Boolean);
            if (!files.length) {
              return `No files contain: ${pattern}`;
            }
            return `🔄 Preview (dry run) — would replace in ${files.length} file(s):\n\n${files.join("\n")}\n\n"${pattern}" → "${replacement}"\n\nSet dry_run=false to apply.`;
          }
          const r = await sandboxExec(
            `find '${dir}' ${exc
              .split(",")
              .map((e) => `-not -path '*/${e.trim()}/*'`)
              .join(
                " ",
              )} -type f ${inc ? `-name '${inc}'` : ""} -exec sed -i ${caseSensitive ? "" : "I"} 's/${pattern.replace(/\//g, "\\/")}/${replacement.replace(/\//g, "\\/")}/g' {} + 2>&1`,
            "/workspace",
            30,
          );
          return r.exitCode === 0
            ? `✅ Replaced "${pattern}" → "${replacement}" across files`
            : `⚠️ ${r.stdout.slice(0, 500)}`;
        }
        case "stats": {
          const r = await sandboxExec(
            `echo "=== Workspace Stats ===" && find '${dir}' ${exc
              .split(",")
              .map((e) => `-not -path '*/${e.trim()}/*'`)
              .join(" ")} -type f | wc -l && echo "files" && find '${dir}' ${exc
              .split(",")
              .map((e) => `-not -path '*/${e.trim()}/*'`)
              .join(
                " ",
              )} -type f -printf '%f\\n' | sed 's/.*\\.//' | sort | uniq -c | sort -rn | head -20 && echo "=== Size ===" && du -sh '${dir}' 2>/dev/null`,
            "/workspace",
            15,
          );
          return `📊 Workspace Statistics:\n\n\`\`\`\n${r.stdout.slice(0, 5000)}\n\`\`\``;
        }
        default:
          return `Unknown action: ${action}. Use: content, name, recent, large, duplicates, type, replace, stats`;
      }
    },

    // ─── Git Diff & Review ───────────────────────────────────────
    git_diff_review: async (input: ToolInput) => {
      const action = (input.action as string) || "diff";
      const refA = (input.ref_a as string) || "HEAD~1";
      const refB = (input.ref_b as string) || "HEAD";
      const path = (input.path as string) || "";
      const fmt = (input.format as string) || "unified";
      const maxCommits = (input.max_commits as number) || 20;
      const pathArg = path ? `-- '${path}'` : "";

      switch (action) {
        case "diff": {
          const fmtFlag = fmt === "stat" ? "--stat" : fmt === "name-only" ? "--name-only" : "";
          const r = await sandboxExec(
            `git diff ${fmtFlag} ${refA} ${refB} ${pathArg} 2>&1 | head -500`,
            "/workspace",
            15,
          );
          return `📝 Diff: ${refA}..${refB}${path ? ` (${path})` : ""}\n\n\`\`\`diff\n${r.stdout.slice(0, 10000)}\n\`\`\``;
        }
        case "summary": {
          const stat = await sandboxExec(
            `git diff --stat ${refA} ${refB} ${pathArg} 2>&1`,
            "/workspace",
            10,
          );
          const shortlog = await sandboxExec(
            `git log --oneline ${refA}..${refB} ${pathArg} 2>&1 | head -20`,
            "/workspace",
            10,
          );
          return `📋 Change Summary: ${refA}..${refB}\n\n**Commits:**\n${shortlog.stdout.slice(0, 3000)}\n\n**File Stats:**\n\`\`\`\n${stat.stdout.slice(0, 5000)}\n\`\`\``;
        }
        case "pr_description": {
          const log = await sandboxExec(
            `git log --oneline ${refA}..${refB} 2>&1`,
            "/workspace",
            10,
          );
          const stat = await sandboxExec(`git diff --stat ${refA} ${refB} 2>&1`, "/workspace", 10);
          const diff = await sandboxExec(
            `git diff ${refA} ${refB} 2>&1 | head -200`,
            "/workspace",
            15,
          );
          const commits = log.stdout.trim().split("\n").filter(Boolean);
          const title = commits[0]?.replace(/^[a-f0-9]+\s+/, "") || "Update";
          return `📝 PR Description:\n\n**Title**: ${title}\n\n## What Changed\n${commits.map((c) => `- ${c}`).join("\n")}\n\n## Files Modified\n\`\`\`\n${stat.stdout.slice(0, 3000)}\n\`\`\`\n\n## Key Diff\n\`\`\`diff\n${diff.stdout.slice(0, 5000)}\n\`\`\``;
        }
        case "blame": {
          if (!path) {
            return "Error: path required for blame";
          }
          const r = await sandboxExec(
            `git blame --line-porcelain '${path}' 2>&1 | head -200`,
            "/workspace",
            15,
          );
          return `👤 Blame: ${path}\n\n\`\`\`\n${r.stdout.slice(0, 8000)}\n\`\`\``;
        }
        case "log": {
          const r = await sandboxExec(
            `git log --oneline --graph --decorate -n ${maxCommits} ${pathArg} 2>&1`,
            "/workspace",
            10,
          );
          return `📜 Commit Log (last ${maxCommits}):\n\n\`\`\`\n${r.stdout.slice(0, 8000)}\n\`\`\``;
        }
        case "conflicts": {
          const r = await sandboxExec(
            `git diff --name-only --diff-filter=U 2>&1`,
            "/workspace",
            10,
          );
          if (!r.stdout.trim()) {
            return "✅ No merge conflicts detected";
          }
          const files = r.stdout.trim().split("\n");
          let details = `⚠️ Merge Conflicts in ${files.length} file(s):\n\n`;
          for (const f of files.slice(0, 10)) {
            const d = await sandboxExec(
              `grep -n '<<<<<<<\\|=======\\|>>>>>>>' '${f}' 2>/dev/null | head -20`,
              "/workspace",
              5,
            );
            details += `\n**${f}:**\n\`\`\`\n${d.stdout.slice(0, 1000)}\n\`\`\`\n`;
          }
          return details;
        }
        case "review": {
          const diff = await sandboxExec(
            `git diff ${refA} ${refB} ${pathArg} 2>&1 | head -300`,
            "/workspace",
            15,
          );
          const stat = await sandboxExec(
            `git diff --stat ${refA} ${refB} ${pathArg} 2>&1`,
            "/workspace",
            10,
          );
          // Provide structured review data for the LLM to analyze
          return `🔍 Code Review Data: ${refA}..${refB}\n\n**Stats:**\n\`\`\`\n${stat.stdout.slice(0, 2000)}\n\`\`\`\n\n**Diff:**\n\`\`\`diff\n${diff.stdout.slice(0, 8000)}\n\`\`\`\n\n**Review Notes:**\n- Check for missing error handling\n- Verify type safety\n- Look for hardcoded values\n- Check for missing tests`;
        }
        default:
          return `Unknown action: ${action}. Use: diff, review, summary, pr_description, blame, log, conflicts`;
      }
    },

    // ─── Vector Store (ChromaDB/FAISS) ───────────────────────────
    vector_store: async (input: ToolInput) => {
      const action = (input.action as string) || "list";
      const collName = (input.collection_name as string) || "default";
      const docs = (input.documents as string) || "";
      const searchQuery = (input.query as string) || "";
      const topK = (input.top_k as number) || 5;
      const ingestDir = (input.directory as string) || "";
      const incPattern = (input.include as string) || "*.txt,*.md,*.py,*.ts,*.js";

      // Ensure chromadb
      const check = await sandboxExec(
        "python3 -c 'import chromadb; print(\"ok\")' 2>/dev/null",
        "/workspace",
        5,
      );
      if (check.exitCode !== 0) {
        await sandboxExec(
          "pip install chromadb sentence-transformers 2>&1 | tail -5",
          "/workspace",
          60,
        );
      }

      let pyScript = `import chromadb, json, os, glob\n`;
      pyScript += `client = chromadb.PersistentClient(path="/workspace/.vectordb")\n`;

      switch (action) {
        case "create":
          pyScript += `col = client.get_or_create_collection("${collName}")
print(f"✅ Collection '{collName}' ready (count: {col.count()})")`;
          break;
        case "add":
          if (!docs) {
            return "Error: documents required";
          }
          pyScript += `col = client.get_or_create_collection("${collName}")
docs_input = """${docs.replace(/"""/g, '\\"\\"\\"')}"""
try:
    items = json.loads(docs_input)
    if isinstance(items, list):
        texts = [d.get("text", d) if isinstance(d, dict) else str(d) for d in items]
        ids = [d.get("id", f"doc_{i}") if isinstance(d, dict) else f"doc_{i}" for i, d in enumerate(items)]
        metas = [d.get("metadata", {}) if isinstance(d, dict) else {} for d in items]
    else:
        texts, ids, metas = [str(items)], ["doc_0"], [{}]
except json.JSONDecodeError:
    texts, ids, metas = [docs_input], ["doc_0"], [{}]
col.add(documents=texts, ids=ids, metadatas=metas)
print(f"✅ Added {len(texts)} document(s) to '{collName}' (total: {col.count()})")`;
          break;
        case "query":
          if (!searchQuery) {
            return "Error: query required for semantic search";
          }
          pyScript += `col = client.get_or_create_collection("${collName}")
results = col.query(query_texts=["${searchQuery.replace(/"/g, '\\"')}"], n_results=${topK})
print(f"🔍 Semantic search: '${searchQuery}' in '{collName}'\\n")
for i, (doc, dist) in enumerate(zip(results['documents'][0], results['distances'][0])):
    score = 1 - dist  # Convert distance to similarity
    print(f"  [{i+1}] Score: {score:.3f}")
    print(f"      {doc[:300]}")
    if results.get('metadatas') and results['metadatas'][0][i]:
        print(f"      Meta: {results['metadatas'][0][i]}")
    print()`;
          break;
        case "list":
          pyScript += `cols = client.list_collections()
print(f"📚 Vector Collections ({len(cols)}):\\n")
for c in cols:
    col = client.get_collection(c.name)
    print(f"  📁 {c.name} — {col.count()} documents")`;
          break;
        case "delete":
          pyScript += `try:
    client.delete_collection("${collName}")
    print(f"🗑️ Deleted collection: ${collName}")
except:
    print(f"Collection not found: ${collName}")`;
          break;
        case "stats":
          pyScript += `col = client.get_or_create_collection("${collName}")
print(f"📊 Collection: ${collName}")
print(f"  Documents: {col.count()}")
peek = col.peek(limit=3)
if peek and peek.get('documents'):
    print(f"  Sample docs:")
    for d in peek['documents'][:3]:
        print(f"    → {d[:100]}...")`;
          break;
        case "ingest":
          if (!ingestDir) {
            return "Error: directory required for ingest";
          }
          pyScript += `col = client.get_or_create_collection("${collName}")
patterns = "${incPattern}".split(",")
files = []
for p in patterns:
    files.extend(glob.glob(os.path.join("${ingestDir}", "**", p.strip()), recursive=True))
texts, ids, metas = [], [], []
for f in files[:500]:
    try:
        with open(f, "r", errors="ignore") as fh:
            content = fh.read()[:4000]
            texts.append(content)
            ids.append(f.replace("/", "_").replace(".", "_"))
            metas.append({"source": f, "size": os.path.getsize(f)})
    except: pass
if texts:
    for i in range(0, len(texts), 41):
        batch_t = texts[i:i+41]
        batch_i = ids[i:i+41]
        batch_m = metas[i:i+41]
        col.add(documents=batch_t, ids=batch_i, metadatas=batch_m)
    print(f"✅ Ingested {len(texts)} files into '{collName}' (total: {col.count()})")
else:
    print("No matching files found")`;
          break;
        default:
          return `Unknown action: ${action}. Use: create, add, query, list, delete, stats, ingest`;
      }

      await sandboxWriteFile("/tmp/_vector_store.py", pyScript);
      const result = await sandboxExec("python3 /tmp/_vector_store.py 2>&1", "/workspace", 120);
      return result.stdout.slice(0, 10000) || `Error: ${result.stderr.slice(0, 500)}`;
    },

    // ─── Translation ─────────────────────────────────────────────
    translate: async (input: ToolInput) => {
      const text = (input.text as string) || "";
      const targetLang = (input.target_lang as string) || "";
      const sourceLang = (input.source_lang as string) || "auto";
      const filePath = (input.file_path as string) || "";
      const outPath = (input.output_path as string) || "";
      const mode = (input.mode as string) || "text";

      if (!targetLang) {
        return "Error: target_lang required";
      }

      // Read file if needed
      let content = text;
      if (!content && filePath) {
        const r = await sandboxExec(`cat '${filePath}' 2>/dev/null | head -500`, "/workspace", 5);
        content = r.stdout;
      }
      if (!content) {
        return "Error: text or file_path required";
      }

      // Use googletrans or argostranslate
      const check = await sandboxExec(
        "python3 -c 'from deep_translator import GoogleTranslator; print(\"ok\")' 2>/dev/null",
        "/workspace",
        5,
      );
      if (check.exitCode !== 0) {
        await sandboxExec("pip install deep-translator 2>&1 | tail -3", "/workspace", 30);
      }

      // Language name to code mapping
      const langMap: Record<string, string> = {
        english: "en",
        spanish: "es",
        french: "fr",
        german: "de",
        italian: "it",
        portuguese: "pt",
        chinese: "zh-CN",
        japanese: "ja",
        korean: "ko",
        arabic: "ar",
        russian: "ru",
        hindi: "hi",
        turkish: "tr",
        dutch: "nl",
        polish: "pl",
        swedish: "sv",
        danish: "da",
        norwegian: "no",
        finnish: "fi",
        greek: "el",
        czech: "cs",
        romanian: "ro",
        hungarian: "hu",
        thai: "th",
        vietnamese: "vi",
        indonesian: "id",
        malay: "ms",
        hebrew: "he",
        ukrainian: "uk",
        persian: "fa",
      };
      const tgtCode = langMap[targetLang.toLowerCase()] || targetLang;
      const srcCode =
        sourceLang === "auto" ? "auto" : langMap[sourceLang.toLowerCase()] || sourceLang;

      let pyScript = `from deep_translator import GoogleTranslator\nimport json, sys\n\n`;

      if (mode === "json_keys") {
        pyScript += `data = json.loads("""${content.replace(/"""/g, '\\"\\"\\"')}""")
translator = GoogleTranslator(source="${srcCode}", target="${tgtCode}")
def translate_obj(obj):
    if isinstance(obj, str):
        return translator.translate(obj[:5000]) or obj
    elif isinstance(obj, dict):
        return {k: translate_obj(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [translate_obj(item) for item in obj]
    return obj
result = translate_obj(data)
print(json.dumps(result, ensure_ascii=False, indent=2))`;
      } else {
        // Split into chunks of 4900 chars (API limit)
        pyScript += `text = """${content.slice(0, 25000).replace(/"""/g, '\\"\\"\\"')}"""
translator = GoogleTranslator(source="${srcCode}", target="${tgtCode}")
chunks = [text[i:i+4900] for i in range(0, len(text), 4900)]
translated = []
for chunk in chunks:
    result = translator.translate(chunk)
    translated.append(result or "")
output = "".join(translated)
print(output)`;
      }

      await sandboxWriteFile("/tmp/_translate.py", pyScript);
      const result = await sandboxExec("python3 /tmp/_translate.py 2>&1", "/workspace", 60);

      if (result.exitCode !== 0) {
        return `⚠️ Translation error: ${result.stderr.slice(0, 500)}`;
      }

      let output = `🌐 Translation: ${srcCode} → ${tgtCode}\n\n${result.stdout.slice(0, 10000)}`;
      if (outPath) {
        await sandboxWriteFile(outPath, result.stdout);
        output += `\n\n📁 Saved to: ${outPath}`;
      }
      return output;
    },
  };
}

export const intelligenceToolsSummary: ToolSummaryMap = {
  image_analyze: (input) => `🖼️ Image: ${input.action ?? "describe"} ${input.image_path ?? ""}`,
  pdf_extract: (input) => `📄 PDF: ${input.action ?? "text"} ${input.file_path ?? ""}`,
  file_search: (input) => `🔍 Search: ${input.action ?? "content"} ${input.pattern ?? ""}`,
  git_diff_review: (input) =>
    `📝 Git: ${input.action ?? "diff"} ${input.ref_a ?? ""}..${input.ref_b ?? ""}`,
  vector_store: (input) => `📚 Vector: ${input.action ?? "list"} ${input.collection_name ?? ""}`,
  translate: (input) =>
    `🌐 Translate → ${input.target_lang ?? "?"}: ${((input.text as string) ?? "").slice(0, 30)}`,
};
