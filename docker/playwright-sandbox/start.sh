#!/bin/bash
# ─── HoC Playwright Sandbox Entrypoint ───────────────────────────
# Lightweight sandbox for browser automation tasks.
# Starts: Xvfb → Fluxbox → x11vnc → noVNC → Sandbox API → Preview server
set -e

echo "🎭 HoC Playwright Sandbox starting..."

# ─── 1. Virtual Display ─────────────────────────────────────────
echo "📺 Starting Xvfb virtual display on :99 (1280x720)"
Xvfb :99 -screen 0 1280x720x24 -ac +extension GLX +render -noreset &
sleep 1

# ─── 2. Window Manager ──────────────────────────────────────────
echo "🪟 Starting Fluxbox window manager"
fluxbox &
sleep 1

# ─── 3. VNC Server ──────────────────────────────────────────────
echo "🖥️ Starting x11vnc on port ${VNC_PORT}"
x11vnc -display :99 -nopw -listen 0.0.0.0 -xkb -ncache 10 \
       -ncache_cr -forever -shared -rfbport ${VNC_PORT} &
sleep 1

# ─── 4. noVNC (browser-accessible VNC) ──────────────────────────
echo "🌐 Starting noVNC on port ${NOVNC_PORT}"
websockify --web /usr/share/novnc ${NOVNC_PORT} localhost:${VNC_PORT} &
sleep 1

# ─── 5. Sandbox API server ──────────────────────────────────────
echo "🔌 Starting Sandbox API on port ${SANDBOX_API_PORT}"
cd /sandbox-api && python3 server.py &
sleep 1

# ─── 6. Simple preview server (for hosting generated content) ───
echo "🖼️ Starting preview server on port ${PREVIEW_PORT}"
cd /workspace && python3 -m http.server ${PREVIEW_PORT} --bind 0.0.0.0 &

echo "✅ HoC Playwright Sandbox fully online!"
echo "   noVNC:   http://localhost:${NOVNC_PORT}/vnc.html"
echo "   Preview: http://localhost:${PREVIEW_PORT}"
echo "   API:     http://localhost:${SANDBOX_API_PORT}"

# Keep alive
wait -n
