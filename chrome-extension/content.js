/**
 * HoC Companion — Content Script
 *
 * Injects the floating action button (FAB), handles region selection,
 * extracts page context, and communicates with the background service worker.
 */

(function () {
  "use strict";

  // Prevent double injection
  if (window.__hocCompanionInjected) {return;}
  window.__hocCompanionInjected = true;

  // ─── State ──────────────────────────────────────────────────
  let regionSelecting = false;
  let selectionStart = null;
  let selectionRect = null;
  let overlayEl = null;
  let rectEl = null;
  let fabEl = null;
  let toastTimer = null;
  let fabExpanded = false;
  let fabDragging = false;
  let fabDragOffset = { x: 0, y: 0 };

  // ─── Floating Action Button ─────────────────────────────────
  function createFAB() {
    if (fabEl) {return;}

    fabEl = document.createElement("div");
    fabEl.id = "hoc-fab";
    fabEl.innerHTML = `
      <div class="hoc-fab__button" id="hoc-fab-main" title="HoC Companion">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
          <circle cx="12" cy="13" r="4"/>
        </svg>
      </div>
      <div class="hoc-fab__menu" id="hoc-fab-menu">
        <button class="hoc-fab__action" data-action="capture-full" title="Full Page Screenshot (Alt+Shift+S)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
          <span>Full Page</span>
        </button>
        <button class="hoc-fab__action" data-action="capture-region" title="Region Selection (Alt+Shift+R)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
            <line x1="3" y1="6" x2="21" y2="6"/>
            <path d="M16 10a4 4 0 01-8 0"/>
          </svg>
          <span>Select Region</span>
        </button>
        <button class="hoc-fab__action" data-action="send-to-agent" title="Send Page to Agent">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
          <span>Send to Agent</span>
        </button>
        <button class="hoc-fab__action" data-action="extract-context" title="Extract Page Context">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <span>Page Context</span>
        </button>
      </div>
    `;

    // Positioning — bottom right
    const savedPos = localStorage.getItem("hoc-fab-pos");
    if (savedPos) {
      try {
        const pos = JSON.parse(savedPos);
        fabEl.style.left = pos.x + "px";
        fabEl.style.top = pos.y + "px";
      } catch {}
    }

    document.body.appendChild(fabEl);

    // FAB main button click
    const mainBtn = fabEl.querySelector("#hoc-fab-main");
    mainBtn.addEventListener("mousedown", (e) => {
      fabDragging = false;
      fabDragOffset = {
        x: e.clientX - fabEl.getBoundingClientRect().left,
        y: e.clientY - fabEl.getBoundingClientRect().top,
      };
      const onMove = (me) => {
        fabDragging = true;
        fabEl.style.left = me.clientX - fabDragOffset.x + "px";
        fabEl.style.top = me.clientY - fabDragOffset.y + "px";
        fabEl.style.right = "auto";
        fabEl.style.bottom = "auto";
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        if (!fabDragging) {
          toggleFAB();
        } else {
          // Save position
          const rect = fabEl.getBoundingClientRect();
          localStorage.setItem(
            "hoc-fab-pos",
            JSON.stringify({ x: rect.left, y: rect.top })
          );
        }
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });

    // Action buttons
    fabEl.querySelectorAll(".hoc-fab__action").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        handleFABAction(action);
        toggleFAB(false);
      });
    });

    // Close menu on outside click
    document.addEventListener("click", (e) => {
      if (fabExpanded && !fabEl.contains(e.target)) {
        toggleFAB(false);
      }
    });
  }

  function toggleFAB(force) {
    fabExpanded = force !== undefined ? force : !fabExpanded;
    const menu = fabEl.querySelector("#hoc-fab-menu");
    if (fabExpanded) {
      menu.classList.add("hoc-fab__menu--open");
      fabEl.querySelector("#hoc-fab-main").classList.add("hoc-fab__button--active");
    } else {
      menu.classList.remove("hoc-fab__menu--open");
      fabEl.querySelector("#hoc-fab-main").classList.remove("hoc-fab__button--active");
    }
  }

  function handleFABAction(action) {
    switch (action) {
      case "capture-full":
        captureFullPage();
        break;
      case "capture-region":
        startRegionSelect();
        break;
      case "send-to-agent":
        captureAndSendToAgent();
        break;
      case "extract-context":
        extractAndSendContext();
        break;
    }
  }

  // ─── Full Page Capture ──────────────────────────────────────
  function captureFullPage() {
    showFlash();
    chrome.runtime.sendMessage({ action: "capture-full" }, (resp) => {
      if (resp?.ok) {
        copyImageToClipboard(resp.dataUrl);
        showToast("📸 Screenshot captured & copied!");
      } else {
        showToast("❌ Capture failed: " + (resp?.error || "unknown"), "error");
      }
    });
  }

  // ─── Region Selection ───────────────────────────────────────
  function startRegionSelect() {
    if (regionSelecting) {return;}
    regionSelecting = true;

    // Hide FAB during selection
    if (fabEl) {fabEl.style.display = "none";}

    // Create overlay
    overlayEl = document.createElement("div");
    overlayEl.id = "hoc-region-overlay";
    overlayEl.innerHTML = `
      <div class="hoc-region-instructions">
        Click and drag to select a region · <kbd>Esc</kbd> to cancel
      </div>
    `;
    document.body.appendChild(overlayEl);

    // Create selection rectangle
    rectEl = document.createElement("div");
    rectEl.id = "hoc-region-rect";
    overlayEl.appendChild(rectEl);

    // Create crosshair coordinates display
    const coordsEl = document.createElement("div");
    coordsEl.id = "hoc-region-coords";
    overlayEl.appendChild(coordsEl);

    let startX, startY;

    const onMouseDown = (e) => {
      startX = e.clientX;
      startY = e.clientY;
      selectionStart = { x: startX, y: startY };
      rectEl.style.display = "block";
    };

    const onMouseMove = (e) => {
      // Update coordinates display
      coordsEl.textContent = `${e.clientX}, ${e.clientY}`;
      coordsEl.style.left = e.clientX + 15 + "px";
      coordsEl.style.top = e.clientY + 15 + "px";

      if (!selectionStart) {return;}

      const x = Math.min(startX, e.clientX);
      const y = Math.min(startY, e.clientY);
      const w = Math.abs(e.clientX - startX);
      const h = Math.abs(e.clientY - startY);

      rectEl.style.left = x + "px";
      rectEl.style.top = y + "px";
      rectEl.style.width = w + "px";
      rectEl.style.height = h + "px";

      // Show dimensions
      rectEl.setAttribute("data-size", `${w} × ${h}`);
    };

    const onMouseUp = (e) => {
      if (!selectionStart) {return;}

      const x = Math.min(startX, e.clientX);
      const y = Math.min(startY, e.clientY);
      const w = Math.abs(e.clientX - startX);
      const h = Math.abs(e.clientY - startY);

      selectionRect = { x, y, width: w, height: h };

      // Cleanup
      cleanup();

      // Minimum selection size
      if (w < 10 || h < 10) {
        showToast("Selection too small", "error");
        return;
      }

      // Capture the tab first, then crop
      chrome.runtime.sendMessage({ action: "capture-region" }, (resp) => {
        if (resp?.ok) {
          cropImage(resp.dataUrl, selectionRect, window.devicePixelRatio || 1);
        } else {
          showToast("❌ Capture failed", "error");
        }
      });
    };

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        cleanup();
      }
    };

    function cleanup() {
      regionSelecting = false;
      selectionStart = null;
      overlayEl?.remove();
      overlayEl = null;
      rectEl = null;
      if (fabEl) {fabEl.style.display = "";}
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("keydown", onKeyDown);
    }

    overlayEl.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("keydown", onKeyDown);
  }

  function cropImage(fullDataUrl, rect, dpr) {
    const img = new Image();
    // oxlint-disable-next-line prefer-add-event-listener
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const scale = dpr;
      canvas.width = rect.width * scale;
      canvas.height = rect.height * scale;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(
        img,
        rect.x * scale,
        rect.y * scale,
        rect.width * scale,
        rect.height * scale,
        0,
        0,
        rect.width * scale,
        rect.height * scale
      );
      const croppedDataUrl = canvas.toDataURL("image/png");

      // Save to history
      chrome.runtime.sendMessage({
        action: "save-region-capture",
        dataUrl: croppedDataUrl,
        url: window.location.href,
        title: document.title,
        region: rect,
      });

      copyImageToClipboard(croppedDataUrl);
      showToast("✂️ Region captured & copied!");
    };
    img.src = fullDataUrl;
  }

  // ─── Send to Agent ──────────────────────────────────────────
  function captureAndSendToAgent() {
    showFlash();
    chrome.runtime.sendMessage({ action: "capture-full" }, (resp) => {
      if (resp?.ok) {
        // Show inline prompt input
        showPromptDialog(resp.dataUrl);
      } else {
        showToast("❌ Capture failed", "error");
      }
    });
  }

  function showPromptDialog(dataUrl) {
    const dialog = document.createElement("div");
    dialog.id = "hoc-prompt-dialog";
    const context = extractPageContext();
    const suggestion = getSmartSuggestion();

    dialog.innerHTML = `
      <div class="hoc-prompt__backdrop"></div>
      <div class="hoc-prompt__card">
        <div class="hoc-prompt__header">
          <h3>Send to HoC Agent</h3>
          <button class="hoc-prompt__close" aria-label="Close">&times;</button>
        </div>
        <div class="hoc-prompt__preview">
          <img src="${dataUrl}" alt="Screenshot preview" />
        </div>
        <div class="hoc-prompt__context">
          <span class="hoc-prompt__badge">${context.pageType || "page"}</span>
          <span class="hoc-prompt__url" title="${context.url}">${truncate(context.url, 60)}</span>
        </div>
        ${suggestion ? `<button class="hoc-prompt__suggestion">${suggestion}</button>` : ""}
        <textarea class="hoc-prompt__input" placeholder="Optional: Add a prompt or question about this screenshot..." rows="3"></textarea>
        <div class="hoc-prompt__footer">
          <label class="hoc-prompt__checkbox">
            <input type="checkbox" checked /> Include page context
          </label>
          <div class="hoc-prompt__actions">
            <button class="hoc-prompt__btn hoc-prompt__btn--secondary" data-action="copy">📋 Copy</button>
            <button class="hoc-prompt__btn hoc-prompt__btn--primary" data-action="send">🚀 Send to Agent</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    // Focus input
    const input = dialog.querySelector(".hoc-prompt__input");
    setTimeout(() => input.focus(), 100);

    // Suggestion click
    const suggBtn = dialog.querySelector(".hoc-prompt__suggestion");
    if (suggBtn) {
      suggBtn.addEventListener("click", () => {
        input.value = suggBtn.textContent;
        input.focus();
      });
    }

    // Close
    dialog.querySelector(".hoc-prompt__close").addEventListener("click", () => dialog.remove());
    dialog.querySelector(".hoc-prompt__backdrop").addEventListener("click", () => dialog.remove());

    // Actions
    dialog.querySelector('[data-action="copy"]').addEventListener("click", () => {
      copyImageToClipboard(dataUrl);
      showToast("📋 Copied to clipboard!");
    });

    dialog.querySelector('[data-action="send"]').addEventListener("click", () => {
      const prompt = input.value.trim();
      const includeContext = dialog.querySelector(
        '.hoc-prompt__checkbox input'
      ).checked;

      chrome.runtime.sendMessage(
        {
          action: "send-to-agent",
          dataUrl,
          prompt,
          pageContext: includeContext ? context : null,
        },
        (resp) => {
          if (resp?.ok) {
            showToast("🚀 Sent to agent!");
            dialog.remove();
          } else {
            showToast("❌ " + (resp?.error || "Failed to send"), "error");
          }
        }
      );
    });

    // ESC to close
    const onEsc = (e) => {
      if (e.key === "Escape") {
        dialog.remove();
        document.removeEventListener("keydown", onEsc);
      }
    };
    document.addEventListener("keydown", onEsc);
  }

  // ─── Page Context Extraction ────────────────────────────────
  function extractPageContext() {
    const context = {
      url: window.location.href,
      title: document.title,
      selectedText: window.getSelection()?.toString()?.trim() || "",
      pageType: detectPageType(),
      metaDescription:
        document.querySelector('meta[name="description"]')?.content || "",
      headings: [],
      consoleErrors: [],
    };

    // Extract headings
    document.querySelectorAll("h1, h2, h3").forEach((h, i) => {
      if (i < 10) {context.headings.push(h.textContent?.trim());}
    });

    return context;
  }

  function detectPageType() {
    const url = window.location.href.toLowerCase();
    const title = document.title.toLowerCase();
    const body = document.body?.innerText?.slice(0, 2000)?.toLowerCase() || "";

    // Error pages
    if (
      /error|exception|crash|500|404|403|not found|server error/i.test(
        title + " " + body.slice(0, 500)
      )
    )
      {return "error";}

    // Code platforms
    if (/github\.com|gitlab|bitbucket|codepen|codesandbox|stackblitz/i.test(url))
      {return "code";}

    // Stack Overflow / Q&A
    if (/stackoverflow|stackexchange|quora/i.test(url)) {return "qa";}

    // Documentation
    if (/docs\.|documentation|readme|wiki|api\s*reference/i.test(url + " " + title))
      {return "docs";}

    // Form-heavy pages
    if (document.querySelectorAll("form, input, select, textarea").length > 5)
      {return "form";}

    // Media-heavy pages
    if (document.querySelectorAll("img, video, canvas, svg").length > 10)
      {return "media";}

    // Terminal / Console
    if (document.querySelectorAll("pre, code, .terminal, .console").length > 3)
      {return "terminal";}

    return "page";
  }

  function getSmartSuggestion() {
    const pageType = detectPageType();
    const suggestions = {
      error: "What's causing this error and how do I fix it?",
      code: "Review this code and suggest improvements",
      qa: "Summarize the answer and explain the key points",
      docs: "Summarize the key points from this documentation",
      form: "Help me fill out this form correctly",
      media: "Describe what you see in this content",
      terminal: "Analyze this terminal output and explain the issue",
      page: null,
    };
    return suggestions[pageType] || null;
  }

  function extractAndSendContext() {
    const context = extractPageContext();
    const contextText = [
      `Page: ${context.title}`,
      `URL: ${context.url}`,
      `Type: ${context.pageType}`,
      context.selectedText
        ? `Selected: "${context.selectedText}"`
        : null,
      context.headings.length
        ? `Headings: ${context.headings.join(", ")}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");

    chrome.runtime.sendMessage(
      {
        action: "send-to-agent",
        dataUrl: null,
        prompt: `Here is the context from the current page:\n\n${contextText}`,
        pageContext: context,
      },
      (resp) => {
        if (resp?.ok) {
          showToast("📤 Context sent to agent!");
        } else {
          showToast("❌ " + (resp?.error || "Failed"), "error");
        }
      }
    );
  }

  // ─── Clipboard ──────────────────────────────────────────────
  async function copyImageToClipboard(dataUrl) {
    try {
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({
          [blob.type]: blob,
        }),
      ]);
    } catch (e) {
      // Fallback — some browsers don't support clipboard API for images
      console.warn("[HoC] Clipboard fallback:", e);
    }
  }

  // ─── Visual Effects ─────────────────────────────────────────
  function showFlash() {
    const flash = document.createElement("div");
    flash.id = "hoc-flash";
    document.body.appendChild(flash);
    requestAnimationFrame(() => {
      flash.classList.add("hoc-flash--active");
      setTimeout(() => flash.remove(), 400);
    });
  }

  function showToast(message, type = "success") {
    // Remove existing
    document.getElementById("hoc-toast")?.remove();
    if (toastTimer) {clearTimeout(toastTimer);}

    const toast = document.createElement("div");
    toast.id = "hoc-toast";
    toast.className = `hoc-toast hoc-toast--${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add("hoc-toast--visible"));
    toastTimer = setTimeout(() => {
      toast.classList.remove("hoc-toast--visible");
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // ─── Helpers ────────────────────────────────────────────────
  function truncate(str, max) {
    if (!str) {return "";}
    return str.length > max ? str.slice(0, max) + "…" : str;
  }

  // ─── Message Handler ────────────────────────────────────────
  // oxlint-disable-next-line no-unused-vars
  // oxlint-disable-next-line no-unused-vars
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    switch (msg.action) {
      case "start-region-select":
        startRegionSelect();
        break;
      case "capture-complete":
        showFlash();
        showToast("📸 Screenshot captured!");
        break;
      case "copy-image":
        copyImageToClipboard(msg.dataUrl);
        break;
      case "show-toast":
        showToast(msg.message, msg.type || "success");
        break;
    }
  });

  // ─── Initialize ─────────────────────────────────────────────
  // Only inject FAB on non-extension pages
  if (
    !window.location.href.startsWith("chrome://") &&
    !window.location.href.startsWith("chrome-extension://") &&
    !window.location.href.startsWith("edge://")
  ) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", createFAB);
    } else {
      createFAB();
    }
  }
})();
