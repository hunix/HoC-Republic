// ══════════════════════════════════════════════════════════════
//  WebSocket Library Configuration Override
//
//  The arduinoWebSockets library defines WEBSOCKETS_MAX_DATA_SIZE
//  as 15KB for ESP32.  The OpenClaw gateway's hello-ok response
//  includes a full snapshot (presence, health, sessions, features)
//  that can easily exceed 15KB on a busy system.
//
//  When the incoming frame exceeds this limit, the library calls
//  clientDisconnect(client, 1009) — silently dropping the
//  connection before the application layer sees the response.
//
//  This header is force-included via -include in platformio.ini
//  build_flags, BEFORE WebSockets.h is processed.  We pre-define
//  WEBSOCKETS_MAX_DATA_SIZE so the library's #define is skipped
//  (if it has an #ifndef guard) or we #undef it after inclusion.
//
//  Since the library does NOT use #ifndef, we rely on the
//  build_src_flags approach: this header is included first,
//  and we use a GCC pragma to suppress the redefinition warning.
// ══════════════════════════════════════════════════════════════
#ifndef WS_CONFIG_H
#define WS_CONFIG_H

// 64KB max incoming WebSocket payload — enough for large hello-ok
// responses.  ESP32 has ~160KB free heap at connect time, so 64KB
// is safe with room to spare.
#define WEBSOCKETS_MAX_DATA_SIZE (64 * 1024)

#endif // WS_CONFIG_H
