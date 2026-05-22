"""
Sandbox API for GPU containers (ComfyUI, Diffusion, Video).
Same REST interface as the exec sandbox so the agent loop works identically.
"""

import os
import subprocess
import json
import asyncio
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
import uvicorn

app = FastAPI(title="HoC GPU Sandbox API")

WORKSPACE = "/workspace"

@app.get("/health")
async def health():
    """Health check endpoint."""
    gpu_info = "unknown"
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=name,memory.total,memory.free", "--format=csv,noheader"],
            capture_output=True, text=True, timeout=5
        )
        gpu_info = result.stdout.strip()
    except Exception:
        pass
    return {"status": "ok", "gpu": gpu_info, "workspace": WORKSPACE}


@app.post("/exec")
async def exec_command(request: Request):
    """Execute a shell command in the container."""
    body = await request.json()
    command = body.get("command", "")
    timeout = body.get("timeout", 300)
    cwd = body.get("cwd", WORKSPACE)

    try:
        result = subprocess.run(
            command, shell=True, capture_output=True, text=True,
            timeout=timeout, cwd=cwd,
            env={**os.environ, "PYTHONUNBUFFERED": "1"}
        )
        return JSONResponse({
            "ok": True,
            "stdout": result.stdout[-10000:],  # Last 10KB
            "stderr": result.stderr[-5000:],
            "exitCode": result.returncode,
        })
    except subprocess.TimeoutExpired:
        return JSONResponse({"ok": False, "error": f"Command timed out after {timeout}s"}, status_code=408)
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


@app.post("/write")
async def write_file(request: Request):
    """Write content to a file."""
    body = await request.json()
    file_path = body.get("path", "")
    content = body.get("content", "")

    if not file_path:
        return JSONResponse({"ok": False, "error": "path is required"}, status_code=400)

    full_path = Path(file_path)
    full_path.parent.mkdir(parents=True, exist_ok=True)
    full_path.write_text(content, encoding="utf-8")

    return {"ok": True, "path": str(full_path), "size": len(content)}


@app.post("/read")
async def read_file(request: Request):
    """Read a file's content."""
    body = await request.json()
    file_path = body.get("path", "")

    try:
        content = Path(file_path).read_text(encoding="utf-8")
        return {"ok": True, "content": content[-50000:]}  # Last 50KB
    except FileNotFoundError:
        return JSONResponse({"ok": False, "error": "File not found"}, status_code=404)
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


@app.get("/files")
async def list_files(request: Request):
    """List files in a directory."""
    dir_path = request.query_params.get("path", WORKSPACE)
    try:
        p = Path(dir_path)
        items = []
        for item in sorted(p.iterdir()):
            items.append({
                "name": item.name,
                "type": "dir" if item.is_dir() else "file",
                "size": item.stat().st_size if item.is_file() else None,
            })
        return {"ok": True, "path": str(p), "items": items}
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


@app.post("/comfyui/workflow")
async def run_comfyui_workflow(request: Request):
    """Submit a ComfyUI workflow via its REST API."""
    body = await request.json()
    workflow = body.get("workflow", {})
    
    import aiohttp
    async with aiohttp.ClientSession() as session:
        async with session.post("http://127.0.0.1:8188/prompt", json={"prompt": workflow}) as resp:
            result = await resp.json()
            return {"ok": True, "prompt_id": result.get("prompt_id"), "result": result}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=3100)
