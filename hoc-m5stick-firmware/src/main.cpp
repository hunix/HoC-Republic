#include <M5Unified.h>
#include <WiFi.h>
#include <Preferences.h>
#include <time.h>
#include <driver/i2s.h>
#include <esp_wifi.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include "config.h"
#include "hoc_gateway.h"
#include "ui_manager.h"

// ══════════════════════════════════════════════════════════════
//  HoC Republic — M5StickC Plus2 Companion v3.0.0
//
//  A pocket-sized window into the Republic.
//  Chat with citizens, monitor the simulation, and speak
//  commands through the built-in microphone.
//
//  v2.6.0 — OpenClaw Protocol v3 connect, device identity,
//           valid client mode, deferred voice buffer, WiFi fix
//    1. setReconnectInterval(0) was causing 100 TCP SYN/s flood
//       → Changed to 5000ms in gateway client
//    2. I2S mic driver on GPIO0 (strapping pin) ran continuously
//       → Deferred: install only when recording, uninstall after
//    3. gateway.loop() called even when disconnected, letting
//       library spam reconnect attempts
//       → Only call gateway.loop() when actively connected
//    4. WiFi state machine hardened with longer stability window
//
//  Buttons:
//    BtnA (front)      — Short: action / Long: voice record
//    BtnB (side)       — Scroll / Cycle / context action
//    BtnPWR (top)      — Previous screen
//
//  Serial commands:
//    /help             — Show all commands
//    /set <key> <val>  — Set config (wifi_ssid, wifi_pass,
//                        gw_host, gw_port, gw_token, brightness)
//    /status           — Show connection status
//    /health           — Request health from gateway
//    /sessions         — List sessions
//    /republic         — Request Republic overview
//    /chat <text>      — Send chat message
//    /reboot           — Restart device
//    /factory          — Clear all saved settings
// ══════════════════════════════════════════════════════════════

HoCGateway gateway;
UIManager  ui;
Preferences prefs;

// ── WiFi State Machine ─────────────────────────────────────
//
//  The ESP32 WiFi stack is asynchronous.  Calling WiFi.begin()
//  then immediately checking WiFi.status() in a tight loop
//  causes instability.  Instead we use a state machine:
//
//    IDLE → CONNECTING → WAIT_STABLE → CONNECTED
//                  ↑                        │
//                  └──── DISCONNECTED ◄─────┘
//
//  Key rules:
//    1. Never call WiFi.begin() if already connecting
//    2. After WiFi.status()==WL_CONNECTED, wait WIFI_STABLE_MS
//       before declaring stable (prevents bounce)
//    3. Gateway connection only starts after WiFi is STABLE
//    4. On disconnect, wait WIFI_RETRY_DELAY before reconnecting
//    5. WiFi.setAutoReconnect(false) — we manage reconnect
//    6. WiFi.persistent(false) — don't flash-write credentials
//
enum class WiFiState : uint8_t {
    IDLE,           // Not started
    CONNECTING,     // WiFi.begin() called, waiting for WL_CONNECTED
    WAIT_STABLE,    // Got WL_CONNECTED, waiting stability window
    CONNECTED,      // Stable — gateway may connect
    DISCONNECTED,   // Lost connection, waiting before retry
};

static WiFiState wifiState = WiFiState::IDLE;
static unsigned long wifiStateEnteredMs = 0;
static unsigned long wifiConnectStartMs = 0;
static int wifiConnectAttempts = 0;

// Stability: WiFi must stay connected for this long before
// we consider it truly stable and allow gateway to connect.
#define WIFI_STABLE_MS       3000

// After a disconnect, wait this long before calling WiFi.begin() again.
// Increases with each consecutive failure (exponential backoff).
#define WIFI_RETRY_BASE_MS   5000
#define WIFI_RETRY_MAX_MS    30000

// ── State ───────────────────────────────────────────────────
String wifiSsid;
String wifiPass;
String gwHost;
uint16_t gwPort;
String gwToken;

unsigned long lastHealthPollMs    = 0;
unsigned long lastRepublicPollMs  = 0;
unsigned long lastBattReadMs      = 0;
unsigned long lastHeapCheckMs     = 0;

bool ntpSynced        = false;
bool sessionReady     = false;
bool gatewayStarted   = false;   // True once we've called gateway.begin()

// ── I2S Microphone State ────────────────────────────────────
// CRITICAL FIX: The I2S driver on GPIO0 (a strapping pin) was
// installed at boot and ran continuously, consuming DMA resources
// shared with WiFi and driving GPIO0 as a clock output.  This
// caused interference with the WiFi radio.
//
// Fix: Install I2S driver ONLY when recording starts, uninstall
// when recording stops.  This frees GPIO0 and DMA for WiFi.
static bool i2sInstalled = false;

// ── Voice recording ─────────────────────────────────────────
bool     voiceRecording    = false;
uint8_t* voiceBuffer       = nullptr;
size_t   voiceBufferPos    = 0;
unsigned long voiceStartMs = 0;
unsigned long btnAPressMs  = 0;
bool     btnAWasHeld       = false;

#define LONG_PRESS_MS   600

// ── Forward declarations ────────────────────────────────────
void loadSettings();
void saveString(const char* key, const String& value);
void wifiBeginConnect();
void wifiStateMachine();
void connectGateway();
void syncNtp();
void handleSerial();
void processCommand(const String& cmd);
void printBanner();
bool installI2SMic();
void uninstallI2SMic();
void startVoiceRecording();
void stopVoiceRecording();
void processVoiceBuffer();
void autoCreateOrRestoreSession();
void writeWavHeader(uint8_t* buf, uint32_t dataLen);
void readBattery();
void checkHeap();
void setWifiState(WiFiState newState);
unsigned long wifiRetryDelay();

// ══════════════════════════════════════════════════════════════
//  SETUP
// ══════════════════════════════════════════════════════════════

void setup() {
    // ── Power hold (critical for M5StickC Plus2) ────────────
    pinMode(HOLD_PIN, OUTPUT);
    digitalWrite(HOLD_PIN, HIGH);

    // ── Initialize M5StickC Plus2 ───────────────────────────
    auto cfg = M5.config();
    M5.begin(cfg);

    Serial.begin(115200);
    delay(100);
    printBanner();

    // ── Load persistent settings ────────────────────────────
    loadSettings();

    // ── Initialize UI ───────────────────────────────────────
    ui.setGateway(&gateway);
    ui.begin();

    // ── Initial battery read (seed the EMA) ─────────────────
    readBattery();

    // ── I2S Microphone: NOT installed at boot ───────────────
    // The I2S driver uses GPIO0 (strapping pin) as PDM clock.
    // Running it continuously interferes with WiFi DMA.
    // We install it on-demand when voice recording starts.
    Serial.println("[Mic] Deferred — will install on first recording");

    // ── Voice buffer: deferred allocation ──────────────────
    // 156KB buffer doesn't fit in 275KB heap with no PSRAM.
    // Allocate on-demand when recording starts, free when done.
    Serial.println("[Voice] Buffer deferred — allocate on record start");

    // ══════════════════════════════════════════════════════════
    //  GATEWAY CALLBACKS
    // ══════════════════════════════════════════════════════════

    gateway.onConnected([]() {
        Serial.println("[GW] Connected!");
        ui.setConnectionState(GwState::CONNECTED);
        ui.showToast("Republic Online!", COLOR_SUCCESS);

        gateway.requestSessions();
        gateway.requestHealth();
        gateway.requestRepublicOverview();

        sessionReady = false;

        // Now that everything is connected, enable light power save
        esp_wifi_set_ps(WIFI_PS_MIN_MODEM);
        Serial.println("[WiFi] Power save enabled (modem sleep)");
    });

    gateway.onDisconnected([]() {
        Serial.println("[GW] Disconnected");
        ui.setConnectionState(GwState::DISCONNECTED);
        ui.showToast("Disconnected", COLOR_ERROR);
        sessionReady = false;
        gatewayStarted = false;

        // Disable power save to improve reconnection reliability
        esp_wifi_set_ps(WIFI_PS_NONE);
    });

    gateway.onStateChange([](GwState state) {
        ui.setConnectionState(state);
        Serial.printf("[GW] State → %d\n", (int)state);
    });

    gateway.onHealth([](const GwHealthInfo& info) {
        ui.updateHealth(info);
    });

    gateway.onSessions([](const std::vector<GwSessionInfo>& sessions) {
        Serial.printf("[GW] %d sessions\n", (int)sessions.size());
        ui.updateSessions(sessions);
        if (!sessionReady) {
            autoCreateOrRestoreSession();
        }
    });

    gateway.onChat([](const GwChatChunk& chunk) {
        if (chunk.type == "done") {
            ui.endStream();
        } else if (chunk.type == "error") {
            ui.endStream();
            ui.showError(chunk.content);
        } else if (chunk.isStreaming) {
            ui.appendStreamChunk(chunk.content);
        } else {
            ui.addChatMessage(false, chunk.content);
        }
    });

    gateway.onRepublic([](const RepublicStats& stats) {
        ui.updateRepublic(stats);
    });

    gateway.onSessionCreated([](const String& key, const String& title) {
        Serial.printf("[GW] Session: %s (%s)\n", title.c_str(), key.c_str());
        ui.setActiveSessionKey(key);
        ui.showToast("Session: " + title, COLOR_SUCCESS);
        sessionReady = true;

        Preferences p;
        p.begin(NVS_NAMESPACE, false);
        p.putString(NVS_KEY_SESSION_KEY, key);
        p.end();
    });

    gateway.onTranscript([](const String& text) {
        ui.setVoiceProcessing(false);
        if (text.length() > 0) {
            ui.addChatMessage(true, text);
            ui.showToast("Voice sent", COLOR_SUCCESS);
        } else {
            ui.showToast("No speech detected", COLOR_WARNING);
        }
    });

    gateway.onError([](const String& msg) {
        Serial.printf("[GW] Error: %s\n", msg.c_str());
        ui.showError(msg);
        if (ui.isVoiceRecording()) ui.setVoiceRecording(false);
        ui.setVoiceProcessing(false);
    });

    // ── Start WiFi (non-blocking) ───────────────────────────
    wifiBeginConnect();

    Serial.println("[Main] Ready. /help for commands.");
}

// ══════════════════════════════════════════════════════════════
//  LOOP
// ══════════════════════════════════════════════════════════════

void loop() {
    unsigned long now = millis();

    // ── Update M5 (buttons, IMU) ────────────────────────────
    M5.update();

    // ── Button A: short = action, long = voice ──────────────
    if (M5.BtnA.wasPressed()) {
        btnAPressMs = now;
        btnAWasHeld = false;
    }

    if (M5.BtnA.isPressed() && !btnAWasHeld && !voiceRecording) {
        if (now - btnAPressMs >= LONG_PRESS_MS) {
            btnAWasHeld = true;
            if (ui.currentScreen() == Screen::CHAT && voiceBuffer &&
                gateway.isConnected() && ui.getActiveSessionKey().length() > 0) {
                startVoiceRecording();
                ui.onBtnALongPress();
            }
        }
    }

    if (M5.BtnA.wasReleased()) {
        if (voiceRecording) {
            stopVoiceRecording();
            ui.onBtnAReleased();
            processVoiceBuffer();
        } else if (!btnAWasHeld) {
            ui.onBtnA();
        }
        btnAWasHeld = false;
    }

    // ── Button B ────────────────────────────────────────────
    if (M5.BtnB.wasPressed()) {
        ui.onBtnB();
    }

    // ── Power button ────────────────────────────────────────
    if (M5.BtnPWR.wasClicked()) {
        ui.onBtnPwr();
    }

    // ── Voice recording: read I2S data ──────────────────────
    if (voiceRecording) {
        size_t remaining = MIC_BUFFER_SIZE - voiceBufferPos;
        if (remaining > 0) {
            size_t bytesRead = 0;
            size_t chunkSize = min(remaining, (size_t)1024);
            esp_err_t err = i2s_read(MIC_I2S_PORT, voiceBuffer + 44 + voiceBufferPos,
                                      chunkSize, &bytesRead, 10);
            if (err == ESP_OK && bytesRead > 0) {
                voiceBufferPos += bytesRead;
            }
        } else {
            stopVoiceRecording();
            ui.onBtnAReleased();
            processVoiceBuffer();
        }

        // Auto-stop after max duration
        if (now - voiceStartMs > (unsigned long)(MIC_BUFFER_SECONDS * 1000)) {
            stopVoiceRecording();
            ui.onBtnAReleased();
            processVoiceBuffer();
        }
    }

    // ── IMU tilt-to-wake ────────────────────────────────────
    if (IMU_WAKE_ENABLED && !ui.isScreenOn()) {
        float ax, ay, az;
        M5.Imu.getAccel(&ax, &ay, &az);
        if (abs(ax) > 1.2 || abs(ay) > 1.2) {
            ui.onTilt();
        }
    }

    // ── Battery reading (throttled) ─────────────────────────
    if (now - lastBattReadMs >= BATT_READ_INTERVAL) {
        lastBattReadMs = now;
        readBattery();
    }

    // ══════════════════════════════════════════════════════════
    //  WiFi State Machine — runs every loop iteration
    // ══════════════════════════════════════════════════════════
    wifiStateMachine();

    // ── Gateway loop ────────────────────────────────────────
    // CRITICAL FIX (v2.5.0): Only call gateway.loop() when the
    // WebSocket is actively started AND WiFi is connected.
    //
    // The WebSocketsClient library's loop() attempts to reconnect
    // on every call when disconnected.  With setReconnectInterval(0)
    // (which was the old setting), this meant 100 TCP SYN packets
    // per second flooding the ESP32 WiFi stack, causing it to reset.
    //
    // Even with setReconnectInterval(5000) (the new setting), we
    // still gate the call here for defense-in-depth: if WiFi is
    // down or gateway is fully disconnected, don't call _ws.loop().
    if (gatewayStarted && wifiState == WiFiState::CONNECTED) {
        gateway.loop();
    }

    // ── Periodic health poll ────────────────────────────────
    if (gateway.isConnected() && now - lastHealthPollMs > STATUS_REFRESH_MS) {
        lastHealthPollMs = now;
        gateway.requestHealth();
    }

    // ── Periodic Republic stats poll ────────────────────────
    if (gateway.isConnected() && now - lastRepublicPollMs > REPUBLIC_REFRESH_MS) {
        lastRepublicPollMs = now;
        gateway.requestRepublicOverview();
    }

    // ── Heap monitoring (every 30s) ─────────────────────────
    if (now - lastHeapCheckMs > 30000) {
        lastHeapCheckMs = now;
        checkHeap();
    }

    // ── Serial commands ─────────────────────────────────────
    handleSerial();

    // ── UI loop (handles its own frame throttling) ──────────
    ui.loop();

    // ── Yield to RTOS (prevents watchdog, saves power) ──────
    // 10ms yield keeps the loop responsive while allowing
    // WiFi stack and other RTOS tasks to run.
    vTaskDelay(pdMS_TO_TICKS(10));
}

// ══════════════════════════════════════════════════════════════
//  WiFi STATE MACHINE
// ══════════════════════════════════════════════════════════════

void setWifiState(WiFiState newState) {
    if (newState == wifiState) return;
    Serial.printf("[WiFi] State: %d → %d\n", (int)wifiState, (int)newState);
    wifiState = newState;
    wifiStateEnteredMs = millis();
}

unsigned long wifiRetryDelay() {
    // Exponential backoff: 5s, 10s, 20s, 30s (capped)
    unsigned long d = WIFI_RETRY_BASE_MS * (1UL << min(wifiConnectAttempts, 3));
    return min(d, (unsigned long)WIFI_RETRY_MAX_MS);
}

void wifiBeginConnect() {
    if (wifiSsid.length() == 0) {
        Serial.println("[WiFi] No SSID configured — use /set wifi_ssid <name>");
        ui.showError("No WiFi SSID");
        return;
    }

    Serial.printf("[WiFi] Connecting to '%s' (attempt #%d)...\n",
                  wifiSsid.c_str(), wifiConnectAttempts + 1);

    // ── CRITICAL: Clean slate before connecting ─────────────
    // Disconnect any existing connection cleanly.
    WiFi.disconnect(true);   // true = also erase stored credentials
    WiFi.mode(WIFI_OFF);     // Fully power down WiFi radio
    delay(200);              // Let the radio settle (200ms is important)

    // ── Configure WiFi ──────────────────────────────────────
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(false);  // WE manage reconnect, not the driver
    WiFi.persistent(false);        // Don't write credentials to flash

    // ── Disable power save during connection ────────────────
    // Power save can cause the radio to miss beacons during
    // the association phase, leading to connect/disconnect cycling.
    esp_wifi_set_ps(WIFI_PS_NONE);

    // ── Start connection ────────────────────────────────────
    WiFi.begin(wifiSsid.c_str(), wifiPass.c_str());
    wifiConnectStartMs = millis();
    setWifiState(WiFiState::CONNECTING);
    ui.showToast("WiFi...", COLOR_WARNING);
}

void wifiStateMachine() {
    unsigned long now = millis();
    wl_status_t status = WiFi.status();

    switch (wifiState) {

    // ── IDLE: Should not stay here; start connecting ────────
    case WiFiState::IDLE:
        wifiBeginConnect();
        break;

    // ── CONNECTING: Waiting for WL_CONNECTED ────────────────
    case WiFiState::CONNECTING:
        if (status == WL_CONNECTED) {
            // WiFi reports connected — enter stability window
            Serial.printf("[WiFi] Associated! IP=%s RSSI=%d — waiting %dms for stability\n",
                          WiFi.localIP().toString().c_str(), WiFi.RSSI(), WIFI_STABLE_MS);
            setWifiState(WiFiState::WAIT_STABLE);
        }
        else if (now - wifiConnectStartMs > WIFI_CONNECT_TIMEOUT) {
            // Timeout — connection failed
            wifiConnectAttempts++;
            Serial.printf("[WiFi] Connect timeout (status=%d). Will retry in %lums\n",
                          (int)status, wifiRetryDelay());
            WiFi.disconnect(true);
            setWifiState(WiFiState::DISCONNECTED);
            ui.setWifiConnected(false);
        }
        break;

    // ── WAIT_STABLE: WiFi connected, verify it stays up ─────
    case WiFiState::WAIT_STABLE:
        if (status != WL_CONNECTED) {
            // Dropped during stability window — back to disconnected
            Serial.println("[WiFi] Dropped during stability window!");
            wifiConnectAttempts++;
            setWifiState(WiFiState::DISCONNECTED);
            ui.setWifiConnected(false);
        }
        else if (now - wifiStateEnteredMs >= WIFI_STABLE_MS) {
            // Stable! Declare connected.
            String ip = WiFi.localIP().toString();
            Serial.printf("[WiFi] STABLE: %s (RSSI=%d, attempt #%d)\n",
                          ip.c_str(), WiFi.RSSI(), wifiConnectAttempts + 1);
            wifiConnectAttempts = 0;  // Reset backoff on success
            setWifiState(WiFiState::CONNECTED);
            ui.setWifiConnected(true, ip);

            // Sync NTP if not done
            if (!ntpSynced) syncNtp();

            // Start gateway connection (only if not already active)
            if (!gatewayStarted && !gateway.isActive()) {
                connectGateway();
            }
        }
        break;

    // ── CONNECTED: Monitor for drops ────────────────────────
    case WiFiState::CONNECTED:
        if (status != WL_CONNECTED) {
            Serial.printf("[WiFi] LOST connection (status=%d)\n", (int)status);
            ui.setWifiConnected(false);
            ui.showToast("WiFi lost!", COLOR_ERROR);

            // Disconnect gateway cleanly FIRST
            if (gatewayStarted) {
                gateway.disconnect();
                gatewayStarted = false;
            }

            // Disable power save for faster reconnect
            esp_wifi_set_ps(WIFI_PS_NONE);

            setWifiState(WiFiState::DISCONNECTED);
        }
        // If WiFi is up but gateway died, try reconnecting gateway
        else if (!gatewayStarted && !gateway.isActive() &&
                 now - wifiStateEnteredMs > 5000) {
            Serial.println("[WiFi] WiFi stable but gateway not started — reconnecting gateway");
            connectGateway();
        }
        break;

    // ── DISCONNECTED: Wait before retrying ──────────────────
    case WiFiState::DISCONNECTED:
        if (now - wifiStateEnteredMs >= wifiRetryDelay()) {
            Serial.println("[WiFi] Retry delay elapsed — reconnecting");
            wifiBeginConnect();
        }
        break;
    }
}

// ══════════════════════════════════════════════════════════════
//  BATTERY READING — smoothed via UIManager EMA
// ══════════════════════════════════════════════════════════════

void readBattery() {
    // getBatteryLevel() returns 0-100 from the AXP power chip
    int rawPct = M5.Power.getBatteryLevel();
    ui.updateBattery(rawPct);
}

// ══════════════════════════════════════════════════════════════
//  HEAP MONITORING — warn if memory is low
// ══════════════════════════════════════════════════════════════

void checkHeap() {
    uint32_t freeKB = ESP.getFreeHeap() / 1024;
    if (freeKB < HEAP_CRITICAL_KB) {
        Serial.printf("[Heap] CRITICAL: %d KB free!\n", freeKB);
    } else if (freeKB < HEAP_WARNING_KB) {
        Serial.printf("[Heap] Warning: %d KB free\n", freeKB);
    }
}

// ══════════════════════════════════════════════════════════════
//  AUTO-SESSION
// ══════════════════════════════════════════════════════════════

void autoCreateOrRestoreSession() {
    if (!AUTO_CREATE_SESSION) {
        sessionReady = true;
        return;
    }

    auto& sessions = gateway.getSessions();

    Preferences p;
    p.begin(NVS_NAMESPACE, true);
    String savedKey = p.getString(NVS_KEY_SESSION_KEY, "");
    p.end();

    if (savedKey.length() > 0) {
        for (const auto& s : sessions) {
            if (s.key == savedKey) {
                Serial.printf("[Session] Restored: %s\n", s.title.c_str());
                ui.setActiveSessionKey(savedKey);
                ui.showToast("Session: " + s.title, COLOR_SUCCESS);
                sessionReady = true;
                return;
            }
        }
    }

    if (!sessions.empty()) {
        const auto& latest = sessions[0];
        ui.setActiveSessionKey(latest.key);
        ui.showToast("Session: " + latest.title, COLOR_SUCCESS);
        sessionReady = true;

        p.begin(NVS_NAMESPACE, false);
        p.putString(NVS_KEY_SESSION_KEY, latest.key);
        p.end();
        return;
    }

    ui.showToast("Creating session...", COLOR_ACCENT);
    gateway.createSession(AUTO_SESSION_TITLE);
}

// ══════════════════════════════════════════════════════════════
//  I2S MICROPHONE — ON-DEMAND INSTALL/UNINSTALL
//
//  CRITICAL FIX (v2.5.0): The SPM1423 PDM microphone uses
//  GPIO0 as its clock pin.  GPIO0 is an ESP32 strapping pin.
//  When the I2S driver is installed, it:
//    - Continuously drives GPIO0 as a clock output
//    - Allocates DMA buffers that compete with WiFi DMA
//    - May cause RF interference near the antenna
//
//  Solution: Install I2S only when recording, uninstall after.
//  This keeps GPIO0 free and DMA available for WiFi.
// ══════════════════════════════════════════════════════════════

bool installI2SMic() {
    if (i2sInstalled) return true;

    i2s_config_t i2s_config = {
        .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX | I2S_MODE_PDM),
        .sample_rate = MIC_SAMPLE_RATE,
        .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
        .channel_format = I2S_CHANNEL_FMT_ALL_LEFT,
        .communication_format = I2S_COMM_FORMAT_STAND_I2S,
        .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
        .dma_buf_count = 4,
        .dma_buf_len = 256,
        .use_apll = false,
        .tx_desc_auto_clear = false,
        .fixed_mclk = 0,
    };

    i2s_pin_config_t pin_config = {
        .bck_io_num = I2S_PIN_NO_CHANGE,
        .ws_io_num = MIC_CLK_PIN,
        .data_out_num = I2S_PIN_NO_CHANGE,
        .data_in_num = MIC_DATA_PIN,
    };

    esp_err_t err = i2s_driver_install(MIC_I2S_PORT, &i2s_config, 0, NULL);
    if (err != ESP_OK) {
        Serial.printf("[Mic] I2S install failed: %d\n", err);
        return false;
    }

    err = i2s_set_pin(MIC_I2S_PORT, &pin_config);
    if (err != ESP_OK) {
        Serial.printf("[Mic] I2S pin failed: %d\n", err);
        i2s_driver_uninstall(MIC_I2S_PORT);
        return false;
    }

    // Flush initial noise
    uint8_t dummy[512];
    size_t bytesRead;
    for (int i = 0; i < 10; i++) {
        i2s_read(MIC_I2S_PORT, dummy, sizeof(dummy), &bytesRead, 10);
    }

    i2sInstalled = true;
    Serial.printf("[Mic] I2S installed (CLK=%d DATA=%d %dHz)\n",
                  MIC_CLK_PIN, MIC_DATA_PIN, MIC_SAMPLE_RATE);
    return true;
}

void uninstallI2SMic() {
    if (!i2sInstalled) return;

    i2s_driver_uninstall(MIC_I2S_PORT);
    i2sInstalled = false;

    // Reset GPIO0 to input (high-impedance) so it doesn't
    // interfere with WiFi or boot strapping
    pinMode(MIC_CLK_PIN, INPUT);

    Serial.println("[Mic] I2S uninstalled — GPIO0 released");
}

// ══════════════════════════════════════════════════════════════
//  VOICE RECORDING
// ══════════════════════════════════════════════════════════════

void startVoiceRecording() {
    // On-demand buffer allocation (156KB doesn't fit at boot on 275KB heap)
    if (!voiceBuffer) {
        voiceBuffer = (uint8_t*)ps_malloc(MIC_BUFFER_SIZE + 44);
        if (!voiceBuffer) voiceBuffer = (uint8_t*)malloc(MIC_BUFFER_SIZE + 44);
        if (!voiceBuffer) {
            Serial.println("[Voice] ERROR: Cannot allocate buffer");
            ui.showToast("No memory", COLOR_ERROR);
            return;
        }
        Serial.printf("[Voice] Buffer allocated: %d bytes\n", MIC_BUFFER_SIZE + 44);
    }

    // Install I2S driver on-demand
    if (!installI2SMic()) {
        ui.showToast("Mic error", COLOR_ERROR);
        return;
    }

    voiceRecording = true;
    voiceBufferPos = 0;
    voiceStartMs = millis();

    // Flush initial noise after install
    uint8_t dummy[512];
    size_t bytesRead;
    for (int i = 0; i < 5; i++) {
        i2s_read(MIC_I2S_PORT, dummy, sizeof(dummy), &bytesRead, 5);
    }

    Serial.println("[Voice] Recording...");
}

void stopVoiceRecording() {
    voiceRecording = false;
    unsigned long duration = millis() - voiceStartMs;
    Serial.printf("[Voice] Stopped: %lu ms, %d bytes\n", duration, (int)voiceBufferPos);

    // Uninstall I2S driver to free GPIO0 and DMA for WiFi
    uninstallI2SMic();
}

void processVoiceBuffer() {
    if (!voiceBuffer || voiceBufferPos < 1600) {
        ui.setVoiceProcessing(false);
        ui.showToast("Too short", COLOR_WARNING);
        return;
    }

    ui.setVoiceProcessing(true);
    ui.showToast("Transcribing...", COLOR_ACCENT);

    writeWavHeader(voiceBuffer, voiceBufferPos);

    String sessionKey = ui.getActiveSessionKey();
    gateway.sendVoiceAudio(voiceBuffer, voiceBufferPos + 44, sessionKey);

    // Free voice buffer to reclaim heap for gateway/WiFi
    free(voiceBuffer);
    voiceBuffer = nullptr;
    Serial.println("[Voice] Buffer freed");
}

void writeWavHeader(uint8_t* buf, uint32_t dataLen) {
    uint32_t fileSize = dataLen + 36;
    uint32_t byteRate = MIC_SAMPLE_RATE * 1 * MIC_BITS_PER_SAMPLE / 8;
    uint16_t blockAlign = 1 * MIC_BITS_PER_SAMPLE / 8;

    memcpy(buf + 0,  "RIFF", 4);
    memcpy(buf + 4,  &fileSize, 4);
    memcpy(buf + 8,  "WAVE", 4);
    memcpy(buf + 12, "fmt ", 4);
    uint32_t fmtSize = 16;
    memcpy(buf + 16, &fmtSize, 4);
    uint16_t audioFormat = 1;
    memcpy(buf + 20, &audioFormat, 2);
    uint16_t numChannels = 1;
    memcpy(buf + 22, &numChannels, 2);
    uint32_t sampleRate = MIC_SAMPLE_RATE;
    memcpy(buf + 24, &sampleRate, 4);
    memcpy(buf + 28, &byteRate, 4);
    memcpy(buf + 32, &blockAlign, 2);
    uint16_t bitsPerSample = MIC_BITS_PER_SAMPLE;
    memcpy(buf + 34, &bitsPerSample, 2);
    memcpy(buf + 36, "data", 4);
    memcpy(buf + 40, &dataLen, 4);
}

// ══════════════════════════════════════════════════════════════
//  NTP
// ══════════════════════════════════════════════════════════════

void syncNtp() {
    Serial.println("[NTP] Syncing...");
    configTime(0, 0, "pool.ntp.org", "time.nist.gov", "time.google.com");

    unsigned long start = millis();
    struct tm timeinfo;
    while (!getLocalTime(&timeinfo, 1000) && millis() - start < 10000) {
        delay(100);
    }

    if (getLocalTime(&timeinfo)) {
        ntpSynced = true;
        char buf[30];
        strftime(buf, sizeof(buf), "%Y-%m-%d %H:%M:%S", &timeinfo);
        Serial.printf("[NTP] Synced: %s UTC\n", buf);
    } else {
        Serial.println("[NTP] Failed — will retry on next WiFi connect");
    }
}

// ══════════════════════════════════════════════════════════════
//  SETTINGS
// ══════════════════════════════════════════════════════════════

void loadSettings() {
    prefs.begin(NVS_NAMESPACE, true);

    wifiSsid = prefs.getString(NVS_KEY_WIFI_SSID, WIFI_SSID);
    wifiPass = prefs.getString(NVS_KEY_WIFI_PASS, WIFI_PASS);
    gwHost   = prefs.getString(NVS_KEY_GW_HOST, GATEWAY_HOST);
    gwPort   = prefs.getUShort(NVS_KEY_GW_PORT, GATEWAY_PORT);
    gwToken  = prefs.getString(NVS_KEY_GW_TOKEN, GATEWAY_TOKEN);

    uint8_t brightness = prefs.getUChar(NVS_KEY_BRIGHTNESS, BRIGHTNESS_FULL);
    M5.Display.setBrightness(brightness);

    prefs.end();

    Serial.printf("[Cfg] SSID=%s GW=%s:%d\n",
                  wifiSsid.c_str(), gwHost.c_str(), gwPort);
}

void saveString(const char* key, const String& value) {
    prefs.begin(NVS_NAMESPACE, false);
    prefs.putString(key, value);
    prefs.end();
}

// ══════════════════════════════════════════════════════════════
//  GATEWAY
// ══════════════════════════════════════════════════════════════

void connectGateway() {
    if (gwHost.length() == 0) {
        ui.showError("No gateway host");
        return;
    }

    if (wifiState != WiFiState::CONNECTED) {
        Serial.println("[GW] Skipping — WiFi not stable yet");
        return;
    }

    GwConfig config;
    config.host   = gwHost;
    config.port   = gwPort;
    config.token  = gwToken;
    config.useTls = GATEWAY_USE_TLS;

    ui.setConnectionState(GwState::CONNECTING);
    gateway.begin(config);
    gatewayStarted = true;
    Serial.printf("[GW] Connecting to %s:%d\n", gwHost.c_str(), gwPort);
}

// ══════════════════════════════════════════════════════════════
//  SERIAL CONSOLE
// ══════════════════════════════════════════════════════════════

static String serialBuffer;

void handleSerial() {
    while (Serial.available()) {
        char c = Serial.read();
        if (c == '\n' || c == '\r') {
            if (serialBuffer.length() > 0) {
                processCommand(serialBuffer);
                serialBuffer = "";
            }
        } else {
            serialBuffer += c;
        }
    }
}

void processCommand(const String& cmd) {
    if (!cmd.startsWith("/")) {
        if (gateway.isConnected()) {
            String key = ui.getActiveSessionKey();
            if (key.length() > 0) {
                ui.addChatMessage(true, cmd);
                gateway.sendChat(key, cmd);
            } else {
                Serial.println("[Chat] No session");
            }
        } else {
            Serial.println("[Chat] Not connected");
        }
        return;
    }

    String command = cmd.substring(1);

    if (command == "help") {
        Serial.println(F("\n  HoC Republic Companion v" HOC_VERSION));
        Serial.println(F("  ─────────────────────────────────"));
        Serial.println(F("  /set wifi_ssid <val>"));
        Serial.println(F("  /set wifi_pass <val>"));
        Serial.println(F("  /set gw_host <val>"));
        Serial.println(F("  /set gw_port <val>"));
        Serial.println(F("  /set gw_token <val>"));
        Serial.println(F("  /set brightness <0-255>"));
        Serial.println(F("  /status  /health  /sessions  /republic"));
        Serial.println(F("  /chat <msg>  /reboot  /factory\n"));
    }
    else if (command.startsWith("set ")) {
        String rest = command.substring(4);
        int spaceIdx = rest.indexOf(' ');
        if (spaceIdx < 0) {
            Serial.println("[Set] Usage: /set <key> <value>");
            return;
        }
        String key = rest.substring(0, spaceIdx);
        String val = rest.substring(spaceIdx + 1);
        val.trim();

        if (key == "wifi_ssid") {
            wifiSsid = val;
            saveString(NVS_KEY_WIFI_SSID, val);
            Serial.println("[Set] WiFi SSID = " + val);
        } else if (key == "wifi_pass") {
            wifiPass = val;
            saveString(NVS_KEY_WIFI_PASS, val);
            Serial.println("[Set] WiFi pass updated");
        } else if (key == "gw_host") {
            gwHost = val;
            saveString(NVS_KEY_GW_HOST, val);
            Serial.println("[Set] GW host = " + val);
        } else if (key == "gw_port") {
            gwPort = val.toInt();
            prefs.begin(NVS_NAMESPACE, false);
            prefs.putUShort(NVS_KEY_GW_PORT, gwPort);
            prefs.end();
            Serial.printf("[Set] GW port = %d\n", gwPort);
        } else if (key == "gw_token") {
            gwToken = val;
            saveString(NVS_KEY_GW_TOKEN, val);
            Serial.println("[Set] GW token updated");
        } else if (key == "brightness") {
            uint8_t b = constrain(val.toInt(), 0, 255);
            M5.Display.setBrightness(b);
            prefs.begin(NVS_NAMESPACE, false);
            prefs.putUChar(NVS_KEY_BRIGHTNESS, b);
            prefs.end();
            Serial.printf("[Set] Brightness = %d\n", b);
        } else {
            Serial.println("[Set] Unknown: " + key);
        }
    }
    else if (command == "status") {
        const char* wifiStateNames[] = {"IDLE","CONNECTING","WAIT_STABLE","CONNECTED","DISCONNECTED"};
        Serial.printf("WiFi: %s (state=%s, status=%d, RSSI=%d)\n",
                      WiFi.status() == WL_CONNECTED ? "OK" : "OFF",
                      wifiStateNames[(int)wifiState],
                      (int)WiFi.status(),
                      WiFi.RSSI());
        Serial.printf("  IP: %s  Attempts: %d\n",
                      WiFi.localIP().toString().c_str(), wifiConnectAttempts);
        Serial.printf("GW: %s:%d State: %d  Started: %s\n",
                      gwHost.c_str(), gwPort, (int)gateway.getState(),
                      gatewayStarted ? "yes" : "no");
        Serial.printf("Device: %s\n", gateway.getDeviceId().c_str());
        Serial.printf("Session: %s\n", ui.getActiveSessionKey().c_str());
        Serial.printf("Batt: %d%%  Heap: %dKB  PSRAM: %dKB\n",
                      ui.getSmoothedBattery(),
                      ESP.getFreeHeap() / 1024,
                      ESP.getFreePsram() / 1024);
        Serial.printf("I2S: %s\n", i2sInstalled ? "installed" : "not installed");
    }
    else if (command == "health") {
        if (gateway.isConnected()) gateway.requestHealth();
        else Serial.println("Not connected");
    }
    else if (command == "sessions") {
        if (gateway.isConnected()) gateway.requestSessions();
        else Serial.println("Not connected");
    }
    else if (command == "republic") {
        if (gateway.isConnected()) gateway.requestRepublicOverview();
        else Serial.println("Not connected");
    }
    else if (command.startsWith("chat ")) {
        String msg = command.substring(5);
        if (gateway.isConnected()) {
            String key = ui.getActiveSessionKey();
            if (key.length() > 0) {
                ui.addChatMessage(true, msg);
                gateway.sendChat(key, msg);
            } else {
                Serial.println("No session");
            }
        }
    }
    else if (command == "reboot") {
        Serial.println("Rebooting...");
        delay(300);
        ESP.restart();
    }
    else if (command == "factory") {
        Serial.println("Factory reset...");
        prefs.begin(NVS_NAMESPACE, false);
        prefs.clear();
        prefs.end();
        Preferences idPrefs;
        idPrefs.begin("hoc_id", false);
        idPrefs.clear();
        idPrefs.end();
        delay(300);
        ESP.restart();
    }
    else {
        Serial.println("Unknown: /" + command + "  (/help)");
    }
}

// ══════════════════════════════════════════════════════════════
//  BANNER
// ══════════════════════════════════════════════════════════════

void printBanner() {
    Serial.println(F("\n"));
    Serial.println(F("  ╔═══════════════════════════════════════╗"));
    Serial.println(F("  ║  HoC Republic Companion v" HOC_VERSION "        ║"));
    Serial.println(F("  ║  M5StickC Plus2 | ESP32-PICO-V3-02   ║"));
    Serial.println(F("  ║  WiFi SM | Voice | Republic | Charts  ║"));
    Serial.println(F("  ╚═══════════════════════════════════════╝\n"));
    Serial.printf("  Flash: %dMB  PSRAM: %dKB  Heap: %dKB\n",
                  ESP.getFlashChipSize() / 1024 / 1024,
                  ESP.getPsramSize() / 1024,
                  ESP.getFreeHeap() / 1024);
    Serial.println(F("  /help for commands.\n"));
}
