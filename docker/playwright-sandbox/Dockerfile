FROM ubuntu:22.04

LABEL maintainer="HoC Playwright Sandbox"
LABEL hoc.service="sandbox-playwright"
LABEL hoc.managed="true"
LABEL hoc.image.type="custom"

ENV DEBIAN_FRONTEND=noninteractive
ENV DISPLAY=:99
ENV VNC_PORT=5900
ENV NOVNC_PORT=6080
ENV PREVIEW_PORT=8080
ENV SANDBOX_API_PORT=3100

# ─── System packages ────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Core tools
    curl wget git ca-certificates gnupg lsb-release jq \
    # Archive tools (zip, 7z, tar are included in base)
    zip unzip p7zip-full \
    # Virtual display + VNC + Computer Control Tools
    xvfb x11vnc fluxbox xterm \
    xdotool scrot xclip wmctrl x11-utils \
    # noVNC (browser-based VNC client)
    novnc websockify \
    # Chromium for Playwright (fallback if npx install fails)
    chromium-browser fonts-liberation fonts-noto-color-emoji \
    # Media/document essentials
    imagemagick ffmpeg \
    # Build essentials (for native npm modules)
    build-essential python3 python3-pip python3-venv \
    # Misc
    sudo htop procps net-tools \
    && rm -rf /var/lib/apt/lists/*

# ─── Node.js 22 ─────────────────────────────────────────────────
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g pnpm

# ─── Python packages (minimal — just what Playwright + API need) ─
RUN pip3 install --no-cache-dir \
    playwright requests beautifulsoup4 \
    fastapi uvicorn aiofiles \
    pillow

# ─── Playwright browsers ────────────────────────────────────────
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/playwright
RUN npx playwright install chromium --with-deps 2>/dev/null || true

# ─── Workspace directory ────────────────────────────────────────
RUN mkdir -p /workspace /sandbox-api /root/.fluxbox

# ─── Fluxbox config (minimal window manager) ─────────────────────
RUN echo '[startup]\n{sleep 1 && xterm &}' > /root/.fluxbox/startup

# ─── Sandbox API server (HTTP + exec for gateway communication) ──
COPY sandbox-api.py /sandbox-api/server.py

# ─── Entrypoint ─────────────────────────────────────────────────
COPY start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 6080 8080 3100

WORKDIR /workspace
CMD ["/start.sh"]
