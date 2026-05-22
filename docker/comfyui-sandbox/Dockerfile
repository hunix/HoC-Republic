FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04

LABEL maintainer="HoC ComfyUI Sandbox"
LABEL hoc.service="comfyui-sandbox"
LABEL hoc.managed="true"
LABEL hoc.gpu="required"

ENV DEBIAN_FRONTEND=noninteractive
ENV NVIDIA_VISIBLE_DEVICES=all
ENV NVIDIA_DRIVER_CAPABILITIES=compute,utility

# ─── System packages ────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl wget git ca-certificates gnupg unzip jq \
    build-essential python3 python3-pip python3-venv python3-dev \
    ffmpeg libgl1-mesa-glx libglib2.0-0 libsm6 libxrender-dev \
    sudo htop procps net-tools \
    && rm -rf /var/lib/apt/lists/*

# ─── Node.js 22 ─────────────────────────────────────────────────
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g pnpm

# ─── Python ML packages ─────────────────────────────────────────
RUN pip3 install --no-cache-dir \
    torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu124 \
    && pip3 install --no-cache-dir \
    fastapi uvicorn aiofiles requests \
    Pillow numpy opencv-python-headless scipy \
    transformers accelerate safetensors

# ─── ComfyUI ─────────────────────────────────────────────────────
RUN cd /opt && git clone https://github.com/comfyanonymous/ComfyUI.git \
    && cd ComfyUI && pip3 install --no-cache-dir -r requirements.txt

# ─── ComfyUI Custom Nodes (popular) ─────────────────────────────
RUN cd /opt/ComfyUI/custom_nodes \
    && git clone https://github.com/ltdrdata/ComfyUI-Manager.git \
    && git clone https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite.git \
    && git clone https://github.com/Kosinkadink/ComfyUI-AnimateDiff-Evolved.git \
    && git clone https://github.com/cubiq/ComfyUI_IPAdapter_plus.git || true

# ─── Workspace ──────────────────────────────────────────────────
RUN mkdir -p /workspace /sandbox-api /models

# ─── Sandbox API (same interface as exec sandbox) ───────────────
COPY sandbox-api-gpu.py /sandbox-api/server.py

# ─── Entrypoint ─────────────────────────────────────────────────
COPY start-comfyui.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 8188 8080 3100

WORKDIR /workspace
CMD ["/start.sh"]
