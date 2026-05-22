#!/usr/bin/env python3
"""
HoC Sandbox — Scrapling Tools
Thin CLI wrapper around Scrapling for citizen-driven web scraping.

Usage:
  python3 scrapling-tools.py scrape <url> [--selectors '.class,#id,...']
  python3 scrapling-tools.py stealth <url> [--selectors '.class,#id,...']
  python3 scrapling-tools.py dynamic <url> [--selectors '.class,#id,...']
  python3 scrapling-tools.py crawl <start_url> [--depth 2] [--selectors '.class']
  python3 scrapling-tools.py media <url>

All commands output JSON to stdout.
"""

import argparse
import json
import sys
import traceback


def cmd_scrape(url: str, selectors: list[str] | None = None) -> dict:
    """Fast HTTP scrape with Scrapling's Fetcher (no browser, TLS impersonation)."""
    from scrapling.fetchers import Fetcher

    page = Fetcher.get(url, stealthy_headers=True, follow_redirects=True)
    return _extract(page, selectors, url, mode="scrape")


def cmd_stealth(url: str, selectors: list[str] | None = None) -> dict:
    """Stealth scrape — bypasses Cloudflare Turnstile and anti-bot systems."""
    from scrapling.fetchers import StealthyFetcher

    page = StealthyFetcher.fetch(url, headless=True, network_idle=True)
    return _extract(page, selectors, url, mode="stealth")


def cmd_dynamic(url: str, selectors: list[str] | None = None) -> dict:
    """Full browser render via Playwright Chromium."""
    from scrapling.fetchers import DynamicFetcher

    page = DynamicFetcher.fetch(url, headless=True, network_idle=True)
    return _extract(page, selectors, url, mode="dynamic")


def cmd_crawl(start_url: str, depth: int = 2, selectors: list[str] | None = None) -> dict:
    """Spider-based concurrent crawl with depth limit."""
    import asyncio
    from scrapling.fetchers import Fetcher

    visited: set[str] = set()
    results: list[dict] = []
    queue: list[tuple[str, int]] = [(start_url, 0)]

    while queue and len(visited) < 50:  # safety cap
        url, d = queue.pop(0)
        if url in visited or d > depth:
            continue
        visited.add(url)

        try:
            page = Fetcher.get(url, stealthy_headers=True, follow_redirects=True, timeout=15)
            extracted = _extract(page, selectors, url, mode="crawl")
            results.append(extracted)

            # Discover links for next depth level
            if d < depth:
                links = page.css("a::attr(href)").getall()
                for link in links[:20]:  # limit fanout
                    if link and link.startswith("http"):
                        queue.append((link, d + 1))
        except Exception as e:
            results.append({"url": url, "error": str(e)})

    return {
        "mode": "crawl",
        "start_url": start_url,
        "depth": depth,
        "pages_crawled": len(visited),
        "results": results,
    }


def cmd_media(url: str) -> dict:
    """Extract all media links (images, videos, audio) from a page."""
    from scrapling.fetchers import Fetcher

    page = Fetcher.get(url, stealthy_headers=True, follow_redirects=True)

    images = page.css("img::attr(src)").getall()
    videos = page.css("video source::attr(src)").getall()
    audio = page.css("audio source::attr(src)").getall()
    og_images = page.css('meta[property="og:image"]::attr(content)').getall()

    return {
        "mode": "media",
        "url": url,
        "images": list(set(images + og_images)),
        "videos": list(set(videos)),
        "audio": list(set(audio)),
        "total": len(images) + len(og_images) + len(videos) + len(audio),
    }


# ─── Helpers ────────────────────────────────────────────────────


def _extract(page, selectors: list[str] | None, url: str, mode: str) -> dict:
    """Extract data from a Scrapling response page."""
    result: dict = {
        "mode": mode,
        "url": url,
        "status": getattr(page, "status", None),
        "title": _safe_text(page.css("title::text").get()),
    }

    if selectors:
        extracted = {}
        for sel in selectors:
            sel = sel.strip()
            if not sel:
                continue
            try:
                if "::" in sel:
                    # Pseudo-element selector like .class::text
                    vals = page.css(sel).getall()
                    extracted[sel] = vals
                else:
                    # Element selector — get text + HTML
                    elements = page.css(sel)
                    extracted[sel] = [
                        {
                            "text": _safe_text(el.css("::text").get()),
                            "html": str(el)[:500],
                        }
                        for el in elements[:50]  # cap to 50 elements
                    ]
            except Exception as e:
                extracted[sel] = {"error": str(e)}
        result["selectors"] = extracted
    else:
        # Default: extract page text, meta description, headings, links
        result["meta_description"] = _safe_text(
            page.css('meta[name="description"]::attr(content)').get()
        )
        result["h1"] = page.css("h1::text").getall()[:10]
        result["h2"] = page.css("h2::text").getall()[:20]
        result["paragraphs"] = [
            _safe_text(p)[:300] for p in page.css("p::text").getall()[:30]
        ]
        result["links"] = [
            {"text": _safe_text(a.css("::text").get()), "href": a.attrib.get("href", "")}
            for a in page.css("a")[:50]
        ]

    return result


def _safe_text(val) -> str:
    """Safely convert a value to a clean text string."""
    if val is None:
        return ""
    return str(val).strip()


# ─── CLI ────────────────────────────────────────────────────────


def main():
    parser = argparse.ArgumentParser(description="HoC Scrapling Tools")
    sub = parser.add_subparsers(dest="command")

    # scrape
    p_scrape = sub.add_parser("scrape", help="Fast HTTP scrape")
    p_scrape.add_argument("url")
    p_scrape.add_argument("--selectors", type=str, default="")

    # stealth
    p_stealth = sub.add_parser("stealth", help="Stealth scrape (Cloudflare bypass)")
    p_stealth.add_argument("url")
    p_stealth.add_argument("--selectors", type=str, default="")

    # dynamic
    p_dynamic = sub.add_parser("dynamic", help="Full browser render")
    p_dynamic.add_argument("url")
    p_dynamic.add_argument("--selectors", type=str, default="")

    # crawl
    p_crawl = sub.add_parser("crawl", help="Spider-based crawl")
    p_crawl.add_argument("url")
    p_crawl.add_argument("--depth", type=int, default=2)
    p_crawl.add_argument("--selectors", type=str, default="")

    # media
    p_media = sub.add_parser("media", help="Extract media links")
    p_media.add_argument("url")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    selectors = [s.strip() for s in args.selectors.split(",")] if hasattr(args, "selectors") and args.selectors else None

    try:
        if args.command == "scrape":
            result = cmd_scrape(args.url, selectors)
        elif args.command == "stealth":
            result = cmd_stealth(args.url, selectors)
        elif args.command == "dynamic":
            result = cmd_dynamic(args.url, selectors)
        elif args.command == "crawl":
            result = cmd_crawl(args.url, getattr(args, "depth", 2), selectors)
        elif args.command == "media":
            result = cmd_media(args.url)
        else:
            print(json.dumps({"error": f"Unknown command: {args.command}"}))
            sys.exit(1)

        print(json.dumps(result, indent=2, ensure_ascii=False, default=str))
    except Exception as e:
        print(json.dumps({
            "error": str(e),
            "traceback": traceback.format_exc(),
        }, indent=2))
        sys.exit(1)


if __name__ == "__main__":
    main()
