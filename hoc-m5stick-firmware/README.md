# HoC Republic Companion — M5StickC Plus2

> A pocket-sized window into the Republic. Chat with citizens, monitor the simulation, speak commands, and view live statistics — all from your wrist.

**Firmware Version:** 2.1.0 — Flicker-free, polished, stable.

---

## What's New in v2.1.0

This release focuses on **display stability, visual polish, and power management**.

| Improvement | Details |
|:------------|:--------|
| **Zero-Flicker Display** | All drawing uses M5Canvas sprite double-buffering. The entire frame is composed off-screen, then atomically pushed to the display in a single `pushSprite()` call. No partial redraws or visible tearing. |
| **Dirty-Flag System** | The screen only redraws when data actually changes. Each `update*()` method sets `_dirty = true` only when the new value differs from the old one. |
| **Frame Rate Throttle** | Minimum 150ms between frames (~7 FPS). Prevents the display from being hammered by rapid state changes. |
| **Battery Smoothing** | Exponential Moving Average (alpha=0.05) with a 3% change threshold. Battery reads every 10 seconds. The displayed percentage changes slowly and smoothly. |
| **Visual Battery Icon** | Color-coded battery icon (green >50%, gold 20-50%, red <20%) with a fill-level indicator and percentage text. |
| **Increased Brightness** | Default brightness raised to 128/255 to avoid PWM flicker on the LCD backlight. Dim mode at 30/255. |
| **Smart Power Management** | Screen dims after 20s of inactivity, turns off after 60s. Tilt-to-wake via IMU. FreeRTOS `vTaskDelay` for proper RTOS yielding. |
| **WiFi State Guard** | WiFi status updates only mark the display dirty when the connection state or IP actually changes. |
| **Memory Monitoring** | Free heap displayed on the Health screen. Warning color when heap drops below 20KB. |

---

## Overview

This firmware transforms the M5StickC Plus2 into a dedicated companion device for the **HoC (House of Citizens)** platform, connecting directly to the OpenClaw gateway over WebSocket with full Ed25519 device identity authentication.

| Feature | Description |
|:--------|:------------|
| **Republic Dashboard** | Live population, happiness, health, simulation status, and session count on the home screen |
| **AI Chat** | Full bidirectional chat with quick-reply suggestions and streaming response display |
| **Voice Input** | Hold BtnA to record speech via the built-in PDM microphone; audio is sent to the gateway for transcription and auto-submitted as chat |
| **Republic Statistics** | Four sub-pages: Overview, Specializations (bar chart), Activities (bar chart), Economy and Treasury |
| **Server Health** | CPU, memory, uptime, active clients, and server version with progress bar visualizations |
| **Auto-Session** | Automatically restores the last session or creates a new one on connect — no manual setup needed |
| **Ed25519 Identity** | Generates and persists an Ed25519 keypair on first boot; signs every handshake with challenge-response |
| **Tilt-to-Wake** | IMU-based screen wake when you tilt the device |
| **Serial Console** | Full command-line interface over USB for configuration and debugging |

---

## Hardware

| Component | Specification |
|:----------|:-------------|
| MCU | ESP32-PICO-V3-02 |
| Display | 1.14" TFT LCD (ST7789v2), 135x240 |
| Flash / PSRAM | 8 MB / 2 MB |
| Microphone | SPM1423 PDM (I2S, GPIO0 CLK, GPIO34 DATA) |
| Battery | 200 mAh LiPo |
| Buttons | BtnA (front), BtnB (side), BtnPWR (top) |
| Connectivity | WiFi 802.11 b/g/n, Bluetooth 4.2 |
| USB | Type-C (CH9102 UART) |

---

## Screens

The firmware provides six screens, navigable with the buttons:

| Screen | Content | Controls |
|:-------|:--------|:---------|
| **HOME** | Republic dashboard: population donut, happiness/health bars, simulation status, session indicator | BtnA/B: Next screen, PWR: Previous |
| **CHAT** | AI conversation with streaming responses, quick-reply bar, voice recording overlay | BtnA: Send quick reply, BtnB: Cycle replies, Hold BtnA: Voice record |
| **REPUBLIC** | Four sub-pages: Overview, Specializations bar chart, Activities bar chart, Economy/Treasury | BtnA/B: Next sub-page, PWR: Previous screen |
| **SESSIONS** | Session browser with active indicator, message counts, and selection | BtnA: Select session, BtnB: Scroll, PWR: Previous |
| **HEALTH** | Server CPU, memory, uptime, clients, sessions, version, and device heap | BtnA: Refresh, PWR: Previous |
| **SETTINGS** | WiFi SSID, gateway host, connection status, device ID, active session, firmware version | PWR: Previous |

---

## Voice Input

The M5StickC Plus2 has a built-in SPM1423 PDM microphone. On the **CHAT** screen:

1. **Hold BtnA** for at least 600ms to start recording (you will hear a beep and see a red "Recording" overlay with elapsed time)
2. **Speak** your message (up to 5 seconds)
3. **Release BtnA** to stop recording (another beep confirms)
4. The audio is encoded as a WAV file and sent to the gateway's `voice.transcribe` RPC
5. The gateway forwards it to the configured STT service (e.g., OpenAI Whisper)
6. The transcript is automatically sent as a chat message in the active session

---

## How It Works

The firmware follows the exact same authentication flow as the official OpenClaw clients:

1. **Boot:** The device connects to WiFi and synchronizes time via NTP.
2. **WebSocket Connect:** A WebSocket connection is established to the gateway (default port `18789`).
3. **Challenge:** The gateway sends a `connect.challenge` event containing a unique `nonce`.
4. **Sign:** The firmware builds an auth payload string (`v2|deviceId|clientId|mode|role|scopes|signedAtMs|token|nonce`) and signs it with the device's Ed25519 private key.
5. **Handshake:** A `connect` request is sent with the full device identity object (`id`, `publicKey`, `signature`, `signedAt`, `nonce`), along with auth token and client metadata.
6. **Connected:** The gateway verifies the signature and responds with a success payload.
7. **Auto-Session:** The firmware requests the session list, restores the last active session from NVS, or creates a new one if none exist.
8. **Republic Poll:** Republic statistics are fetched immediately and then every 30 seconds.

---

## Auto-Session Behavior

On successful gateway connection, the firmware automatically:

1. Requests the session list from the gateway
2. Checks NVS for a previously saved session key
3. If the saved session still exists on the server, it restores it
4. If not, it uses the most recent existing session
5. If no sessions exist at all, it creates a new one titled "M5Stick Companion"
6. The active session key is persisted to NVS for next boot

This means you never have to manually create or select a session — the device is ready to chat immediately after connecting.

---

## Republic Statistics

The Republic screen has four sub-pages (cycle with BtnA or BtnB):

1. **Overview** — Population (total/active), happiness and health progress bars, average credits, simulation state, president name, bill count
2. **Specializations** — Horizontal bar chart of the top 6 citizen specializations by count
3. **Activities** — Horizontal bar chart of the top 6 current citizen activities
4. **Economy** — Treasury balances (USD, BTC, ETH, Credits), active bills, and recent events list

Statistics are polled every 30 seconds automatically.

---

## Installation

### Prerequisites

| Tool | Version | Installation |
|:-----|:--------|:-------------|
| Python | 3.8+ | [python.org](https://www.python.org/downloads/) |
| PlatformIO CLI | Latest | `pip install platformio` |
| CH9102 Driver | Latest | [M5Stack Driver](https://docs.m5stack.com/en/download) |
| PowerShell | 7+ (Windows) | `winget install --id Microsoft.PowerShell` |

### Method 1: Interactive Provisioning (Recommended)

#### Windows 11

1. Connect your M5StickC Plus2 via USB-C
2. Navigate to the `scripts` folder and **double-click** `Provision.cmd`
3. Follow the prompts: WiFi SSID, password, gateway IP, port, and optional token
4. The script writes config, cleans the build cache, compiles, and flashes

Alternatively, from PowerShell 7:

```powershell
cd hoc-m5stick\scripts
.\Provision.ps1
```

If you get an execution policy error: `Set-ExecutionPolicy Bypass -Scope Process`

#### Linux / macOS

```bash
cd hoc-m5stick/scripts
./provision.sh
```

### Method 2: Manual Build

1. Edit `include/config.h` with your WiFi and gateway details:

```c
#define WIFI_SSID            "YourWiFiSSID"
#define WIFI_PASS            "YourWiFiPassword"
#define GATEWAY_HOST         "192.168.1.100"
#define GATEWAY_PORT         18789
#define GATEWAY_TOKEN        ""
```

2. Build and flash:

```powershell
Remove-Item -Recurse -Force .pio -ErrorAction SilentlyContinue
pio run -t upload
pio device monitor
```

### Method 3: Quick Re-flash

If already provisioned, just rebuild and flash:

```powershell
cd hoc-m5stick\scripts
.\Flash.cmd
```

---

## Serial Commands

Connect via `pio device monitor` (115200 baud):

| Command | Description |
|:--------|:------------|
| `/help` | Show all available commands |
| `/set wifi_ssid <val>` | Set WiFi SSID (persisted to NVS) |
| `/set wifi_pass <val>` | Set WiFi password |
| `/set gw_host <val>` | Set gateway host IP |
| `/set gw_port <val>` | Set gateway port |
| `/set gw_token <val>` | Set gateway authentication token |
| `/set brightness <0-255>` | Set display brightness |
| `/status` | Show connection status, device ID, battery, memory |
| `/health` | Request server health from gateway |
| `/sessions` | List available sessions |
| `/republic` | Request Republic overview statistics |
| `/chat <message>` | Send a chat message to the active session |
| `/reboot` | Restart the device |
| `/factory` | Clear all saved settings and identity, then reboot |

You can also type any text without a `/` prefix to send it directly as a chat message.

---

## Troubleshooting

| Issue | Solution |
|:------|:---------|
| `DFRobot_GP8XXX` build error | Already handled: `lib_ignore = DFRobot_GP8XXX` in platformio.ini |
| `BtnPWR` not found | M5StickCPlus2 library is pulled from GitHub master which includes BtnPWR |
| `containsKey` deprecated | All calls use ArduinoJson v7 compatible `obj["key"].is<T>()` syntax |
| "Closed before connect" in gateway log | Fixed in v1.2.0+: reconnect loop no longer kills active WebSocket connections |
| Stuck on "Handshake..." | Ensure NTP can reach the internet (the Ed25519 signature requires accurate time within 5 minutes) |
| Screen flickering | Fixed in v2.1.0: M5Canvas double-buffering + dirty-flag system + frame throttle |
| Battery percentage jumping | Fixed in v2.1.0: EMA smoothing (alpha=0.05, 10s interval, 3% threshold) |
| Voice not working | Ensure you are on the CHAT screen with an active session; hold BtnA for at least 600ms |
| No sessions / "Auto-creating..." | The firmware will create a session automatically; wait a few seconds after connection |
| WiFi connection fails | The M5StickC Plus2 supports **2.4 GHz WiFi only** |
| COM port not detected | Install the CH9102 driver. On Windows, check Device Manager |
| Build cache issues | Delete the `.pio` folder and rebuild: `Remove-Item -Recurse -Force .pio` |

---

## Project Structure

```
hoc-m5stick/
├── boards/
│   └── m5stickc_plus2.json     # Custom PlatformIO board definition
├── include/
│   ├── config.h                # WiFi, gateway, branding, voice, pin config
│   ├── hoc_gateway.h           # Gateway client + Republic data types + voice
│   └── ui_manager.h            # UI screens + voice state + Republic pages
├── src/
│   ├── main.cpp                # Entry point, I2S mic, auto-session, loop
│   ├── hoc_gateway.cpp         # WebSocket + Ed25519 + RPC + Republic + voice
│   └── ui_manager.cpp          # All 6 screens with charts and Republic branding
├── scripts/
│   ├── Provision.ps1           # PowerShell 7 interactive provisioner
│   ├── Provision.cmd           # Double-click launcher for Provision.ps1
│   ├── Flash.ps1               # PowerShell 7 quick re-flash
│   ├── Flash.cmd               # Double-click launcher for Flash.ps1
│   ├── provision.sh            # Linux/macOS interactive provisioner
│   └── flash.sh                # Linux/macOS quick flash
├── platformio.ini              # Build configuration and dependencies
├── .gitignore
└── README.md
```

---

## License

Part of the [HoC (House of Citizens)](https://github.com/hunix/HoC) project. See the main repository for license details.
