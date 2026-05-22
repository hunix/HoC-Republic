#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════
#  HoC M5StickC Plus2 — Provisioning Script
#
#  Interactive setup that configures WiFi and gateway settings
#  before flashing the firmware. Writes values into config.h
#  and then runs PlatformIO build + upload.
#
#  Usage:  ./scripts/provision.sh [PORT]
#  Example: ./scripts/provision.sh /dev/ttyACM0
# ══════════════════════════════════════════════════════════════

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CONFIG_FILE="$PROJECT_DIR/include/config.h"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${CYAN}"
echo "  ╔═══════════════════════════════════════╗"
echo "  ║   HoC M5StickC Plus2 — Provisioner    ║"
echo "  ╚═══════════════════════════════════════╝"
echo -e "${NC}"

# ── Check prerequisites ─────────────────────────────────────
if ! command -v pio &> /dev/null; then
    echo -e "${RED}Error: PlatformIO CLI (pio) not found.${NC}"
    echo "Install it: pip install platformio"
    exit 1
fi

# ── Detect port ──────────────────────────────────────────────
PORT="${1:-}"
if [ -z "$PORT" ]; then
    echo -e "${YELLOW}Detecting USB port...${NC}"
    if [ -e /dev/ttyACM0 ]; then
        PORT="/dev/ttyACM0"
    elif [ -e /dev/ttyUSB0 ]; then
        PORT="/dev/ttyUSB0"
    elif ls /dev/cu.usbserial-* 2>/dev/null | head -1 > /dev/null; then
        PORT=$(ls /dev/cu.usbserial-* 2>/dev/null | head -1)
    elif ls /dev/cu.usbmodem* 2>/dev/null | head -1 > /dev/null; then
        PORT=$(ls /dev/cu.usbmodem* 2>/dev/null | head -1)
    else
        echo -e "${RED}No USB serial port detected.${NC}"
        echo "Connect your M5StickC Plus2 and try again,"
        echo "or specify the port: ./provision.sh /dev/ttyXXX"
        exit 1
    fi
    echo -e "${GREEN}Found: $PORT${NC}"
fi

# ── Gather configuration ────────────────────────────────────
echo ""
echo -e "${CYAN}── WiFi Configuration ──${NC}"
read -p "  WiFi SSID: " WIFI_SSID
read -sp "  WiFi Password: " WIFI_PASS
echo ""

echo ""
echo -e "${CYAN}── HoC Gateway Configuration ──${NC}"
read -p "  Gateway Host IP [192.168.1.100]: " GW_HOST
GW_HOST="${GW_HOST:-192.168.1.100}"
read -p "  Gateway Port [18789]: " GW_PORT
GW_PORT="${GW_PORT:-18789}"
read -p "  Gateway Token (leave empty if none): " GW_TOKEN
read -p "  Use TLS? (y/N): " USE_TLS
USE_TLS="${USE_TLS:-N}"

if [[ "$USE_TLS" =~ ^[Yy]$ ]]; then
    TLS_VAL="true"
else
    TLS_VAL="false"
fi

echo ""
echo -e "${CYAN}── Summary ──${NC}"
echo "  WiFi SSID:     $WIFI_SSID"
echo "  Gateway:       $GW_HOST:$GW_PORT"
echo "  TLS:           $TLS_VAL"
echo "  Token:         ${GW_TOKEN:-(none)}"
echo "  Port:          $PORT"
echo ""

read -p "Proceed with flashing? (Y/n): " CONFIRM
CONFIRM="${CONFIRM:-Y}"
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
fi

# ── Write configuration ─────────────────────────────────────
echo -e "${YELLOW}Writing configuration...${NC}"

# Use sed to replace values in config.h
sed -i "s|#define WIFI_SSID.*|#define WIFI_SSID            \"$WIFI_SSID\"|" "$CONFIG_FILE"
sed -i "s|#define WIFI_PASS.*|#define WIFI_PASS            \"$WIFI_PASS\"|" "$CONFIG_FILE"
sed -i "s|#define GATEWAY_HOST.*\".*\"|#define GATEWAY_HOST         \"$GW_HOST\"|" "$CONFIG_FILE"
sed -i "s|#define GATEWAY_PORT.*[0-9]|#define GATEWAY_PORT         $GW_PORT|" "$CONFIG_FILE"
sed -i "s|#define GATEWAY_TOKEN.*\".*\"|#define GATEWAY_TOKEN        \"$GW_TOKEN\"|" "$CONFIG_FILE"
sed -i "s|#define GATEWAY_USE_TLS.*|#define GATEWAY_USE_TLS      $TLS_VAL|" "$CONFIG_FILE"

echo -e "${GREEN}Configuration written to config.h${NC}"

# ── Build & Flash ────────────────────────────────────────────
echo ""
echo -e "${YELLOW}Building firmware...${NC}"
cd "$PROJECT_DIR"
pio run

echo ""
echo -e "${YELLOW}Uploading firmware to $PORT...${NC}"
pio run -t upload --upload-port "$PORT"

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Firmware flashed successfully!      ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════╝${NC}"
echo ""
echo "Your M5StickC Plus2 will now:"
echo "  1. Connect to WiFi: $WIFI_SSID"
echo "  2. Connect to HoC Gateway: $GW_HOST:$GW_PORT"
echo "  3. Show the dashboard on the display"
echo ""
echo "Open Serial Monitor to interact:"
echo "  pio device monitor -p $PORT -b 115200"
echo ""
echo -e "${CYAN}Tip: You can change settings later via Serial commands.${NC}"
echo "     Type /help in the serial monitor for all options."
