#include "ui_manager.h"
#include <Preferences.h>

// ══════════════════════════════════════════════════════════════
//  HoC Republic — UI Manager v2.1.0
//
//  FLICKER-FREE via M5Canvas sprite double-buffering.
//  All drawing targets _canvas (off-screen), then a single
//  pushSprite() copies the finished frame to the display.
//
//  Display: 240x135 (landscape, rotation=1)
// ══════════════════════════════════════════════════════════════

#define W           240
#define H           135
#define HDR_H       HEADER_H   // 20
#define FTR_H       FOOTER_H   // 16
#define FTR_Y       (H - FTR_H)
#define BD_Y        HDR_H
#define BD_H        (FTR_Y - BD_Y)
#define LN_H        13          // Line height
#define CHAR_W      6           // Approx char width at size 1

// ── Quick replies ──────────────────────────────────────────
const char* UIManager::QUICK_REPLIES[] = {
    "Republic status?",
    "Who is the president?",
    "How many citizens?",
    "Economy report",
    "Latest news",
    "Run simulation tick",
    "List specializations",
    "Hello Republic!",
};
const int UIManager::QUICK_REPLY_COUNT = 8;

static const char* SCREEN_NAMES[] = {
    "HOME", "CHAT", "REPUBLIC", "SESSIONS", "HEALTH", "SETTINGS"
};

// ══════════════════════════════════════════════════════════════
//  CONSTRUCTOR
// ══════════════════════════════════════════════════════════════

UIManager::UIManager()
    : _canvas(&M5.Display)
    , _dirty(true)
    , _lastPushMs(0)
    , _gw(nullptr)
    , _screen(Screen::HOME)
    , _screenOn(true)
    , _brightness(BRIGHTNESS_FULL)
    , _lastActivityMs(0)
    , _toastExpireMs(0)
    , _battSmoothed(-1.0f)
    , _battDisplay(0)
    , _battInitialized(false)
    , _gwState(GwState::DISCONNECTED)
    , _wifiConnected(false)
    , _chatScrollPos(0)
    , _isStreaming(false)
    , _quickReplyIdx(0)
    , _voiceRecording(false)
    , _voiceProcessing(false)
    , _voiceStartMs(0)
    , _sessionIdx(0)
    , _settingsIdx(0)
    , _republicPage(0)
{}

// ══════════════════════════════════════════════════════════════
//  BEGIN — create canvas, show boot splash
// ══════════════════════════════════════════════════════════════

void UIManager::begin() {
    auto& lcd = M5.Display;
    lcd.setRotation(SCREEN_ROTATION);
    lcd.setBrightness(BRIGHTNESS_FULL);

    // Create the full-screen off-screen canvas
    _canvas.createSprite(W, H);
    _canvas.setColorDepth(16);

    // ── Boot splash (drawn directly — one-time) ─────────────
    lcd.fillScreen(COLOR_BG);
    lcd.fillRect(0, 0, W, 3, COLOR_PRIMARY);

    lcd.setTextDatum(middle_center);
    lcd.setTextSize(2.0);
    lcd.setTextColor(COLOR_PRIMARY);
    lcd.drawString("HoC", W / 2, 42);

    lcd.setTextSize(1.0);
    lcd.setTextColor(COLOR_ACCENT);
    lcd.drawString("Republic Companion", W / 2, 68);

    lcd.setTextColor(COLOR_TEXT_DIM);
    lcd.drawString("v" HOC_VERSION, W / 2, 88);

    lcd.fillRect(0, H - 3, W, 3, COLOR_PRIMARY);
    lcd.setTextDatum(top_left);

    delay(1600);

    _lastActivityMs = millis();
    _dirty = true;
}

// ══════════════════════════════════════════════════════════════
//  LOOP — throttled redraw + power management
// ══════════════════════════════════════════════════════════════

void UIManager::loop() {
    unsigned long now = millis();

    // Power management (dim / sleep)
    handlePowerManagement();

    // Toast expiry
    if (_toastExpireMs > 0 && now > _toastExpireMs) {
        _toastExpireMs = 0;
        _toastText = "";
        _dirty = true;
    }

    // Force periodic redraw for streaming cursor blink etc.
    if (now - _lastPushMs > UI_FORCE_REDRAW_MS) {
        _dirty = true;
    }

    // Streaming cursor blink — mark dirty every 500ms
    if (_isStreaming && _screen == Screen::CHAT) {
        static unsigned long lastBlink = 0;
        if (now - lastBlink > 500) {
            lastBlink = now;
            _dirty = true;
        }
    }

    // Voice recording pulse
    if (_voiceRecording) {
        static unsigned long lastPulse = 0;
        if (now - lastPulse > 300) {
            lastPulse = now;
            _dirty = true;
        }
    }

    // Only redraw if dirty AND enough time has passed AND screen is on
    if (!_dirty || !_screenOn) return;
    if (now - _lastPushMs < UI_FRAME_INTERVAL_MS) return;

    render();
    _dirty = false;
    _lastPushMs = now;
}

// ══════════════════════════════════════════════════════════════
//  RENDER — draw everything to canvas, then push once
// ══════════════════════════════════════════════════════════════

void UIManager::render() {
    // Clear entire canvas
    _canvas.fillSprite(COLOR_BG);

    // Draw header
    drawHeader();

    // Draw body
    switch (_screen) {
        case Screen::HOME:      drawHome(); break;
        case Screen::CHAT:      drawChat(); break;
        case Screen::REPUBLIC:  drawRepublic(); break;
        case Screen::SESSIONS:  drawSessions(); break;
        case Screen::HEALTH:    drawHealth(); break;
        case Screen::SETTINGS:  drawSettings(); break;
        default: break;
    }

    // Draw footer
    drawFooter();

    // Toast overlay
    if (_toastExpireMs > 0) drawToast();

    // ── ATOMIC PUSH — single operation, zero flicker ────────
    _canvas.pushSprite(0, 0);
}

// ══════════════════════════════════════════════════════════════
//  POWER MANAGEMENT
// ══════════════════════════════════════════════════════════════

void UIManager::handlePowerManagement() {
    if (!_screenOn) return;
    unsigned long idle = millis() - _lastActivityMs;

    if (idle > SCREEN_OFF_MS) {
        dimScreen();
    } else if (idle > SCREEN_DIM_MS && _brightness != BRIGHTNESS_DIM) {
        _brightness = BRIGHTNESS_DIM;
        M5.Display.setBrightness(BRIGHTNESS_DIM);
    }
}

// ══════════════════════════════════════════════════════════════
//  NAVIGATION
// ══════════════════════════════════════════════════════════════

void UIManager::showScreen(Screen s) {
    _screen = s;
    _dirty = true;
    wakeScreen();
}

void UIManager::nextScreen() {
    int next = ((int)_screen + 1) % (int)Screen::SCREEN_COUNT;
    showScreen((Screen)next);
}

void UIManager::prevScreen() {
    int prev = ((int)_screen - 1 + (int)Screen::SCREEN_COUNT) % (int)Screen::SCREEN_COUNT;
    showScreen((Screen)prev);
}

// ══════════════════════════════════════════════════════════════
//  DATA UPDATES — each sets _dirty = true
// ══════════════════════════════════════════════════════════════

void UIManager::setConnectionState(GwState state) {
    if (_gwState != state) { _gwState = state; _dirty = true; }
}

void UIManager::setWifiConnected(bool connected, const String& ip) {
    if (_wifiConnected != connected || _wifiIp != ip) {
        _wifiConnected = connected;
        _wifiIp = ip;
        _dirty = true;
    }
}

void UIManager::updateHealth(const GwHealthInfo& health) {
    _health = health;
    if (_screen == Screen::HEALTH || _screen == Screen::HOME) _dirty = true;
}

void UIManager::updateSessions(const std::vector<GwSessionInfo>& sessions) {
    _sessionList = sessions;
    if (_sessionIdx >= (int)_sessionList.size()) _sessionIdx = 0;
    if (_screen == Screen::SESSIONS || _screen == Screen::HOME) _dirty = true;
}

void UIManager::updateRepublic(const RepublicStats& stats) {
    _republic = stats;
    if (_screen == Screen::REPUBLIC || _screen == Screen::HOME) _dirty = true;
}

void UIManager::addChatMessage(bool isUser, const String& text) {
    ChatLine line;
    line.isUser = isUser;
    line.text = text;
    line.timestamp = millis();
    _chatLines.push_back(line);
    while ((int)_chatLines.size() > MAX_CHAT_LINES)
        _chatLines.erase(_chatLines.begin());
    _chatScrollPos = max(0, (int)_chatLines.size() - 6);
    if (_screen == Screen::CHAT) _dirty = true;
    wakeScreen();
    if (HAPTIC_ENABLED && !isUser) buzz(2000, 50);
}

void UIManager::appendStreamChunk(const String& text) {
    _isStreaming = true;
    _streamBuffer += text;
    if (!_chatLines.empty() && !_chatLines.back().isUser) {
        _chatLines.back().text = _streamBuffer;
    } else {
        addChatMessage(false, _streamBuffer);
    }
    if (_screen == Screen::CHAT) _dirty = true;
}

void UIManager::endStream() {
    _isStreaming = false;
    _streamBuffer = "";
    if (_screen == Screen::CHAT) _dirty = true;
}

void UIManager::showError(const String& msg) {
    showToast(msg, COLOR_ERROR);
}

void UIManager::showToast(const String& msg, uint16_t color) {
    _toastText = msg;
    _toastColor = color;
    _toastExpireMs = millis() + 3000;
    _dirty = true;
    wakeScreen();
}

// ── Battery smoothing ───────────────────────────────────────

void UIManager::updateBattery(int rawPercent) {
    rawPercent = constrain(rawPercent, 0, 100);
    if (!_battInitialized) {
        _battSmoothed = (float)rawPercent;
        _battDisplay = rawPercent;
        _battInitialized = true;
        _dirty = true;
        return;
    }
    _battSmoothed = BATT_EMA_ALPHA * rawPercent + (1.0f - BATT_EMA_ALPHA) * _battSmoothed;
    int newDisplay = (int)(_battSmoothed + 0.5f);
    if (abs(newDisplay - _battDisplay) >= BATT_CHANGE_THRESH) {
        _battDisplay = newDisplay;
        _dirty = true;
    }
}

// ── Voice ───────────────────────────────────────────────────

void UIManager::setVoiceRecording(bool recording) {
    _voiceRecording = recording;
    if (recording) _voiceStartMs = millis();
    _dirty = true;
}

void UIManager::setVoiceProcessing(bool processing) {
    _voiceProcessing = processing;
    _dirty = true;
}

// ══════════════════════════════════════════════════════════════
//  BUTTON HANDLERS
// ══════════════════════════════════════════════════════════════

void UIManager::onBtnA() {
    wakeScreen();
    if (!_screenOn) return;

    switch (_screen) {
        case Screen::HOME:
            nextScreen();
            break;
        case Screen::CHAT:
            if (_gw && _gw->isConnected() && _activeSessionKey.length() > 0) {
                String msg = getSelectedQuickReply();
                _gw->sendChat(_activeSessionKey, msg);
                addChatMessage(true, msg);
                buzz(1200, 50);
            }
            break;
        case Screen::REPUBLIC:
            _republicPage = (_republicPage + 1) % 4;
            _dirty = true;
            break;
        case Screen::SESSIONS:
            if (!_sessionList.empty()) {
                _activeSessionKey = _sessionList[_sessionIdx].key;
                showToast("Active: " + truncateText(_sessionList[_sessionIdx].title, 18), COLOR_SUCCESS);
                Preferences p;
                p.begin(NVS_NAMESPACE, false);
                p.putString(NVS_KEY_SESSION_KEY, _activeSessionKey);
                p.end();
                buzz(1000, 80);
            }
            break;
        case Screen::HEALTH:
            if (_gw) _gw->requestHealth();
            showToast("Refreshing...", COLOR_ACCENT);
            break;
        case Screen::SETTINGS:
            nextScreen();
            break;
        default: break;
    }
}

void UIManager::onBtnB() {
    wakeScreen();
    if (!_screenOn) return;

    switch (_screen) {
        case Screen::CHAT:
            scrollQuickReply(1);
            _dirty = true;
            break;
        case Screen::REPUBLIC:
            _republicPage = (_republicPage + 1) % 4;
            _dirty = true;
            break;
        case Screen::SESSIONS:
            _sessionIdx = (_sessionIdx + 1) % max(1, (int)_sessionList.size());
            _dirty = true;
            break;
        default:
            nextScreen();
            break;
    }
}

void UIManager::onBtnPwr() {
    wakeScreen();
    if (!_screenOn) return;
    prevScreen();
}

void UIManager::onBtnALongPress() {
    if (_screen == Screen::CHAT && !_voiceRecording) {
        setVoiceRecording(true);
        buzz(800, 100);
    }
}

void UIManager::onBtnAReleased() {
    if (_voiceRecording) {
        setVoiceRecording(false);
        setVoiceProcessing(true);
        buzz(600, 50);
    }
}

void UIManager::onTilt() {
    if (!_screenOn) wakeScreen();
}

void UIManager::scrollQuickReply(int direction) {
    _quickReplyIdx = (_quickReplyIdx + direction + QUICK_REPLY_COUNT) % QUICK_REPLY_COUNT;
}

String UIManager::getSelectedQuickReply() const {
    return String(QUICK_REPLIES[_quickReplyIdx]);
}

// ══════════════════════════════════════════════════════════════
//  SCREEN STATE
// ══════════════════════════════════════════════════════════════

void UIManager::wakeScreen() {
    _lastActivityMs = millis();
    if (!_screenOn) {
        _screenOn = true;
        M5.Display.wakeup();
        _brightness = BRIGHTNESS_FULL;
        M5.Display.setBrightness(BRIGHTNESS_FULL);
        _dirty = true;
    } else if (_brightness != BRIGHTNESS_FULL) {
        _brightness = BRIGHTNESS_FULL;
        M5.Display.setBrightness(BRIGHTNESS_FULL);
    }
}

void UIManager::dimScreen() {
    _screenOn = false;
    M5.Display.setBrightness(0);
    M5.Display.sleep();
}

// ══════════════════════════════════════════════════════════════
//  HEADER — drawn to _canvas
// ══════════════════════════════════════════════════════════════

void UIManager::drawHeader() {
    // Header background
    _canvas.fillRect(0, 0, W, HDR_H, COLOR_HEADER_BG);
    // Gold accent line
    _canvas.drawFastHLine(0, HDR_H - 1, W, COLOR_PRIMARY);

    _canvas.setTextSize(1.0);
    _canvas.setTextDatum(top_left);

    // Screen name (left, gold, slightly larger)
    int idx = (int)_screen;
    if (idx < (int)Screen::SCREEN_COUNT) {
        _canvas.setTextColor(COLOR_PRIMARY);
        _canvas.drawString(SCREEN_NAMES[idx], 4, 5);
    }

    // Connection indicator
    uint16_t stateColor;
    const char* stateLabel;
    switch (_gwState) {
        case GwState::CONNECTED:    stateColor = COLOR_SUCCESS; stateLabel = "OK"; break;
        case GwState::HANDSHAKE:    stateColor = COLOR_WARNING; stateLabel = ".."; break;
        case GwState::CONNECTING:   stateColor = COLOR_WARNING; stateLabel = ">>"; break;
        case GwState::RECONNECTING: stateColor = COLOR_ERROR;   stateLabel = "RE"; break;
        default:                    stateColor = COLOR_ERROR;   stateLabel = "XX"; break;
    }
    _canvas.fillCircle(90, 10, 4, stateColor);
    _canvas.setTextColor(stateColor);
    _canvas.drawString(stateLabel, 97, 5);

    // WiFi signal bars
    if (_wifiConnected) {
        for (int i = 0; i < 4; i++) {
            int bh = 3 + i * 2;
            _canvas.fillRect(115 + i * 4, HDR_H - 3 - bh, 3, bh, COLOR_SUCCESS);
        }
    } else {
        _canvas.setTextColor(COLOR_ERROR);
        _canvas.drawString("!W", 115, 5);
    }

    // Streaming indicator
    if (_isStreaming) {
        _canvas.setTextColor(COLOR_ACCENT);
        _canvas.drawString(">>>", 140, 5);
    }

    // Voice recording indicator
    if (_voiceRecording) {
        unsigned long now = millis();
        if ((now / 300) % 2 == 0) {
            _canvas.fillCircle(165, 10, 4, COLOR_VOICE_ACTIVE);
        }
    }

    // Battery icon + percentage
    drawBatteryIcon(W - 48, 3, _battDisplay);
}

// ══════════════════════════════════════════════════════════════
//  BATTERY ICON — visual battery with color
// ══════════════════════════════════════════════════════════════

void UIManager::drawBatteryIcon(int x, int y, int pct) {
    pct = constrain(pct, 0, 100);

    // Color based on level
    uint16_t color;
    if (pct > 50)      color = COLOR_BATT_GOOD;
    else if (pct > 20) color = COLOR_BATT_MED;
    else               color = COLOR_BATT_LOW;

    // Battery outline: 20x10 body + 2x4 tip
    _canvas.drawRect(x, y, 20, 12, COLOR_TEXT_DIM);
    _canvas.fillRect(x + 20, y + 3, 3, 6, COLOR_TEXT_DIM);

    // Fill level
    int fillW = (int)(pct / 100.0f * 16);
    if (fillW > 0) {
        _canvas.fillRect(x + 2, y + 2, fillW, 8, color);
    }

    // Percentage text
    char buf[6];
    snprintf(buf, sizeof(buf), "%d%%", pct);
    _canvas.setTextColor(color);
    _canvas.setTextDatum(top_left);
    _canvas.drawString(buf, x + 25, y + 2);
}

// ══════════════════════════════════════════════════════════════
//  FOOTER — drawn to _canvas
// ══════════════════════════════════════════════════════════════

void UIManager::drawFooter() {
    _canvas.fillRect(0, FTR_Y, W, FTR_H, COLOR_FOOTER_BG);
    _canvas.drawFastHLine(0, FTR_Y, W, COLOR_BG_CARD);

    _canvas.setTextSize(1.0);
    _canvas.setTextColor(COLOR_TEXT_DIM);
    _canvas.setTextDatum(top_left);

    // Context-sensitive footer hints
    switch (_screen) {
        case Screen::HOME:
            _canvas.drawString("[A]Next  [B]Next  [PWR]Prev", 4, FTR_Y + 4);
            break;
        case Screen::CHAT:
            if (_voiceRecording) {
                _canvas.fillRect(0, FTR_Y, W, FTR_H, COLOR_VOICE_ACTIVE);
                _canvas.setTextColor(COLOR_TEXT);
                _canvas.drawString("Release [A] to send voice", 20, FTR_Y + 4);
            } else if (_voiceProcessing) {
                _canvas.setTextColor(COLOR_ACCENT);
                _canvas.drawString("Transcribing voice...", 30, FTR_Y + 4);
            } else {
                _canvas.drawString("[A]Send [B]Reply [Hold]Voice", 4, FTR_Y + 4);
            }
            break;
        case Screen::REPUBLIC:
            _canvas.drawString("[A/B]Page  [PWR]Prev", 4, FTR_Y + 4);
            break;
        case Screen::SESSIONS:
            _canvas.drawString("[A]Select  [B]Next  [PWR]Prev", 4, FTR_Y + 4);
            break;
        case Screen::HEALTH:
            _canvas.drawString("[A]Refresh  [PWR]Prev", 4, FTR_Y + 4);
            break;
        case Screen::SETTINGS:
            _canvas.drawString("Serial: /set <key> <val>", 4, FTR_Y + 4);
            break;
        default: break;
    }
}

// ══════════════════════════════════════════════════════════════
//  HOME SCREEN
// ══════════════════════════════════════════════════════════════

void UIManager::drawHome() {
    // Title
    _canvas.setTextSize(1.0);
    _canvas.setTextColor(COLOR_PRIMARY);
    _canvas.drawString("HoC Republic", 5, BD_Y + 3);
    _canvas.setTextColor(COLOR_TEXT_DIM);
    _canvas.drawString("Companion", 90, BD_Y + 3);

    _canvas.drawFastHLine(5, BD_Y + 14, 230, COLOR_BG_CARD);

    if (_republic.valid) {
        int y = BD_Y + 18;

        // Population donut (left)
        drawDonutIndicator(30, y + 22, 18, _republic.avgHappiness / 100.0f,
                           COLOR_SUCCESS, String(_republic.populationTotal));
        _canvas.setTextColor(COLOR_TEXT_DIM);
        _canvas.setTextDatum(top_center);
        _canvas.drawString("Citizens", 30, y + 44);
        _canvas.setTextDatum(top_left);

        // Happiness + Health bars (center)
        char pctBuf[8];
        _canvas.setTextColor(COLOR_TEXT);
        _canvas.drawString("Happy", 65, y);
        drawProgressBar(65, y + 10, 70, 7, _republic.avgHappiness / 100.0f, COLOR_SUCCESS);
        snprintf(pctBuf, sizeof(pctBuf), "%.0f%%", _republic.avgHappiness);
        _canvas.setTextColor(COLOR_SUCCESS);
        _canvas.drawString(pctBuf, 140, y);

        _canvas.setTextColor(COLOR_TEXT);
        _canvas.drawString("Health", 65, y + 22);
        drawProgressBar(65, y + 32, 70, 7, _republic.avgHealth / 100.0f, COLOR_ACCENT);
        snprintf(pctBuf, sizeof(pctBuf), "%.0f%%", _republic.avgHealth);
        _canvas.setTextColor(COLOR_ACCENT);
        _canvas.drawString(pctBuf, 140, y + 22);

        // Right column
        _canvas.setTextColor(_republic.simRunning ? COLOR_SUCCESS : COLOR_TEXT_DIM);
        _canvas.drawString(_republic.simRunning ? "SIM ON" : "SIM OFF", 175, y);
        char tickBuf[16];
        snprintf(tickBuf, sizeof(tickBuf), "Tick %d", _republic.simTick);
        _canvas.setTextColor(COLOR_TEXT);
        _canvas.drawString(tickBuf, 175, y + 13);

        char sessBuf[16];
        snprintf(sessBuf, sizeof(sessBuf), "%d sess", (int)_sessionList.size());
        _canvas.setTextColor(COLOR_ACCENT);
        _canvas.drawString(sessBuf, 175, y + 28);

        if (_activeSessionKey.length() > 0) {
            _canvas.setTextColor(COLOR_SUCCESS);
            _canvas.drawString("Chat OK", 175, y + 42);
        }

    } else if (_gwState == GwState::CONNECTED) {
        _canvas.setTextColor(COLOR_TEXT_DIM);
        _canvas.drawString("Loading Republic data...", 20, BD_Y + 40);
    } else {
        _canvas.setTextColor(COLOR_TEXT_DIM);
        _canvas.drawString("Connecting to gateway...", 20, BD_Y + 30);
        _canvas.setTextColor(COLOR_ACCENT);
        _canvas.drawString("WiFi: " + _wifiIp, 20, BD_Y + 45);
    }
}

// ══════════════════════════════════════════════════════════════
//  CHAT SCREEN
// ══════════════════════════════════════════════════════════════

void UIManager::drawChat() {
    int chatTop = BD_Y + 2;
    int chatH = BD_H - 18;  // Leave room for quick reply bar

    // No session
    if (_activeSessionKey.length() == 0) {
        _canvas.setTextColor(COLOR_WARNING);
        _canvas.drawString("No active session", 20, chatTop + 20);
        _canvas.setTextColor(COLOR_TEXT_DIM);
        _canvas.drawString("Auto-creating session...", 20, chatTop + 35);
        return;
    }

    // Voice recording overlay
    if (_voiceRecording) {
        _canvas.setTextColor(COLOR_VOICE_ACTIVE);
        _canvas.setTextSize(2.0);
        _canvas.setTextDatum(middle_center);
        _canvas.drawString("Recording", W / 2, BD_Y + BD_H / 2 - 10);
        _canvas.setTextSize(1.0);
        unsigned long elapsed = (millis() - _voiceStartMs) / 1000;
        char timeBuf[8];
        snprintf(timeBuf, sizeof(timeBuf), "%lus", elapsed);
        _canvas.drawString(timeBuf, W / 2, BD_Y + BD_H / 2 + 12);
        _canvas.setTextDatum(top_left);
        return;
    }

    // Voice processing
    if (_voiceProcessing) {
        _canvas.setTextColor(COLOR_ACCENT);
        _canvas.setTextDatum(middle_center);
        _canvas.drawString("Transcribing...", W / 2, BD_Y + BD_H / 2);
        _canvas.setTextDatum(top_left);
        return;
    }

    // Chat messages
    _canvas.setTextSize(1.0);
    int y = chatTop;
    int maxLines = chatH / LN_H;
    int startIdx = max(0, (int)_chatLines.size() - maxLines);

    for (int i = startIdx; i < (int)_chatLines.size() && y < chatTop + chatH; i++) {
        const ChatLine& line = _chatLines[i];
        uint16_t color = line.isUser ? COLOR_CHAT_USER : COLOR_CHAT_AI;
        const char* prefix = line.isUser ? "> " : "< ";

        _canvas.setTextColor(color);
        String display = String(prefix) + truncateText(line.text, 36);
        _canvas.drawString(display, 3, y);
        y += LN_H;
    }

    // Streaming cursor
    if (_isStreaming) {
        if ((millis() / 500) % 2 == 0) {
            _canvas.fillRect(3, y, 6, 8, COLOR_ACCENT);
        }
    }

    // Empty state
    if (_chatLines.empty() && !_isStreaming) {
        _canvas.setTextColor(COLOR_TEXT_DIM);
        _canvas.drawString("Say something to the Republic!", 15, chatTop + 25);
        _canvas.setTextColor(COLOR_ACCENT);
        _canvas.drawString("Hold [A] for voice input", 25, chatTop + 42);
    }

    // Quick reply bar
    int qrY = FTR_Y - 14;
    _canvas.fillRect(0, qrY, W, 14, COLOR_BG_CARD);
    _canvas.setTextColor(COLOR_PRIMARY);
    _canvas.drawString("> ", 3, qrY + 2);
    _canvas.setTextColor(COLOR_TEXT);
    _canvas.drawString(truncateText(getSelectedQuickReply(), 34), 15, qrY + 2);
}

// ══════════════════════════════════════════════════════════════
//  REPUBLIC SCREEN
// ══════════════════════════════════════════════════════════════

void UIManager::drawRepublic() {
    switch (_republicPage) {
        case 0: drawRepublicOverview(); break;
        case 1: drawRepublicSpecializations(); break;
        case 2: drawRepublicActivities(); break;
        case 3: drawRepublicEconomy(); break;
    }
}

void UIManager::drawRepublicOverview() {
    _canvas.setTextColor(COLOR_PRIMARY);
    _canvas.drawString("Republic Overview", 5, BD_Y + 3);
    _canvas.setTextColor(COLOR_ACCENT);
    _canvas.drawString("1/4", 215, BD_Y + 3);

    if (!_republic.valid) {
        _canvas.setTextColor(COLOR_TEXT_DIM);
        _canvas.drawString("Waiting for data...", 20, BD_Y + 40);
        return;
    }

    int y = BD_Y + 16;
    char buf[48];

    _canvas.setTextColor(COLOR_ACCENT);
    _canvas.drawString("Pop", 5, y);
    _canvas.setTextColor(COLOR_TEXT);
    snprintf(buf, sizeof(buf), "%d total (%d active)", _republic.populationTotal, _republic.populationActive);
    _canvas.drawString(buf, 30, y);
    y += LN_H;

    _canvas.setTextColor(COLOR_TEXT_DIM);
    _canvas.drawString("Happy", 5, y);
    drawProgressBar(40, y + 1, 55, 7, _republic.avgHappiness / 100.0f, COLOR_SUCCESS);
    snprintf(buf, sizeof(buf), "%.0f%%", _republic.avgHappiness);
    _canvas.setTextColor(COLOR_SUCCESS);
    _canvas.drawString(buf, 100, y);

    _canvas.setTextColor(COLOR_TEXT_DIM);
    _canvas.drawString("Hlth", 125, y);
    drawProgressBar(152, y + 1, 50, 7, _republic.avgHealth / 100.0f, COLOR_ACCENT);
    snprintf(buf, sizeof(buf), "%.0f%%", _republic.avgHealth);
    _canvas.setTextColor(COLOR_ACCENT);
    _canvas.drawString(buf, 207, y);
    y += LN_H;

    _canvas.setTextColor(COLOR_TEXT_DIM);
    _canvas.drawString("Credits", 5, y);
    _canvas.setTextColor(COLOR_PRIMARY);
    snprintf(buf, sizeof(buf), "%.0f avg", _republic.avgCredits);
    _canvas.drawString(buf, 50, y);

    _canvas.setTextColor(_republic.simRunning ? COLOR_SUCCESS : COLOR_TEXT_DIM);
    _canvas.drawString(_republic.simRunning ? "SIM ON" : "SIM OFF", 130, y);
    snprintf(buf, sizeof(buf), "T:%d", _republic.simTick);
    _canvas.setTextColor(COLOR_TEXT);
    _canvas.drawString(buf, 185, y);
    y += LN_H;

    _canvas.setTextColor(COLOR_TEXT_DIM);
    _canvas.drawString("Pres", 5, y);
    _canvas.setTextColor(COLOR_PRIMARY);
    _canvas.drawString(truncateText(_republic.presidentName, 22), 35, y);
    y += LN_H;

    _canvas.setTextColor(COLOR_TEXT_DIM);
    snprintf(buf, sizeof(buf), "%d Specs  %d Bills  %d Hiber",
             (int)_republic.topSpecializations.size(), _republic.activeBills,
             _republic.populationHibernated);
    _canvas.drawString(buf, 5, y);
}

void UIManager::drawRepublicSpecializations() {
    _canvas.setTextColor(COLOR_PRIMARY);
    _canvas.drawString("Specializations", 5, BD_Y + 3);
    _canvas.setTextColor(COLOR_ACCENT);
    _canvas.drawString("2/4", 215, BD_Y + 3);

    if (!_republic.valid || _republic.topSpecializations.empty()) {
        _canvas.setTextColor(COLOR_TEXT_DIM);
        _canvas.drawString("No data available", 20, BD_Y + 40);
    } else {
        drawMiniBarChart(5, BD_Y + 16, 230, FTR_Y - BD_Y - 20,
                         _republic.topSpecializations, COLOR_ACCENT);
    }
}

void UIManager::drawRepublicActivities() {
    _canvas.setTextColor(COLOR_PRIMARY);
    _canvas.drawString("Activities", 5, BD_Y + 3);
    _canvas.setTextColor(COLOR_ACCENT);
    _canvas.drawString("3/4", 215, BD_Y + 3);

    if (!_republic.valid || _republic.topActivities.empty()) {
        _canvas.setTextColor(COLOR_TEXT_DIM);
        _canvas.drawString("No data available", 20, BD_Y + 40);
    } else {
        drawMiniBarChart(5, BD_Y + 16, 230, FTR_Y - BD_Y - 20,
                         _republic.topActivities, COLOR_SUCCESS);
    }
}

void UIManager::drawRepublicEconomy() {
    _canvas.setTextColor(COLOR_PRIMARY);
    _canvas.drawString("Economy & Treasury", 5, BD_Y + 3);
    _canvas.setTextColor(COLOR_ACCENT);
    _canvas.drawString("4/4", 215, BD_Y + 3);

    if (!_republic.valid) {
        _canvas.setTextColor(COLOR_TEXT_DIM);
        _canvas.drawString("No data available", 20, BD_Y + 40);
        return;
    }

    int y = BD_Y + 16;
    char buf[32];

    _canvas.setTextColor(COLOR_WARNING);
    _canvas.drawString("USD", 5, y);
    _canvas.setTextColor(COLOR_TEXT);
    snprintf(buf, sizeof(buf), "$%.2f", _republic.treasuryUSD);
    _canvas.drawString(buf, 35, y);
    y += LN_H;

    _canvas.setTextColor(COLOR_WARNING);
    _canvas.drawString("BTC", 5, y);
    _canvas.setTextColor(COLOR_TEXT);
    snprintf(buf, sizeof(buf), "%.6f", _republic.treasuryBTC);
    _canvas.drawString(buf, 35, y);
    y += LN_H;

    _canvas.setTextColor(COLOR_WARNING);
    _canvas.drawString("ETH", 5, y);
    _canvas.setTextColor(COLOR_TEXT);
    snprintf(buf, sizeof(buf), "%.4f", _republic.treasuryETH);
    _canvas.drawString(buf, 35, y);
    y += LN_H;

    _canvas.setTextColor(COLOR_PRIMARY);
    _canvas.drawString("Credits", 5, y);
    _canvas.setTextColor(COLOR_TEXT);
    snprintf(buf, sizeof(buf), "%.0f", _republic.treasuryCredits);
    _canvas.drawString(buf, 55, y);
    y += LN_H;

    _canvas.setTextColor(COLOR_ACCENT);
    snprintf(buf, sizeof(buf), "Bills: %d", _republic.activeBills);
    _canvas.drawString(buf, 5, y);

    // Recent events on right
    if (!_republic.recentEvents.empty()) {
        _canvas.setTextColor(COLOR_TEXT_DIM);
        _canvas.drawString("Recent:", 125, BD_Y + 16);
        int ey = BD_Y + 28;
        for (size_t i = 0; i < min((size_t)5, _republic.recentEvents.size()); i++) {
            _canvas.drawString(truncateText(_republic.recentEvents[i], 17), 125, ey);
            ey += 11;
        }
    }
}

// ══════════════════════════════════════════════════════════════
//  SESSIONS SCREEN
// ══════════════════════════════════════════════════════════════

void UIManager::drawSessions() {
    _canvas.setTextColor(COLOR_PRIMARY);
    _canvas.drawString("Sessions", 5, BD_Y + 3);

    if (_sessionList.empty()) {
        _canvas.setTextColor(COLOR_TEXT_DIM);
        _canvas.drawString("No sessions available", 20, BD_Y + 40);
        return;
    }

    // Index indicator
    char idxBuf[12];
    snprintf(idxBuf, sizeof(idxBuf), "%d/%d", _sessionIdx + 1, (int)_sessionList.size());
    _canvas.setTextColor(COLOR_TEXT_DIM);
    _canvas.drawString(idxBuf, 195, BD_Y + 3);

    int y = BD_Y + 16;
    int maxVisible = (FTR_Y - y) / 14;
    int startIdx = max(0, _sessionIdx - maxVisible / 2);
    if (startIdx + maxVisible > (int)_sessionList.size()) {
        startIdx = max(0, (int)_sessionList.size() - maxVisible);
    }

    for (int i = startIdx; i < min(startIdx + maxVisible, (int)_sessionList.size()); i++) {
        bool selected = (i == _sessionIdx);
        bool active = (_sessionList[i].key == _activeSessionKey);

        if (selected) {
            _canvas.fillRect(3, y - 1, 234, LN_H, COLOR_BG_CARD);
        }
        if (active) {
            _canvas.fillCircle(8, y + 5, 3, COLOR_SUCCESS);
        }

        _canvas.setTextColor(selected ? COLOR_PRIMARY : COLOR_TEXT);
        _canvas.drawString(truncateText(_sessionList[i].title, 28), 15, y);

        _canvas.setTextColor(COLOR_TEXT_DIM);
        char cnt[8];
        snprintf(cnt, sizeof(cnt), "%d", _sessionList[i].messageCount);
        _canvas.setTextDatum(top_right);
        _canvas.drawString(cnt, 235, y);
        _canvas.setTextDatum(top_left);

        y += 14;
    }
}

// ══════════════════════════════════════════════════════════════
//  HEALTH SCREEN
// ══════════════════════════════════════════════════════════════

void UIManager::drawHealth() {
    _canvas.setTextColor(COLOR_PRIMARY);
    _canvas.drawString("Server Health", 5, BD_Y + 3);

    if (!_health.valid) {
        _canvas.setTextColor(COLOR_TEXT_DIM);
        _canvas.drawString("Waiting for data...", 20, BD_Y + 40);
        return;
    }

    int y = BD_Y + 16;
    char buf[48];

    // CPU
    _canvas.setTextColor(COLOR_TEXT_DIM);
    _canvas.drawString("CPU", 5, y);
    drawProgressBar(30, y + 1, 100, 8, _health.cpuPercent / 100.0f,
                    _health.cpuPercent > 80 ? COLOR_ERROR : COLOR_ACCENT);
    snprintf(buf, sizeof(buf), "%.1f%%", _health.cpuPercent);
    _canvas.setTextColor(COLOR_TEXT);
    _canvas.drawString(buf, 135, y);
    y += 14;

    // Memory
    _canvas.setTextColor(COLOR_TEXT_DIM);
    _canvas.drawString("MEM", 5, y);
    float memPct = _health.memTotalMB > 0 ? (float)_health.memUsedMB / _health.memTotalMB : 0;
    drawProgressBar(30, y + 1, 100, 8, memPct,
                    memPct > 0.85f ? COLOR_ERROR : COLOR_SUCCESS);
    snprintf(buf, sizeof(buf), "%d/%dMB", _health.memUsedMB, _health.memTotalMB);
    _canvas.setTextColor(COLOR_TEXT);
    _canvas.drawString(buf, 135, y);
    y += 14;

    // Uptime
    _canvas.setTextColor(COLOR_TEXT_DIM);
    _canvas.drawString("Up", 5, y);
    _canvas.setTextColor(COLOR_TEXT);
    _canvas.drawString(formatUptime(_health.uptimeSec), 25, y);
    y += 14;

    // Clients + Sessions
    _canvas.setTextColor(COLOR_TEXT_DIM);
    _canvas.drawString("Clients", 5, y);
    _canvas.setTextColor(COLOR_ACCENT);
    snprintf(buf, sizeof(buf), "%d", _health.activeClients);
    _canvas.drawString(buf, 50, y);

    _canvas.setTextColor(COLOR_TEXT_DIM);
    _canvas.drawString("Sess", 75, y);
    _canvas.setTextColor(COLOR_ACCENT);
    snprintf(buf, sizeof(buf), "%d", _health.activeSessions);
    _canvas.drawString(buf, 105, y);

    _canvas.setTextColor(COLOR_TEXT_DIM);
    _canvas.drawString("Ver", 130, y);
    _canvas.setTextColor(COLOR_TEXT);
    _canvas.drawString(truncateText(_health.serverVersion, 12), 155, y);
    y += 14;

    // Device heap info
    uint32_t freeHeap = ESP.getFreeHeap() / 1024;
    _canvas.setTextColor(freeHeap < HEAP_WARNING_KB ? COLOR_WARNING : COLOR_TEXT_DIM);
    snprintf(buf, sizeof(buf), "Heap: %dKB free", freeHeap);
    _canvas.drawString(buf, 5, y);
}

// ══════════════════════════════════════════════════════════════
//  SETTINGS SCREEN
// ══════════════════════════════════════════════════════════════

void UIManager::drawSettings() {
    _canvas.setTextColor(COLOR_PRIMARY);
    _canvas.drawString("Settings", 5, BD_Y + 3);

    Preferences p;
    p.begin(NVS_NAMESPACE, true);

    int y = BD_Y + 16;

    _canvas.setTextColor(COLOR_TEXT_DIM);
    _canvas.drawString("WiFi", 5, y);
    _canvas.setTextColor(COLOR_TEXT);
    _canvas.drawString(truncateText(p.getString(NVS_KEY_WIFI_SSID, WIFI_SSID), 22), 40, y);
    y += LN_H;

    _canvas.setTextColor(COLOR_TEXT_DIM);
    _canvas.drawString("GW", 5, y);
    _canvas.setTextColor(COLOR_TEXT);
    String host = p.getString(NVS_KEY_GW_HOST, GATEWAY_HOST);
    uint16_t port = p.getUShort(NVS_KEY_GW_PORT, GATEWAY_PORT);
    char gwBuf[48];
    snprintf(gwBuf, sizeof(gwBuf), "%s:%d", host.c_str(), port);
    _canvas.drawString(gwBuf, 25, y);
    y += LN_H;

    _canvas.setTextColor(COLOR_TEXT_DIM);
    _canvas.drawString("Status", 5, y);
    switch (_gwState) {
        case GwState::CONNECTED:
            _canvas.setTextColor(COLOR_SUCCESS);
            _canvas.drawString("Connected", 45, y);
            break;
        case GwState::HANDSHAKE:
            _canvas.setTextColor(COLOR_WARNING);
            _canvas.drawString("Handshake...", 45, y);
            break;
        default:
            _canvas.setTextColor(COLOR_ERROR);
            _canvas.drawString("Disconnected", 45, y);
            break;
    }
    y += LN_H;

    _canvas.setTextColor(COLOR_TEXT_DIM);
    _canvas.drawString("DevID", 5, y);
    _canvas.setTextColor(COLOR_TEXT);
    if (_gw) _canvas.drawString(truncateText(_gw->getDeviceId(), 26), 40, y);
    y += LN_H;

    _canvas.setTextColor(COLOR_TEXT_DIM);
    _canvas.drawString("Sess", 5, y);
    _canvas.setTextColor(_activeSessionKey.length() > 0 ? COLOR_SUCCESS : COLOR_WARNING);
    _canvas.drawString(_activeSessionKey.length() > 0 ?
                       truncateText(_activeSessionKey, 26) : "Auto-create", 35, y);
    y += LN_H;

    _canvas.setTextColor(COLOR_TEXT_DIM);
    _canvas.drawString("FW", 5, y);
    _canvas.setTextColor(COLOR_PRIMARY);
    _canvas.drawString("v" HOC_VERSION " Republic", 25, y);

    p.end();
}

// ══════════════════════════════════════════════════════════════
//  TOAST OVERLAY
// ══════════════════════════════════════════════════════════════

void UIManager::drawToast() {
    _canvas.fillRoundRect(10, 50, 220, 28, 4, _toastColor);
    _canvas.setTextColor(COLOR_TEXT);
    _canvas.setTextDatum(middle_center);
    _canvas.drawString(truncateText(_toastText, 34), W / 2, 64);
    _canvas.setTextDatum(top_left);
}

// ══════════════════════════════════════════════════════════════
//  DRAWING HELPERS
// ══════════════════════════════════════════════════════════════

void UIManager::drawProgressBar(int x, int y, int w, int h,
                                 float percent, uint16_t color) {
    percent = constrain(percent, 0.0f, 1.0f);
    _canvas.drawRect(x, y, w, h, COLOR_TEXT_DIM);
    int fillW = (int)(percent * (w - 2));
    if (fillW > 0) {
        _canvas.fillRect(x + 1, y + 1, fillW, h - 2, color);
    }
}

void UIManager::drawMiniBarChart(int x, int y, int w, int h,
                                  const std::vector<RepublicBarItem>& items,
                                  uint16_t barColor) {
    if (items.empty()) return;

    int maxVal = 1;
    for (const auto& item : items) {
        if (item.value > maxVal) maxVal = item.value;
    }

    int count = min((int)items.size(), 6);
    int rowH = h / count;
    int labelW = 65;
    int barAreaW = w - labelW - 30;

    for (int i = 0; i < count; i++) {
        int ry = y + i * rowH;

        _canvas.setTextColor(COLOR_TEXT_DIM);
        _canvas.drawString(truncateText(items[i].label, 10), x, ry + 2);

        int bw = max(2, (int)((float)items[i].value / maxVal * barAreaW));
        _canvas.fillRect(x + labelW, ry + 1, bw, rowH - 3, barColor);

        _canvas.setTextColor(COLOR_TEXT);
        char vBuf[8];
        snprintf(vBuf, sizeof(vBuf), "%d", items[i].value);
        _canvas.drawString(vBuf, x + labelW + bw + 3, ry + 2);
    }
}

void UIManager::drawDonutIndicator(int cx, int cy, int r, float percent,
                                    uint16_t color, const String& label) {
    percent = constrain(percent, 0.0f, 1.0f);

    // Background ring
    _canvas.drawCircle(cx, cy, r, COLOR_TEXT_DIM);
    _canvas.drawCircle(cx, cy, r - 1, COLOR_TEXT_DIM);

    // Filled arc segments
    int segments = (int)(percent * 36);
    for (int i = 0; i < segments; i++) {
        float angle = (i * 10.0f - 90.0f) * DEG_TO_RAD;
        int x1 = cx + (int)(cos(angle) * r);
        int y1 = cy + (int)(sin(angle) * r);
        int x2 = cx + (int)(cos(angle) * (r - 2));
        int y2 = cy + (int)(sin(angle) * (r - 2));
        _canvas.drawLine(x1, y1, x2, y2, color);
    }

    // Center label
    _canvas.setTextColor(color);
    _canvas.setTextDatum(middle_center);
    _canvas.drawString(label, cx, cy);
    _canvas.setTextDatum(top_left);
}

String UIManager::formatUptime(uint32_t seconds) {
    uint32_t d = seconds / 86400;
    uint32_t h = (seconds % 86400) / 3600;
    uint32_t m = (seconds % 3600) / 60;
    char buf[24];
    if (d > 0) snprintf(buf, sizeof(buf), "%dd %dh %dm", d, h, m);
    else if (h > 0) snprintf(buf, sizeof(buf), "%dh %dm", h, m);
    else snprintf(buf, sizeof(buf), "%dm %lds", m, (long)(seconds % 60));
    return String(buf);
}

String UIManager::truncateText(const String& text, int maxChars) {
    if ((int)text.length() <= maxChars) return text;
    return text.substring(0, maxChars - 2) + "..";
}

String UIManager::formatNumber(int n) {
    if (n >= 1000000) {
        char buf[12];
        snprintf(buf, sizeof(buf), "%.1fM", n / 1000000.0f);
        return String(buf);
    } else if (n >= 1000) {
        char buf[12];
        snprintf(buf, sizeof(buf), "%.1fK", n / 1000.0f);
        return String(buf);
    }
    return String(n);
}

void UIManager::buzz(int freq, int durationMs) {
    if (!HAPTIC_ENABLED) return;
    M5.Speaker.tone(freq, durationMs);
}
