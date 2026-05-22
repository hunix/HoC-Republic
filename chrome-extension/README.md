# HoC Companion — Chrome Extension

> AI-powered screenshot capture, annotation, and agent prompting for the **House of Claw** platform.

## Features

| Feature | Description |
|---------|-------------|
| 📸 **Full Tab Screenshot** | One-click capture of the visible tab via `Alt+Shift+S` |
| ✂️ **Region Selection** | Marquee rectangle tool with crosshair, dim overlay, and live dimensions (`Alt+Shift+R`) |
| 🎯 **Floating Action Button** | Persistent, draggable FAB on every page for quick access |
| ✏️ **Annotation Tools** | Draw, highlight, arrow, text overlay, blur/redact — with undo/redo |
| 📋 **Clipboard Integration** | Auto-copies captures to clipboard |
| 🚀 **AI Prompting** | Send captures to active HoC agent with optional user prompt |
| 🔍 **Smart Context** | Auto-detects page type (code, docs, error, form) and suggests relevant prompts |
| 📂 **Capture History** | Last 20 captures stored locally with thumbnails |
| 🔌 **Gateway Connection** | Live WebSocket status with auto-reconnect |
| ⌨️ **Keyboard Shortcuts** | `Alt+Shift+S` (full page), `Alt+Shift+R` (region select) |
| 🖱️ **Context Menu** | Right-click → Capture Full Page / Region / Send Selected Text |

## Installation

1. Open `chrome://extensions` (or `edge://extensions`)
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select the `chrome-extension/` folder
5. The HoC Companion icon appears in your toolbar

## Configuration

Click the extension icon → **Settings** tab:

- **Gateway URL**: WebSocket URL of your HoC gateway (default: `ws://localhost:18789`)
- **Auth Token**: Optional authentication token
- **Session Key**: Select which agent session to send captures to

## Architecture

```
chrome-extension/
├── manifest.json       # Manifest V3 config
├── background.js       # Service worker — gateway WS, capture, history
├── content.js          # Content script — FAB, region selector, context extraction
├── content.css         # Styles for FAB, overlay, toast, prompt dialog
├── popup.html          # Extension popup UI
├── popup.css           # Popup styles (dark glassmorphism)
├── popup.js            # Popup logic — tabs, history, settings
├── annotator.js        # Canvas annotation engine
├── icons/              # Extension icons (SVG)
│   ├── icon16.svg
│   ├── icon48.svg
│   └── icon128.svg
└── README.md           # This file
```

## Gateway Protocol

The extension connects to the HoC gateway using the same WebSocket JSON-RPC protocol as the control UI:

```javascript
// Request frame
{ type: "req", id: "<uuid>", method: "chat.send", params: { ... } }

// Response frame
{ type: "res", id: "<uuid>", ok: true, payload: { ... } }
```

Screenshots are sent as base64 data URL attachments via `chat.send`.

## Development

The extension is plain JavaScript (no build step required). Edit files directly and reload the extension in `chrome://extensions`.
