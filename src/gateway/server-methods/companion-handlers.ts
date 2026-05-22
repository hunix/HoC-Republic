/**
 * Companion RPC Handlers
 *
 * Backend handlers for the Companion page:
 *  - companion.status — returns all companion app statuses
 *  - companion.ping   — pings a specific companion app
 *  - companion.configure — updates configuration for a companion app
 */

import { getCompanionBridge, isCompanionAvailable } from "../../infra/companion-bridge.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

interface CompanionApp {
  id: string;
  name: string;
  type: "pwa" | "chrome-extension" | "windows-service" | "other";
  status: "connected" | "disconnected" | "error" | "unknown";
  version: string | null;
  lastSeen: number | null;
  endpoint: string | null;
  config: Record<string, unknown>;
  capabilities: string[];
}

/**
 * Detect the real status of the Windows Companion Service.
 */
async function getWindowsServiceApp(): Promise<CompanionApp> {
  const base: CompanionApp = {
    id: "windows-service",
    name: "HoC Windows Companion Service",
    type: "windows-service",
    status: "disconnected",
    version: null,
    lastSeen: null,
    endpoint: "\\\\.\\pipe\\OpenClawCompanion",
    config: {},
    capabilities: [
      "mouse-control",
      "keyboard-control",
      "screen-capture",
      "process-management",
      "window-management",
      "ui-automation",
      "audio-control",
      "system-info",
    ],
  };

  try {
    const available = await isCompanionAvailable();
    if (!available) {return base;}

    const bridge = getCompanionBridge();
    const health = await bridge.healthCheck() as Record<string, unknown> | undefined;

    base.status = "connected";
    base.lastSeen = Date.now();
    if (health && typeof health === "object") {
      base.version = (health.version as string) ?? null;
    }
  } catch {
    base.status = "error";
  }

  return base;
}

/**
 * Build the full list of companion apps (static + dynamic detection).
 */
async function buildCompanionStatus(): Promise<{
  apps: CompanionApp[];
  totalConnected: number;
  lastRefreshed: number;
}> {
  const apps: CompanionApp[] = [
    // Static companion placeholders
    {
      id: "pwa",
      name: "HoC Companion (React PWA)",
      type: "pwa",
      status: "unknown",
      version: null,
      lastSeen: null,
      endpoint: null,
      config: {},
      capabilities: ["notifications", "voice", "biometrics", "task-management"],
    },
    {
      id: "chrome-extension",
      name: "HoC Chrome Extension",
      type: "chrome-extension",
      status: "unknown",
      version: null,
      lastSeen: null,
      endpoint: null,
      config: {},
      capabilities: ["page-context", "tab-management", "content-injection", "screenshot"],
    },
  ];

  // Only probe Windows companion on win32
  if (process.platform === "win32") {
    apps.push(await getWindowsServiceApp());
  } else {
    apps.push({
      id: "windows-service",
      name: "HoC Windows Companion Service",
      type: "windows-service",
      status: "disconnected",
      version: null,
      lastSeen: null,
      endpoint: null,
      config: {},
      capabilities: [
        "mouse-control",
        "keyboard-control",
        "screen-capture",
        "process-management",
      ],
    });
  }

  const totalConnected = apps.filter((a) => a.status === "connected").length;
  return { apps, totalConnected, lastRefreshed: Date.now() };
}

export const companionHandlers: GatewayRequestHandlers = {
  /**
   * companion.status — Returns all companion apps with their current statuses.
   */
  "companion.status": async ({ respond }) => {
    try {
      const status = await buildCompanionStatus();
      respond(true, status);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, `companion status failed: ${String(err)}`),
      );
    }
  },

  /**
   * companion.ping — Pings a specific companion app to check connectivity.
   */
  "companion.ping": async ({ params, respond }) => {
    const appId = params.appId as string | undefined;
    if (!appId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "appId required"));
      return;
    }

    if (appId === "windows-service") {
      try {
        const available = await isCompanionAvailable();
        if (available) {
          const bridge = getCompanionBridge();
          await bridge.healthCheck();
          respond(true, { ok: true, appId, latencyMs: 0 });
        } else {
          respond(true, { ok: false, appId, reason: "Service not available" });
        }
      } catch (err) {
        respond(true, { ok: false, appId, reason: String(err) });
      }
      return;
    }

    // For PWA / chrome-extension — no active ping mechanism yet
    respond(true, { ok: false, appId, reason: "No active ping mechanism for this companion type" });
  },

  /**
   * companion.configure — Update configuration for a companion app.
   */
  "companion.configure": async ({ params, respond }) => {
    const appId = params.appId as string | undefined;
    const config = params.config as Record<string, unknown> | undefined;
    if (!appId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "appId required"));
      return;
    }
    if (!config || typeof config !== "object") {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "config object required"));
      return;
    }

    // For now, configuration is accepted but not persisted server-side
    respond(true, { ok: true, appId });
  },

  /**
   * ping — Lightweight keepalive for companion nodes (ESP32, M5Stick).
   * Returns a simple pong with server timestamp.
   */
  "ping": async ({ respond }) => {
    respond(true, { pong: true, ts: Date.now() });
  },
};
