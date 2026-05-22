/**
 * Document Tools — Document generation, reading, and data visualization
 * Handles: create_document, read_document, data_viz
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { ToolInput, ToolHandlerMap, ToolSummaryMap, SandboxContext } from "./types.js";

// ── Resolve doc-generators directory (ESM-safe) ─────────────────
// After tsdown bundling, __dirname is unreliable and require() fails.
// We use multiple strategies to find the Python generator scripts.
function resolveGeneratorDir(): string | null {
  const candidates: string[] = [];
  // Strategy 1: import.meta.url relative path (works in ESM)
  try {
    const thisDir = path.dirname(fileURLToPath(import.meta.url));
    candidates.push(
      path.join(thisDir, "doc-generators"),
      path.join(thisDir, "..", "doc-generators"),
      path.join(thisDir, "..", "republic", "doc-generators"),
    );
  } catch {
    /* import.meta.url unavailable in CJS */
  }
  // Strategy 2: process.cwd() relative path (works always)
  candidates.push(
    path.resolve(process.cwd(), "src", "republic", "doc-generators"),
    path.resolve(process.cwd(), "doc-generators"),
  );
  for (const dir of candidates) {
    if (fs.existsSync(dir)) {
      return dir;
    }
  }
  return null;
}

const _generatorDir = resolveGeneratorDir();

function readGenerator(name: string): string | null {
  if (!_generatorDir) {
    return null;
  }
  const filePath = path.join(_generatorDir, name);
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, "utf-8");
    }
  } catch {
    /* best-effort */
  }
  return null;
}

export function createDocumentToolsHandlers(ctx: SandboxContext): ToolHandlerMap {
  const { sandboxExec, sandboxWriteFile } = ctx;

  return {
    create_document: async (input: ToolInput) => {
      const { type = "pptx", filename = "document", title = "Untitled", slide_data = "[]" } = input;
      const inp = input as Record<string, unknown>;
      const templateName = (inp.template as string) || "";
      const imagesJson = (inp.images as string) || "[]";
      const brandingJson = (inp.branding as string) || "{}";
      const outPath = `/workspace/${filename}`;

      const genArgs = JSON.stringify({
        slide_data,
        branding: brandingJson,
        title,
        out_path: outPath,
        template: templateName,
        images: imagesJson,
      });

      switch (type) {
        case "pptx": {
          await sandboxExec(
            "pip install --quiet python-pptx Pillow requests matplotlib cairosvg 2>/dev/null",
            "/workspace",
            90,
          );
          let script = readGenerator("pptx-generator.py");
          if (!script) {
            script = INLINE_PPTX_GENERATOR;
          }
          await sandboxWriteFile("/tmp/_gen_pptx.py", script);
          await sandboxWriteFile("/tmp/_gen_args.json", genArgs);
          const result = await sandboxExec("python3 /tmp/_gen_pptx.py", "/workspace", 120);
          await sandboxExec(
            "rm -f /tmp/_gen_pptx.py /tmp/_gen_args.json /tmp/_chart_* /tmp/_slide_img_* /tmp/_brand_logo.png",
            "/workspace",
            5,
          );
          if (result.exitCode !== 0) {
            return `❌ Failed: ${result.stderr}\n${result.stdout}`;
          }
          return `✅ Presentation created: ${outPath} (${title})\n${result.stdout}\n<file_download url="/sandbox-files/${filename}" filename="${filename}" />`;
        }

        case "docx": {
          await sandboxExec(
            "pip install --quiet python-docx Pillow cairosvg 2>/dev/null",
            "/workspace",
            60,
          );
          let script = readGenerator("docx-generator.py");
          if (!script) {
            script = INLINE_DOCX_GENERATOR;
          }
          await sandboxWriteFile("/tmp/_gen_docx.py", script);
          await sandboxWriteFile("/tmp/_gen_args.json", genArgs);
          const result = await sandboxExec("python3 /tmp/_gen_docx.py", "/workspace", 60);
          await sandboxExec(
            "rm -f /tmp/_gen_docx.py /tmp/_gen_args.json /tmp/_docx_*",
            "/workspace",
            5,
          );
          if (result.exitCode !== 0) {
            return `❌ Failed: ${result.stderr}`;
          }
          return `✅ Document created: ${outPath}\n${result.stdout}\n<file_download url="/sandbox-files/${filename}" filename="${filename}" />`;
        }

        case "pdf": {
          await sandboxExec(
            "pip install --quiet reportlab Pillow cairosvg 2>/dev/null",
            "/workspace",
            60,
          );
          let script = readGenerator("pdf-generator.py");
          if (!script) {
            script = INLINE_PDF_GENERATOR;
          }
          await sandboxWriteFile("/tmp/_gen_pdf.py", script);
          await sandboxWriteFile("/tmp/_gen_args.json", genArgs);
          const result = await sandboxExec("python3 /tmp/_gen_pdf.py", "/workspace", 120);
          await sandboxExec(
            "rm -f /tmp/_gen_pdf.py /tmp/_gen_args.json /tmp/_pdf_*",
            "/workspace",
            5,
          );
          if (result.exitCode !== 0) {
            return `❌ Failed: ${result.stderr}`;
          }
          return `✅ PDF created: ${outPath}\n${result.stdout}\n<file_download url="/sandbox-files/${filename}" filename="${filename}" />`;
        }

        case "xlsx": {
          await sandboxExec("pip install --quiet openpyxl 2>/dev/null", "/workspace", 30);
          const xlsxScript = `#!/usr/bin/env python3
import json
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

args = json.loads(open("/tmp/_gen_args.json").read())
data = json.loads(args.get("slide_data", "[]"))
wb = Workbook()
ws = wb.active
ws.title = args.get("title", "Sheet1")[:31]

accent = args.get("branding", "{}") or "{}"
try: accent_hex = json.loads(accent).get("primary_color", "0f172a").lstrip("#")
except: accent_hex = "0f172a"

header_fill = PatternFill("solid", fgColor=accent_hex)
header_font = Font(bold=True, color="ffffff", size=11)
thin_border = Border(
    left=Side(style="thin", color="d1d5db"),
    right=Side(style="thin", color="d1d5db"),
    top=Side(style="thin", color="d1d5db"),
    bottom=Side(style="thin", color="d1d5db"),
)

if isinstance(data, list) and data:
    first = data[0]
    if isinstance(first, dict):
        headers = first.get("headers", list(first.keys()))
        rows = first.get("rows", [list(d.values()) for d in data])
    elif isinstance(first, list):
        headers = first
        rows = data[1:]
    else:
        headers = ["Data"]
        rows = [[str(d)] for d in data]

    for ci, h in enumerate(headers, 1):
        cell = ws.cell(row=1, column=ci, value=str(h))
        cell.fill = header_fill; cell.font = header_font
        cell.alignment = Alignment(horizontal="center")
        cell.border = thin_border
        ws.column_dimensions[chr(64+ci)].width = max(15, len(str(h))+4)

    alt_fill = PatternFill("solid", fgColor="f8fafc")
    for ri, row in enumerate(rows, 2):
        for ci, val in enumerate(row if isinstance(row, list) else [row], 1):
            cell = ws.cell(row=ri, column=ci, value=val)
            cell.border = thin_border
            if ri % 2 == 0: cell.fill = alt_fill

wb.save("${outPath}")
print(f"Spreadsheet saved: ${outPath}")
`;
          await sandboxWriteFile("/tmp/_gen_xlsx.py", xlsxScript);
          await sandboxWriteFile("/tmp/_gen_args.json", genArgs);
          const result = await sandboxExec("python3 /tmp/_gen_xlsx.py", "/workspace", 30);
          await sandboxExec("rm -f /tmp/_gen_xlsx.py /tmp/_gen_args.json", "/workspace", 5);
          if (result.exitCode !== 0) {
            return `❌ Failed: ${result.stderr}`;
          }
          return `✅ Spreadsheet created: ${outPath}\n${result.stdout}\n<file_download url="/sandbox-files/${filename}" filename="${filename}" />`;
        }

        case "md": {
          let mdContent = `# ${title}\n\n`;
          try {
            const sections = JSON.parse(slide_data) as Array<{ title?: string; content?: string }>;
            for (const s of sections) {
              if (s.title) {
                mdContent += `## ${s.title}\n\n`;
              }
              if (s.content) {
                mdContent += `${s.content}\n\n`;
              }
            }
          } catch {
            mdContent += slide_data;
          }
          await sandboxWriteFile(outPath, mdContent);
          const htmlPath = outPath.replace(/\.md$/, ".html");
          await sandboxExec(
            `python3 -c "import markdown; open('${htmlPath}','w').write('<html><head><style>body{font-family:system-ui;max-width:800px;margin:2em auto;padding:0 1em;line-height:1.6;color:#1a1a1a}h1,h2,h3{color:#0f172a}table{border-collapse:collapse;width:100%}td,th{border:1px solid #e2e8f0;padding:8px}th{background:#f8fafc}</style></head><body>'+markdown.markdown(open('${outPath}').read(),extensions=['tables','fenced_code'])+'</body></html>')" 2>/dev/null || echo "HTML preview skipped (install: pip install markdown)"`,
            "/workspace",
            15,
          );
          return `✅ Markdown document created: ${outPath}`;
        }

        default:
          return `Document type '${type}' — use sandbox_exec with pandoc, reportlab, or other tool.`;
      }
    },

    read_document: async (input: ToolInput) => {
      const filePath = input.file_path as string;
      if (!filePath) {
        return "Error: file_path is required";
      }
      const maxChars = (input.max_chars as number) || 10000;
      const ext = (input.format as string) || filePath.split(".").pop()?.toLowerCase() || "";

      switch (ext) {
        case "pdf": {
          const result = await sandboxExec(
            `pdftotext '${filePath}' - 2>&1 | head -c ${maxChars}`,
            "/workspace",
            15,
          );
          if (result.exitCode !== 0) {
            return `PDF read error: ${result.stderr || result.stdout}`;
          }
          const lineCount = (result.stdout.match(/\n/g) || []).length;
          return `📄 PDF: ${filePath} (${lineCount} lines)\n\n${result.stdout.slice(0, maxChars)}`;
        }
        case "docx": {
          const result = await sandboxExec(
            `pandoc '${filePath}' -t plain 2>&1 | head -c ${maxChars}`,
            "/workspace",
            15,
          );
          return `📝 Word: ${filePath}\n\n${result.stdout.slice(0, maxChars)}`;
        }
        case "xlsx":
        case "xls": {
          const result = await sandboxExec(
            `python3 -c "import pandas as pd; df=pd.read_excel('${filePath}'); print(df.to_string(max_rows=100))" 2>&1 | head -c ${maxChars}`,
            "/workspace",
            15,
          );
          return `📊 Excel: ${filePath}\n\n${result.stdout.slice(0, maxChars)}`;
        }
        case "csv":
        case "tsv": {
          const sep = ext === "tsv" ? "\\t" : ",";
          const result = await sandboxExec(
            `python3 -c "import pandas as pd; df=pd.read_csv('${filePath}', sep='${sep}'); print(f'Shape: {df.shape}\\nColumns: {list(df.columns)}\\n\\n'); print(df.to_string(max_rows=50))" 2>&1 | head -c ${maxChars}`,
            "/workspace",
            15,
          );
          return `📊 ${ext.toUpperCase()}: ${filePath}\n\n${result.stdout.slice(0, maxChars)}`;
        }
        case "json": {
          const result = await sandboxExec(
            `python3 -c "import json; d=json.load(open('${filePath}')); print(json.dumps(d, indent=2)[:${maxChars}])" 2>&1`,
            "/workspace",
            10,
          );
          return `📋 JSON: ${filePath}\n\n${result.stdout.slice(0, maxChars)}`;
        }
        default: {
          const result = await sandboxExec(
            `head -c ${maxChars} '${filePath}' 2>&1`,
            "/workspace",
            10,
          );
          return `📄 ${filePath}\n\n${result.stdout}`;
        }
      }
    },

    data_viz: async (input: ToolInput) => {
      const chartType = (input.chart_type as string) || "bar";
      const chartData = (input.data as string) || "";
      const chartTitle = (input.title as string) || "Chart";
      const xLabel = (input.x_label as string) || "";
      const yLabel = (input.y_label as string) || "";
      const chartColors = (input.colors as string) || "";
      const outPath = (input.output_path as string) || "/workspace/chart.png";
      const outFormat = (input.output_format as string) || "png";
      const figW = (input.width as number) || 10;
      const figH = (input.height as number) || 6;
      const chartStyle = (input.style as string) || "darkgrid";

      // ── Interactive Plotly Dashboard Mode ──────────────────────
      // When output_format is "html" or chart_type is "dashboard",
      // generate an interactive Plotly.js dashboard instead of static PNG
      if (outFormat === "html" || chartType === "dashboard") {
        const dashboardScript = `#!/usr/bin/env python3
"""Interactive Plotly Dashboard Generator"""
import json, sys

data_str = '''${chartData.replace(/'/g, "\\'")}'''
try:
    import os
    if os.path.exists(data_str):
        if data_str.endswith('.csv'):
            import csv
            with open(data_str) as f:
                reader = csv.DictReader(f)
                data = {k: [] for k in reader.fieldnames or []}
                for row in reader:
                    for k, v in row.items():
                        try: data[k].append(float(v))
                        except: data[k].append(v)
        else:
            data = json.load(open(data_str))
    else:
        data = json.loads(data_str) if data_str else {'labels': ['A','B','C','D'], 'values': [25, 40, 30, 55]}
except:
    data = {'labels': ['A','B','C','D'], 'values': [25, 40, 30, 55]}

chart_type = '${chartType}'
title = '${chartTitle}'
x_label = '${xLabel}'
y_label = '${yLabel}'

labels = data.get('labels', data.get('x', list(range(len(next(iter(data.values())))))))
values = data.get('values', data.get('y', list(data.values())[0] if data else []))

# Build traces
traces = []
if chart_type == 'dashboard':
    # Multi-chart dashboard: create subplots for all numeric data
    cols = [k for k,v in data.items() if isinstance(v, list) and len(v) > 0 and isinstance(v[0], (int, float))]
    x_vals = data.get('labels', data.get('x', list(range(max(len(v) for v in data.values())))))
    for ci, col in enumerate(cols[:6]):
        traces.append(f'''{{
            x: {json.dumps(x_vals)},
            y: {json.dumps(data[col])},
            name: "{col}",
            type: "{['bar','scatter','scatter'][ci % 3]}",
            {"mode: 'lines+markers'," if ci % 3 != 0 else ""}
        }}''')
else:
    if chart_type == 'pie':
        traces.append(f'''{{
            labels: {json.dumps(labels)},
            values: {json.dumps(values)},
            type: "pie",
            hole: 0.3,
            textinfo: "label+percent",
        }}''')
    elif chart_type == 'scatter':
        x = data.get('x', labels)
        y = data.get('y', values)
        traces.append(f'''{{
            x: {json.dumps(x)},
            y: {json.dumps(y)},
            mode: "markers",
            type: "scatter",
            marker: {{ size: 12, opacity: 0.7 }},
        }}''')
    elif chart_type == 'line':
        traces.append(f'''{{
            x: {json.dumps(labels)},
            y: {json.dumps(values)},
            mode: "lines+markers",
            type: "scatter",
            line: {{ width: 3 }},
        }}''')
    elif chart_type == 'histogram':
        traces.append(f'''{{
            x: {json.dumps(values)},
            type: "histogram",
        }}''')
    elif chart_type == 'heatmap':
        matrix = data.get('matrix', [[1,2],[3,4]])
        traces.append(f'''{{
            z: {json.dumps(matrix)},
            type: "heatmap",
            colorscale: "Viridis",
        }}''')
    else:  # bar
        traces.append(f'''{{
            x: {json.dumps(labels)},
            y: {json.dumps(values)},
            type: "bar",
        }}''')

traces_js = ',\\n'.join(traces)

html = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
<script src="https://cdn.plot.ly/plotly-2.35.2.min.js"></script>
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{ background: #0f172a; color: #f1f5f9; font-family: Inter, system-ui, sans-serif; }}
  .header {{ padding: 24px 32px; border-bottom: 1px solid #1e293b; }}
  .header h1 {{ font-size: 24px; font-weight: 700; color: #f8fafc; }}
  .header p {{ font-size: 14px; color: #94a3b8; margin-top: 4px; }}
  .chart-container {{ padding: 16px; height: calc(100vh - 100px); }}
  .plotly-chart {{ width: 100%; height: 100%; border-radius: 12px; overflow: hidden; }}
</style>
</head>
<body>
<div class="header">
  <h1>📊 {title}</h1>
  <p>Interactive dashboard — hover, zoom, and pan to explore data</p>
</div>
<div class="chart-container">
  <div id="chart" class="plotly-chart"></div>
</div>
<script>
var data = [{traces_js}];
var layout = {{
  title: {{ text: "{title}", font: {{ color: "#f8fafc", size: 18 }} }},
  paper_bgcolor: "#1e293b",
  plot_bgcolor: "#0f172a",
  font: {{ color: "#94a3b8" }},
  xaxis: {{ title: "{x_label}", gridcolor: "#334155", zerolinecolor: "#475569" }},
  yaxis: {{ title: "{y_label}", gridcolor: "#334155", zerolinecolor: "#475569" }},
  margin: {{ t: 60, r: 20, b: 60, l: 60 }},
  showlegend: {str(len(traces) > 1).lower()},
  legend: {{ font: {{ color: "#f8fafc" }} }},
}};
var config = {{ responsive: true, displayModeBar: true, modeBarButtonsToRemove: ["sendDataToCloud"] }};
Plotly.newPlot("chart", data, layout, config);
</script>
</body>
</html>'''

out = '${outPath}'
if not out.endswith('.html'):
    out = out.rsplit('.', 1)[0] + '.html'
with open(out, 'w') as f:
    f.write(html)
print(f'Interactive dashboard saved: {{out}}')
`;
        await sandboxWriteFile("/tmp/dashboard.py", dashboardScript);
        const result = await sandboxExec("python3 /tmp/dashboard.py", "/workspace", 30);
        if (result.exitCode === 0) {
          const htmlPath = outPath.endsWith(".html")
            ? outPath
            : outPath.replace(/\.[^.]+$/, ".html");
          const htmlFilename = htmlPath.split("/").pop() ?? "dashboard.html";
          return `📊 Interactive dashboard generated: ${htmlPath}\nOpen in browser for hover, zoom, and pan interactions.\n<file_download url="/sandbox-files/${htmlFilename}" filename="${htmlFilename}" />`;
        }
        return `Dashboard generation failed: ${result.stderr.slice(0, 500)}`;
      }

      // ── Static chart mode (matplotlib/seaborn) ─────────────────
      await sandboxExec(
        "python3 -c 'import matplotlib, pandas, seaborn, numpy' 2>/dev/null || pip install -q matplotlib pandas seaborn numpy",
        "/workspace",
        60,
      );

      if (chartType === "custom" && input.custom_code) {
        await sandboxWriteFile("/tmp/custom_chart.py", input.custom_code);
        const r = await sandboxExec("python3 /tmp/custom_chart.py", "/workspace", 30);
        return r.exitCode === 0
          ? `✅ Custom chart generated\n${r.stdout}`
          : `Error: ${r.stderr.slice(0, 500)}`;
      }

      const pyScript = `
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import seaborn as sns
import json, sys, os

sns.set_style('${chartStyle}')
fig, ax = plt.subplots(figsize=(${figW}, ${figH}))

# Parse data
data_str = '''${chartData.replace(/'/g, "\\'")}'''
try:
    if os.path.exists(data_str):
        import pandas as pd
        if data_str.endswith('.csv'):
            data = pd.read_csv(data_str).to_dict('list')
        else:
            data = json.load(open(data_str))
    else:
        data = json.loads(data_str) if data_str else {'labels': ['A','B','C','D'], 'values': [25, 40, 30, 55]}
except:
    data = {'labels': ['A','B','C','D'], 'values': [25, 40, 30, 55]}

colors = None
color_str = '''${chartColors.replace(/'/g, "\\'")}'''
if color_str:
    try: colors = json.loads(color_str) if color_str.startswith('[') else color_str
    except: colors = color_str

chart_type = '${chartType}'
labels = data.get('labels', data.get('x', list(range(len(next(iter(data.values())))))))
values = data.get('values', data.get('y', list(data.values())[0] if data else []))

if chart_type == 'bar':
    if isinstance(colors, list): ax.bar(labels, values, color=colors[:len(labels)])
    elif isinstance(colors, str): ax.bar(labels, values, color=sns.color_palette(colors, len(labels)))
    else: ax.bar(labels, values, color=sns.color_palette('husl', len(labels)))
elif chart_type == 'line':
    ax.plot(labels, values, marker='o', linewidth=2)
elif chart_type == 'pie':
    ax.pie(values, labels=labels, autopct='%1.1f%%', colors=sns.color_palette('husl', len(labels)))
elif chart_type == 'scatter':
    x = data.get('x', labels)
    y = data.get('y', values)
    ax.scatter(x, y, alpha=0.7, s=100)
elif chart_type == 'histogram':
    ax.hist(values, bins=min(20, len(values)), color='steelblue', edgecolor='white')
elif chart_type == 'heatmap':
    import numpy as np
    matrix = np.array(data.get('matrix', [[1,2],[3,4]]))
    sns.heatmap(matrix, annot=True, fmt='.1f', ax=ax)
elif chart_type == 'box':
    ax.boxplot(values if isinstance(values[0], list) else [values])
elif chart_type == 'area':
    ax.fill_between(range(len(values)), values, alpha=0.4)
    ax.plot(range(len(values)), values, linewidth=2)

ax.set_title('${chartTitle}', fontsize=16, fontweight='bold', pad=20)
if '${xLabel}': ax.set_xlabel('${xLabel}')
if '${yLabel}': ax.set_ylabel('${yLabel}')
plt.tight_layout()
plt.savefig('${outPath}', format='${outFormat}', dpi=150, bbox_inches='tight')
plt.close()
print(f'Chart saved: ${outPath}')
`;
      await sandboxWriteFile("/tmp/dataviz.py", pyScript);
      const result = await sandboxExec("python3 /tmp/dataviz.py", "/workspace", 30);
      if (result.exitCode === 0) {
        const chartFilename = outPath.split("/").pop() ?? "chart.png";
        return `📊 Chart generated: ${outPath}\nType: ${chartType} | Format: ${outFormat} | Size: ${figW}×${figH}in\n<file_download url="/sandbox-files/${chartFilename}" filename="${chartFilename}" />`;
      }
      return `Chart generation failed: ${result.stderr.slice(0, 500)}`;
    },
  };
}

export const documentToolsSummary: ToolSummaryMap = {
  create_document: (input) => `📝 ${input.type ?? "pptx"}: ${input.filename ?? "document"}`,
  read_document: (input) => `📄 Read: ${input.file_path ?? "?"}`,
  data_viz: (input) =>
    `📊 Chart: ${input.chart_type ?? "bar"} → ${input.output_path ?? "chart.png"}`,
};

// ── Inline Fallback Generators ─────────────────────────────────────
// Used when the external Python scripts aren't found in dist/doc-generators/.
// These are simplified but fully functional — they produce real PPTX/PDF/DOCX files.

const INLINE_PPTX_GENERATOR = `#!/usr/bin/env python3
"""Inline PPTX generator fallback — produces real PowerPoint files using python-pptx."""
import json, sys
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN

args = json.loads(open("/tmp/_gen_args.json").read())
slides_raw = args.get("slide_data", "[]")
slides = json.loads(slides_raw) if isinstance(slides_raw, str) else slides_raw
title = args.get("title", "Untitled")
out_path = args.get("out_path", "/workspace/output.pptx")
branding = args.get("branding", "{}")
if isinstance(branding, str):
    try: branding = json.loads(branding)
    except: branding = {}

primary = branding.get("primary_color", "#1a365d")
company = branding.get("company_name", "")

def hex_to_rgb(h):
    h = h.lstrip("#")
    return RGBColor(int(h[0:2],16), int(h[2:4],16), int(h[4:6],16))

prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)

def add_slide(layout_idx=6):
    return prs.slides.add_slide(prs.slide_layouts[layout_idx])

def add_bg(slide, color):
    bg = slide.background
    fill = bg.fill
    fill.solid()
    fill.fore_color.rgb = hex_to_rgb(color)

def add_text(slide, left, top, width, height, text, font_size=18, bold=False, color="#ffffff", align=PP_ALIGN.LEFT):
    txBox = slide.shapes.add_textbox(Inches(left), Inches(top), Inches(width), Inches(height))
    tf = txBox.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = text
    p.font.size = Pt(font_size)
    p.font.bold = bold
    p.font.color.rgb = hex_to_rgb(color)
    p.alignment = align
    return txBox

# Title slide
s = add_slide()
add_bg(s, primary)
add_text(s, 1, 2, 11, 2, title, 44, True, "#ffffff", PP_ALIGN.CENTER)
if company:
    add_text(s, 1, 4.5, 11, 1, company, 20, False, "#94a3b8", PP_ALIGN.CENTER)

# Content slides
for i, slide_data in enumerate(slides):
    s = add_slide()
    add_bg(s, "#0f172a")
    stitle = slide_data.get("title", f"Slide {i+1}")
    content = slide_data.get("content", "")
    add_text(s, 0.8, 0.3, 11, 0.8, stitle, 28, True, "#f8fafc")
    # Accent line
    shape = s.shapes.add_shape(1, Inches(0.8), Inches(1.1), Inches(2), Inches(0.05))
    shape.fill.solid()
    shape.fill.fore_color.rgb = hex_to_rgb(primary)
    shape.line.fill.background()
    # Content
    if content:
        add_text(s, 0.8, 1.4, 11, 5, content, 16, False, "#cbd5e1")

prs.save(out_path)
print(f"Created {len(slides)+1} slides in {out_path}")
`;

const INLINE_PDF_GENERATOR = `#!/usr/bin/env python3
"""Inline PDF generator fallback — produces real PDF files using reportlab."""
import json
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER

args = json.loads(open("/tmp/_gen_args.json").read())
slides_raw = args.get("slide_data", "[]")
sections = json.loads(slides_raw) if isinstance(slides_raw, str) else slides_raw
title = args.get("title", "Untitled")
out_path = args.get("out_path", "/workspace/output.pdf")
branding = args.get("branding", "{}")
if isinstance(branding, str):
    try: branding = json.loads(branding)
    except: branding = {}

primary = branding.get("primary_color", "#1a365d")

doc = SimpleDocTemplate(out_path, pagesize=A4,
    topMargin=0.75*inch, bottomMargin=0.75*inch,
    leftMargin=0.75*inch, rightMargin=0.75*inch)

styles = getSampleStyleSheet()
styles.add(ParagraphStyle('DocTitle', parent=styles['Title'], fontSize=28,
    textColor=HexColor(primary), spaceAfter=20, alignment=TA_CENTER))
styles.add(ParagraphStyle('SectionHead', parent=styles['Heading1'], fontSize=18,
    textColor=HexColor(primary), spaceBefore=16, spaceAfter=8))
styles.add(ParagraphStyle('Body', parent=styles['BodyText'], fontSize=11,
    leading=16, spaceAfter=8))

story = []
story.append(Paragraph(title, styles['DocTitle']))
story.append(Spacer(1, 0.3*inch))

for sec in sections:
    stitle = sec.get("title", "")
    content = sec.get("content", "")
    if stitle:
        story.append(Paragraph(stitle, styles['SectionHead']))
    if content:
        for para in content.split("\\n"):
            if para.strip():
                story.append(Paragraph(para, styles['Body']))
    story.append(Spacer(1, 0.15*inch))

doc.build(story)
print(f"PDF created: {out_path} ({len(sections)} sections)")
`;

const INLINE_DOCX_GENERATOR = `#!/usr/bin/env python3
"""Inline DOCX generator fallback — produces real Word documents using python-docx."""
import json
from docx import Document
from docx.shared import Pt, Inches, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH

args = json.loads(open("/tmp/_gen_args.json").read())
slides_raw = args.get("slide_data", "[]")
sections = json.loads(slides_raw) if isinstance(slides_raw, str) else slides_raw
title = args.get("title", "Untitled")
out_path = args.get("out_path", "/workspace/output.docx")
branding = args.get("branding", "{}")
if isinstance(branding, str):
    try: branding = json.loads(branding)
    except: branding = {}

primary = branding.get("primary_color", "#1a365d")

def hex_to_rgb(h):
    h = h.lstrip("#")
    return RGBColor(int(h[0:2],16), int(h[2:4],16), int(h[4:6],16))

doc = Document()

# Title
tp = doc.add_paragraph()
tp.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = tp.add_run(title)
run.font.size = Pt(28)
run.font.bold = True
run.font.color.rgb = hex_to_rgb(primary)
doc.add_paragraph()

# Sections
for sec in sections:
    stitle = sec.get("title", "")
    content = sec.get("content", "")
    if stitle:
        heading = doc.add_heading(stitle, level=1)
        for run in heading.runs:
            run.font.color.rgb = hex_to_rgb(primary)
    if content:
        for para in content.split("\\n"):
            if para.strip():
                p = doc.add_paragraph(para)
                for run in p.runs:
                    run.font.size = Pt(11)

doc.save(out_path)
print(f"DOCX created: {out_path} ({len(sections)} sections)")
`;
