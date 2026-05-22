---
name: playwright-browser-automation
description: Full browser automation using Playwright. Navigate, interact, scrape, screenshot, test, and automate any web workflow inside the sandbox container.
---

# Playwright Browser Automation Skill

This skill gives agents/citizens full browser automation capabilities using **Playwright** inside the agent sandbox container.

## Prerequisites

Playwright and Chromium are pre-installed in the agent sandbox (`hoc/agent-sandbox:latest`).
If running in a bare container, install first:

```bash
pip3 install playwright
npx playwright install chromium --with-deps
```

## Core Capabilities

### 1. Navigate & Screenshot

```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1920, "height": 1080})
    page.goto("https://example.com")
    page.screenshot(path="/workspace/screenshot.png", full_page=True)
    print(f"Title: {page.title()}")
    browser.close()
```

### 2. Fill Forms & Click Elements

```python
page.goto("https://example.com/login")
page.fill('input[name="email"]', 'user@example.com')
page.fill('input[name="password"]', 'securepassword')
page.click('button[type="submit"]')
page.wait_for_url("**/dashboard**")
page.screenshot(path="/workspace/after-login.png")
```

### 3. Extract Data from Pages

```python
# Get all links
links = page.eval_on_selector_all("a[href]", "els => els.map(e => ({text: e.textContent.trim(), href: e.href}))")

# Get table data
rows = page.query_selector_all("table tbody tr")
for row in rows:
    cells = row.query_selector_all("td")
    data = [cell.inner_text() for cell in cells]
    print(data)

# Get structured data via JavaScript
data = page.evaluate("""() => {
    return Array.from(document.querySelectorAll('.product')).map(el => ({
        name: el.querySelector('.name')?.textContent,
        price: el.querySelector('.price')?.textContent,
        image: el.querySelector('img')?.src
    }))
}""")
```

### 4. Handle Dynamic Content (SPAs)

```python
# Wait for dynamic content to load
page.wait_for_selector(".results-container", timeout=10000)

# Wait for network idle
page.wait_for_load_state("networkidle")

# Scroll to load lazy content
page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
page.wait_for_timeout(2000)

# Infinite scroll pattern
prev_height = 0
while True:
    page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    page.wait_for_timeout(1500)
    new_height = page.evaluate("document.body.scrollHeight")
    if new_height == prev_height:
        break
    prev_height = new_height
```

### 5. Download Files

```python
with page.expect_download() as download_info:
    page.click("a.download-link")
download = download_info.value
download.save_as(f"/workspace/downloads/{download.suggested_filename}")
```

### 6. Handle Authentication (Cookies/Sessions)

```python
# Save login state
context = browser.new_context()
page = context.new_page()
page.goto("https://app.example.com/login")
page.fill("#email", "user@example.com")
page.fill("#password", "pass123")
page.click("button[type=submit]")
page.wait_for_url("**/dashboard**")
# Save cookies/state for reuse
context.storage_state(path="/workspace/.auth/state.json")
context.close()

# Reuse authentication later
context = browser.new_context(storage_state="/workspace/.auth/state.json")
page = context.new_page()
page.goto("https://app.example.com/dashboard")  # Already logged in!
```

### 7. Multi-Tab / Multi-Page Workflows

```python
# Open multiple tabs
page1 = context.new_page()
page2 = context.new_page()
page1.goto("https://source.example.com")
page2.goto("https://target.example.com")

# Extract from page1, fill into page2
data = page1.inner_text(".data-field")
page2.fill("#import-field", data)
page2.click("#submit")
```

### 8. PDF Generation

```python
page.goto("https://example.com/report")
page.pdf(path="/workspace/report.pdf", format="A4", print_background=True)
```

### 9. Network Interception

```python
# Block images for faster scraping
page.route("**/*.{png,jpg,jpeg,gif,svg}", lambda route: route.abort())

# Capture API responses
responses = []
page.on("response", lambda r: responses.append({
    "url": r.url, "status": r.status
}) if "/api/" in r.url else None)

page.goto("https://app.example.com")
print(f"Captured {len(responses)} API calls")
```

### 10. Automated Testing

```python
# Assert page content
from playwright.sync_api import expect

page.goto("https://myapp.com")
expect(page).to_have_title("My App")
expect(page.locator("h1")).to_have_text("Welcome")
expect(page.locator(".items")).to_have_count(5)
```

## CLI Usage

For quick one-off tasks, use the Playwright CLI:

```bash
# Take a screenshot
npx playwright screenshot https://example.com /workspace/screenshot.png

# Generate a PDF
npx playwright pdf https://example.com /workspace/page.pdf

# Open Playwright's codegen tool (generates code from your interactions)
npx playwright codegen https://example.com
```

## Advanced Patterns

### Stealth Mode (Anti-Detection)

```python
context = browser.new_context(
    user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    viewport={"width": 1920, "height": 1080},
    locale="en-US",
    timezone_id="America/New_York",
)
# Also consider using Scrapling for advanced anti-detection
```

### Parallel Page Processing

```python
import asyncio
from playwright.async_api import async_playwright

async def scrape_urls(urls):
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        tasks = [scrape_page(browser, url) for url in urls]
        results = await asyncio.gather(*tasks)
        await browser.close()
        return results

async def scrape_page(browser, url):
    page = await browser.new_page()
    await page.goto(url, timeout=30000)
    title = await page.title()
    text = await page.inner_text("body")
    await page.close()
    return {"url": url, "title": title, "text": text[:500]}
```

### Full Website Mirror + Assets

```bash
# Use wget for complete mirroring including all assets
wget --mirror --convert-links --adjust-extension --page-requisites \
     --no-parent --directory-prefix=/workspace/mirror \
     https://example.com

# Or use httrack for smarter crawling
apt-get install -y httrack
httrack https://example.com -O /workspace/mirror -r3
```

## Tool Integration

When the agent loop calls `sandbox_exec`, use these Playwright scripts:

```bash
# Quick scrape — write a Python script and execute it
python3 /workspace/.skills/playwright-scrape.py "https://example.com" "/workspace/output"

# Screenshot workflow
python3 -c "
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page()
    pg.goto('$URL')
    pg.screenshot(path='/workspace/screenshot.png', full_page=True)
    print(pg.title())
    b.close()
"
```

## Error Handling

Always wrap Playwright operations in try/except:

```python
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout

try:
    page.goto(url, timeout=30000)
except PlaywrightTimeout:
    print(f"Timeout loading {url}")
except Exception as e:
    print(f"Error: {e}")
finally:
    browser.close()
```

## Environment Notes

- **Chromium only** — Firefox and WebKit are not installed by default
- **Headless mode** — always use `headless=True` when running from agent loop
- **noVNC** — if you need to see the browser visually, access `http://localhost:6080`
- **Screenshots** — save to `/workspace/` for preview access
- **Max concurrent** — limit to 3 browser instances to avoid memory pressure
