#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════
#  HoC M5StickC Plus2 — Quick Flash
#
#  Builds and uploads without modifying config.h.
#  Use this if you prefer to configure via Serial commands
#  after flashing, or if config.h is already set up.
#
#  Usage:  ./scripts/flash.sh [PORT]
# ══════════════════════════════════════════════════════════════

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

PORT="${1:-}"

cd "$PROJECT_DIR"

echo "Building HoC M5StickC Plus2 firmware..."
pio run

if [ -n "$PORT" ]; then
    echo "Uploading to $PORT..."
    pio run -t upload --upload-port "$PORT"
else
    echo "Uploading (auto-detect port)..."
    pio run -t upload
fi

echo ""
echo "Done! Open serial monitor:"
echo "  pio device monitor -b 115200"
echo ""
echo "Then configure via serial:"
echo "  /set wifi_ssid YourNetwork"
echo "  /set wifi_pass YourPassword"
echo "  /set gw_host 192.168.1.100"
echo "  /set gw_port 18789"
echo "  /reboot"
