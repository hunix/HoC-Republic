/**
 * Windows Control — Gateway server methods
 *
 * Exposes the full Windows companion surface as gateway RPC methods.
 * All methods are prefixed with "windows." and route through the companion bridge.
 */

import type { GatewayRequestHandlers, RespondFn } from "./types.js";
import { getCompanionBridge, isCompanionAvailable } from "../../infra/companion-bridge.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";

/** Helper: send a raw command to the companion and respond */
async function companionExec(
  command: string,
  params: Record<string, unknown>,
  respond: (
    ok: boolean,
    payload?: unknown,
    error?: import("../protocol/index.js").ErrorShape,
  ) => void,
) {
  if (!(await isCompanionAvailable())) {
    respond(
      false,
      undefined,
      errorShape(ErrorCodes.UNAVAILABLE, "Windows companion service is not available"),
    );
    return;
  }
  try {
    const bridge = getCompanionBridge();
    await bridge.connect();
    const result = await bridge.invoke(command, params);
    respond(true, result);
  } catch (err) {
    respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
  }
}

/** Build a simple passthrough handler for a companion command */
function passthrough(companionCommand: string) {
  return async ({ params, respond }: { params: Record<string, unknown>; respond: RespondFn }) => {
    await companionExec(companionCommand, params, respond);
  };
}

export const windowsControlHandlers: GatewayRequestHandlers = {
  // ── Capabilities ─────────────────────────────────────────
  "windows.capabilities": async ({ respond }) => {
    const { getWindowsCapabilities } = await import("./windows/capabilities.js");
    respond(true, getWindowsCapabilities());
  },

  // ── Input Simulation ─────────────────────────────────────
  "windows.input.mouse.move": passthrough("input.mouse.move"),
  "windows.input.mouse.click": passthrough("input.mouse.click"),
  "windows.input.mouse.scroll": passthrough("input.mouse.scroll"),
  "windows.input.keyboard.type": passthrough("input.keyboard.type"),
  "windows.input.keyboard.press": passthrough("input.keyboard.press"),
  "windows.input.keyboard.combo": passthrough("input.keyboard.combo"),

  // ── UI Automation ────────────────────────────────────────
  "windows.ui.find": passthrough("ui.find"),
  "windows.ui.click": passthrough("ui.click"),
  "windows.ui.read": passthrough("ui.read"),
  "windows.ui.list": passthrough("ui.list"),
  "windows.ui.tree": passthrough("ui.tree"),

  // ── Process ──────────────────────────────────────────────
  "windows.process.list": passthrough("process.list"),
  "windows.process.start": passthrough("process.start"),
  "windows.process.kill": passthrough("process.kill"),
  "windows.process.info": passthrough("process.info"),
  "windows.process.focus": passthrough("process.focus"),
  "windows.process.priority": passthrough("process.priority"),

  // ── Screen ───────────────────────────────────────────────
  "windows.screen.capture": passthrough("screen.capture"),
  "windows.screen.list": passthrough("screen.list"),
  "windows.screen.info": passthrough("screen.info"),

  // ── Audio ────────────────────────────────────────────────
  "windows.audio.devices": passthrough("audio.devices"),
  "windows.audio.record.start": passthrough("audio.record.start"),
  "windows.audio.record.stop": passthrough("audio.record.stop"),
  "windows.audio.play": passthrough("audio.play"),
  "windows.audio.volume.get": passthrough("audio.volume.get"),
  "windows.audio.volume.set": passthrough("audio.volume.set"),
  "windows.audio.mute": passthrough("audio.mute"),
  "windows.audio.unmute": passthrough("audio.unmute"),

  // ── System ───────────────────────────────────────────────
  "windows.system.info": passthrough("system.info"),
  "windows.system.wmi.query": passthrough("system.wmi.query"),
  "windows.system.service.list": passthrough("system.service.list"),
  "windows.system.service.control": passthrough("system.service.control"),
  "windows.system.shutdown": passthrough("system.shutdown"),
  "windows.system.restart": passthrough("system.restart"),
  "windows.system.sleep": passthrough("system.sleep"),
  "windows.system.hibernate": passthrough("system.hibernate"),
  "windows.system.lock": passthrough("system.lock"),
  "windows.system.logoff": passthrough("system.logoff"),
  "windows.system.notification.show": passthrough("system.notification.show"),
  "windows.system.users.list": passthrough("system.users.list"),
  "windows.system.users.current": passthrough("system.users.current"),

  // ── Health ───────────────────────────────────────────────
  "windows.health.check": passthrough("health.check"),

  // ── PowerShell ───────────────────────────────────────────
  "windows.powershell.execute": passthrough("powershell.execute"),
  "windows.powershell.remoting": passthrough("powershell.remoting"),

  // ── Registry ─────────────────────────────────────────────
  "windows.system.registry.read": passthrough("system.registry.read"),
  "windows.system.registry.write": passthrough("system.registry.write"),

  // ── Environment Variables ────────────────────────────────
  "windows.system.env.get": passthrough("system.env.get"),
  "windows.system.env.set": passthrough("system.env.set"),

  // ── Firewall ─────────────────────────────────────────────
  "windows.system.firewall.rule": passthrough("system.firewall.rule"),

  // ── Task Scheduler ───────────────────────────────────────
  "windows.system.task.schedule": passthrough("system.task.schedule"),

  // ── Hardware ─────────────────────────────────────────────
  "windows.hardware.gpu.info": passthrough("hardware.gpu.info"),
  "windows.hardware.disk.info": passthrough("hardware.disk.info"),
  "windows.hardware.network.info": passthrough("hardware.network.info"),
  "windows.hardware.memory.info": passthrough("hardware.memory.info"),
  "windows.hardware.battery.info": passthrough("hardware.battery.info"),
  "windows.hardware.display.brightness": passthrough("hardware.display.brightness"),

  // ── File Operations ──────────────────────────────────────
  "windows.file.read": passthrough("file.read"),
  "windows.file.write": passthrough("file.write"),
  "windows.file.list": passthrough("file.list"),
  "windows.file.search": passthrough("file.search"),

  // ── Clipboard ────────────────────────────────────────────
  "windows.clipboard.get": passthrough("clipboard.get"),
  "windows.clipboard.set": passthrough("clipboard.set"),

  // ── Window Management ────────────────────────────────────
  "windows.window.list": passthrough("window.list"),
  "windows.window.focus": passthrough("window.focus"),
  "windows.window.resize": passthrough("window.resize"),
  "windows.window.minimize": passthrough("window.minimize"),
  "windows.window.close": passthrough("window.close"),
  "windows.window.maximize": passthrough("window.maximize"),
  "windows.window.move": passthrough("window.move"),
  "windows.window.snap": passthrough("window.snap"),
  "windows.window.opacity": passthrough("window.opacity"),
  "windows.window.topmost": passthrough("window.topmost"),
  "windows.window.title.set": passthrough("window.title.set"),

  // ── Display ──────────────────────────────────────────────
  "windows.display.resolution.get": passthrough("display.resolution.get"),
  "windows.display.resolution.set": passthrough("display.resolution.set"),
  "windows.display.list": passthrough("display.list"),

  // ── Network ──────────────────────────────────────────────
  "windows.network.adapters": passthrough("network.adapters"),
  "windows.network.ip": passthrough("network.ip"),
  "windows.network.wifi.list": passthrough("network.wifi.list"),
  "windows.network.wifi.connect": passthrough("network.wifi.connect"),
  "windows.network.wifi.disconnect": passthrough("network.wifi.disconnect"),
  "windows.network.dns.flush": passthrough("network.dns.flush"),

  // ── Installed Apps ───────────────────────────────────────
  "windows.apps.installed": passthrough("apps.installed"),
  "windows.apps.uninstall": passthrough("apps.uninstall"),

  // ── Device Management ────────────────────────────────────
  "windows.device.list": passthrough("device.list"),
  "windows.device.enable": passthrough("device.enable"),
  "windows.device.disable": passthrough("device.disable"),

  // ── Vision ───────────────────────────────────────────────
  "windows.vision.analyze": passthrough("vision.analyze"),
  "windows.vision.describe": passthrough("vision.describe"),
  "windows.vision.find_element": passthrough("vision.find_element"),
  "windows.vision.ocr": passthrough("vision.ocr"),
};
