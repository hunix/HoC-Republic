/* eslint-env browser */
/* global chrome, AnnotationEngine, ClipboardItem */
/**
 * HoC Companion — Popup Script
 *
 * Handles the popup UI: tab switching, capture triggers,
 * history display, annotation integration, prompt composition,
 * settings management, and gateway status display.
 */

// ─── State ────────────────────────────────────────────────────
let currentCapture = null;
let annotationEngine = null;

// ─── DOM Elements ─────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ─── Tab Navigation ───────────────────────────────────────────
$$(".popup-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    $$(".popup-tab").forEach((t) => t.classList.remove("popup-tab--active"));
    $$(".popup-panel").forEach((p) => p.classList.remove("popup-panel--active"));
    tab.classList.add("popup-tab--active");
    const panel = $(`[data-panel="${tab.dataset.tab}"]`);
    if (panel) {panel.classList.add("popup-panel--active");}

    // Refresh history when switching to history tab
    if (tab.dataset.tab === "history") {loadHistory();}
    if (tab.dataset.tab === "relay") {loadRelayStatus();}
    if (tab.dataset.tab === "chat") {loadChatSessions();}
  });
});

// ─── Status Updates ───────────────────────────────────────────
function updateStatus(connected, lastError) {
  const dot = $(".status-dot");
  const text = $("#status-text");
  dot.className = `status-dot status-dot--${connected ? "connected" : "disconnected"}`;
  if (connected) {
    text.textContent = "Connected";
    text.title = "";
  } else if (lastError) {
    // Show abbreviated error in status, full error in tooltip
    const short = lastError.length > 40 ? lastError.slice(0, 40) + "…" : lastError;
    text.textContent = `Error: ${short}`;
    text.title = lastError;
    text.style.color = "#f87171";
  } else {
    text.textContent = "Disconnected";
    text.title = "";
    text.style.color = "";
  }
}

function refreshStatus() {
  chrome.runtime.sendMessage({ action: "get-status" }, (resp) => {
    if (resp) {
      updateStatus(resp.connected, resp.lastError);
    }
  });
}

// Listen for status updates from background
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "status-update") {
    updateStatus(msg.connected, msg.lastError);
    if (msg.relay) {updateRelayUI(msg.relay);}
  }
});

// ─── Capture Buttons ──────────────────────────────────────────
$("#btn-capture-full").addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "capture-full" }, (resp) => {
    if (resp?.ok) {
      showPreview(resp.dataUrl);
    } else {
      showError("Capture failed: " + (resp?.error || "unknown"));
    }
  });
});

$("#btn-capture-region").addEventListener("click", async () => {
  // Close popup and trigger region select in active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { action: "start-region-select" });
    window.close();
  }
});

// ─── Preview ──────────────────────────────────────────────────
function showPreview(dataUrl) {
  currentCapture = dataUrl;
  const preview = $("#capture-preview");
  const img = $("#preview-img");
  preview.style.display = "block";
  img.src = dataUrl;

  // Hide annotation container
  const annoContainer = $("#annotation-container");
  annoContainer.style.display = "none";
  if (annotationEngine) {
    annotationEngine.unbind();
    annotationEngine = null;
  }
}

function showError(msg) {
  // Simple fallback
  const preview = $("#capture-preview");
  preview.style.display = "block";
  preview.querySelector(".capture-preview__image").innerHTML = `
    <p style="color:#f87171;padding:20px;text-align:center;">${msg}</p>
  `;
}

// ─── Preview Tools ────────────────────────────────────────────
$("#btn-copy").addEventListener("click", async () => {
  if (!currentCapture) {return;}
  try {
    const resp = await fetch(currentCapture);
    const blob = await resp.blob();
    await navigator.clipboard.write([
      new ClipboardItem({ [blob.type]: blob }),
    ]);
    showToast("Copied to clipboard!");
  // oxlint-disable-next-line no-unused-vars
  } catch (e) {
    showToast("Copy failed", true);
  }
});

$("#btn-download").addEventListener("click", () => {
  if (!currentCapture) {return;}
  const a = document.createElement("a");
  a.href = currentCapture;
  a.download = `hoc-capture-${Date.now()}.png`;
  a.click();
});

// ─── Annotation ───────────────────────────────────────────────
$("#btn-annotate").addEventListener("click", async () => {
  if (!currentCapture) {return;}
  const container = $("#annotation-container");
  const canvas = $("#annotation-canvas");

  if (container.style.display === "none" || !container.style.display) {
    container.style.display = "block";
    // Hide preview image since canvas replaces it
    $(".capture-preview__image").style.display = "none";

    annotationEngine = new AnnotationEngine(canvas, currentCapture);
    await annotationEngine.init();
  } else {
    container.style.display = "none";
    $(".capture-preview__image").style.display = "block";
  }
});

// Annotation tool buttons
$$(".anno-tool[data-tool]").forEach((btn) => {
  btn.addEventListener("click", () => {
    $$(".anno-tool[data-tool]").forEach((b) => b.classList.remove("anno-tool--active"));
    btn.classList.add("anno-tool--active");
    if (annotationEngine) {
      annotationEngine.setTool(btn.dataset.tool);
    }
  });
});

$("#anno-color")?.addEventListener("input", (e) => {
  if (annotationEngine) {annotationEngine.setColor(e.target.value);}
});

$("#anno-size")?.addEventListener("input", (e) => {
  if (annotationEngine) {annotationEngine.setSize(e.target.value);}
});

$("#anno-undo")?.addEventListener("click", () => annotationEngine?.undo());
$("#anno-redo")?.addEventListener("click", () => annotationEngine?.redo());
$("#anno-clear")?.addEventListener("click", () => annotationEngine?.clear());

$("#anno-save")?.addEventListener("click", () => {
  if (!annotationEngine) {return;}
  currentCapture = annotationEngine.getDataUrl();
  // Update preview
  const img = $("#preview-img");
  img.src = currentCapture;
  // Hide annotation canvas
  $("#annotation-container").style.display = "none";
  $(".capture-preview__image").style.display = "block";
  showToast("Annotations saved!");
});

// ─── Send to Agent ────────────────────────────────────────────
$("#btn-send-agent").addEventListener("click", async () => {
  if (!currentCapture) {
    showToast("Capture a screenshot first", true);
    return;
  }

  const prompt = $("#prompt-input").value.trim();
  const includeContext = $("#include-context").checked;

  let pageContext = null;
  if (includeContext) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    pageContext = {
      url: tab?.url || "",
      title: tab?.title || "",
    };
  }

  const btn = $("#btn-send-agent");
  btn.textContent = "⏳ Sending...";
  btn.disabled = true;

  chrome.runtime.sendMessage(
    {
      action: "send-to-agent",
      dataUrl: currentCapture,
      prompt,
      pageContext,
    },
    (resp) => {
      btn.textContent = "🚀 Send to Agent";
      btn.disabled = false;

      if (resp?.ok) {
        showToast("Sent to agent! ✓");
        $("#prompt-input").value = "";
      } else {
        showToast("Failed: " + (resp?.error || "Unknown error"), true);
      }
    }
  );
});

// ─── History ──────────────────────────────────────────────────
function loadHistory() {
  chrome.runtime.sendMessage({ action: "get-history" }, (resp) => {
    const grid = $("#history-grid");
    const countEl = $("#history-count");
    const history = resp?.history || [];

    countEl.textContent = `${history.length} capture${history.length !== 1 ? "s" : ""}`;

    if (history.length === 0) {
      grid.innerHTML = `
        <div class="history-empty">
          <p>No captures yet</p>
          <span>Use the capture buttons or press Alt+Shift+S</span>
        </div>
      `;
      return;
    }

    grid.innerHTML = history
      .map(
        (item) => `
      <div class="history-item" data-id="${item.id}" title="${item.title || item.url || ""}">
        <img src="${item.dataUrl}" alt="Capture" loading="lazy" />
        <span class="history-item__badge">${item.type || "full"}</span>
        <span class="history-item__time">${formatTime(item.timestamp)}</span>
        <button class="history-item__delete" data-delete="${item.id}" title="Delete">&times;</button>
      </div>
    `
      )
      .join("");

    // Click handlers
    grid.querySelectorAll(".history-item").forEach((item) => {
      item.addEventListener("click", (e) => {
        if (e.target.closest(".history-item__delete")) {return;}
        const entry = history.find((h) => h.id === item.dataset.id);
        if (entry) {
          // Switch to capture tab and show preview
          $$(".popup-tab").forEach((t) => t.classList.remove("popup-tab--active"));
          $$(".popup-panel").forEach((p) => p.classList.remove("popup-panel--active"));
          document.querySelector('[data-tab="capture"]').classList.add("popup-tab--active");
          document.querySelector('[data-panel="capture"]').classList.add("popup-panel--active");
          showPreview(entry.dataUrl);
        }
      });
    });

    grid.querySelectorAll(".history-item__delete").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        chrome.runtime.sendMessage(
          { action: "delete-history-item", id: btn.dataset.delete },
          () => loadHistory()
        );
      });
    });
  });
}

function formatTime(ts) {
  if (!ts) {return "";}
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) {return "just now";}
  if (diff < 3600000) {return `${Math.floor(diff / 60000)}m ago`;}
  if (diff < 86400000) {return `${Math.floor(diff / 3600000)}h ago`;}
  return d.toLocaleDateString();
}

// Clear history
$("#btn-clear-history").addEventListener("click", () => {
  if (confirm("Clear all capture history?")) {
    chrome.runtime.sendMessage({ action: "clear-history" }, () => loadHistory());
  }
});

// ─── Settings ─────────────────────────────────────────────────
function loadSettings() {
  chrome.storage.sync.get(
    ["gatewayUrl", "authToken", "sessionKey"],
    (cfg) => {
      $("#setting-gateway-url").value = cfg.gatewayUrl || "ws://localhost:18789";
      $("#setting-auth-token").value = cfg.authToken || "";
      if (cfg.sessionKey) {
        const select = $("#setting-session-key");
        const opt = document.createElement("option");
        opt.value = cfg.sessionKey;
        opt.textContent = cfg.sessionKey;
        opt.selected = true;
        select.appendChild(opt);
      }
    }
  );
}

$("#btn-save-settings").addEventListener("click", () => {
  const gatewayUrl = $("#setting-gateway-url").value.trim();
  const authToken = $("#setting-auth-token").value.trim();
  const sessionKey = $("#setting-session-key").value;

  chrome.runtime.sendMessage(
    {
      action: "update-settings",
      gatewayUrl,
      authToken,
      sessionKey,
    },
    (resp) => {
      if (resp?.ok) {
        showToast("Settings saved!");
        updateStatus(false); // Will reconnect
        setTimeout(refreshStatus, 2000);
      }
    }
  );
});

$("#btn-reconnect").addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "reconnect" }, () => {
    updateStatus(false);
    setTimeout(refreshStatus, 2000);
  });
});

$("#btn-refresh-sessions").addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "get-sessions" }, (resp) => {
    const select = $("#setting-session-key");
    const currentVal = select.value;
    select.innerHTML = '<option value="">Default</option>';
    (resp?.sessions || []).forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s.key;
      opt.textContent = s.key;
      if (s.key === currentVal) {opt.selected = true;}
      select.appendChild(opt);
    });
  });
});

// ─── Toast ────────────────────────────────────────────────────
function showToast(message, isError = false) {
  const existing = document.querySelector(".popup-toast");
  if (existing) {existing.remove();}

  const toast = document.createElement("div");
  toast.className = `popup-toast ${isError ? "popup-toast--error" : "popup-toast--success"}`;
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 12px;
    left: 50%;
    transform: translateX(-50%);
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 500;
    z-index: 9999;
    animation: toast-in 200ms ease;
    background: ${isError ? "rgba(239,68,68,0.9)" : "rgba(16,185,129,0.9)"};
    color: #fff;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

// ─── Init ─────────────────────────────────────────────────────
refreshStatus();
loadSettings();
loadHistory();
loadRelaySettings();

// ─── Relay Tab ────────────────────────────────────────────────
function loadRelaySettings() {
  chrome.storage.sync.get(
    ["relayEnabled", "supabaseUrl", "supabaseAnonKey"],
    (cfg) => {
      const toggle = $("#relay-toggle-input");
      if (toggle) {toggle.checked = !!cfg.relayEnabled;}
      const urlInput = $("#relay-supabase-url");
      if (urlInput) {urlInput.value = cfg.supabaseUrl || "";}
      const keyInput = $("#relay-supabase-key");
      if (keyInput) {keyInput.value = cfg.supabaseAnonKey || "";}
    }
  );
}

function loadRelayStatus() {
  chrome.runtime.sendMessage({ action: "relay-status" }, (resp) => {
    if (resp) {updateRelayUI(resp);}
  });
}

function updateRelayUI(relay) {
  const toggle = $("#relay-toggle-input");
  if (toggle) {toggle.checked = relay.enabled;}

  const dotLocal = $("#relay-dot-local");
  const dotSupabase = $("#relay-dot-supabase");
  const dotPwa = $("#relay-dot-pwa");

  // Retrieve gateway connection status from main status
  chrome.runtime.sendMessage({ action: "get-status" }, (status) => {
    if (dotLocal) {
      dotLocal.className = `relay-indicator__dot relay-indicator__dot--${status?.connected ? "active" : "inactive"}`;
    }
  });

  if (dotSupabase) {
    dotSupabase.className = `relay-indicator__dot relay-indicator__dot--${relay.connected ? "active" : "inactive"}`;
  }
  if (dotPwa) {
    // PWA dot is active if we've sent/received messages recently (last 5 min)
    const recentActivity = relay.stats?.lastActivity && (Date.now() - relay.stats.lastActivity) < 300000;
    dotPwa.className = `relay-indicator__dot relay-indicator__dot--${recentActivity ? "active" : "inactive"}`;
  }

  const statSent = $("#relay-stat-sent");
  const statReceived = $("#relay-stat-received");
  const statActivity = $("#relay-stat-activity");

  if (statSent) {statSent.textContent = relay.stats?.sent || 0;}
  if (statReceived) {statReceived.textContent = relay.stats?.received || 0;}
  if (statActivity && relay.stats?.lastActivity) {
    statActivity.textContent = `Last: ${formatTime(relay.stats.lastActivity)}`;
  }
}

$("#relay-toggle-input")?.addEventListener("change", (e) => {
  const enabled = e.target.checked;
  const supabaseUrl = $("#relay-supabase-url")?.value.trim() || "";
  const supabaseAnonKey = $("#relay-supabase-key")?.value.trim() || "";

  if (enabled) {
    if (!supabaseUrl || !supabaseAnonKey) {
      showToast("Enter Supabase URL and key first", true);
      e.target.checked = false;
      return;
    }
    chrome.runtime.sendMessage({
      action: "relay-enable",
      supabaseUrl,
      supabaseAnonKey,
    }, (resp) => {
      if (resp?.ok) {showToast("Relay enabled!");}
    });
  } else {
    chrome.runtime.sendMessage({ action: "relay-disable" }, (resp) => {
      if (resp?.ok) {showToast("Relay disabled");}
    });
  }
});

$("#btn-relay-save")?.addEventListener("click", () => {
  const supabaseUrl = $("#relay-supabase-url")?.value.trim();
  const supabaseAnonKey = $("#relay-supabase-key")?.value.trim();

  if (!supabaseUrl || !supabaseAnonKey) {
    showToast("Both fields are required", true);
    return;
  }

  chrome.runtime.sendMessage({
    action: "relay-update-settings",
    supabaseUrl,
    supabaseAnonKey,
  }, (resp) => {
    if (resp?.ok) {showToast("Relay settings saved!");}
  });
});

// ─── Mini-Chat ────────────────────────────────────────────────
function loadChatSessions() {
  chrome.runtime.sendMessage({ action: "get-sessions" }, (resp) => {
    const select = $("#chat-session-select");
    if (!select) {return;}
    const currentVal = select.value;
    select.innerHTML = '<option value="">Default session</option>';
    (resp?.sessions || []).forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s.key;
      opt.textContent = s.key;
      if (s.key === currentVal) {opt.selected = true;}
      select.appendChild(opt);
    });
  });
}

function addChatMessage(role, content) {
  const container = $("#chat-messages");
  if (!container) {return;}

  // Remove empty placeholder
  const empty = container.querySelector(".chat-empty");
  if (empty) {empty.remove();}

  const msgDiv = document.createElement("div");
  msgDiv.className = `ext-chat-msg ext-chat-msg--${role}`;
  msgDiv.textContent = content;
  container.appendChild(msgDiv);
  container.scrollTop = container.scrollHeight;
}

$("#btn-chat-send")?.addEventListener("click", () => {
  const input = $("#chat-input");
  const message = input?.value.trim();
  if (!message) {return;}

  addChatMessage("user", message);
  input.value = "";

  const btn = $("#btn-chat-send");
  if (btn) {
    btn.textContent = "⏳";
    btn.disabled = true;
  }

  chrome.runtime.sendMessage(
    { action: "chat-send", message },
    (resp) => {
      if (btn) {
        btn.textContent = "Send";
        btn.disabled = false;
      }
      if (resp?.ok) {
        addChatMessage("assistant", "Message sent to agent ✓");
      } else {
        addChatMessage("error", resp?.error || "Failed to send");
      }
    }
  );
});

// Enter to send in chat
$("#chat-input")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    $("#btn-chat-send")?.click();
  }
});
