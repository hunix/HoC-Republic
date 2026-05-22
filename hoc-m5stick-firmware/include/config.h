#ifndef HOC_CONFIG_H
#define HOC_CONFIG_H

// ══════════════════════════════════════════════════════════════
//  HoC Republic — M5StickC Plus2 Companion
//  Version 3.0.0  —  Migrated to M5Unified + M5GFX (deprecated M5StickCPlus2 removed)
// ══════════════════════════════════════════════════════════════

#define HOC_VERSION          "3.0.0"

// ── WiFi ────────────────────────────────────────────────────
#define WIFI_SSID            "H-Orbi-Zain-5G"
#define WIFI_PASS            "6659895000"
#define WIFI_CONNECT_TIMEOUT 15000
#define WIFI_RETRY_DELAY     3000

// ── Gateway ─────────────────────────────────────────────────
#define GATEWAY_HOST         "192.168.1.7"
#define GATEWAY_PORT         18789
#define GATEWAY_TOKEN        "05ea46a824ea37a2eb85b945a4c6b8e21e86b62f5cbc910f"
#define GATEWAY_USE_TLS      false
#define GATEWAY_RECONNECT_MS 3000
#define GATEWAY_MAX_RECONNECT_MS 30000
#define GATEWAY_TICK_MS      15000
#define GATEWAY_PROTOCOL_VER 3
#define GW_PING_INTERVAL     25000   // WebSocket ping every 25 s
#define GW_PONG_TIMEOUT      10000   // Expect pong within 10 s

// ── Version / Identity ──────────────────────────────────────
#define DEVICE_CLIENT_ID     "gateway-client"
#define DEVICE_PLATFORM      "esp32"
#define DEVICE_MODE          "node"       // Valid: webchat, cli, ui, backend, node, probe, test, companion

// ── Display (M5StickC Plus2: ST7789v2, 135x240) ────────────
#define SCREEN_W             135
#define SCREEN_H             240
#define SCREEN_ROTATION      1     // landscape: 240 x 135
#define HEADER_H             20
#define FOOTER_H             16
#define BODY_Y               (HEADER_H)
#define BODY_H               (SCREEN_H - HEADER_H - FOOTER_H)

// ── Frame rate / redraw throttle ────────────────────────────
//    CRITICAL: These prevent the screen flicker.
//    The UI only redraws when _dirty is true AND at least
//    UI_FRAME_INTERVAL_MS has elapsed since the last push.
#define UI_FRAME_INTERVAL_MS 150   // ~7 FPS — smooth, no flicker
#define UI_FORCE_REDRAW_MS   5000  // Force full redraw every 5 s (safety net)

// ── Battery smoothing ───────────────────────────────────────
#define BATT_READ_INTERVAL   10000 // Read battery every 10 seconds
#define BATT_EMA_ALPHA       0.05f // Exponential moving average weight (lower = smoother)
#define BATT_CHANGE_THRESH   3     // Only update display if >=3% change

// ── Hardware Pins (M5StickC Plus2) ──────────────────────────
#define HOLD_PIN             4
#define LED_PIN              19
#define IR_PIN               19
#define BUZZER_PIN           2
#define BTN_A_PIN            37
#define BTN_B_PIN            39

// ── Microphone (SPM1423 PDM) ────────────────────────────────
#define MIC_CLK_PIN          0
#define MIC_DATA_PIN         34
#define MIC_SAMPLE_RATE      16000
#define MIC_BITS_PER_SAMPLE  16
#define MIC_BUFFER_SECONDS   5
#define MIC_BUFFER_SIZE      (MIC_SAMPLE_RATE * MIC_BITS_PER_SAMPLE / 8 * MIC_BUFFER_SECONDS)
#define MIC_I2S_PORT         I2S_NUM_0

// ── Color palette (RGB565) ──────────────────────────────────
//    High-contrast dark theme.  Pure black BG for OLED clarity.
//    Republic Gold is bright saturated yellow-gold.
#define COLOR_BG             0x0000  // Pure black
#define COLOR_BG_CARD        0x18E3  // #181828  Dark card
#define COLOR_PRIMARY        0xFE00  // #FFD000  Bright Republic Gold
#define COLOR_ACCENT         0x07FF  // #00FFFF  Bright Cyan
#define COLOR_SUCCESS        0x07E0  // #00FF00  Green
#define COLOR_WARNING        0xFD20  // #FFA500  Orange
#define COLOR_ERROR          0xF800  // #FF0000  Red
#define COLOR_TEXT           0xFFFF  // #FFFFFF  Pure white
#define COLOR_TEXT_DIM       0x9CF3  // #999999  Muted grey
#define COLOR_CHAT_USER      0xFE00  // Republic Gold
#define COLOR_CHAT_AI        0x07FF  // Cyan
#define COLOR_HEADER_BG      0x0000  // Black
#define COLOR_FOOTER_BG      0x0000  // Black
#define COLOR_REPUBLIC       0xFE00  // Republic Gold
#define COLOR_VOICE_ACTIVE   0xF800  // Red when recording
#define COLOR_BATT_GOOD      0x07E0  // Green  > 50%
#define COLOR_BATT_MED       0xFE00  // Gold   20-50%
#define COLOR_BATT_LOW       0xF800  // Red    < 20%

// ── Behaviour ───────────────────────────────────────────────
#define MAX_CHAT_LINES       50
#define MAX_MSG_SIZE         4096
#define SCROLL_SPEED         3
#define STATUS_REFRESH_MS    10000
#define REPUBLIC_REFRESH_MS  30000
#define HAPTIC_ENABLED       true
#define IMU_WAKE_ENABLED     true
#define AUTO_CREATE_SESSION  true

// ── Power management ────────────────────────────────────────
#define SCREEN_DIM_MS        20000   // Dim after 20 s inactivity
#define SCREEN_OFF_MS        60000   // Off after 60 s inactivity
#define BRIGHTNESS_FULL      128     // Normal brightness (0-255)
#define BRIGHTNESS_DIM       30      // Dimmed brightness

// ── Memory thresholds ───────────────────────────────────────
#define HEAP_WARNING_KB      20
#define HEAP_CRITICAL_KB     10

// ── Rate Limiting ───────────────────────────────────────────
#define RATELIMIT_PER_MINUTE 30
#define RATELIMIT_PER_HOUR   200

// ── Auto-Session ────────────────────────────────────────────
#define AUTO_SESSION_TITLE   "M5Stick Companion"

// ── NVS Keys ────────────────────────────────────────────────
#define NVS_NAMESPACE        "hoc"
#define NVS_KEY_WIFI_SSID    "wifi_ssid"
#define NVS_KEY_WIFI_PASS    "wifi_pass"
#define NVS_KEY_GW_HOST      "gw_host"
#define NVS_KEY_GW_PORT      "gw_port"
#define NVS_KEY_GW_TOKEN     "gw_token"
#define NVS_KEY_DEVICE_ID    "device_id"
#define NVS_KEY_DEVICE_TOKEN "device_tok"
#define NVS_KEY_BRIGHTNESS   "brightness"
#define NVS_KEY_SESSION_KEY  "session_k"

#endif // HOC_CONFIG_H
