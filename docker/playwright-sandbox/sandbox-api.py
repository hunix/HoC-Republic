"""
HoC Playwright Sandbox — Internal API Server

Lightweight FastAPI service running inside the Playwright sandbox container.
The gateway calls this to execute commands, run scripts, and control the browser.
Identical interface to the full agent-sandbox API.
"""

import asyncio
import json
import os
import subprocess
import sys
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="HoC Playwright Sandbox API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ─── Models ──────────────────────────────────────────────────────

class ExecRequest(BaseModel):
    command: str
    cwd: str = "/workspace"
    timeout: int = 60

class ExecResult(BaseModel):
    stdout: str
    stderr: str
    exit_code: int
    duration_ms: float

class WriteFileRequest(BaseModel):
    path: str
    content: str

class BrowserAction(BaseModel):
    action: str  # navigate, click, type, screenshot, extract_text, execute_js
    url: str | None = None
    selector: str | None = None
    text: str | None = None
    code: str | None = None

class ComputerActionRequest(BaseModel):
    action: str
    coordinate: list[int] | None = None
    text: str | None = None

# ─── Shell Execution ─────────────────────────────────────────────

@app.post("/exec", response_model=ExecResult)
async def exec_command(req: ExecRequest):
    """Execute a shell command inside the sandbox."""
    import time
    start = time.time()
    try:
        proc = await asyncio.create_subprocess_shell(
            req.command,
            cwd=req.cwd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=req.timeout)
        duration_ms = (time.time() - start) * 1000
        return ExecResult(
            stdout=stdout.decode("utf-8", errors="replace")[-10000:],
            stderr=stderr.decode("utf-8", errors="replace")[-5000:],
            exit_code=proc.returncode or 0,
            duration_ms=round(duration_ms, 1),
        )
    except asyncio.TimeoutError:
        return ExecResult(stdout="", stderr="Command timed out", exit_code=124, duration_ms=req.timeout * 1000)

# ─── File Operations ─────────────────────────────────────────────

@app.post("/write-file")
async def write_file(req: WriteFileRequest):
    """Write content to a file inside the sandbox."""
    path = Path(req.path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(req.content, encoding="utf-8")
    return {"ok": True, "path": str(path), "size": len(req.content)}

@app.get("/read-file")
async def read_file(path: str):
    """Read a file from the sandbox."""
    p = Path(path)
    if not p.exists():
        raise HTTPException(404, f"File not found: {path}")
    return {"ok": True, "content": p.read_text(encoding="utf-8", errors="replace")[:50000]}

@app.get("/list-files")
async def list_files(path: str = "/workspace"):
    """List files in a directory."""
    p = Path(path)
    if not p.is_dir():
        raise HTTPException(404, f"Directory not found: {path}")
    entries = []
    for entry in sorted(p.iterdir()):
        entries.append({
            "name": entry.name,
            "type": "dir" if entry.is_dir() else "file",
            "size": entry.stat().st_size if entry.is_file() else 0,
        })
    return {"ok": True, "path": str(p), "entries": entries}

# ─── Browser Automation (Playwright) ─────────────────────────────

_browser = None
_page = None

async def get_page():
    """Lazily launch Playwright browser and return a page."""
    global _browser, _page
    if _page is None:
        try:
            from playwright.async_api import async_playwright
            pw = await async_playwright().start()
            _browser = await pw.chromium.launch(
                headless=False,  # Visible in VNC!
                args=["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"]
            )
            _page = await _browser.new_page(viewport={"width": 1200, "height": 700})
        except Exception as e:
            raise HTTPException(500, f"Failed to launch browser: {e}")
    return _page

@app.post("/browser")
async def browser_action(req: BrowserAction):
    """Control the browser inside the sandbox."""
    page = await get_page()

    if req.action == "navigate":
        if not req.url:
            raise HTTPException(400, "URL required for navigate")
        await page.goto(req.url, wait_until="domcontentloaded", timeout=30000)
        return {"ok": True, "url": page.url, "title": await page.title()}

    elif req.action == "click":
        if not req.selector:
            raise HTTPException(400, "Selector required for click")
        await page.click(req.selector, timeout=10000)
        return {"ok": True, "clicked": req.selector}

    elif req.action == "type":
        if not req.selector or not req.text:
            raise HTTPException(400, "Selector and text required for type")
        await page.fill(req.selector, req.text, timeout=10000)
        return {"ok": True, "typed": len(req.text)}

    elif req.action == "screenshot":
        import base64
        screenshot = await page.screenshot(full_page=False)
        b64 = base64.b64encode(screenshot).decode("ascii")
        return {"ok": True, "screenshot_b64": b64, "url": page.url}

    elif req.action == "extract_text":
        text = await page.inner_text("body")
        return {"ok": True, "text": text[:20000], "url": page.url}

    elif req.action == "execute_js":
        if not req.code:
            raise HTTPException(400, "Code required for execute_js")
        result = await page.evaluate(req.code)
        return {"ok": True, "result": str(result)[:5000]}

    else:
        raise HTTPException(400, f"Unknown action: {req.action}")

# ─── Health / Status ─────────────────────────────────────────────

@app.get("/health")
async def health():
    """Health check endpoint."""
    import shutil
    disk = shutil.disk_usage("/workspace")
    return {
        "ok": True,
        "service": "hoc-playwright-sandbox",
        "workspace_disk_free_gb": round(disk.free / 1e9, 2),
        "python_version": sys.version,
        "pid": os.getpid(),
    }

@app.get("/screenshot")
async def take_screenshot():
    """Take a screenshot of the virtual display."""
    import base64
    screen_path = Path("/tmp/screen.png")
    proc = await asyncio.create_subprocess_shell(
        "DISPLAY=:99 scrot -z /tmp/screen.png",
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
    )
    await proc.communicate()
    
    if screen_path.exists():
        b64 = base64.b64encode(screen_path.read_bytes()).decode("ascii")
        return {"ok": True, "screenshot_b64": b64}
    return {"ok": False, "error": "Screenshot failed"}

@app.post("/computer")
async def computer_action(req: ComputerActionRequest):
    """Direct X11 control mapping Anthropic's Computer Use API."""
    import time
    action = req.action
    cmd = None
    
    if action == "mouse_move" and req.coordinate:
        x, y = req.coordinate
        cmd = f"xdotool mousemove {x} {y}"
    elif action == "left_click":
        cmd = "xdotool click 1"
    elif action == "left_click_drag" and req.coordinate:
        x, y = req.coordinate
        cmd = f"xdotool mousedown 1 mousemove {x} {y} mouseup 1"
    elif action == "right_click":
        cmd = "xdotool click 3"
    elif action == "middle_click":
        cmd = "xdotool click 2"
    elif action == "double_click":
        cmd = "xdotool click --repeat 2 1"
    elif action == "type" and req.text:
        safe_text = req.text.replace("'", "'\\''")
        cmd = f"xdotool type --delay 10 '{safe_text}'"
    elif action == "key" and req.text:
        cmd = f"xdotool key {req.text}"
    elif action == "screenshot":
        return await take_screenshot()
    else:
        return {"ok": False, "error": f"Invalid or missing parameters for action: {action}"}
        
    if cmd:
        proc = await asyncio.create_subprocess_shell(
            f"DISPLAY=:99 {cmd}",
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        await proc.communicate()
        
    time.sleep(0.5)
    return await take_screenshot()

# ─── Main ────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("SANDBOX_API_PORT", "3100"))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
