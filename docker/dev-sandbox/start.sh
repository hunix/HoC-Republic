#!/bin/bash
# ─── HoC Dev Sandbox Entrypoint ──────────────────────────────────
# Full-stack development powerstation.
# Starts: Xvfb → Fluxbox → x11vnc → noVNC → code-server →
#         Sandbox API → Preview server
set -e

echo "🔧 HoC Dev Sandbox starting..."

# ─── 1. Virtual Display ─────────────────────────────────────────
echo "📺 Starting Xvfb virtual display on :99 (1920x1080)"
Xvfb :99 -screen 0 1920x1080x24 -ac +extension GLX +render -noreset &
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

# ─── 5. code-server (VS Code in browser) ────────────────────────
echo "💻 Starting code-server on port ${CODE_SERVER_PORT}"
code-server --bind-addr 0.0.0.0:${CODE_SERVER_PORT} \
    --auth none \
    --disable-telemetry \
    /workspace &
sleep 1

# ─── 6. Sandbox API server ──────────────────────────────────────
echo "🔌 Starting Sandbox API on port ${SANDBOX_API_PORT}"
cd /sandbox-api && python3 server.py &
sleep 1

# ─── 7. Preview server (for hosting generated apps) ─────────────
echo "🖼️ Starting preview server on port ${PREVIEW_PORT}"
cd /workspace && python3 -m http.server ${PREVIEW_PORT} --bind 0.0.0.0 &

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  🔧 HoC Dev Sandbox fully online!                      ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  code-server:  http://localhost:${CODE_SERVER_PORT}     ║"
echo "║  noVNC:        http://localhost:${NOVNC_PORT}/vnc.html  ║"
echo "║  Preview:      http://localhost:${PREVIEW_PORT}         ║"
echo "║  API:          http://localhost:${SANDBOX_API_PORT}     ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  Tools: Node $(node -v), Python $(python3 --version 2>&1 | awk '{print $2}')  ║"
echo "║         Go $(go version 2>/dev/null | awk '{print $3}' | sed 's/go//'), Rust $(rustc --version 2>/dev/null | awk '{print $2}')  ║"
echo "║         Claude Code, GitHub CLI, Supabase CLI, Docker   ║"
echo "╚══════════════════════════════════════════════════════════╝"

# Keep alive
wait -n
