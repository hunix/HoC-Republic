#!/bin/bash
set -e

echo "[ComfyUI Sandbox] Starting..."

# ─── Start ComfyUI in background ────────────────────────────────
cd /opt/ComfyUI
python3 main.py \
  --listen 0.0.0.0 \
  --port 8188 \
  --output-directory /workspace/output \
  --input-directory /workspace/input \
  --extra-model-paths-config /opt/ComfyUI/extra_model_paths.yaml 2>&1 &
COMFYUI_PID=$!

# ─── Start HTTP preview server on port 8080 ──────────────────────
cd /workspace
python3 -m http.server 8080 &

# ─── Start sandbox API on port 3100 ─────────────────────────────
cd /sandbox-api
python3 server.py &

echo "[ComfyUI Sandbox] All services started"
echo "  - ComfyUI:     http://0.0.0.0:8188"
echo "  - Preview:     http://0.0.0.0:8080"
echo "  - Sandbox API: http://0.0.0.0:3100"

# Wait for any process to exit
wait -n
exit $?
