FROM ubuntu:22.04

LABEL maintainer="HoC Dev Sandbox"
LABEL hoc.service="sandbox-dev"
LABEL hoc.managed="true"
LABEL hoc.image.type="custom"

ENV DEBIAN_FRONTEND=noninteractive
ENV DISPLAY=:99
ENV VNC_PORT=5900
ENV NOVNC_PORT=6080
ENV PREVIEW_PORT=8080
ENV SANDBOX_API_PORT=3100
ENV CODE_SERVER_PORT=8443

# ─── System packages ────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Core tools
    curl wget git ca-certificates gnupg lsb-release jq httpie \
    # Build essentials / compilers
    build-essential cmake pkg-config autoconf automake libtool \
    python3 python3-pip python3-venv python3-dev \
    # Virtual display + VNC + Computer Control Tools
    xvfb x11vnc fluxbox xterm \
    xdotool scrot xclip wmctrl x11-utils \
    # noVNC (browser-based VNC client)
    novnc websockify \
    # Chromium for Playwright
    chromium-browser fonts-liberation fonts-noto-color-emoji \
    # Database clients
    postgresql-client redis-tools \
    # Document processing
    imagemagick poppler-utils pandoc \
    # Archive tools
    zip unzip p7zip-full \
    # Media tools
    ffmpeg \
    # Misc
    sudo htop procps net-tools dnsutils openssh-client tmux \
    && rm -rf /var/lib/apt/lists/*

# ─── GitHub CLI ──────────────────────────────────────────────────
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
    > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

# ─── Docker CLI (host socket mount, NOT Docker-in-Docker) ────────
RUN curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
    > /etc/apt/sources.list.d/docker.list \
    && apt-get update && apt-get install -y docker-ce-cli docker-compose-plugin \
    && rm -rf /var/lib/apt/lists/*

# ─── Node.js 22 LTS ─────────────────────────────────────────────
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g pnpm tsx typescript \
    && rm -rf /var/lib/apt/lists/*

# ─── Claude Code CLI ────────────────────────────────────────────
# Anthropic's agentic coding assistant for complex multi-file tasks
RUN npm install -g @anthropic-ai/claude-code \
    && claude --version || true

# ─── code-server (VS Code in browser) ───────────────────────────
RUN curl -fsSL https://code-server.dev/install.sh | sh \
    && code-server --version || true

# Install key VS Code extensions
RUN code-server --install-extension esbenp.prettier-vscode \
    --install-extension bradlc.vscode-tailwindcss \
    --install-extension dbaeumer.vscode-eslint \
    --install-extension ms-python.python \
    || true

# ─── Supabase CLI ────────────────────────────────────────────────
ARG SUPABASE_VERSION=2.84.4
RUN curl -fsSL "https://github.com/supabase/cli/releases/download/v${SUPABASE_VERSION}/supabase_linux_amd64.tar.gz" \
    -o /tmp/supabase.tar.gz \
    && tar -xzf /tmp/supabase.tar.gz -C /usr/local/bin supabase \
    && rm /tmp/supabase.tar.gz \
    && supabase --version \
    || (echo 'Pinned version failed, falling back to npm install' && npm install -g supabase)

# ─── Deno (for Supabase Edge Functions) ─────────────────────────
RUN curl -fsSL https://deno.land/install.sh | sh \
    && ln -s /root/.deno/bin/deno /usr/local/bin/deno || true

# ─── Go (backend services, CLI tools) ───────────────────────────
ARG GO_VERSION=1.24.1
RUN curl -fsSL "https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz" \
    -o /tmp/go.tar.gz \
    && tar -C /usr/local -xzf /tmp/go.tar.gz \
    && rm /tmp/go.tar.gz
ENV PATH="/usr/local/go/bin:/root/go/bin:${PATH}"
ENV GOPATH="/root/go"

# ─── Rust (systems programming, WASM) ───────────────────────────
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y \
    && . /root/.cargo/env \
    && rustup target add wasm32-unknown-unknown \
    && cargo install wasm-pack || true
ENV PATH="/root/.cargo/bin:${PATH}"

# ─── Cloudflared (Cloudflare Quick Tunnel) ───────────────────────
RUN curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb \
    -o /tmp/cloudflared.deb \
    && dpkg -i /tmp/cloudflared.deb \
    && rm /tmp/cloudflared.deb

# ─── Rclone (cloud storage: OneDrive, GDrive, Dropbox) ──────────
RUN curl -fsSL https://rclone.org/install.sh | bash

# ─── Global npm dev tools ───────────────────────────────────────
RUN npm install -g \
    lighthouse @axe-core/cli \
    vercel \
    prisma \
    turbo \
    eslint prettier \
    && npm cache clean --force

# ─── Python packages (API server + dev tools) ───────────────────
RUN pip3 install --no-cache-dir \
    playwright requests beautifulsoup4 \
    fastapi uvicorn aiofiles \
    pillow pydantic jinja2 \
    httpx pytest

# ─── Playwright browsers ────────────────────────────────────────
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/playwright
RUN npx playwright install chromium --with-deps 2>/dev/null || true

# ─── Workspace + config directories ─────────────────────────────
RUN mkdir -p /workspace /sandbox-api /root/.fluxbox /root/.config/code-server

# ─── code-server config (no auth for local container use) ────────
RUN echo 'bind-addr: 0.0.0.0:8443\nauth: none\ncert: false' \
    > /root/.config/code-server/config.yaml

# ─── Fluxbox config (minimal window manager) ─────────────────────
RUN echo '[startup]\n{sleep 1 && xterm &}' > /root/.fluxbox/startup

# ─── Git defaults ───────────────────────────────────────────────
RUN git config --global init.defaultBranch main \
    && git config --global user.email "agent@hoc.local" \
    && git config --global user.name "HoC Dev Agent"

# ─── CLAUDE.md (project rules for Claude Code CLI) ──────────────
COPY CLAUDE.md /workspace/CLAUDE.md

# ─── Sandbox API server ─────────────────────────────────────────
COPY sandbox-api.py /sandbox-api/server.py

# ─── Entrypoint ─────────────────────────────────────────────────
COPY start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 6080 8080 3100 8443

WORKDIR /workspace
CMD ["/start.sh"]
