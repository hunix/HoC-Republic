#include "hoc_gateway.h"
#include "config.h"
#include <Ed25519.h>
#include <SHA256.h>
#include <RNG.h>
#include <WiFi.h>

// ══════════════════════════════════════════════════════════════
//  HoC Republic — Gateway Client v2.7.0
//
//  v2.5.0 — Fixed reconnect flooding (root cause found):
//    - setReconnectInterval(0) does NOT disable reconnect!
//      It causes the library to attempt TCP connect on EVERY
//      loop() call (100/sec at 10ms loop).  This floods the
//      ESP32 WiFi stack with SYN packets, causing radio reset.
//    - Changed to setReconnectInterval(5000) — 5 second minimum
//      between library-internal reconnect attempts.
//    - Main.cpp now gates gateway.loop() calls — only called
//      when WiFi is verified stable, providing defense-in-depth.
//    - Removed RECONNECTING state — main.cpp handles all
//      reconnection after WiFi is re-established.
//    - On WStype_DISCONNECTED, just set DISCONNECTED state.
//      Main.cpp will detect this and call begin() again after
//      verifying WiFi is still stable.
// ══════════════════════════════════════════════════════════════

HoCGateway::HoCGateway()
    : _state(GwState::DISCONNECTED)
    , _wsStarted(false)
    , _lastReconnectMs(0)
    , _reconnectDelayMs(GATEWAY_RECONNECT_MS)
    , _reconnectAttempts(0)
    , _requestCounter(0)
    , _lastTickMs(0)
    , _identityReady(false)
{}

// ══════════════════════════════════════════════════════════════
//  BEGIN — Start the WebSocket connection (guarded)
// ══════════════════════════════════════════════════════════════

void HoCGateway::begin(const GwConfig& config) {
    // Guard: only start if truly disconnected
    if (_wsStarted && _state != GwState::DISCONNECTED) {
        Serial.printf("[HoC] begin() ignored — already in state %d\n", (int)_state);
        return;
    }

    // Guard: don't connect if WiFi is not connected
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("[HoC] begin() ignored — WiFi not connected");
        return;
    }

    _config = config;
    _state = GwState::CONNECTING;
    if (_cbStateChange) _cbStateChange(_state);

    // Load cached device token (for fallback auth)
    Preferences p;
    p.begin(NVS_NAMESPACE, true);
    _deviceToken = p.getString(NVS_KEY_DEVICE_TOKEN, "");
    p.end();

    // ── Load or create Ed25519 device identity ────────────
    // CRITICAL FIX (v2.5.1): This was never being called!
    // Without the identity, _deviceId is empty and the
    // handshake auth payload is invalid.
    if (!_identityReady) {
        loadOrCreateIdentity();
    }

    // Build WebSocket URL path
    // The gateway WebSocket endpoint is at "/ws".
    // Confirmed via browser DevTools: ws://host:18789/ws returns 101.
    // Previously "/ws/gateway" returned HTTP 404.
    String path = "/ws";

    Serial.printf("[HoC] Connecting to %s:%d%s (device=%s)\n",
                  _config.host.c_str(), _config.port, path.c_str(),
                  _deviceId.substring(0, 8).c_str());

    // ── Clean up any previous WebSocket state ───────────────
    if (_wsStarted) {
        _ws.disconnect();
        _wsStarted = false;
        delay(100);  // Let the TCP stack fully clean up
    }

    _ws.onEvent([this](WStype_t t, uint8_t* p, size_t l) {
        this->onWsEvent(t, p, l);
    });

    // ══════════════════════════════════════════════════════════
    //  CRITICAL FIX: setReconnectInterval(5000)
    //
    //  The old code used setReconnectInterval(0) thinking it
    //  would DISABLE auto-reconnect.  But the library code is:
    //
    //    if((millis() - _lastConnectionFail) < _reconnectInterval) {
    //        return;  // skip this loop iteration
    //    }
    //
    //  With interval=0, this condition is ALWAYS false (unsigned
    //  subtraction is always >= 0), so the library tries to open
    //  a new TCP connection on EVERY SINGLE loop() call.
    //
    //  At 10ms loop interval, that's 100 TCP SYN packets/second
    //  flooding the ESP32 WiFi stack, causing the radio to reset.
    //
    //  Setting to 5000ms means the library will wait at least 5
    //  seconds between its own internal reconnect attempts.
    //  Combined with main.cpp gating (only calling gateway.loop()
    //  when WiFi is stable), this prevents the TCP flood entirely.
    // ══════════════════════════════════════════════════════════
    _ws.setReconnectInterval(5000);

    // ── WebSocket-level heartbeat (v2.7.0) ─────────────────────
    // Without this, the TCP connection silently dies behind NAT
    // routers and firewalls that drop idle connections.
    // The library sends protocol-level pings and detects missing
    // pongs, triggering a clean disconnect that main.cpp can
    // detect and recover from.
    _ws.enableHeartbeat(GW_PING_INTERVAL, GW_PONG_TIMEOUT, 2);

    if (_config.useTls) {
        _ws.beginSSL(_config.host.c_str(), _config.port, path.c_str());
    } else {
        _ws.begin(_config.host.c_str(), _config.port, path.c_str());
    }

    _wsStarted = true;
    Serial.println("[HoC] WebSocket begin() called — waiting for connection");
}

// ══════════════════════════════════════════════════════════════
//  LOOP
// ══════════════════════════════════════════════════════════════

void HoCGateway::loop() {
    // Only drive the WebSocket if it's been started.
    // Main.cpp additionally gates this: it only calls gateway.loop()
    // when WiFi state is CONNECTED.  This is defense-in-depth.
    if (!_wsStarted) return;

    // Additional safety: if WiFi dropped, don't let the library
    // try to reconnect (it would spam TCP SYN packets).
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("[HoC] loop() — WiFi down, stopping WebSocket");
        _ws.disconnect();
        _wsStarted = false;
        _state = GwState::DISCONNECTED;
        if (_cbStateChange) _cbStateChange(_state);
        if (_cbDisconnected) _cbDisconnected();
        return;
    }

    _ws.loop();

    // Periodic tick (heartbeat/keepalive)
    if (_state == GwState::CONNECTED) {
        unsigned long now = millis();
        if (now - _lastTickMs > GATEWAY_TICK_MS) {
            _lastTickMs = now;
            // Send a lightweight ping via RPC
            JsonDocument doc;
            JsonObject root = doc.to<JsonObject>();
            root["type"]   = "req";
            root["id"]     = trackRequest("ping");
            root["method"] = "ping";
            String out;
            serializeJson(doc, out);
            _ws.sendTXT(out);
        }
    }
}

void HoCGateway::disconnect() {
    Serial.println("[HoC] disconnect() called");
    if (_wsStarted) {
        _ws.disconnect();
    }
    _wsStarted = false;
    _state = GwState::DISCONNECTED;
    if (_cbStateChange) _cbStateChange(_state);
}

bool HoCGateway::isConnected() const {
    return _state == GwState::CONNECTED;
}

bool HoCGateway::isActive() const {
    return _state == GwState::CONNECTING ||
           _state == GwState::HANDSHAKE  ||
           _state == GwState::CONNECTED;
}

GwState HoCGateway::getState() const {
    return _state;
}

// ══════════════════════════════════════════════════════════════
//  WEBSOCKET EVENT HANDLER
// ══════════════════════════════════════════════════════════════

void HoCGateway::onWsEvent(WStype_t type, uint8_t* payload, size_t length) {
    switch (type) {
        case WStype_CONNECTED:
            Serial.println("[HoC] WebSocket connected — waiting for challenge");
            _state = GwState::HANDSHAKE;
            _reconnectAttempts = 0;
            _reconnectDelayMs = GATEWAY_RECONNECT_MS;
            if (_cbStateChange) _cbStateChange(_state);
            break;

        case WStype_DISCONNECTED:
            {
                const char* stName =
                    _state == GwState::DISCONNECTED ? "DISCONNECTED" :
                    _state == GwState::CONNECTING   ? "CONNECTING" :
                    _state == GwState::HANDSHAKE    ? "HANDSHAKE" :
                    _state == GwState::CONNECTED    ? "CONNECTED" :
                    _state == GwState::RECONNECTING ? "RECONNECTING" : "?";
                Serial.printf("[HoC] WebSocket disconnected (was %s, heap=%u)\n",
                              stName, ESP.getFreeHeap());
                if (payload && length > 0) {
                    // The library may pass the close reason in the payload
                    Serial.printf("[HoC] Close payload (%d bytes): %.*s\n",
                                  (int)length, (int)min(length, (size_t)128), payload);
                }
                bool wasConnected = (_state == GwState::CONNECTED);
                _wsStarted = false;
                _state = GwState::DISCONNECTED;
                if (_cbStateChange) _cbStateChange(_state);
                if (wasConnected && _cbDisconnected) _cbDisconnected();
            }
            // NOTE: We do NOT schedule reconnect here.
            // Main.cpp will detect that gatewayStarted is false
            // (set by the onDisconnected callback) and WiFi is
            // still stable, then call connectGateway() again.
            // This prevents the old reconnect-within-reconnect
            // feedback loop.
            break;

        case WStype_TEXT:
            Serial.printf("[HoC] ← TEXT frame (%d bytes, heap=%u)\n",
                          (int)length, ESP.getFreeHeap());
            if (length < 512) {
                // Log small messages fully for diagnostics
                Serial.printf("[HoC] ← %.*s\n", (int)length, payload);
            } else {
                // Log just the start for large messages
                Serial.printf("[HoC] ← %.200s...\n", payload);
            }
            handleMessage((const char*)payload, length);
            break;

        case WStype_ERROR:
            Serial.printf("[HoC] WebSocket error: %s\n",
                          payload ? (const char*)payload : "unknown");
            break;

        case WStype_PING:
            break;
        case WStype_PONG:
            break;

        default:
            break;
    }
}

// ══════════════════════════════════════════════════════════════
//  MESSAGE ROUTER
// ══════════════════════════════════════════════════════════════

void HoCGateway::handleMessage(const char* json, size_t len) {
    if (len > 32768) {
        Serial.printf("[HoC] WARNING: Large message (%d bytes, heap=%u)\n",
                      (int)len, ESP.getFreeHeap());
    }
    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, json, len);
    if (err) {
        Serial.printf("[HoC] JSON parse error: %s (msg=%d bytes, heap=%u)\n",
                      err.c_str(), (int)len, ESP.getFreeHeap());
        return;
    }

    JsonObject msg = doc.as<JsonObject>();
    const char* type = msg["type"] | "";

    if (strcmp(type, "event") == 0) {
        handleEvent(msg);
    } else if (strcmp(type, "res") == 0) {
        handleResponse(msg);
    } else {
        Serial.printf("[HoC] Unknown message type: %s\n", type);
    }
}

// ══════════════════════════════════════════════════════════════
//  EVENT HANDLER
// ══════════════════════════════════════════════════════════════

void HoCGateway::handleEvent(const JsonObject& msg) {
    const char* event = msg["event"] | "";

    // ── Connect challenge ──────────────────────────────────
    if (strcmp(event, "connect.challenge") == 0) {
        String nonce = msg["payload"]["nonce"] | "";
        Serial.printf("[HoC] Got challenge nonce: %s\n", nonce.c_str());
        sendHandshake(nonce);
        return;
    }

    // ── Chat stream events ─────────────────────────────────
    // The gateway sends event="chat" with payload.state = "delta"|"final"|"error"
    // Also handle legacy names chat.stream/chat.done/chat.error for compat.
    if (strcmp(event, "chat") == 0 ||
        strcmp(event, "chat.stream") == 0 ||
        strcmp(event, "chat.message") == 0 ||
        strcmp(event, "chat.done") == 0 ||
        strcmp(event, "chat.error") == 0) {

        JsonObject p = msg["payload"];
        GwChatChunk chunk;
        chunk.sessionKey = p["sessionKey"] | "";
        chunk.runId      = p["runId"] | "";
        chunk.model      = p["model"] | "";

        // Determine chunk type from event name or payload.state
        const char* state = p["state"] | "";
        bool isFinal = (strcmp(event, "chat.done") == 0 || strcmp(state, "final") == 0);
        bool isError = (strcmp(event, "chat.error") == 0 || strcmp(state, "error") == 0);
        bool isDelta = (strcmp(event, "chat.stream") == 0 || strcmp(state, "delta") == 0);

        if (isFinal || isDelta) {
            chunk.type = isFinal ? "done" : "text";
            chunk.isStreaming = isDelta;
            // Extract text from message.content[0].text (same structure for delta & final)
            JsonObject msg_obj = p["message"];
            if (!msg_obj.isNull()) {
                JsonArray content_arr = msg_obj["content"];
                if (content_arr.size() > 0) {
                    chunk.content = content_arr[0]["text"] | "";
                }
            }
        } else if (isError) {
            chunk.type = "error";
            chunk.content = p["errorMessage"] | p["error"]["message"] | p["message"] | "Chat error";
            chunk.isStreaming = false;
        } else {
            // Unknown state — treat as streaming delta with same extraction
            chunk.type = "text";
            chunk.isStreaming = true;
            JsonObject msg_obj = p["message"];
            if (!msg_obj.isNull()) {
                JsonArray content_arr = msg_obj["content"];
                if (content_arr.size() > 0) {
                    chunk.content = content_arr[0]["text"] | "";
                }
            }
        }

        if (_cbChat) _cbChat(chunk);
        return;
    }

    // ── Session events ─────────────────────────────────────
    if (strcmp(event, "session.created") == 0 ||
        strcmp(event, "session.updated") == 0) {
        // Refresh sessions list
        requestSessions();
        return;
    }

    // ── Republic tick ──────────────────────────────────────
    if (strcmp(event, "republic.tick") == 0) {
        return;
    }

    Serial.printf("[HoC] Unhandled event: %s\n", event);
}

// ══════════════════════════════════════════════════════════════
//  RESPONSE HANDLER
// ══════════════════════════════════════════════════════════════

void HoCGateway::handleResponse(const JsonObject& msg) {
    bool ok = msg["ok"] | false;
    const char* id = msg["id"] | "";
    JsonObject payload = msg["payload"];

    // Gateway responses do NOT include a "method" field.
    // Look up the method by request ID from our pending map.
    String method;
    auto it = _pendingRequests.find(String(id));
    if (it != _pendingRequests.end()) {
        method = it->second;
        _pendingRequests.erase(it);
    } else {
        Serial.printf("[HoC] Response for unknown id: %s (ok=%d)\n", id, ok);
        // Fall through to generic error handling
    }

    Serial.printf("[HoC] Response: id=%s method=%s ok=%d\n", id, method.c_str(), ok);

    // ── Connect response ──────────────────────────────────
    if (method == "connect") {
        if (ok) {
            _state = GwState::CONNECTED;
            if (_cbStateChange) _cbStateChange(_state);

            // Save device token if provided (gateway puts it in payload.auth.deviceToken)
            JsonObject authResp = payload["auth"];
            String dt = authResp["deviceToken"] | "";
            if (dt.length() > 0) {
                _deviceToken = dt;
                Preferences p;
                p.begin(NVS_NAMESPACE, false);
                p.putString(NVS_KEY_DEVICE_TOKEN, dt);
                p.end();
                Serial.printf("[HoC] Device token saved: %s...\n", dt.substring(0, 16).c_str());
            }

            // Log server info from hello-ok payload
            const char* serverVer = payload["server"]["version"] | "?";
            const char* connId = payload["server"]["connId"] | "?";
            int proto = payload["protocol"] | 0;
            Serial.printf("[HoC] ✓ Connected to Republic Gateway (server=%s proto=%d conn=%s)\n",
                          serverVer, proto, connId);
            if (_cbConnected) _cbConnected();
        } else {
            const char* errMsg = msg["error"]["message"] | "Connect failed";
            Serial.printf("[HoC] Connect rejected: %s\n", errMsg);
            if (_cbError) _cbError(String(errMsg));
        }
        return;
    }

    // ── Health response ───────────────────────────────────
    if (method == "health" && ok) {
        _health.valid = true;
        _health.cpuPercent    = payload["cpu"]["percent"] | 0.0f;
        _health.memUsedMB     = payload["memory"]["usedMB"] | 0;
        _health.memTotalMB    = payload["memory"]["totalMB"] | 0;
        _health.uptimeSec     = payload["uptime"] | 0;
        _health.activeClients = payload["clients"]["active"] | 0;
        _health.activeSessions = payload["sessions"]["active"] | 0;
        _health.serverVersion = payload["version"] | "?";
        if (_cbHealth) _cbHealth(_health);
        return;
    }

    // ── Sessions response ─────────────────────────────────
    if (method == "sessions.list" && ok) {
        _sessions.clear();
        JsonArray arr = payload["sessions"].as<JsonArray>();
        for (JsonObject s : arr) {
            GwSessionInfo info;
            info.key          = s["key"] | "";
            info.title        = s["title"] | "Untitled";
            info.model        = s["model"] | "";
            info.messageCount = s["messageCount"] | 0;
            _sessions.push_back(info);
        }
        if (_cbSessions) _cbSessions(_sessions);
        return;
    }

    // ── Session create response ───────────────────────────
    if (method == "sessions.create" && ok) {
        String key   = payload["key"] | "";
        String title = payload["title"] | "New Session";
        if (_cbSessionCreated) _cbSessionCreated(key, title);
        return;
    }

    // ── Republic overview response ────────────────────────
    if (method == "republic.overview" && ok) {
        _republic.valid = true;

        JsonObject pop = payload["population"];
        _republic.populationTotal      = pop["total"] | 0;
        _republic.populationActive     = pop["active"] | 0;
        _republic.populationHibernated = pop["hibernated"] | 0;
        _republic.avgHappiness         = pop["avgHappiness"] | 0.0f;
        _republic.avgHealth            = pop["avgHealth"] | 0.0f;
        _republic.avgCredits           = pop["avgCredits"] | 0.0f;

        _republic.topSpecializations.clear();
        JsonArray specs = payload["topSpecializations"].as<JsonArray>();
        for (JsonObject sp : specs) {
            RepublicBarItem item;
            item.label = sp["name"] | sp["label"] | "";
            item.value = sp["count"] | sp["value"] | 0;
            _republic.topSpecializations.push_back(item);
        }

        _republic.topActivities.clear();
        JsonArray acts = payload["topActivities"].as<JsonArray>();
        for (JsonObject ac : acts) {
            RepublicBarItem item;
            item.label = ac["name"] | ac["label"] | "";
            item.value = ac["count"] | ac["value"] | 0;
            _republic.topActivities.push_back(item);
        }

        JsonObject econ = payload["economy"];
        _republic.treasuryUSD     = econ["treasuryUSD"] | 0.0f;
        _republic.treasuryBTC     = econ["treasuryBTC"] | 0.0f;
        _republic.treasuryETH     = econ["treasuryETH"] | 0.0f;
        _republic.treasuryCredits = econ["treasuryCredits"] | 0.0f;

        JsonObject gov = payload["government"];
        _republic.presidentName = gov["president"] | "None";
        _republic.activeBills   = gov["activeBills"] | 0;

        JsonObject sim = payload["simulation"];
        _republic.simRunning = sim["running"] | false;
        _republic.simTick    = sim["tick"] | 0;
        _republic.simSpeed   = sim["speed"] | "paused";

        _republic.recentEvents.clear();
        JsonArray events = payload["recentEvents"].as<JsonArray>();
        for (JsonVariant ev : events) {
            _republic.recentEvents.push_back(ev.as<String>());
        }

        if (_cbRepublic) _cbRepublic(_republic);
        return;
    }

    // ── Voice transcription response ──────────────────────
    if (method == "voice.transcribe") {
        if (ok) {
            String text = payload["text"] | "";
            if (_cbTranscript) _cbTranscript(text);
        } else {
            const char* errMsg = msg["error"]["message"] | "Transcription failed";
            if (_cbError) _cbError(String(errMsg));
        }
        return;
    }

    // ── Ping response ─────────────────────────────────────
    if (method == "ping") {
        return;
    }

    // ── Status response ────────────────────────────────────
    if (payload["status"].is<const char*>() || payload["state"].is<const char*>()) {
        if (_cbStatus) _cbStatus(payload);
        return;
    }

    // ── Generic error ──────────────────────────────────────
    if (!ok) {
        const char* errMsg = msg["error"]["message"] | "Unknown error";
        Serial.printf("[HoC] RPC error: %s\n", errMsg);
        if (_cbError) _cbError(String(errMsg));
    }
}

// ══════════════════════════════════════════════════════════════
//  HANDSHAKE — Full OpenClaw Protocol v3 connect (v2.6.3)
//
//  From the OpenClaw gateway source (frames.ts ConnectParamsSchema):
//
//  params: {
//    minProtocol, maxProtocol,
//    client: { id, displayName?, version, platform, mode },
//    auth?: { token?, password? },            ← ONLY token/password
//    device?: { id, publicKey, signature, signedAt, nonce? },
//    role?, scopes?                           ← siblings of auth
//  }
//
//  Valid client modes (GatewayClientModeSchema):
//    webchat, cli, ui, backend, node, probe, test
//  "companion" is NOT valid — causes schema validation failure.
//
//  Auth flow (gateway message-handler.ts):
//    1. authorizeGatewayConnect checks shared auth (token or password)
//    2. If shared auth fails AND device block present:
//       → verifyDeviceToken fallback (device-token auth)
//    3. If authOk=true AND no device → connection accepted (no pairing)
//    4. If authOk=true AND device present → pairing check
//    5. If authOk=false AND no device → rejected
//
//  CRITICAL INSIGHT (v2.6.3):
//    When shared auth succeeds (sharedAuthOk=true) and NO device
//    block is sent, the gateway skips pairing entirely:
//      canSkipDevice = sharedAuthOk = true → skip device check
//    But when a device block IS sent, the gateway ALWAYS checks
//    pairing (unless allowControlUiBypass), and auto-approval only
//    works for loopback connections (127.0.0.1), NOT LAN clients.
//
//  v2.6.1: Omitted device block + token → silent disconnect
//          (worked in token mode but ESP32 didn't receive response)
//  v2.6.2: Always sent device block + token → "pairing required"
//          (token auth succeeded but pairing blocked non-loopback)
//  v2.6.3: Smart strategy:
//    - If shared token configured → OMIT device block (skip pairing)
//    - Send token as BOTH auth.token AND auth.password (handles
//      either gateway mode)
//    - If no shared token → send device block for device-token auth
//
//  Auth payload format (v2 with nonce):
//    v2|deviceId|clientId|clientMode|role|scopes|signedAtMs|token|nonce
// ══════════════════════════════════════════════════════════════

void HoCGateway::sendHandshake(const String& nonce) {
    Serial.printf("[HoC] Building connect request (nonce=%s, heap=%u)\n",
                  nonce.c_str(), ESP.getFreeHeap());

    const bool hasSharedToken = _config.token.length() > 0;

    // ── Build JSON request ─────────────────────────────
    JsonDocument doc;
    JsonObject root = doc.to<JsonObject>();

    // Frame envelope
    root["type"]   = "req";
    root["id"]     = trackRequest("connect");
    root["method"] = "connect";

    // Params
    JsonObject params = root["params"].to<JsonObject>();
    params["minProtocol"] = GATEWAY_PROTOCOL_VER;  // 3
    params["maxProtocol"] = GATEWAY_PROTOCOL_VER;  // 3

    // Client identification
    JsonObject client = params["client"].to<JsonObject>();
    client["id"]          = DEVICE_CLIENT_ID;   // "gateway-client"
    client["displayName"] = "M5StickC Plus2";
    client["version"]     = HOC_VERSION;
    client["platform"]    = DEVICE_PLATFORM;    // "esp32"
    client["mode"]        = DEVICE_MODE;        // "backend"

    // ── Auth block ───────────────────────────────────
    // Gateway schema: { token?: string, password?: string }
    // additionalProperties: false — ONLY token and password allowed.
    //
    // We don't know if the gateway is in token mode or password mode,
    // so send the shared secret as BOTH auth.token AND auth.password.
    // The gateway checks whichever field matches its configured mode.
    JsonObject auth = params["auth"].to<JsonObject>();
    if (hasSharedToken) {
        auth["token"]    = _config.token;
        auth["password"] = _config.token;
        Serial.println("[HoC] Auth: shared token sent as both token+password");
    } else if (_deviceToken.length() > 0) {
        auth["token"] = _deviceToken;
        Serial.println("[HoC] Auth: using cached device token");
    }

    // ── Device identity — CONDITIONAL (v2.6.3 smart strategy) ──
    //
    // When a shared token is configured, OMIT the device block.
    // Gateway flow without device block:
    //   sharedAuthOk = true (token or password matches)
    //   canSkipDevice = sharedAuthOk = true
    //   → skips pairing entirely → connection accepted
    //
    // When NO shared token is configured, send the device block
    // for device-token auth (verifyDeviceToken fallback).
    if (!hasSharedToken && _identityReady) {
        struct timeval tv;
        gettimeofday(&tv, nullptr);
        unsigned long long signedAtMs =
            (unsigned long long)tv.tv_sec * 1000ULL +
            (unsigned long long)(tv.tv_usec / 1000);
        String authPayload = buildAuthPayload(nonce, signedAtMs);
        String signature   = signPayload(authPayload);
        Serial.printf("[HoC] Auth payload: %s\n", authPayload.c_str());
        Serial.printf("[HoC] Signature: %s\n", signature.c_str());

        JsonObject device = params["device"].to<JsonObject>();
        device["id"]        = _deviceId;
        device["publicKey"] = _publicKeyB64Url;
        device["signature"] = signature;
        device["signedAt"]  = signedAtMs;
        if (nonce.length() > 0) {
            device["nonce"] = nonce;
        }
        Serial.println("[HoC] Device identity included (no shared token)");
    } else if (hasSharedToken) {
        Serial.println("[HoC] Device identity OMITTED (shared token → skip pairing)");
    } else {
        Serial.println("[HoC] WARNING: no shared token and identity not ready");
    }

    // Role = "node" so the gateway registers us in the node registry.
    // Without this, the device connects OK but is invisible to node.list,
    // node.invoke, remote skills, and cluster management.
    params["role"] = "node";

    // Serialize and send
    String output;
    serializeJson(doc, output);

    Serial.printf("[HoC] Sending connect (%d bytes, heap=%u):\n",
                  (int)output.length(), ESP.getFreeHeap());
    Serial.println(output);

    bool sent = _ws.sendTXT(output);
    Serial.printf("[HoC] Connect request sent=%d — awaiting response (heap=%u)\n",
                  sent, ESP.getFreeHeap());
}

// ══════════════════════════════════════════════════════════════
//  RPC METHODS
// ══════════════════════════════════════════════════════════════

void HoCGateway::sendChat(const String& sessionKey, const String& text) {
    if (_state != GwState::CONNECTED) return;

    JsonDocument doc;
    JsonObject root = doc.to<JsonObject>();
    root["type"]   = "req";
    root["id"]     = trackRequest("chat.send");
    root["method"] = "chat.send";

    JsonObject params = root["params"].to<JsonObject>();
    params["sessionKey"] = sessionKey;
    params["message"] = text;

    char idempKey[32];
    snprintf(idempKey, sizeof(idempKey), "m5-%lu", millis());
    params["idempotencyKey"] = idempKey;

    String output;
    serializeJson(doc, output);
    _ws.sendTXT(output);
    Serial.printf("[HoC] Chat sent to %s\n", sessionKey.c_str());
}

void HoCGateway::abortChat(const String& sessionKey) {
    if (_state != GwState::CONNECTED) return;

    JsonDocument doc;
    JsonObject root = doc.to<JsonObject>();
    root["type"]   = "req";
    root["id"]     = trackRequest("chat.abort");
    root["method"] = "chat.abort";
    JsonObject params = root["params"].to<JsonObject>();
    params["sessionKey"] = sessionKey;

    String output;
    serializeJson(doc, output);
    _ws.sendTXT(output);
}

void HoCGateway::requestHealth() {
    if (_state != GwState::CONNECTED) return;

    JsonDocument doc;
    JsonObject root = doc.to<JsonObject>();
    root["type"]   = "req";
    root["id"]     = trackRequest("health");
    root["method"] = "health";

    String output;
    serializeJson(doc, output);
    _ws.sendTXT(output);
}

void HoCGateway::requestStatus() {
    if (_state != GwState::CONNECTED) return;

    JsonDocument doc;
    JsonObject root = doc.to<JsonObject>();
    root["type"]   = "req";
    root["id"]     = trackRequest("status");
    root["method"] = "status";

    String output;
    serializeJson(doc, output);
    _ws.sendTXT(output);
}

void HoCGateway::requestSessions() {
    if (_state != GwState::CONNECTED) return;

    JsonDocument doc;
    JsonObject root = doc.to<JsonObject>();
    root["type"]   = "req";
    root["id"]     = trackRequest("sessions.list");
    root["method"] = "sessions.list";
    JsonObject params = root["params"].to<JsonObject>();
    params["includeGlobal"] = true;
    params["limit"] = 20;

    String output;
    serializeJson(doc, output);
    _ws.sendTXT(output);
}

void HoCGateway::createSession(const String& title) {
    if (_state != GwState::CONNECTED) return;

    JsonDocument doc;
    JsonObject root = doc.to<JsonObject>();
    root["type"]   = "req";
    root["id"]     = trackRequest("sessions.create");
    root["method"] = "sessions.create";
    JsonObject params = root["params"].to<JsonObject>();
    params["title"] = title;

    String output;
    serializeJson(doc, output);
    _ws.sendTXT(output);
    Serial.printf("[HoC] Creating session: %s\n", title.c_str());
}

void HoCGateway::requestRepublicOverview() {
    if (_state != GwState::CONNECTED) return;

    JsonDocument doc;
    JsonObject root = doc.to<JsonObject>();
    root["type"]   = "req";
    root["id"]     = trackRequest("republic.overview");
    root["method"] = "republic.overview";

    String output;
    serializeJson(doc, output);
    _ws.sendTXT(output);
    Serial.println("[HoC] Requesting Republic overview");
}

void HoCGateway::sendVoiceAudio(const uint8_t* wavData, size_t wavLen,
                                 const String& sessionKey) {
    if (_state != GwState::CONNECTED) return;

    String b64 = base64UrlEncode(wavData, wavLen);

    JsonDocument doc;
    JsonObject root = doc.to<JsonObject>();
    root["type"]   = "req";
    root["id"]     = trackRequest("voice.transcribe");
    root["method"] = "voice.transcribe";

    JsonObject params = root["params"].to<JsonObject>();
    params["audio"]      = b64;
    params["format"]     = "wav";
    params["sampleRate"] = MIC_SAMPLE_RATE;
    params["encoding"]   = "pcm16";
    if (sessionKey.length() > 0) {
        params["sessionKey"] = sessionKey;
        params["autoSend"]   = true;
    }

    String output;
    serializeJson(doc, output);
    _ws.sendTXT(output);
    Serial.printf("[HoC] Voice audio sent (%d bytes WAV, %d bytes b64)\n",
                  (int)wavLen, (int)b64.length());
}

// ══════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════

String HoCGateway::nextId() {
    _requestCounter++;
    char buf[16];
    snprintf(buf, sizeof(buf), "m5-%u", _requestCounter);
    return String(buf);
}

String HoCGateway::trackRequest(const String& method) {
    String id = nextId();
    _pendingRequests[id] = method;
    // Limit map size to prevent memory leak (keep last 20)
    while (_pendingRequests.size() > 20) {
        _pendingRequests.erase(_pendingRequests.begin());
    }
    return id;
}

void HoCGateway::scheduleReconnect() {
    // NOTE: This method is kept for API compatibility but is
    // no longer called in v2.5.0.  Reconnection is now handled
    // entirely by main.cpp's WiFi state machine, which detects
    // that gatewayStarted==false and calls connectGateway().
    _reconnectDelayMs = min(
        (unsigned long)(GATEWAY_RECONNECT_MS * (1 << min(_reconnectAttempts, 4))),
        (unsigned long)GATEWAY_MAX_RECONNECT_MS
    );
    _lastReconnectMs = millis();
    _state = GwState::RECONNECTING;
    Serial.printf("[HoC] scheduleReconnect() called — %lums (attempt #%d)\n",
                  _reconnectDelayMs, _reconnectAttempts + 1);
    if (_cbStateChange) _cbStateChange(_state);
}

// ══════════════════════════════════════════════════════════════
//  Ed25519 IDENTITY
// ══════════════════════════════════════════════════════════════

void HoCGateway::loadOrCreateIdentity() {
    Preferences idPrefs;
    idPrefs.begin("hoc_id", false);

    size_t privLen = idPrefs.getBytesLength("priv");
    size_t pubLen  = idPrefs.getBytesLength("pub");

    if (privLen == 32 && pubLen == 32) {
        idPrefs.getBytes("priv", _privateKey, 32);
        idPrefs.getBytes("pub",  _publicKey,  32);
        Serial.println("[HoC] Loaded existing Ed25519 identity");
    } else {
        Serial.println("[HoC] Generating new Ed25519 keypair...");
        Ed25519::generatePrivateKey(_privateKey);
        Ed25519::derivePublicKey(_publicKey, _privateKey);
        idPrefs.putBytes("priv", _privateKey, 32);
        idPrefs.putBytes("pub",  _publicKey,  32);
        Serial.println("[HoC] New keypair saved to NVS");
    }
    idPrefs.end();

    _deviceId       = sha256Hex(_publicKey, 32);
    _publicKeyB64Url = base64UrlEncode(_publicKey, 32);
    _identityReady  = true;

    Serial.printf("[HoC] Device ID: %s\n", _deviceId.c_str());
    Serial.printf("[HoC] Public Key: %s\n", _publicKeyB64Url.c_str());
}

void HoCGateway::saveIdentity() {
    Preferences idPrefs;
    idPrefs.begin("hoc_id", false);
    idPrefs.putBytes("priv", _privateKey, 32);
    idPrefs.putBytes("pub",  _publicKey,  32);
    idPrefs.end();
}

String HoCGateway::sha256Hex(const uint8_t* data, size_t len) {
    SHA256 sha;
    sha.update(data, len);
    uint8_t hash[32];
    sha.finalize(hash, 32);

    char hex[65];
    for (int i = 0; i < 32; i++) {
        sprintf(hex + i * 2, "%02x", hash[i]);
    }
    hex[64] = '\0';
    return String(hex);
}

String HoCGateway::base64UrlEncode(const uint8_t* data, size_t len) {
    static const char table[] =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

    String result;
    result.reserve((len * 4 / 3) + 4);

    for (size_t i = 0; i < len; i += 3) {
        uint32_t n = ((uint32_t)data[i]) << 16;
        if (i + 1 < len) n |= ((uint32_t)data[i + 1]) << 8;
        if (i + 2 < len) n |= ((uint32_t)data[i + 2]);

        result += table[(n >> 18) & 0x3F];
        result += table[(n >> 12) & 0x3F];
        if (i + 1 < len) result += table[(n >> 6) & 0x3F];
        if (i + 2 < len) result += table[n & 0x3F];
    }

    return result;
}

String HoCGateway::buildAuthPayload(const String& nonce,
                                     unsigned long long signedAtMs) {
    String scopes = "";  // Nodes don't request admin scopes
    char tsBuf[24];
    snprintf(tsBuf, sizeof(tsBuf), "%llu", signedAtMs);

    String payload = "v2|";
    payload += _deviceId;
    payload += "|";
    payload += DEVICE_CLIENT_ID;
    payload += "|";
    payload += DEVICE_MODE;
    payload += "|node|";
    payload += scopes;
    payload += "|";
    payload += tsBuf;
    payload += "|";
    payload += (_config.token.length() > 0) ? _config.token :
               (_deviceToken.length() > 0 ? _deviceToken : "");
    payload += "|";
    payload += nonce;

    return payload;
}

String HoCGateway::signPayload(const String& payload) {
    uint8_t sig[64];
    Ed25519::sign(sig, _privateKey, _publicKey,
                  (const uint8_t*)payload.c_str(), payload.length());
    return base64UrlEncode(sig, 64);
}
