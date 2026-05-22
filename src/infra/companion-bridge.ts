/**
 * IPC Bridge for communicating with the Windows Companion Service
 * Provides a TypeScript interface to the C# companion's capabilities
 */

import { Socket } from "node:net";
import { logger } from "../logger.js";
import { ErrorCategory, ErrorSeverity, handleError } from "./error-handler.js";

export interface CompanionRequest {
  command: string;
  parameters: Record<string, unknown>;
}

export interface CompanionResponse {
  success: boolean;
  data?: unknown;
  error?: string;
  stackTrace?: string;
}

export class CompanionBridge {
  private socket: Socket | null = null;
  private connected = false;
  private readonly pipeName: string;
  private requestQueue: Array<{
    request: CompanionRequest;
    resolve: (response: CompanionResponse) => void;
    reject: (error: Error) => void;
  }> = [];

  constructor(pipeName = "\\\\.\\pipe\\OpenClawCompanion") {
    this.pipeName = pipeName;
  }

  /**
   * Connect to the companion service
   */
  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        this.socket = new Socket();

        this.socket.on("connect", () => {
          this.connected = true;
          logger.info("Connected to Windows Companion Service");
          resolve();
        });

        this.socket.on("error", (error) => {
          handleError(error, {
            category: ErrorCategory.WINDOWS,
            component: "CompanionBridge",
            operation: "connect",
          });
          reject(error);
        });

        this.socket.on("close", () => {
          this.connected = false;
          logger.warn("Disconnected from Windows Companion Service");
        });

        this.socket.on("data", (data) => {
          this.handleResponse(data.toString());
        });

        // Connect to named pipe
        this.socket.connect(this.pipeName);
      } catch (error) {
        handleError(error, {
          category: ErrorCategory.WINDOWS,
          component: "CompanionBridge",
          operation: "connect",
          severity: ErrorSeverity.ERROR,
        });
        reject(error);
      }
    });
  }

  /**
   * Disconnect from the companion service
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.end();
      this.socket = null;
      this.connected = false;
    }
  }

  /**
   * Send a request to the companion service
   */
  async sendRequest(request: CompanionRequest): Promise<CompanionResponse> {
    if (!this.connected) {
      await this.connect();
    }

    return new Promise((resolve, reject) => {
      try {
        // C# System.Text.Json default deserialization is case-sensitive PascalCase.
        // Send PascalCase keys to match CompanionRequest { Command, Parameters }.
        const wirePayload = {
          Command: request.command,
          Parameters: request.parameters,
        };
        const requestJson = JSON.stringify(wirePayload) + "\n";
        this.socket?.write(requestJson);

        this.requestQueue.push({ request, resolve, reject });
      } catch (error) {
        handleError(error, {
          category: ErrorCategory.WINDOWS,
          component: "CompanionBridge",
          operation: "sendRequest",
        });
        reject(error);
      }
    });
  }

  private handleResponse(data: string): void {
    try {
      // C# serializes PascalCase: { Success, Data, Error, StackTrace }
      // Normalize to our camelCase interface.
      const raw = JSON.parse(data);
      const response: CompanionResponse = {
        success: raw.success ?? raw.Success ?? false,
        data: raw.data ?? raw.Data,
        error: raw.error ?? raw.Error,
        stackTrace: raw.stackTrace ?? raw.StackTrace,
      };
      const pending = this.requestQueue.shift();

      if (pending) {
        if (response.success) {
          pending.resolve(response);
        } else {
          pending.reject(new Error(response.error || "Unknown error"));
        }
      }
    } catch (error) {
      handleError(error, {
        category: ErrorCategory.WINDOWS,
        component: "CompanionBridge",
        operation: "handleResponse",
      });
    }
  }

  // ── Generic invoke (any command) ─────────────────────────────

  /** Send any command to the companion service by name */
  async invoke(command: string, parameters: Record<string, unknown> = {}): Promise<unknown> {
    const response = await this.sendRequest({ command, parameters });
    if (!response.success) {throw new Error(response.error || `Command ${command} failed`);}
    return response.data;
  }

  // ── Input Simulation ──────────────────────────────────────────

  async moveMouse(x: number, y: number): Promise<void> {
    const r = await this.sendRequest({ command: "input.mouse.move", parameters: { x, y } });
    if (!r.success) {throw new Error(r.error || "Failed to move mouse");}
  }

  async clickMouse(button: "left" | "right" | "middle" = "left"): Promise<void> {
    const r = await this.sendRequest({ command: "input.mouse.click", parameters: { button } });
    if (!r.success) {throw new Error(r.error || "Failed to click mouse");}
  }

  async scrollMouse(delta: number, direction: "vertical" | "horizontal" = "vertical"): Promise<void> {
    const r = await this.sendRequest({ command: "input.mouse.scroll", parameters: { delta, direction } });
    if (!r.success) {throw new Error(r.error || "Failed to scroll mouse");}
  }

  async typeText(text: string): Promise<void> {
    const r = await this.sendRequest({ command: "input.keyboard.type", parameters: { text } });
    if (!r.success) {throw new Error(r.error || "Failed to type text");}
  }

  async pressKey(key: string, modifiers?: string[]): Promise<void> {
    const r = await this.sendRequest({ command: "input.keyboard.press", parameters: { key, modifiers } });
    if (!r.success) {throw new Error(r.error || "Failed to press key");}
  }

  async keyCombo(keys: string[]): Promise<void> {
    const r = await this.sendRequest({ command: "input.keyboard.combo", parameters: { keys } });
    if (!r.success) {throw new Error(r.error || "Failed to execute key combo");}
  }

  // ── UI Automation ─────────────────────────────────────────────

  async findUIElement(selector: string): Promise<{
    found: boolean;
    name?: string;
    className?: string;
    bounds?: { x: number; y: number; width: number; height: number };
  }> {
    const r = await this.sendRequest({ command: "ui.find", parameters: { selector } });
    if (!r.success) {throw new Error(r.error || "Failed to find UI element");}
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any
    return r.data as any;
  }

  async clickUIElement(selector: string): Promise<void> {
    const r = await this.sendRequest({ command: "ui.click", parameters: { selector } });
    if (!r.success) {throw new Error(r.error || "Failed to click UI element");}
  }

  async readUIElement(selector: string): Promise<string> {
    const r = await this.sendRequest({ command: "ui.read", parameters: { selector } });
    if (!r.success) {throw new Error(r.error || "Failed to read UI element");}
    return (r.data as { text: string }).text;
  }

  async listUIElements(selector?: string): Promise<unknown[]> {
    const r = await this.sendRequest({ command: "ui.list", parameters: { selector } });
    if (!r.success) {throw new Error(r.error || "Failed to list UI elements");}
    return r.data as unknown[];
  }

  async uiTree(depth?: number): Promise<unknown> {
    const r = await this.sendRequest({ command: "ui.tree", parameters: { depth } });
    if (!r.success) {throw new Error(r.error || "Failed to get UI tree");}
    return r.data;
  }

  // ── Process Management ────────────────────────────────────────

  async processList(): Promise<unknown[]> {
    const r = await this.sendRequest({ command: "process.list", parameters: {} });
    if (!r.success) {throw new Error(r.error || "Failed to list processes");}
    return r.data as unknown[];
  }

  async processStart(path: string, args?: string[]): Promise<{ pid: number }> {
    const r = await this.sendRequest({ command: "process.start", parameters: { path, args } });
    if (!r.success) {throw new Error(r.error || "Failed to start process");}
    return r.data as { pid: number };
  }

  async processKill(pid: number): Promise<void> {
    const r = await this.sendRequest({ command: "process.kill", parameters: { pid } });
    if (!r.success) {throw new Error(r.error || "Failed to kill process");}
  }

  async processInfo(pid: number): Promise<unknown> {
    const r = await this.sendRequest({ command: "process.info", parameters: { pid } });
    if (!r.success) {throw new Error(r.error || "Failed to get process info");}
    return r.data;
  }

  async processFocus(pid: number): Promise<void> {
    const r = await this.sendRequest({ command: "process.focus", parameters: { pid } });
    if (!r.success) {throw new Error(r.error || "Failed to focus process");}
  }

  async processPriority(pid: number, priority: string): Promise<void> {
    const r = await this.sendRequest({ command: "process.priority", parameters: { pid, priority } });
    if (!r.success) {throw new Error(r.error || "Failed to set process priority");}
  }

  // ── Screen ────────────────────────────────────────────────────

  async captureScreen(screen?: number): Promise<Buffer> {
    const r = await this.sendRequest({ command: "screen.capture", parameters: { screen } });
    if (!r.success) {throw new Error(r.error || "Failed to capture screen");}
    const base64Data = (r.data as { image: string }).image;
    return Buffer.from(base64Data, "base64");
  }

  async screenList(): Promise<unknown[]> {
    const r = await this.sendRequest({ command: "screen.list", parameters: {} });
    if (!r.success) {throw new Error(r.error || "Failed to list screens");}
    return r.data as unknown[];
  }

  async screenInfo(screen?: number): Promise<unknown> {
    const r = await this.sendRequest({ command: "screen.info", parameters: { screen } });
    if (!r.success) {throw new Error(r.error || "Failed to get screen info");}
    return r.data;
  }

  // ── Audio ─────────────────────────────────────────────────────

  async audioDevices(): Promise<unknown[]> {
    const r = await this.sendRequest({ command: "audio.devices", parameters: {} });
    if (!r.success) {throw new Error(r.error || "Failed to list audio devices");}
    return r.data as unknown[];
  }

  async audioRecordStart(device?: string): Promise<void> {
    const r = await this.sendRequest({ command: "audio.record.start", parameters: { device } });
    if (!r.success) {throw new Error(r.error || "Failed to start audio recording");}
  }

  async audioRecordStop(): Promise<{ path: string }> {
    const r = await this.sendRequest({ command: "audio.record.stop", parameters: {} });
    if (!r.success) {throw new Error(r.error || "Failed to stop audio recording");}
    return r.data as { path: string };
  }

  async audioPlay(path: string): Promise<void> {
    const r = await this.sendRequest({ command: "audio.play", parameters: { path } });
    if (!r.success) {throw new Error(r.error || "Failed to play audio");}
  }

  async audioVolumeGet(): Promise<{ volume: number; muted: boolean }> {
    const r = await this.sendRequest({ command: "audio.volume.get", parameters: {} });
    if (!r.success) {throw new Error(r.error || "Failed to get volume");}
    return r.data as { volume: number; muted: boolean };
  }

  async audioVolumeSet(level: number): Promise<void> {
    const r = await this.sendRequest({ command: "audio.volume.set", parameters: { level } });
    if (!r.success) {throw new Error(r.error || "Failed to set volume");}
  }

  async audioMute(): Promise<void> {
    const r = await this.sendRequest({ command: "audio.mute", parameters: {} });
    if (!r.success) {throw new Error(r.error || "Failed to mute audio");}
  }

  async audioUnmute(): Promise<void> {
    const r = await this.sendRequest({ command: "audio.unmute", parameters: {} });
    if (!r.success) {throw new Error(r.error || "Failed to unmute audio");}
  }

  // ── System Operations ─────────────────────────────────────────

  async queryWMI(query: string): Promise<Array<Record<string, unknown>>> {
    const r = await this.sendRequest({ command: "system.wmi.query", parameters: { query } });
    if (!r.success) {throw new Error(r.error || "Failed to query WMI");}
    return r.data as Array<Record<string, unknown>>;
  }

  async serviceList(): Promise<unknown[]> {
    const r = await this.sendRequest({ command: "system.service.list", parameters: {} });
    if (!r.success) {throw new Error(r.error || "Failed to list services");}
    return r.data as unknown[];
  }

  async serviceControl(name: string, action: "start" | "stop" | "restart"): Promise<void> {
    const r = await this.sendRequest({ command: "system.service.control", parameters: { name, action } });
    if (!r.success) {throw new Error(r.error || "Failed to control service");}
  }

  async systemInfo(): Promise<unknown> {
    const r = await this.sendRequest({ command: "system.info", parameters: {} });
    if (!r.success) {throw new Error(r.error || "Failed to get system info");}
    return r.data;
  }

  async executeCommand(command: string, args?: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const r = await this.sendRequest({ command: "system.run", parameters: { command, args } });
    if (!r.success) {throw new Error(r.error || "Failed to execute command");}
    return r.data as { exitCode: number; stdout: string; stderr: string };
  }

  // ── System Power ──────────────────────────────────────────────

  async systemShutdown(options?: { delay?: number; force?: boolean }): Promise<void> {
    const r = await this.sendRequest({ command: "system.shutdown", parameters: options || {} });
    if (!r.success) {throw new Error(r.error || "Failed to shutdown");}
  }

  async systemRestart(options?: { delay?: number; force?: boolean }): Promise<void> {
    const r = await this.sendRequest({ command: "system.restart", parameters: options || {} });
    if (!r.success) {throw new Error(r.error || "Failed to restart");}
  }

  async systemSleep(): Promise<void> {
    const r = await this.sendRequest({ command: "system.sleep", parameters: {} });
    if (!r.success) {throw new Error(r.error || "Failed to enter sleep mode");}
  }

  async systemHibernate(): Promise<void> {
    const r = await this.sendRequest({ command: "system.hibernate", parameters: {} });
    if (!r.success) {throw new Error(r.error || "Failed to hibernate");}
  }

  async systemLock(): Promise<void> {
    const r = await this.sendRequest({ command: "system.lock", parameters: {} });
    if (!r.success) {throw new Error(r.error || "Failed to lock workstation");}
  }

  async systemLogoff(): Promise<void> {
    const r = await this.sendRequest({ command: "system.logoff", parameters: {} });
    if (!r.success) {throw new Error(r.error || "Failed to logoff");}
  }

  // ── Notifications ─────────────────────────────────────────────

  async showNotification(message: string, title?: string, icon?: "info" | "warning" | "error"): Promise<void> {
    const r = await this.sendRequest({ command: "system.notification.show", parameters: { message, title, icon } });
    if (!r.success) {throw new Error(r.error || "Failed to show notification");}
  }

  // ── Health Check ──────────────────────────────────────────────

  async healthCheck(): Promise<unknown> {
    const r = await this.sendRequest({ command: "health.check", parameters: {} });
    if (!r.success) {throw new Error(r.error || "Health check failed");}
    return r.data;
  }

  // ── PowerShell ────────────────────────────────────────────────

  async executePowerShell(script: string, admin?: boolean): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const r = await this.sendRequest({ command: "powershell.execute", parameters: { script, admin } });
    if (!r.success) {throw new Error(r.error || "Failed to execute PowerShell");}
    return r.data as { exitCode: number; stdout: string; stderr: string };
  }

  async executePowerShellRemoting(host: string, script: string): Promise<unknown> {
    const r = await this.sendRequest({ command: "powershell.remoting", parameters: { host, script } });
    if (!r.success) {throw new Error(r.error || "Failed to execute remote PowerShell");}
    return r.data;
  }

  // ── Registry ──────────────────────────────────────────────────

  async registryRead(path: string, name?: string): Promise<unknown> {
    const r = await this.sendRequest({ command: "system.registry.read", parameters: { path, name } });
    if (!r.success) {throw new Error(r.error || "Failed to read registry");}
    return r.data;
  }

  async registryWrite(path: string, name: string, value: unknown, type?: string): Promise<void> {
    const r = await this.sendRequest({ command: "system.registry.write", parameters: { path, name, value, type } });
    if (!r.success) {throw new Error(r.error || "Failed to write registry");}
  }

  // ── Environment Variables ─────────────────────────────────────

  async envGet(name: string, target?: "machine" | "user" | "process"): Promise<string | null> {
    const r = await this.sendRequest({ command: "system.env.get", parameters: { name, target } });
    if (!r.success) {throw new Error(r.error || "Failed to get env var");}
    return (r.data as { value: string | null }).value;
  }

  async envSet(name: string, value: string, target?: "machine" | "user" | "process"): Promise<void> {
    const r = await this.sendRequest({ command: "system.env.set", parameters: { name, value, target } });
    if (!r.success) {throw new Error(r.error || "Failed to set env var");}
  }

  // ── Firewall ──────────────────────────────────────────────────

  async firewallRule(name: string, action: "allow" | "block", direction: "inbound" | "outbound", port?: number, protocol?: string): Promise<void> {
    const r = await this.sendRequest({ command: "system.firewall.rule", parameters: { name, action, direction, port, protocol } });
    if (!r.success) {throw new Error(r.error || "Failed to set firewall rule");}
  }

  // ── Task Scheduler ────────────────────────────────────────────

  async taskSchedule(name: string, command: string, trigger: string, options?: Record<string, unknown>): Promise<void> {
    const r = await this.sendRequest({ command: "system.task.schedule", parameters: { name, command: command, trigger, ...options } });
    if (!r.success) {throw new Error(r.error || "Failed to schedule task");}
  }

  // ── Hardware Info ─────────────────────────────────────────────

  async hardwareGpuInfo(): Promise<unknown> {
    const r = await this.sendRequest({ command: "hardware.gpu.info", parameters: {} });
    if (!r.success) {throw new Error(r.error || "Failed to get GPU info");}
    return r.data;
  }

  async hardwareDiskInfo(): Promise<unknown> {
    const r = await this.sendRequest({ command: "hardware.disk.info", parameters: {} });
    if (!r.success) {throw new Error(r.error || "Failed to get disk info");}
    return r.data;
  }

  async hardwareNetworkInfo(): Promise<unknown> {
    const r = await this.sendRequest({ command: "hardware.network.info", parameters: {} });
    if (!r.success) {throw new Error(r.error || "Failed to get network info");}
    return r.data;
  }

  async hardwareMemoryInfo(): Promise<unknown> {
    const r = await this.sendRequest({ command: "hardware.memory.info", parameters: {} });
    if (!r.success) {throw new Error(r.error || "Failed to get memory info");}
    return r.data;
  }

  async hardwareBatteryInfo(): Promise<unknown> {
    const r = await this.sendRequest({ command: "hardware.battery.info", parameters: {} });
    if (!r.success) {throw new Error(r.error || "Failed to get battery info");}
    return r.data;
  }

  async displayBrightness(level?: number): Promise<{ brightness: number }> {
    const r = await this.sendRequest({ command: "hardware.display.brightness", parameters: { level } });
    if (!r.success) {throw new Error(r.error || "Failed to get/set brightness");}
    return r.data as { brightness: number };
  }

  // ── File Operations ───────────────────────────────────────────

  async fileRead(path: string): Promise<string> {
    const r = await this.sendRequest({ command: "file.read", parameters: { path } });
    if (!r.success) {throw new Error(r.error || "Failed to read file");}
    return (r.data as { content: string }).content;
  }

  async fileWrite(path: string, content: string): Promise<void> {
    const r = await this.sendRequest({ command: "file.write", parameters: { path, content } });
    if (!r.success) {throw new Error(r.error || "Failed to write file");}
  }

  async fileList(path: string): Promise<unknown[]> {
    const r = await this.sendRequest({ command: "file.list", parameters: { path } });
    if (!r.success) {throw new Error(r.error || "Failed to list files");}
    return r.data as unknown[];
  }

  async fileSearch(path: string, pattern: string): Promise<unknown[]> {
    const r = await this.sendRequest({ command: "file.search", parameters: { path, pattern } });
    if (!r.success) {throw new Error(r.error || "Failed to search files");}
    return r.data as unknown[];
  }

  // ── Clipboard ─────────────────────────────────────────────────

  async clipboardGet(): Promise<string> {
    const r = await this.sendRequest({ command: "clipboard.get", parameters: {} });
    if (!r.success) {throw new Error(r.error || "Failed to get clipboard");}
    return (r.data as { text: string }).text;
  }

  async clipboardSet(text: string): Promise<void> {
    const r = await this.sendRequest({ command: "clipboard.set", parameters: { text } });
    if (!r.success) {throw new Error(r.error || "Failed to set clipboard");}
  }

  // ── Window Management ─────────────────────────────────────────

  async windowList(): Promise<Array<{
    handle: number; title: string; pid: number;
    x: number; y: number; width: number; height: number;
  }>> {
    const r = await this.sendRequest({ command: "window.list", parameters: {} });
    if (!r.success) {throw new Error(r.error || "Failed to list windows");}
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any
    return r.data as any;
  }

  async windowFocus(handle: number): Promise<void> {
    const r = await this.sendRequest({ command: "window.focus", parameters: { handle } });
    if (!r.success) {throw new Error(r.error || "Failed to focus window");}
  }

  async windowResize(handle: number, width: number, height: number): Promise<void> {
    const r = await this.sendRequest({ command: "window.resize", parameters: { handle, width, height } });
    if (!r.success) {throw new Error(r.error || "Failed to resize window");}
  }

  async windowMinimize(handle: number): Promise<void> {
    const r = await this.sendRequest({ command: "window.minimize", parameters: { handle } });
    if (!r.success) {throw new Error(r.error || "Failed to minimize window");}
  }

  async windowClose(handle: number): Promise<void> {
    const r = await this.sendRequest({ command: "window.close", parameters: { handle } });
    if (!r.success) {throw new Error(r.error || "Failed to close window");}
  }

  async windowMaximize(handle: number): Promise<void> {
    const r = await this.sendRequest({ command: "window.maximize", parameters: { handle } });
    if (!r.success) {throw new Error(r.error || "Failed to maximize window");}
  }

  async windowMove(handle: number, x: number, y: number): Promise<void> {
    const r = await this.sendRequest({ command: "window.move", parameters: { handle, x, y } });
    if (!r.success) {throw new Error(r.error || "Failed to move window");}
  }

  async windowSnap(handle: number, position: "left" | "right" | "top-left" | "top-right" | "bottom-left" | "bottom-right" | "top" | "bottom" | "full"): Promise<void> {
    const r = await this.sendRequest({ command: "window.snap", parameters: { handle, position } });
    if (!r.success) {throw new Error(r.error || "Failed to snap window");}
  }

  async windowOpacity(handle: number, opacity: number): Promise<void> {
    const r = await this.sendRequest({ command: "window.opacity", parameters: { handle, opacity } });
    if (!r.success) {throw new Error(r.error || "Failed to set window opacity");}
  }

  async windowTopmost(handle: number, topmost = true): Promise<void> {
    const r = await this.sendRequest({ command: "window.topmost", parameters: { handle, topmost } });
    if (!r.success) {throw new Error(r.error || "Failed to set window topmost");}
  }

  async windowTitleSet(handle: number, title: string): Promise<void> {
    const r = await this.sendRequest({ command: "window.title.set", parameters: { handle, title } });
    if (!r.success) {throw new Error(r.error || "Failed to set window title");}
  }

  // ── Display ───────────────────────────────────────────────────

  async displayResolutionGet(screen?: number): Promise<{ width: number; height: number; bitsPerPixel: number; primary: boolean; deviceName: string }> {
    const r = await this.sendRequest({ command: "display.resolution.get", parameters: { screen } });
    if (!r.success) {throw new Error(r.error || "Failed to get display resolution");}
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any
    return r.data as any;
  }

  async displayResolutionSet(width: number, height: number): Promise<void> {
    const r = await this.sendRequest({ command: "display.resolution.set", parameters: { width, height } });
    if (!r.success) {throw new Error(r.error || "Failed to set display resolution");}
  }

  async displayList(): Promise<unknown[]> {
    const r = await this.sendRequest({ command: "display.list", parameters: {} });
    if (!r.success) {throw new Error(r.error || "Failed to list displays");}
    return r.data as unknown[];
  }

  // ── Network ───────────────────────────────────────────────────

  async networkAdapters(): Promise<unknown[]> {
    const r = await this.sendRequest({ command: "network.adapters", parameters: {} });
    if (!r.success) {throw new Error(r.error || "Failed to list network adapters");}
    return r.data as unknown[];
  }

  async networkIp(): Promise<unknown> {
    const r = await this.sendRequest({ command: "network.ip", parameters: {} });
    if (!r.success) {throw new Error(r.error || "Failed to get IP config");}
    return r.data;
  }

  async networkWifiList(): Promise<unknown> {
    const r = await this.sendRequest({ command: "network.wifi.list", parameters: {} });
    if (!r.success) {throw new Error(r.error || "Failed to list Wi-Fi networks");}
    return r.data;
  }

  async networkWifiConnect(ssid: string, password?: string): Promise<void> {
    const r = await this.sendRequest({ command: "network.wifi.connect", parameters: { ssid, password } });
    if (!r.success) {throw new Error(r.error || "Failed to connect to Wi-Fi");}
  }

  async networkWifiDisconnect(): Promise<void> {
    const r = await this.sendRequest({ command: "network.wifi.disconnect", parameters: {} });
    if (!r.success) {throw new Error(r.error || "Failed to disconnect from Wi-Fi");}
  }

  async networkDnsFlush(): Promise<void> {
    const r = await this.sendRequest({ command: "network.dns.flush", parameters: {} });
    if (!r.success) {throw new Error(r.error || "Failed to flush DNS cache");}
  }

  // ── Installed Apps ────────────────────────────────────────────

  async appsInstalled(): Promise<unknown[]> {
    const r = await this.sendRequest({ command: "apps.installed", parameters: {} });
    if (!r.success) {throw new Error(r.error || "Failed to list installed apps");}
    return r.data as unknown[];
  }

  async appsUninstall(name: string, silent?: boolean): Promise<unknown> {
    const r = await this.sendRequest({ command: "apps.uninstall", parameters: { name, silent } });
    if (!r.success) {throw new Error(r.error || "Failed to uninstall app");}
    return r.data;
  }

  // ── User Accounts ─────────────────────────────────────────────

  async usersList(): Promise<unknown[]> {
    const r = await this.sendRequest({ command: "system.users.list", parameters: {} });
    if (!r.success) {throw new Error(r.error || "Failed to list users");}
    return r.data as unknown[];
  }

  async usersCurrent(): Promise<{
    name: string; isAuthenticated: boolean; isSystem: boolean; isAdmin: boolean; groups: string[];
  }> {
    const r = await this.sendRequest({ command: "system.users.current", parameters: {} });
    if (!r.success) {throw new Error(r.error || "Failed to get current user");}
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any
    return r.data as any;
  }

  // ── Device Management ─────────────────────────────────────────

  async deviceList(category?: string): Promise<unknown[]> {
    const r = await this.sendRequest({ command: "device.list", parameters: { category } });
    if (!r.success) {throw new Error(r.error || "Failed to list devices");}
    return r.data as unknown[];
  }

  async deviceEnable(deviceId: string): Promise<void> {
    const r = await this.sendRequest({ command: "device.enable", parameters: { deviceId } });
    if (!r.success) {throw new Error(r.error || "Failed to enable device");}
  }

  async deviceDisable(deviceId: string): Promise<void> {
    const r = await this.sendRequest({ command: "device.disable", parameters: { deviceId } });
    if (!r.success) {throw new Error(r.error || "Failed to disable device");}
  }

  // ── Vision (VLM via Ollama) ───────────────────────────────────

  async visionAnalyze(imagePath: string, prompt?: string): Promise<unknown> {
    const r = await this.sendRequest({ command: "vision.analyze", parameters: { imagePath, prompt } });
    if (!r.success) {throw new Error(r.error || "Failed to analyze image");}
    return r.data;
  }

  async visionDescribe(imagePath: string): Promise<string> {
    const r = await this.sendRequest({ command: "vision.describe", parameters: { imagePath } });
    if (!r.success) {throw new Error(r.error || "Failed to describe image");}
    return (r.data as { description: string }).description;
  }

  async visionFindElement(imagePath: string, element: string): Promise<unknown> {
    const r = await this.sendRequest({ command: "vision.find_element", parameters: { imagePath, element } });
    if (!r.success) {throw new Error(r.error || "Failed to find element in image");}
    return r.data;
  }

  async visionOCR(imagePath: string): Promise<string> {
    const r = await this.sendRequest({ command: "vision.ocr", parameters: { imagePath } });
    if (!r.success) {throw new Error(r.error || "Failed to perform OCR");}
    return (r.data as { text: string }).text;
  }
}

/**
 * Global companion bridge instance
 */
let globalBridge: CompanionBridge | null = null;

/**
 * Get or create the global companion bridge
 */
export function getCompanionBridge(): CompanionBridge {
  if (!globalBridge) {
    globalBridge = new CompanionBridge();
  }
  return globalBridge;
}

/**
 * Check if the companion service is available
 */
export async function isCompanionAvailable(): Promise<boolean> {
  if (process.platform !== "win32") {
    return false;
  }

  try {
    const bridge = getCompanionBridge();
    await bridge.connect();
    return true;
  } catch {
    return false;
  }
}
