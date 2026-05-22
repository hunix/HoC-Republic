#ifndef HOC_GATEWAY_H
#define HOC_GATEWAY_H

#include <Arduino.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <functional>
#include <vector>
#include <map>

// ══════════════════════════════════════════════════════════════
//  HoC Republic Gateway Client — v2.0.0
//
//  OpenClaw Gateway Protocol v3 over WebSocket.
//  Features:
//    - Ed25519 device identity with challenge-response
//    - Republic statistics (republic.overview)
//    - Auto-session creation on connect
//    - Voice transcription via gateway STT proxy
//    - Chat, health, sessions, status RPC
//    - Auto-reconnect with exponential backoff
// ══════════════════════════════════════════════════════════════

enum class GwState : uint8_t {
    DISCONNECTED,
    CONNECTING,
    HANDSHAKE,
    CONNECTED,
    RECONNECTING,
};

struct GwConfig {
    String host;
    uint16_t port;
    String token;
    bool useTls;
};

// ── Structured data ────────────────────────────────────────

struct GwHealthInfo {
    float cpuPercent;
    uint32_t memUsedMB;
    uint32_t memTotalMB;
    uint32_t uptimeSec;
    uint16_t activeClients;
    uint16_t activeSessions;
    String serverVersion;
    bool valid = false;
};

struct GwSessionInfo {
    String key;
    String title;
    String model;
    uint32_t messageCount;
    unsigned long lastActiveMs;
};

struct GwChatChunk {
    String sessionKey;
    String runId;
    String type;       // "text", "thinking", "tool_use", "done", "error"
    String content;
    String model;
    bool   isStreaming;
};

// ── Republic Stats ─────────────────────────────────────────

struct RepublicBarItem {
    String label;
    int    value;
};

struct RepublicStats {
    // Population
    int populationTotal   = 0;
    int populationActive  = 0;
    int populationHibernated = 0;
    float avgHappiness    = 0;
    float avgHealth       = 0;
    float avgCredits      = 0;

    // Top specializations (max 6)
    std::vector<RepublicBarItem> topSpecializations;

    // Top activities (max 6)
    std::vector<RepublicBarItem> topActivities;

    // Economy
    float treasuryUSD     = 0;
    float treasuryBTC     = 0;
    float treasuryETH     = 0;
    float treasuryCredits = 0;

    // Government
    String presidentName;
    int    activeBills    = 0;

    // Simulation
    bool   simRunning     = false;
    int    simTick        = 0;
    String simSpeed;

    // Recent events (last 5)
    std::vector<String> recentEvents;

    bool valid = false;
};

// ── Callbacks ──────────────────────────────────────────────

using OnGwConnected    = std::function<void()>;
using OnGwDisconnected = std::function<void()>;
using OnGwHealth       = std::function<void(const GwHealthInfo& info)>;
using OnGwSessions     = std::function<void(const std::vector<GwSessionInfo>& sessions)>;
using OnGwChat         = std::function<void(const GwChatChunk& chunk)>;
using OnGwError        = std::function<void(const String& msg)>;
using OnGwStatus       = std::function<void(const JsonObject& payload)>;
using OnGwStateChange  = std::function<void(GwState state)>;
using OnGwRepublic     = std::function<void(const RepublicStats& stats)>;
using OnGwTranscript   = std::function<void(const String& text)>;
using OnGwSessionCreated = std::function<void(const String& key, const String& title)>;

class HoCGateway {
public:
    HoCGateway();

    void begin(const GwConfig& config);
    void loop();
    void disconnect();
    bool isConnected() const;
    bool isActive() const;
    GwState getState() const;
    const GwHealthInfo& getHealth() const { return _health; }
    const std::vector<GwSessionInfo>& getSessions() const { return _sessions; }
    const RepublicStats& getRepublicStats() const { return _republic; }
    String getDeviceId() const { return _deviceId; }

    // ── RPC methods ─────────────────────────────────────────
    void sendChat(const String& sessionKey, const String& text);
    void abortChat(const String& sessionKey);
    void requestHealth();
    void requestStatus();
    void requestSessions();
    void createSession(const String& title);
    void requestRepublicOverview();
    void sendVoiceAudio(const uint8_t* wavData, size_t wavLen, const String& sessionKey);

    // ── Callbacks ───────────────────────────────────────────
    void onConnected(OnGwConnected cb)       { _cbConnected = cb; }
    void onDisconnected(OnGwDisconnected cb) { _cbDisconnected = cb; }
    void onHealth(OnGwHealth cb)             { _cbHealth = cb; }
    void onSessions(OnGwSessions cb)         { _cbSessions = cb; }
    void onChat(OnGwChat cb)                 { _cbChat = cb; }
    void onError(OnGwError cb)               { _cbError = cb; }
    void onStatus(OnGwStatus cb)             { _cbStatus = cb; }
    void onStateChange(OnGwStateChange cb)   { _cbStateChange = cb; }
    void onRepublic(OnGwRepublic cb)         { _cbRepublic = cb; }
    void onTranscript(OnGwTranscript cb)     { _cbTranscript = cb; }
    void onSessionCreated(OnGwSessionCreated cb) { _cbSessionCreated = cb; }

private:
    WebSocketsClient _ws;
    GwConfig  _config;
    GwState   _state;
    bool      _wsStarted;

    GwHealthInfo _health;
    std::vector<GwSessionInfo> _sessions;
    RepublicStats _republic;

    unsigned long _lastReconnectMs;
    unsigned long _reconnectDelayMs;
    int           _reconnectAttempts;
    uint32_t      _requestCounter;
    unsigned long _lastTickMs;

    // ── Ed25519 Device Identity ─────────────────────────────
    uint8_t _privateKey[32];
    uint8_t _publicKey[32];
    String  _deviceId;
    String  _publicKeyB64Url;
    bool    _identityReady;
    String  _deviceToken;

    // Callbacks
    OnGwConnected    _cbConnected;
    OnGwDisconnected _cbDisconnected;
    OnGwHealth       _cbHealth;
    OnGwSessions     _cbSessions;
    OnGwChat         _cbChat;
    OnGwError        _cbError;
    OnGwStatus       _cbStatus;
    OnGwStateChange  _cbStateChange;
    OnGwRepublic     _cbRepublic;
    OnGwTranscript   _cbTranscript;
    OnGwSessionCreated _cbSessionCreated;

    // Internal
    void onWsEvent(WStype_t type, uint8_t* payload, size_t length);
    void handleMessage(const char* json, size_t len);
    void handleEvent(const JsonObject& msg);
    void handleResponse(const JsonObject& msg);
    void sendHandshake(const String& nonce);
    String nextId();
    String trackRequest(const String& method);  // returns ID and registers it
    void scheduleReconnect();

    // Request ID → method name tracking (gateway responses have no method field)
    std::map<String, String> _pendingRequests;

    // Crypto
    void loadOrCreateIdentity();
    void saveIdentity();
    String sha256Hex(const uint8_t* data, size_t len);
    String base64UrlEncode(const uint8_t* data, size_t len);
    String buildAuthPayload(const String& nonce, unsigned long long signedAtMs);
    String signPayload(const String& payload);
};

#endif // HOC_GATEWAY_H
