#ifndef UI_MANAGER_H
#define UI_MANAGER_H

#include <Arduino.h>
#include <M5Unified.h>
#include <vector>
#include "hoc_gateway.h"
#include "config.h"

// ══════════════════════════════════════════════════════════════
//  HoC Republic — UI Manager v2.1.0
//
//  FLICKER-FREE via M5Canvas sprite double-buffering.
//  All drawing goes to an off-screen canvas, then pushed
//  atomically to the display.  Dirty-flag system ensures
//  we only redraw when data actually changes.
//
//  Screens:
//    0 = HOME       — Republic dashboard overview
//    1 = CHAT       — AI conversation + voice input
//    2 = REPUBLIC   — Population stats with mini charts
//    3 = SESSIONS   — Session list browser
//    4 = HEALTH     — Server health metrics
//    5 = SETTINGS   — Configuration display
// ══════════════════════════════════════════════════════════════

enum class Screen : uint8_t {
    HOME = 0,
    CHAT,
    REPUBLIC,
    SESSIONS,
    HEALTH,
    SETTINGS,
    SCREEN_COUNT
};

struct ChatLine {
    bool isUser;
    String text;
    unsigned long timestamp;
};

class UIManager {
public:
    UIManager();

    void begin();
    void loop();
    void setGateway(HoCGateway* gw) { _gw = gw; }

    // ── Screen navigation ───────────────────────────────────
    void showScreen(Screen s);
    void nextScreen();
    void prevScreen();
    Screen currentScreen() const { return _screen; }

    // ── Data updates (each sets _dirty = true) ─────────────
    void setConnectionState(GwState state);
    void setWifiConnected(bool connected, const String& ip = "");
    void updateHealth(const GwHealthInfo& health);
    void updateSessions(const std::vector<GwSessionInfo>& sessions);
    void updateRepublic(const RepublicStats& stats);
    void addChatMessage(bool isUser, const String& text);
    void appendStreamChunk(const String& text);
    void endStream();
    void showError(const String& msg);
    void showToast(const String& msg, uint16_t color = COLOR_PRIMARY);

    // ── Battery (smoothed) ──────────────────────────────────
    void updateBattery(int rawPercent);
    int  getSmoothedBattery() const { return _battDisplay; }

    // ── Voice state ─────────────────────────────────────────
    void setVoiceRecording(bool recording);
    void setVoiceProcessing(bool processing);
    bool isVoiceRecording() const { return _voiceRecording; }

    // ── Input handling ──────────────────────────────────────
    void onBtnA();
    void onBtnB();
    void onBtnPwr();
    void onBtnALongPress();
    void onBtnAReleased();
    void onTilt();

    // ── Accessors ───────────────────────────────────────────
    bool isScreenOn() const { return _screenOn; }
    void setActiveSessionKey(const String& key) { _activeSessionKey = key; }
    String getActiveSessionKey() const { return _activeSessionKey; }
    int getSessionIdx() const { return _sessionIdx; }
    void wakeScreen();
    void dimScreen();
    void markDirty() { _dirty = true; }

    // ── Quick-reply system ──────────────────────────────────
    void scrollQuickReply(int direction);
    String getSelectedQuickReply() const;

    // ── Power management ────────────────────────────────────
    void handlePowerManagement();

private:
    // ── Canvas (double-buffer) ──────────────────────────────
    M5Canvas _canvas;
    bool     _dirty;
    unsigned long _lastPushMs;

    HoCGateway* _gw;
    Screen _screen;
    bool   _screenOn;
    uint8_t _brightness;
    unsigned long _lastActivityMs;
    unsigned long _toastExpireMs;
    String _toastText;
    uint16_t _toastColor;

    // ── Battery smoothing ───────────────────────────────────
    float _battSmoothed;     // EMA-smoothed value
    int   _battDisplay;      // Integer displayed (only changes when threshold met)
    bool  _battInitialized;

    // Connection state
    GwState _gwState;
    bool    _wifiConnected;
    String  _wifiIp;

    // Data
    GwHealthInfo _health;
    std::vector<GwSessionInfo> _sessionList;
    RepublicStats _republic;
    std::vector<ChatLine> _chatLines;
    int _chatScrollPos;
    bool _isStreaming;
    String _streamBuffer;

    // Quick replies
    int _quickReplyIdx;
    static const char* QUICK_REPLIES[];
    static const int QUICK_REPLY_COUNT;

    // Voice
    bool _voiceRecording;
    bool _voiceProcessing;
    unsigned long _voiceStartMs;

    // Navigation
    int _sessionIdx;
    int _settingsIdx;
    String _activeSessionKey;
    int _republicPage;

    // ── Drawing methods (all draw to _canvas) ───────────────
    void render();          // Master render: header + body + footer → push
    void drawHeader();
    void drawFooter();
    void drawHome();
    void drawChat();
    void drawRepublic();
    void drawSessions();
    void drawHealth();
    void drawSettings();
    void drawToast();

    // Republic sub-pages
    void drawRepublicOverview();
    void drawRepublicSpecializations();
    void drawRepublicActivities();
    void drawRepublicEconomy();

    // ── Battery icon ────────────────────────────────────────
    void drawBatteryIcon(int x, int y, int pct);

    // ── Helpers ─────────────────────────────────────────────
    void drawProgressBar(int x, int y, int w, int h,
                         float percent, uint16_t color);
    void drawMiniBarChart(int x, int y, int w, int h,
                          const std::vector<RepublicBarItem>& items,
                          uint16_t barColor);
    void drawDonutIndicator(int cx, int cy, int r, float percent,
                            uint16_t color, const String& label);
    String formatUptime(uint32_t seconds);
    String truncateText(const String& text, int maxChars);
    String formatNumber(int n);
    void buzz(int freq, int durationMs);
};

#endif // UI_MANAGER_H
