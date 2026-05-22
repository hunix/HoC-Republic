FROM ubuntu:22.04

LABEL maintainer="HoC Agent Sandbox"
LABEL hoc.service="agent-sandbox"
LABEL hoc.managed="true"

ENV DEBIAN_FRONTEND=noninteractive
ENV DISPLAY=:99
ENV VNC_PORT=5900
ENV NOVNC_PORT=6080
ENV PREVIEW_PORT=8080
ENV SANDBOX_API_PORT=3100

# ─── System packages ────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Core tools
    curl wget git ca-certificates gnupg lsb-release unzip jq \
    # Build essentials
    build-essential python3 python3-pip python3-venv \
    # Virtual display + VNC + Computer Control Tools
    xvfb x11vnc fluxbox xterm \
    xdotool scrot xclip wmctrl x11-utils \
    # noVNC (browser-based VNC client)
    novnc websockify \
    # Chromium for Playwright
    chromium-browser fonts-liberation fonts-noto-color-emoji \
    # Database client (for direct SQL queries)
    postgresql-client \
    # Document processing (PDF, Word, images)
    imagemagick poppler-utils pandoc \
    # Misc
    sudo htop procps net-tools dnsutils \
    && rm -rf /var/lib/apt/lists/*

# ─── GitHub CLI ──────────────────────────────────────────────────
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

# ─── Docker CLI (for Supabase/container orchestration via host socket) ──
RUN curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list \
    && apt-get update && apt-get install -y docker-ce-cli docker-compose-plugin \
    && rm -rf /var/lib/apt/lists/*

# ─── Node.js 22 ─────────────────────────────────────────────────
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g pnpm

# ─── Claude Code CLI ─────────────────────────────────────────────
# Anthropic's agentic coding assistant — used by the orchestrator
# for complex software development tasks (full-stack builds, refactoring, QA)
RUN npm install -g @anthropic-ai/claude-code \
    && claude --version || true

# ─── Supabase CLI ────────────────────────────────────────────────
# Full-stack backend: Postgres, Auth, Storage, Realtime, Edge Functions
# Pin to a known version to avoid GitHub API rate-limit 404s on dynamic lookup
ARG SUPABASE_VERSION=2.84.4
RUN curl -fsSL "https://github.com/supabase/cli/releases/download/v${SUPABASE_VERSION}/supabase_linux_amd64.tar.gz" -o /tmp/supabase.tar.gz \
    && tar -xzf /tmp/supabase.tar.gz -C /usr/local/bin supabase \
    && rm /tmp/supabase.tar.gz \
    && supabase --version \
    || (echo 'Pinned version failed, falling back to npm install' && npm install -g supabase) \
    && npm install -g lighthouse @axe-core/cli

# ─── Cloudflared (Cloudflare Quick Tunnel for public URLs) ───────
RUN curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o /tmp/cloudflared.deb \
    && dpkg -i /tmp/cloudflared.deb \
    && rm /tmp/cloudflared.deb

# ─── Deno (for Supabase Edge Functions) ─────────────────────────
RUN curl -fsSL https://deno.land/install.sh | sh \
    && ln -s /root/.deno/bin/deno /usr/local/bin/deno || true

# NOTE: GitHub CLI (gh) already installed in the earlier apt block (line 34-38)

# ─── Rclone (OneDrive, Google Drive, Dropbox OAuth storage) ─────
RUN curl -fsSL https://rclone.org/install.sh | bash

# ─── Python packages (Layer 1: Essential — document gen, browser, web) ──
RUN pip3 install --no-cache-dir \
    playwright requests beautifulsoup4 pandas \
    fastapi uvicorn aiofiles lxml \
    numpy matplotlib seaborn pillow openpyxl \
    python-pptx reportlab jinja2 pydantic \
    python-docx pypdf scikit-learn \
    cairosvg markdown

# ─── Python packages (Layer 2: Heavy ML/RAG — may timeout, non-blocking) ──
RUN pip3 install --no-cache-dir \
    "scrapling[all]" \
    chromadb sentence-transformers \
    axe-selenium-python \
    || echo "⚠️ Heavy ML packages failed to install (non-critical)"

# ─── Scrapling browser dependencies (camoufox, stealth fingerprints) ──
RUN scrapling install || echo "⚠️ Scrapling install skipped (non-critical)"

# ─── Playwright browsers ────────────────────────────────────────
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/playwright
RUN npx playwright install chromium --with-deps 2>/dev/null || true

# ─── Workspace directory ────────────────────────────────────────
RUN mkdir -p /workspace /sandbox-api /root/.fluxbox

# ─── Fluxbox config (minimal window manager) ─────────────────────
RUN echo '[startup]\n{sleep 1 && xterm &}' > /root/.fluxbox/startup

# ─── Sandbox API server (simple HTTP + WebSocket for commands) ───
COPY sandbox-api.py /sandbox-api/server.py
COPY scrapling-tools.py /sandbox-api/scrapling-tools.py
COPY demo-builder.py /sandbox-api/demo-builder.py

# ─── Entrypoint ─────────────────────────────────────────────────
COPY start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 6080 8080 3100

WORKDIR /workspace
CMD ["/start.sh"]
