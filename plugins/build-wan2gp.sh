#!/usr/bin/env bash
# Build the WanGP Docker image for HoC integration
#
# Usage:
#   ./build-wan2gp.sh                    # Builds for TITAN RTX + RTX 3090 Ti
#   ./build-wan2gp.sh "8.6"             # Build for specific CUDA arch only
#   ./build-wan2gp.sh "7.5;8.6;8.9"    # Multiple architectures
#
# GPU Architecture Reference:
#   7.5  = TITAN RTX, RTX 2080 Ti
#   8.6  = RTX 3090 Ti, RTX 3080
#   8.9  = RTX 4090, RTX 4080
#   9.0  = H100
#   12.0 = RTX 5090, RTX 6000 Pro (Blackwell) — requires cu130 base image
#
# Note: Building includes SageAttention compilation which takes 10-15 minutes.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$SCRIPT_DIR/.data/wan2gp"
IMAGE_NAME="hoc/wan2gp:latest"
CUDA_ARCH="${1:-7.5;8.6}"

echo "═══════════════════════════════════════════════════"
echo "  Building WanGP Docker Image"
echo "  CUDA Architectures: $CUDA_ARCH"
echo "  Image: $IMAGE_NAME"
echo "═══════════════════════════════════════════════════"

# Clone or update the WanGP repository
if [ -d "$REPO_DIR" ]; then
    echo "📦 Updating existing WanGP repo..."
    cd "$REPO_DIR"
    git pull origin main 2>/dev/null || echo "⚠️ Git pull failed, using existing code"
else
    echo "📦 Cloning WanGP repository..."
    mkdir -p "$(dirname "$REPO_DIR")"
    git clone --depth 1 https://github.com/deepbeepmeep/Wan2GP.git "$REPO_DIR"
    cd "$REPO_DIR"
fi

# Build the Docker image
echo ""
echo "🔨 Building Docker image (this will take 15-30 minutes)..."
echo "   SageAttention compilation is the slowest step."
echo ""

docker build \
    --build-arg CUDA_ARCHITECTURES="$CUDA_ARCH" \
    -t "$IMAGE_NAME" \
    -f Dockerfile \
    .

echo ""
echo "═══════════════════════════════════════════════════"
echo "  ✅ Build complete: $IMAGE_NAME"
echo ""
echo "  Run with:"
echo "    docker run -d --name hoc-wan2gp \\"
echo "      --gpus all \\"
echo "      -p 7860:7860 \\"
echo "      -v wan2gp-models:/home/user/.cache \\"
echo "      -v wan2gp-outputs:/workspace/outputs \\"
echo "      --label hoc.service=wan2gp \\"
echo "      $IMAGE_NAME"
echo ""
echo "  Or use HoC agent:"
echo "    container_manage action=\"start\" container_type=\"wan2gp\""
echo "═══════════════════════════════════════════════════"
