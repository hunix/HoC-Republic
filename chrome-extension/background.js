/**
 * HoC Companion — Background Service Worker
 *
 * Manages the WebSocket connection to the HoC gateway,
 * screenshot capture via chrome.tabs API, capture history,
 * and message routing between content scripts and the popup.
 */

// ─── State ────────────────────────────────────────────────────
let ws = null;
let wsConnected = false;
let pendingRequests = new Map();
let reconnectTimer = null;
let backoffMs = 1000;
let gatewayUrl = "ws://localhost:18789";
let authToken = "";
let sessionKey = "";
let captureHistory = [];
let lastError = null;
let deviceIdentity = null; // { deviceId, publicKeyB64Url, privateKey (CryptoKey) }
const MAX_HISTORY = 20;

// ─── Relay State (PWA Bridge via Supabase) ────────────────────
let relayEnabled = false;
let supabaseUrl = "";
let supabaseAnonKey = "";
let supabaseAccessToken = "";
// oxlint-disable-next-line no-unused-vars
let relayChannel = null;
let relayHeartbeatTimer = null;
let relayConnected = false;
// oxlint-disable-next-line no-unused-vars
let relayMessageQueue = [];
let relayStats = { sent: 0, received: 0, lastActivity: null };

// ─── Device Identity (Ed25519 via Web Crypto) ─────────────────

function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

function base64UrlEncode(bytes) {
  let binary = "";
  for (const b of bytes) {binary += String.fromCharCode(b);}
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function base64UrlDecode(input) {
  const normalized = input.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {out[i] = binary.charCodeAt(i);}
  return out;
}

async function deriveDeviceId(publicKeyRaw) {
  const hash = await crypto.subtle.digest("SHA-256", publicKeyRaw);
  return bytesToHex(new Uint8Array(hash));
}

async function generateDeviceIdentity() {
  const keyPair = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
  const rawPub = await crypto.subtle.exportKey("raw", keyPair.publicKey);
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
  const publicKeyRaw = new Uint8Array(rawPub);
  const deviceId = await deriveDeviceId(publicKeyRaw);
  return {
    deviceId,
    publicKeyB64Url: base64UrlEncode(publicKeyRaw),
    privateKeyPkcs8B64: base64UrlEncode(new Uint8Array(pkcs8)),
    privateKey: keyPair.privateKey,
  };
}

async function loadOrCreateDeviceIdentity() {
  try {
    const stored = await chrome.storage.local.get(["deviceIdentity"]);
    if (stored.deviceIdentity) {
      const d = stored.deviceIdentity;
      if (d.deviceId && d.publicKeyB64Url && d.privateKeyPkcs8B64) {
        // Re-import the private key
        const pkcs8 = base64UrlDecode(d.privateKeyPkcs8B64);
        const privateKey = await crypto.subtle.importKey(
          "pkcs8", pkcs8.buffer, "Ed25519", false, ["sign"]
        );
        // Verify device ID matches
        const pubRaw = base64UrlDecode(d.publicKeyB64Url);
        const derivedId = await deriveDeviceId(pubRaw.buffer);
        if (derivedId === d.deviceId) {
          return { deviceId: d.deviceId, publicKeyB64Url: d.publicKeyB64Url, privateKey };
        }
      }
    }
  } catch (e) {
    console.warn("[HoC] Failed to load device identity, regenerating:", e);
  }
  const identity = await generateDeviceIdentity();
  await chrome.storage.local.set({
    deviceIdentity: {
      deviceId: identity.deviceId,
      publicKeyB64Url: identity.publicKeyB64Url,
      privateKeyPkcs8B64: identity.privateKeyPkcs8B64,
    },
  });
  return { deviceId: identity.deviceId, publicKeyB64Url: identity.publicKeyB64Url, privateKey: identity.privateKey };
}

function buildDeviceAuthPayload({ deviceId, clientId, clientMode, role, scopes, signedAtMs, token }) {
  return ["v1", deviceId, clientId, clientMode, role, scopes.join(","), String(signedAtMs), token || ""].join("|");
}

async function signPayload(privateKey, payload) {
  const data = new TextEncoder().encode(payload);
  const sig = await crypto.subtle.sign("Ed25519", privateKey, data);
  return base64UrlEncode(new Uint8Array(sig));
}

// ─── Init ─────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(
    ["gatewayUrl", "authToken", "sessionKey"],
    async (cfg) => {
      if (cfg.gatewayUrl) {gatewayUrl = cfg.gatewayUrl;}
      if (cfg.authToken) {authToken = cfg.authToken;}
      if (cfg.sessionKey) {sessionKey = cfg.sessionKey;}
      // Load relay settings
      const relayCfg = await chrome.storage.sync.get(["relayEnabled", "supabaseUrl", "supabaseAnonKey"]);
      if (relayCfg.relayEnabled) {relayEnabled = relayCfg.relayEnabled;}
      if (relayCfg.supabaseUrl) {supabaseUrl = relayCfg.supabaseUrl;}
      if (relayCfg.supabaseAnonKey) {supabaseAnonKey = relayCfg.supabaseAnonKey;}
      try {
        deviceIdentity = await loadOrCreateDeviceIdentity();
        console.log("[HoC] Device identity ready:", deviceIdentity.deviceId.slice(0, 12) + "…");
      } catch (e) {
        console.warn("[HoC] Device identity init failed:", e);
      }
      connectGateway();
      // Start relay if enabled
      if (relayEnabled && supabaseUrl && supabaseAnonKey) {
        connectRelay();
      }
    }
  );
  // Load capture history
  chrome.storage.local.get(["captureHistory"], (d) => {
    if (d.captureHistory) {captureHistory = d.captureHistory;}
  });
});

// Also connect on startup (service worker restarts)
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.sync.get(
    ["gatewayUrl", "authToken", "sessionKey"],
    async (cfg) => {
      if (cfg.gatewayUrl) {gatewayUrl = cfg.gatewayUrl;}
      if (cfg.authToken) {authToken = cfg.authToken;}
      if (cfg.sessionKey) {sessionKey = cfg.sessionKey;}
      const relayCfg = await chrome.storage.sync.get(["relayEnabled", "supabaseUrl", "supabaseAnonKey"]);
      if (relayCfg.relayEnabled) {relayEnabled = relayCfg.relayEnabled;}
      if (relayCfg.supabaseUrl) {supabaseUrl = relayCfg.supabaseUrl;}
      if (relayCfg.supabaseAnonKey) {supabaseAnonKey = relayCfg.supabaseAnonKey;}
      try {
        deviceIdentity = await loadOrCreateDeviceIdentity();
      } catch (e) {
        console.warn("[HoC] Device identity init failed:", e);
      }
      connectGateway();
      if (relayEnabled && supabaseUrl && supabaseAnonKey) {
        connectRelay();
      }
    }
  );
  chrome.storage.local.get(["captureHistory"], (d) => {
    if (d.captureHistory) {captureHistory = d.captureHistory;}
  });
});

// ─── Gateway WebSocket ────────────────────────────────────────
function generateId() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function connectGateway() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  try {
    ws = new WebSocket(gatewayUrl);
  } catch (e) {
    console.warn("[HoC] WebSocket creation failed:", e.message);
    scheduleReconnect();
    return;
  }

  // oxlint-disable-next-line prefer-add-event-listener
  ws.onopen = () => {
    console.log("[HoC] WebSocket connected to", gatewayUrl);
    backoffMs = 1000;
    // Don't send connect immediately — wait for gateway's connect.challenge event
  };

  // oxlint-disable-next-line prefer-add-event-listener
  ws.onmessage = (evt) => {
    try {
      const frame = JSON.parse(evt.data);
      // Handle connect.challenge — gateway sends this immediately on open
      if (frame.type === "event" && frame.event === "connect.challenge") {
        console.log("[HoC] Got connect challenge, sending connect frame");
        sendConnectFrame();
        return;
      }
      handleMessage(frame);
    } catch (e) {
      console.warn("[HoC] Failed to parse message:", e);
    }
  };

  // oxlint-disable-next-line prefer-add-event-listener
  ws.onclose = (evt) => {
    console.log("[HoC] WebSocket closed:", evt.code, evt.reason);
    wsConnected = false;
    ws = null;
    broadcastStatus();
    scheduleReconnect();
  };

  // oxlint-disable-next-line prefer-add-event-listener
  ws.onerror = () => {
    // onclose will fire after this
  };
}

function scheduleReconnect() {
  if (reconnectTimer) {return;}
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    backoffMs = Math.min(backoffMs * 1.5, 30000);
    connectGateway();
  }, backoffMs);
}

async function sendConnectFrame() {
  const auth = authToken ? { token: authToken } : undefined;
  const role = "operator";
  const scopes = ["operator.admin"];
  const clientId = "chrome-extension";
  const clientMode = "companion";
  const signedAtMs = Date.now();

  // Build device identity block for gateway auth
  let device = undefined;
  if (deviceIdentity) {
    try {
      const payload = buildDeviceAuthPayload({
        deviceId: deviceIdentity.deviceId,
        clientId,
        clientMode,
        role,
        scopes,
        signedAtMs,
        token: authToken || null,
      });
      const signature = await signPayload(deviceIdentity.privateKey, payload);
      device = {
        id: deviceIdentity.deviceId,
        publicKey: deviceIdentity.publicKeyB64Url,
        signature,
        signedAt: signedAtMs,
      };
    } catch (e) {
      console.warn("[HoC] Device signing failed:", e);
    }
  }

  const params = {
    minProtocol: 3,
    maxProtocol: 3,
    client: {
      id: clientId,
      version: "1.0.0",
      platform: navigator.userAgent.includes("Windows") ? "windows" : "web",
      mode: clientMode,
    },
    role,
    scopes,
    caps: [],
    auth,
    device,
    userAgent: navigator.userAgent,
    locale: navigator.language,
  };
  gatewayRequest("connect", params)
    .then((hello) => {
      wsConnected = true;
      lastError = null;
      console.log("[HoC] Connected — protocol", hello?.protocol);
      // Store device token if provided
      if (hello?.auth?.deviceToken) {
        authToken = hello.auth.deviceToken;
        chrome.storage.sync.set({ authToken });
      }
      broadcastStatus();
    })
    .catch((err) => {
      const msg = err?.message || String(err);
      lastError = msg;
      console.error("[HoC] Connect failed:", msg);
      broadcastStatus();
      ws?.close(4008, "connect failed");
    });
}

function handleMessage(frame) {
  if (frame.type === "res" && frame.id) {
    const p = pendingRequests.get(frame.id);
    if (p) {
      pendingRequests.delete(frame.id);
      if (frame.ok) {
        p.resolve(frame.payload);
      } else {
        p.reject(frame.error || { message: "Unknown error" });
      }
    }
  }

  if (frame.type === "event") {
    // Forward events to popup / content scripts if needed
    chrome.runtime.sendMessage({
      action: "gateway-event",
      event: frame.event,
      payload: frame.payload,
    }).catch(() => {}); // Popup may not be open
  }
}

function gatewayRequest(method, params) {
  return new Promise((resolve, reject) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      reject(new Error("Gateway not connected"));
      return;
    }
    const id = generateId();
    pendingRequests.set(id, { resolve, reject });
    ws.send(JSON.stringify({ type: "req", id, method, params }));
    // Timeout after 30s
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error("Request timed out"));
      }
    }, 30000);
  });
}

function broadcastStatus() {
  const status = {
    action: "status-update",
    connected: wsConnected,
    gatewayUrl,
    historyCount: captureHistory.length,
    lastError: lastError,
    relay: {
      enabled: relayEnabled,
      connected: relayConnected,
      stats: relayStats,
      supabaseUrl: supabaseUrl ? supabaseUrl.replace(/\/\/(.{8}).*@/, "//$1…@") : "",
    },
  };
  chrome.runtime.sendMessage(status).catch(() => {});
}

// ─── Screenshot Capture ───────────────────────────────────────
async function captureFullTab() {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(null, {
      format: "png",
      quality: 100,
    });
    return dataUrl;
  } catch (e) {
    console.error("[HoC] Capture failed:", e);
    throw e;
  }
}

// ─── History Management ───────────────────────────────────────
function addToHistory(entry) {
  captureHistory.unshift(entry);
  if (captureHistory.length > MAX_HISTORY) {
    captureHistory = captureHistory.slice(0, MAX_HISTORY);
  }
  // Store only thumbnails (compressed) to save space
  const storageEntries = captureHistory.map((e) => ({
    ...e,
    // Keep full data URL for the most recent 5, thumbnail for older
  }));
  chrome.storage.local.set({ captureHistory: storageEntries });
}

// ─── Send to Agent ────────────────────────────────────────────
async function sendToAgent(imageDataUrl, prompt, pageContext) {
  if (!wsConnected) {
    throw new Error("Not connected to gateway");
  }

  // oxlint-disable-next-line no-unused-vars
  const message = {
    role: "user",
    content: prompt || "Please analyze this screenshot.",
  };

  // Build attachments array
  const attachments = [];
  if (imageDataUrl) {
    // Extract base64 and mime from data URL
    const match = imageDataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
    if (match) {
      attachments.push({
        type: "image",
        mimeType: match[1],
        data: match[2],
        name: "screenshot.png",
      });
    }
  }

  // Add page context to the prompt if available
  let enrichedPrompt = prompt || "";
  if (pageContext) {
    const contextParts = [];
    if (pageContext.url) {contextParts.push(`URL: ${pageContext.url}`);}
    if (pageContext.title) {contextParts.push(`Page: ${pageContext.title}`);}
    if (pageContext.selectedText)
      {contextParts.push(`Selected text: "${pageContext.selectedText}"`);}
    if (pageContext.consoleErrors?.length)
      {contextParts.push(
        `Console errors:\n${pageContext.consoleErrors.join("\n")}`
      );}

    if (contextParts.length > 0) {
      enrichedPrompt = `${enrichedPrompt}\n\n--- Page Context ---\n${contextParts.join("\n")}`;
    }
  }

  const key = sessionKey || "default";

  const params = {
    sessionKey: key,
    message: {
      role: "user",
      content: enrichedPrompt || "Please analyze this screenshot.",
    },
    deliver: false,
    idempotencyKey: generateId(),
    attachments,
  };

  return gatewayRequest("chat.send", params);
}

// ─── Get Active Sessions ──────────────────────────────────────
async function getActiveSessions() {
  if (!wsConnected) {return [];}
  try {
    const result = await gatewayRequest("sessions.list", {});
    return result?.sessions || [];
  } catch {
    return [];
  }
}

// ─── Message Handler ──────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg.action) {
        case "capture-full": {
          const dataUrl = await captureFullTab();
          const tab = await chrome.tabs.query({
            active: true,
            currentWindow: true,
          });
          const entry = {
            id: generateId(),
            dataUrl,
            timestamp: Date.now(),
            type: "full",
            url: tab[0]?.url || "",
            title: tab[0]?.title || "",
          };
          addToHistory(entry);
          sendResponse({ ok: true, dataUrl, id: entry.id });
          break;
        }

        case "capture-region": {
          // First capture the full tab, then we crop in content script
          const fullDataUrl = await captureFullTab();
          sendResponse({ ok: true, dataUrl: fullDataUrl });
          break;
        }

        case "save-region-capture": {
          const entry = {
            id: generateId(),
            dataUrl: msg.dataUrl,
            timestamp: Date.now(),
            type: "region",
            url: msg.url || "",
            title: msg.title || "",
            region: msg.region,
          };
          addToHistory(entry);
          sendResponse({ ok: true, id: entry.id });
          break;
        }

        case "send-to-agent": {
          const result = await sendToAgent(
            msg.dataUrl,
            msg.prompt,
            msg.pageContext
          );
          sendResponse({ ok: true, result });
          break;
        }

        case "get-status": {
          sendResponse({
            connected: wsConnected,
            gatewayUrl,
            historyCount: captureHistory.length,
            lastError: lastError,
            relay: {
              enabled: relayEnabled,
              connected: relayConnected,
              stats: relayStats,
            },
          });
          break;
        }

        case "get-history": {
          sendResponse({ history: captureHistory });
          break;
        }

        case "clear-history": {
          captureHistory = [];
          chrome.storage.local.set({ captureHistory: [] });
          sendResponse({ ok: true });
          break;
        }

        case "delete-history-item": {
          captureHistory = captureHistory.filter((e) => e.id !== msg.id);
          chrome.storage.local.set({ captureHistory });
          sendResponse({ ok: true });
          break;
        }

        case "update-settings": {
          if (msg.gatewayUrl) {gatewayUrl = msg.gatewayUrl;}
          if (msg.authToken !== undefined) {authToken = msg.authToken;}
          if (msg.sessionKey !== undefined) {sessionKey = msg.sessionKey;}
          chrome.storage.sync.set({
            gatewayUrl,
            authToken,
            sessionKey,
          });
          // Reconnect with new settings
          ws?.close();
          ws = null;
          connectGateway();
          sendResponse({ ok: true });
          break;
        }

        case "reconnect": {
          ws?.close();
          ws = null;
          backoffMs = 1000;
          connectGateway();
          sendResponse({ ok: true });
          break;
        }

        case "get-sessions": {
          const sessions = await getActiveSessions();
          sendResponse({ sessions });
          break;
        }

        case "copy-to-clipboard": {
          // Handled by popup/content script directly
          sendResponse({ ok: true });
          break;
        }

        default:
          // ─── Relay commands ────────────────────────
          if (msg.action === "relay-enable") {
            relayEnabled = true;
            if (msg.supabaseUrl) {supabaseUrl = msg.supabaseUrl;}
            if (msg.supabaseAnonKey) {supabaseAnonKey = msg.supabaseAnonKey;}
            chrome.storage.sync.set({ relayEnabled, supabaseUrl, supabaseAnonKey });
            connectRelay();
            sendResponse({ ok: true });
          } else if (msg.action === "relay-disable") {
            relayEnabled = false;
            chrome.storage.sync.set({ relayEnabled: false });
            disconnectRelay();
            sendResponse({ ok: true });
          } else if (msg.action === "relay-status") {
            sendResponse({
              enabled: relayEnabled,
              connected: relayConnected,
              stats: relayStats,
              supabaseUrl: supabaseUrl || "",
            });
          } else if (msg.action === "relay-update-settings") {
            if (msg.supabaseUrl) {supabaseUrl = msg.supabaseUrl;}
            if (msg.supabaseAnonKey) {supabaseAnonKey = msg.supabaseAnonKey;}
            chrome.storage.sync.set({ supabaseUrl, supabaseAnonKey });
            if (relayEnabled) {
              disconnectRelay();
              connectRelay();
            }
            sendResponse({ ok: true });
          } else if (msg.action === "chat-send") {
            // Mini-chat: forward a chat message to the gateway
            const chatResult = await sendToAgent(null, msg.message, msg.pageContext);
            sendResponse({ ok: true, result: chatResult });
          } else if (msg.action === "chat-history") {
            // Mini-chat: load chat history from gateway
            try {
              const history = await gatewayRequest("chat.history", {
                sessionKey: msg.sessionKey || sessionKey || "default",
              });
              sendResponse({ ok: true, history });
            } catch (e) {
              sendResponse({ ok: false, error: e.message });
            }
          } else {
            sendResponse({ ok: false, error: "Unknown action" });
          }
      }
    } catch (e) {
      sendResponse({ ok: false, error: e.message || String(e) });
    }
  })();
  return true; // Keep the message channel open for async
});

// ─── Keyboard Shortcut Commands ───────────────────────────────
chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (!tab?.id) {return;}

  if (command === "capture-full") {
    const dataUrl = await captureFullTab();
    const entry = {
      id: generateId(),
      dataUrl,
      timestamp: Date.now(),
      type: "full",
      url: tab.url || "",
      title: tab.title || "",
    };
    addToHistory(entry);

    // Notify the content script to show a flash effect
    chrome.tabs.sendMessage(tab.id, {
      action: "capture-complete",
      dataUrl,
    }).catch(() => {});

    // Copy to clipboard via content script
    chrome.tabs.sendMessage(tab.id, {
      action: "copy-image",
      dataUrl,
    }).catch(() => {});
  }

  if (command === "capture-region") {
    chrome.tabs.sendMessage(tab.id, {
      action: "start-region-select",
    }).catch(() => {});
  }
});

// ─── Context Menu ─────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus?.create({
    id: "hoc-capture-full",
    title: "📸 Capture Full Page",
    contexts: ["page", "image"],
  });
  chrome.contextMenus?.create({
    id: "hoc-capture-region",
    title: "✂️ Capture Region",
    contexts: ["page", "image"],
  });
  chrome.contextMenus?.create({
    id: "hoc-send-selection",
    title: "🤖 Send Selected Text to Agent",
    contexts: ["selection"],
  });
});

chrome.contextMenus?.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) {return;}

  if (info.menuItemId === "hoc-capture-full") {
    const dataUrl = await captureFullTab();
    const entry = {
      id: generateId(),
      dataUrl,
      timestamp: Date.now(),
      type: "full",
      url: tab.url || "",
      title: tab.title || "",
    };
    addToHistory(entry);
    chrome.tabs.sendMessage(tab.id, {
      action: "capture-complete",
      dataUrl,
    }).catch(() => {});
  }

  if (info.menuItemId === "hoc-capture-region") {
    chrome.tabs.sendMessage(tab.id, {
      action: "start-region-select",
    }).catch(() => {});
  }

  if (info.menuItemId === "hoc-send-selection" && info.selectionText) {
    try {
      await sendToAgent(null, info.selectionText, {
        url: tab.url,
        title: tab.title,
        selectedText: info.selectionText,
      });
      chrome.tabs.sendMessage(tab.id, {
        action: "show-toast",
        message: "Sent to agent ✓",
      }).catch(() => {});
    } catch (e) {
      chrome.tabs.sendMessage(tab.id, {
        action: "show-toast",
        message: "Failed: " + e.message,
        type: "error",
      }).catch(() => {});
    }
  }
});

// ─── Supabase Relay Bridge (PWA ↔ Chrome Extension ↔ HoC) ────
// Uses REST API polling since service workers can't hold persistent
// WebSocket connections (Supabase Realtime JS SDK unusable here).
// The relay polls relay_messages for pwa_to_hoc commands, forwards
// them to the local HoC gateway, then writes responses back.

const RELAY_POLL_INTERVAL = 2000; // ms
const RELAY_HEARTBEAT_INTERVAL = 30000; // ms
let relayPollTimer = null;
let _relayLastPollAt = null;

function supabaseHeaders() {
  const headers = {
    "Content-Type": "application/json",
    "apikey": supabaseAnonKey,
    "Prefer": "return=representation",
  };
  if (supabaseAccessToken) {
    headers["Authorization"] = `Bearer ${supabaseAccessToken}`;
  } else {
    headers["Authorization"] = `Bearer ${supabaseAnonKey}`;
  }
  return headers;
}

async function connectRelay() {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn("[HoC Relay] Cannot connect — Supabase URL or key not configured");
    return;
  }
  if (relayPollTimer) {
    clearInterval(relayPollTimer);
  }
  if (relayHeartbeatTimer) {
    clearInterval(relayHeartbeatTimer);
  }

  console.log("[HoC Relay] Starting relay bridge...");
  relayConnected = true;
  relayStats.lastActivity = Date.now();
  broadcastStatus();

  // Start polling for incoming commands
  relayPollTimer = setInterval(pollRelayMessages, RELAY_POLL_INTERVAL);
  pollRelayMessages(); // Poll immediately

  // Start heartbeat
  relayHeartbeatTimer = setInterval(sendRelayHeartbeat, RELAY_HEARTBEAT_INTERVAL);
  sendRelayHeartbeat();
}

function disconnectRelay() {
  if (relayPollTimer) {
    clearInterval(relayPollTimer);
    relayPollTimer = null;
  }
  if (relayHeartbeatTimer) {
    clearInterval(relayHeartbeatTimer);
    relayHeartbeatTimer = null;
  }
  relayConnected = false;
  console.log("[HoC Relay] Relay bridge stopped");
  broadcastStatus();
}

async function pollRelayMessages() {
  if (!relayEnabled || !supabaseUrl || !supabaseAnonKey) {return;}

  try {
    const url = `${supabaseUrl}/rest/v1/relay_messages?direction=eq.pwa_to_hoc&status=eq.pending&order=created_at.asc&limit=10`;
    const res = await fetch(url, {
      method: "GET",
      headers: supabaseHeaders(),
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        console.warn("[HoC Relay] Auth failed — check Supabase credentials");
        relayConnected = false;
        broadcastStatus();
      }
      return;
    }

    const messages = await res.json();
    if (!Array.isArray(messages) || messages.length === 0) {return;}

    _relayLastPollAt = Date.now();
    for (const msg of messages) {
      await processRelayMessage(msg);
    }
  } catch (e) {
    console.warn("[HoC Relay] Poll error:", e.message);
  }
}

async function processRelayMessage(msg) {
  const { id, message_type, payload, correlation_id } = msg;

  try {
    // Mark as delivered
    await updateRelayMessageStatus(id, "delivered");

    let response = null;

    switch (message_type) {
      case "chat.send": {
        if (!wsConnected) {
          response = { error: "HoC gateway not connected" };
          break;
        }
        const chatParams = {
          sessionKey: payload.sessionKey || sessionKey || "default",
          message: {
            role: "user",
            content: payload.message || "",
          },
          deliver: false,
          idempotencyKey: generateId(),
          attachments: payload.attachments || [],
        };
        response = await gatewayRequest("chat.send", chatParams);
        break;
      }

      case "status.request": {
        response = {
          connected: wsConnected,
          gatewayUrl,
          deviceId: deviceIdentity?.deviceId || null,
        };
        break;
      }

      case "republic.query": {
        if (!wsConnected) {
          response = { error: "HoC gateway not connected" };
          break;
        }
        const method = payload.method;
        const params = payload.params || {};
        response = await gatewayRequest(method, params);
        break;
      }

      default:
        response = { error: `Unknown message type: ${message_type}` };
    }

    // Publish response back
    await publishRelayResponse(correlation_id, message_type.replace(".send", ".response"), response);
    relayStats.received++;
    relayStats.lastActivity = Date.now();
    broadcastStatus();
  } catch (e) {
    console.warn("[HoC Relay] Failed to process message:", id, e.message);
    await publishRelayResponse(correlation_id, "error", {
      error: e.message || "Processing failed",
      originalType: message_type,
    });
  }
}

async function updateRelayMessageStatus(id, status) {
  try {
    await fetch(`${supabaseUrl}/rest/v1/relay_messages?id=eq.${id}`, {
      method: "PATCH",
      headers: supabaseHeaders(),
      body: JSON.stringify({
        status,
        delivered_at: status === "delivered" ? new Date().toISOString() : null,
      }),
    });
  } catch (e) {
    console.warn("[HoC Relay] Failed to update message status:", e.message);
  }
}

async function publishRelayResponse(correlationId, messageType, payload) {
  try {
    const msg = {
      direction: "hoc_to_pwa",
      message_type: messageType,
      correlation_id: correlationId,
      payload: payload || {},
      status: "pending",
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    };

    const res = await fetch(`${supabaseUrl}/rest/v1/relay_messages`, {
      method: "POST",
      headers: supabaseHeaders(),
      body: JSON.stringify(msg),
    });

    if (!res.ok) {
      console.warn("[HoC Relay] Failed to publish response:", res.status);
    }

    relayStats.sent++;
    relayStats.lastActivity = Date.now();
  } catch (e) {
    console.warn("[HoC Relay] Failed to publish response:", e.message);
  }
}

async function sendRelayHeartbeat() {
  if (!relayEnabled || !supabaseUrl || !supabaseAnonKey) {return;}

  try {
    const deviceId = deviceIdentity?.deviceId || "unknown";
    const msg = {
      direction: "hoc_to_pwa",
      message_type: "heartbeat",
      correlation_id: generateId(),
      payload: {
        ts: Date.now(),
        deviceId,
        gatewayConnected: wsConnected,
        gatewayUrl,
        uptime: relayStats.lastActivity ? Date.now() - relayStats.lastActivity : 0,
      },
      status: "pending",
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
    };

    await fetch(`${supabaseUrl}/rest/v1/relay_messages`, {
      method: "POST",
      headers: supabaseHeaders(),
      body: JSON.stringify(msg),
    });
  // oxlint-disable-next-line no-unused-vars
  } catch (e) {
    // Silent — heartbeat failures are non-critical
  }
}
