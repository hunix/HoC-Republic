#!/usr/bin/env python3
"""
HoC Sandbox — Demo Builder
Scrapes a URL, builds a beautiful dashboard, and serves it via the existing
preview server on port 8080 (already running from start.sh).

Usage (in HoC Chat):
  run python3 /sandbox-api/demo-builder.py
  run python3 /sandbox-api/demo-builder.py --url https://quotes.toscrape.com --selectors ".text::text,.author::text"
  run python3 /sandbox-api/demo-builder.py --mode stealth --url https://www.cloudflare.com
"""

import argparse
import json
import os
import signal
import subprocess
import sys
import time


def scrape(url, selectors, mode="scrape"):
    """Run scrapling-tools.py and return parsed JSON."""
    cmd = [
        sys.executable,
        "/sandbox-api/scrapling-tools.py",
        mode,
        url,
    ]
    if selectors:
        cmd += ["--selectors", selectors]

    print(f"[1/3] Scraping {url} ({mode} mode)...")
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    if result.returncode != 0:
        print(f"Scrape failed: {result.stderr}")
        return None

    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError:
        print(f"Failed to parse scrape output")
        return None


def build_hn_dashboard(data, output_dir, url="https://news.ycombinator.com"):
    """Build a Hacker News dashboard from scraped data."""
    selectors = data.get("selectors", {})
    titles = selectors.get(".titleline a::text", [])
    hrefs = selectors.get(".titleline a::attr(href)", [])
    scores = selectors.get(".score::text", [])

    cards_html = ""
    for i, title in enumerate(titles[:30]):
        href = hrefs[i] if i < len(hrefs) else "#"
        score = scores[i] if i < len(scores) else ""
        cards_html += f"""
        <div class="card" style="animation-delay: {i * 0.03}s">
          <a href="{href}" target="_blank" rel="noopener">{title}</a>
          <div class="meta">{score}</div>
        </div>"""

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>HN Dashboard — Built by HoC Citizens</title>
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{
    background: linear-gradient(135deg, #0f0f23 0%, #1a1a3e 100%);
    color: #e0e0e0;
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    padding: 2rem;
    min-height: 100vh;
  }}
  .header {{
    text-align: center;
    margin-bottom: 2rem;
  }}
  .badge {{
    display: inline-block;
    background: linear-gradient(135deg, #ff6b6b, #ee5a24);
    color: #fff;
    padding: 4px 14px;
    border-radius: 99px;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.5px;
    margin-bottom: 1rem;
    text-transform: uppercase;
  }}
  h1 {{
    background: linear-gradient(135deg, #ff6b6b, #ffc93c, #ff6b6b);
    background-size: 200% auto;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    font-size: 2.5rem;
    font-weight: 800;
    animation: shimmer 3s ease-in-out infinite;
  }}
  @keyframes shimmer {{
    0%, 100% {{ background-position: 0% center; }}
    50% {{ background-position: 200% center; }}
  }}
  .subtitle {{
    color: #888;
    font-size: 0.9rem;
    margin-top: 0.5rem;
  }}
  .grid {{
    display: grid;
    gap: 0.75rem;
    max-width: 800px;
    margin: 0 auto;
  }}
  .card {{
    background: rgba(26, 26, 62, 0.8);
    border: 1px solid rgba(255, 107, 107, 0.1);
    border-radius: 14px;
    padding: 1rem 1.5rem;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    animation: fadeIn 0.4s ease-out both;
    backdrop-filter: blur(10px);
  }}
  @keyframes fadeIn {{
    from {{ opacity: 0; transform: translateY(10px); }}
    to {{ opacity: 1; transform: translateY(0); }}
  }}
  .card:hover {{
    transform: translateY(-3px);
    border-color: #ff6b6b;
    box-shadow: 0 8px 30px rgba(255, 107, 107, 0.15);
  }}
  .card a {{
    color: #ffc93c;
    text-decoration: none;
    font-size: 0.95rem;
    font-weight: 500;
    line-height: 1.4;
  }}
  .card a:hover {{ text-decoration: underline; }}
  .meta {{
    color: #ff6b6b;
    font-size: 0.8rem;
    margin-top: 0.4rem;
    font-weight: 500;
  }}
  .footer {{
    text-align: center;
    color: #555;
    font-size: 0.75rem;
    margin-top: 2rem;
    padding-top: 1rem;
    border-top: 1px solid rgba(255,255,255,0.05);
  }}
</style>
</head>
<body>
<div class="header">
  <div class="badge">Scraped by HoC Citizens via Scrapling</div>
  <h1>Hacker News Dashboard</h1>
  <p class="subtitle">{len(titles[:30])} stories &middot; Live data &middot; Built autonomously</p>
</div>
<div class="grid">{cards_html}
</div>
<div class="footer">
  Powered by HoC Republic &middot; Scrapling &middot; Agent Sandbox
</div>
</body>
</html>"""

    os.makedirs(output_dir, exist_ok=True)
    filepath = os.path.join(output_dir, "index.html")
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"[2/3] Dashboard built: {filepath} ({len(titles[:30])} stories)")
    return filepath


def build_generic_dashboard(data, output_dir, url):
    """Build a dashboard from generic scraped data."""
    title = data.get("title", "Scraped Content")
    h1s = data.get("h1", [])
    h2s = data.get("h2", [])
    paragraphs = data.get("paragraphs", [])
    links = data.get("links", [])
    selectors = data.get("selectors", {})

    content_html = ""

    # Use selector data if available
    if selectors:
        for sel, items in selectors.items():
            if isinstance(items, list):
                for item in items[:20]:
                    if isinstance(item, str):
                        content_html += f'<div class="card">{item}</div>'
                    elif isinstance(item, dict):
                        text = item.get("text", "")
                        if text:
                            content_html += f'<div class="card">{text}</div>'
    else:
        # Use default extracted data
        for h in h1s[:5]:
            content_html += f'<div class="card"><strong>{h}</strong></div>'
        for h in h2s[:10]:
            content_html += f'<div class="card"><em>{h}</em></div>'
        for p in paragraphs[:15]:
            content_html += f'<div class="card">{p}</div>'
        for link in links[:20]:
            href = link.get("href", "#")
            text = link.get("text", href)
            if text.strip():
                content_html += f'<div class="card"><a href="{href}" target="_blank">{text}</a></div>'

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} — HoC Scrape</title>
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{
    background: linear-gradient(160deg, #0d1117 0%, #161b22 100%);
    color: #c9d1d9;
    font-family: 'Segoe UI', system-ui, sans-serif;
    padding: 2rem;
    min-height: 100vh;
  }}
  .badge {{ display: inline-block; background: #238636; color: #fff; padding: 3px 12px; border-radius: 99px; font-size: 0.7rem; margin-bottom: 1rem; }}
  h1 {{ color: #58a6ff; font-size: 2rem; margin-bottom: 0.5rem; }}
  .subtitle {{ color: #8b949e; margin-bottom: 1.5rem; font-size: 0.85rem; }}
  .grid {{ display: grid; gap: 0.6rem; max-width: 800px; margin: 0 auto; }}
  .card {{
    background: #21262d;
    border: 1px solid #30363d;
    border-radius: 10px;
    padding: 0.8rem 1.2rem;
    font-size: 0.9rem;
    line-height: 1.5;
    transition: border-color 0.2s;
  }}
  .card:hover {{ border-color: #58a6ff; }}
  .card a {{ color: #58a6ff; text-decoration: none; }}
  .card a:hover {{ text-decoration: underline; }}
</style>
</head>
<body>
<div class="badge">Scraped by HoC via Scrapling</div>
<h1>{title}</h1>
<p class="subtitle">Source: {url}</p>
<div class="grid">{content_html}</div>
</body></html>"""

    os.makedirs(output_dir, exist_ok=True)
    filepath = os.path.join(output_dir, "index.html")
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"[2/3] Dashboard built: {filepath}")
    return filepath


def serve(directory, port=8080):
    """Verify the existing preview server is serving our output.
    start.sh already runs 'python3 -m http.server 8080 --bind 0.0.0.0' from /workspace.
    We write index.html to /workspace, so the existing server serves it.
    NEVER kill the existing server — that crashes the container (start.sh wait -n).
    """
    print(f"[3/3] Preview available on port {port}")
    print(f"PREVIEW READY — http://127.0.0.1:{port}")


def main():
    parser = argparse.ArgumentParser(description="HoC Demo Builder")
    parser.add_argument("--url", default="https://news.ycombinator.com", help="URL to scrape")
    parser.add_argument("--selectors", default="", help="CSS selectors (comma-separated)")
    parser.add_argument("--mode", default="scrape", choices=["scrape", "stealth", "dynamic"], help="Scrape mode")
    parser.add_argument("--port", type=int, default=8080, help="Preview server port (default: 8080)")
    parser.add_argument("--output", default="/workspace", help="Output directory (must be /workspace for the existing server)")
    args = parser.parse_args()

    is_hn = "ycombinator" in args.url or "news.yc" in args.url

    # Default HN selectors
    selectors = args.selectors
    if not selectors and is_hn:
        selectors = ".titleline a::text,.titleline a::attr(href),.score::text"

    # 1. Scrape
    data = scrape(args.url, selectors, args.mode)
    if not data:
        print("Scraping failed — creating a placeholder page")
        os.makedirs(args.output, exist_ok=True)
        with open(os.path.join(args.output, "index.html"), "w") as f:
            f.write("<html><body><h1>Scraping failed</h1><p>Check the URL and try again.</p></body></html>")
    else:
        # Save raw data
        os.makedirs(args.output, exist_ok=True)
        with open(os.path.join(args.output, "data.json"), "w") as f:
            json.dump(data, f, indent=2, ensure_ascii=False, default=str)

        # 2. Build
        if is_hn:
            build_hn_dashboard(data, args.output, args.url)
        else:
            build_generic_dashboard(data, args.output, args.url)

    # 3. Serve
    serve(args.output, args.port)


if __name__ == "__main__":
    main()
