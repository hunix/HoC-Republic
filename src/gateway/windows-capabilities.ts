/**
 * Windows Capabilities Manifest
 *
 * Complete catalogue of every Windows-control command exposed through the
 * companion service and gateway.  The AI uses this at runtime so it knows
 * exactly what it can do on the host machine.
 */

export interface WindowsCapability {
  /** Gateway method name (e.g. "windows.window.snap") */
  method: string;
  /** Human-readable one-liner */
  description: string;
  /** Expected parameter names (empty array = no params) */
  params: string[];
  /** Whether the operation mutates state */
  write: boolean;
  /** Requires admin / elevated rights */
  admin: boolean;
  /** Logical category for grouping in UIs */
  category: string;
}

const caps: WindowsCapability[] = [
  // ── Input ────────────────────────────────────────────────────
  { method: "windows.input.mouse.move",       description: "Move the mouse cursor to (x,y)",                   params: ["x","y"],                       write: true,  admin: false, category: "input" },
  { method: "windows.input.mouse.click",      description: "Click a mouse button",                             params: ["button"],                      write: true,  admin: false, category: "input" },
  { method: "windows.input.mouse.scroll",     description: "Scroll the mouse wheel",                           params: ["delta","direction"],            write: true,  admin: false, category: "input" },
  { method: "windows.input.keyboard.type",    description: "Type a string of text",                            params: ["text"],                        write: true,  admin: false, category: "input" },
  { method: "windows.input.keyboard.press",   description: "Press a key with optional modifiers",              params: ["key","modifiers"],              write: true,  admin: false, category: "input" },
  { method: "windows.input.keyboard.combo",   description: "Press a combination of keys simultaneously",       params: ["keys"],                        write: true,  admin: false, category: "input" },

  // ── UI Automation ────────────────────────────────────────────
  { method: "windows.ui.find",                description: "Find a UI element by selector",                    params: ["selector"],                    write: false, admin: false, category: "ui" },
  { method: "windows.ui.click",              description: "Click a UI element by selector",                   params: ["selector"],                    write: true,  admin: false, category: "ui" },
  { method: "windows.ui.read",              description: "Read text from a UI element",                      params: ["selector"],                    write: false, admin: false, category: "ui" },
  { method: "windows.ui.list",              description: "List child UI elements",                           params: ["selector"],                    write: false, admin: false, category: "ui" },
  { method: "windows.ui.tree",              description: "Get the full UI automation tree",                   params: ["depth"],                       write: false, admin: false, category: "ui" },

  // ── Process ──────────────────────────────────────────────────
  { method: "windows.process.list",           description: "List running processes",                           params: [],                              write: false, admin: false, category: "process" },
  { method: "windows.process.start",          description: "Start a new process",                              params: ["path","args"],                 write: true,  admin: false, category: "process" },
  { method: "windows.process.kill",           description: "Terminate a process by PID",                       params: ["pid"],                         write: true,  admin: false, category: "process" },
  { method: "windows.process.info",           description: "Get detailed info about a process",                params: ["pid"],                         write: false, admin: false, category: "process" },
  { method: "windows.process.focus",          description: "Bring a process window to the foreground",         params: ["pid"],                         write: true,  admin: false, category: "process" },
  { method: "windows.process.priority",       description: "Set process priority class",                       params: ["pid","priority"],              write: true,  admin: false, category: "process" },

  // ── Screen ───────────────────────────────────────────────────
  { method: "windows.screen.capture",         description: "Capture a screenshot (base64 PNG)",                params: ["screen"],                      write: false, admin: false, category: "screen" },
  { method: "windows.screen.list",           description: "List available screens/monitors",                  params: [],                              write: false, admin: false, category: "screen" },
  { method: "windows.screen.info",           description: "Get info about a specific screen",                 params: ["screen"],                      write: false, admin: false, category: "screen" },

  // ── Audio ────────────────────────────────────────────────────
  { method: "windows.audio.devices",          description: "List audio input/output devices",                  params: [],                              write: false, admin: false, category: "audio" },
  { method: "windows.audio.record.start",     description: "Start recording audio",                            params: ["device"],                      write: true,  admin: false, category: "audio" },
  { method: "windows.audio.record.stop",      description: "Stop recording audio and return file path",        params: [],                              write: true,  admin: false, category: "audio" },
  { method: "windows.audio.play",            description: "Play an audio file",                               params: ["path"],                        write: true,  admin: false, category: "audio" },
  { method: "windows.audio.volume.get",       description: "Get current volume level and mute state",          params: [],                              write: false, admin: false, category: "audio" },
  { method: "windows.audio.volume.set",       description: "Set the system volume (0-100)",                    params: ["level"],                       write: true,  admin: false, category: "audio" },
  { method: "windows.audio.mute",            description: "Mute system audio",                                params: [],                              write: true,  admin: false, category: "audio" },
  { method: "windows.audio.unmute",          description: "Unmute system audio",                              params: [],                              write: true,  admin: false, category: "audio" },

  // ── System ───────────────────────────────────────────────────
  { method: "windows.system.info",            description: "Get OS version, hostname, uptime",                 params: [],                              write: false, admin: false, category: "system" },
  { method: "windows.system.wmi.query",       description: "Execute a WMI query",                              params: ["query"],                       write: false, admin: false, category: "system" },
  { method: "windows.system.service.list",    description: "List Windows services",                            params: [],                              write: false, admin: false, category: "system" },
  { method: "windows.system.service.control", description: "Start/stop/restart a Windows service",             params: ["name","action"],               write: true,  admin: true,  category: "system" },

  // ── System Power ─────────────────────────────────────────────
  { method: "windows.system.shutdown",        description: "Shutdown the computer",                            params: ["delay","force"],               write: true,  admin: true,  category: "power" },
  { method: "windows.system.restart",         description: "Restart the computer",                             params: ["delay","force"],               write: true,  admin: true,  category: "power" },
  { method: "windows.system.sleep",           description: "Put the computer to sleep",                        params: [],                              write: true,  admin: false, category: "power" },
  { method: "windows.system.hibernate",       description: "Hibernate the computer",                           params: [],                              write: true,  admin: false, category: "power" },
  { method: "windows.system.lock",            description: "Lock the workstation",                             params: [],                              write: true,  admin: false, category: "power" },
  { method: "windows.system.logoff",          description: "Log off current user",                             params: [],                              write: true,  admin: false, category: "power" },

  // ── Notifications ────────────────────────────────────────────
  { method: "windows.system.notification.show", description: "Show a system tray notification",               params: ["message","title","icon"],      write: true,  admin: false, category: "notification" },

  // ── Users ────────────────────────────────────────────────────
  { method: "windows.system.users.list",      description: "List local user accounts",                        params: [],                              write: false, admin: false, category: "users" },
  { method: "windows.system.users.current",   description: "Get current user identity and groups",            params: [],                              write: false, admin: false, category: "users" },

  // ── Health ───────────────────────────────────────────────────
  { method: "windows.health.check",          description: "Health check the companion service",               params: [],                              write: false, admin: false, category: "health" },

  // ── PowerShell ───────────────────────────────────────────────
  { method: "windows.powershell.execute",     description: "Execute a PowerShell script",                     params: ["script","admin"],              write: true,  admin: false, category: "powershell" },
  { method: "windows.powershell.remoting",    description: "Execute PowerShell on a remote host",             params: ["host","script"],               write: true,  admin: true,  category: "powershell" },

  // ── Registry ─────────────────────────────────────────────────
  { method: "windows.system.registry.read",   description: "Read a registry value",                           params: ["path","name"],                 write: false, admin: false, category: "registry" },
  { method: "windows.system.registry.write",  description: "Write a registry value",                          params: ["path","name","value","type"],   write: true,  admin: true,  category: "registry" },

  // ── Environment Variables ────────────────────────────────────
  { method: "windows.system.env.get",         description: "Get an environment variable",                     params: ["name","target"],               write: false, admin: false, category: "env" },
  { method: "windows.system.env.set",         description: "Set an environment variable",                     params: ["name","value","target"],       write: true,  admin: true,  category: "env" },

  // ── Firewall ─────────────────────────────────────────────────
  { method: "windows.system.firewall.rule",   description: "Add/modify a firewall rule",                      params: ["name","action","direction","port","protocol"], write: true, admin: true, category: "firewall" },

  // ── Task Scheduler ───────────────────────────────────────────
  { method: "windows.system.task.schedule",   description: "Create a scheduled task",                         params: ["name","command","trigger"],    write: true,  admin: true,  category: "scheduler" },

  // ── Hardware ─────────────────────────────────────────────────
  { method: "windows.hardware.gpu.info",      description: "Get GPU information via WMI",                     params: [],                              write: false, admin: false, category: "hardware" },
  { method: "windows.hardware.disk.info",     description: "Get disk drive information via WMI",               params: [],                              write: false, admin: false, category: "hardware" },
  { method: "windows.hardware.network.info",  description: "Get network adapter info via WMI",                params: [],                              write: false, admin: false, category: "hardware" },
  { method: "windows.hardware.memory.info",   description: "Get physical memory info via WMI",                params: [],                              write: false, admin: false, category: "hardware" },
  { method: "windows.hardware.battery.info",  description: "Get battery status via WMI",                      params: [],                              write: false, admin: false, category: "hardware" },
  { method: "windows.hardware.display.brightness", description: "Get or set display brightness",              params: ["level"],                       write: true,  admin: false, category: "hardware" },

  // ── File Operations ──────────────────────────────────────────
  { method: "windows.file.read",             description: "Read a file's text content",                      params: ["path"],                        write: false, admin: false, category: "file" },
  { method: "windows.file.write",            description: "Write content to a file",                         params: ["path","content"],              write: true,  admin: false, category: "file" },
  { method: "windows.file.list",             description: "List files in a directory",                       params: ["path"],                        write: false, admin: false, category: "file" },
  { method: "windows.file.search",           description: "Search for files matching a pattern",             params: ["path","pattern"],              write: false, admin: false, category: "file" },

  // ── Clipboard ────────────────────────────────────────────────
  { method: "windows.clipboard.get",         description: "Get clipboard text content",                      params: [],                              write: false, admin: false, category: "clipboard" },
  { method: "windows.clipboard.set",         description: "Set clipboard text content",                      params: ["text"],                        write: true,  admin: false, category: "clipboard" },

  // ── Window Management ────────────────────────────────────────
  { method: "windows.window.list",           description: "List all visible windows with bounds",            params: [],                              write: false, admin: false, category: "window" },
  { method: "windows.window.focus",          description: "Bring a window to the foreground",                params: ["handle"],                      write: true,  admin: false, category: "window" },
  { method: "windows.window.resize",         description: "Resize a window",                                 params: ["handle","width","height"],     write: true,  admin: false, category: "window" },
  { method: "windows.window.minimize",       description: "Minimize a window",                               params: ["handle"],                      write: true,  admin: false, category: "window" },
  { method: "windows.window.close",          description: "Close a window",                                  params: ["handle"],                      write: true,  admin: false, category: "window" },
  { method: "windows.window.maximize",       description: "Maximize a window",                               params: ["handle"],                      write: true,  admin: false, category: "window" },
  { method: "windows.window.move",           description: "Move a window to (x,y)",                          params: ["handle","x","y"],              write: true,  admin: false, category: "window" },
  { method: "windows.window.snap",           description: "Snap a window to a screen region",                params: ["handle","position"],           write: true,  admin: false, category: "window" },
  { method: "windows.window.opacity",        description: "Set window transparency (0-255)",                 params: ["handle","opacity"],            write: true,  admin: false, category: "window" },
  { method: "windows.window.topmost",        description: "Set or clear always-on-top",                      params: ["handle","topmost"],            write: true,  admin: false, category: "window" },
  { method: "windows.window.title.set",      description: "Change a window's title bar text",                params: ["handle","title"],              write: true,  admin: false, category: "window" },

  // ── Display ──────────────────────────────────────────────────
  { method: "windows.display.resolution.get", description: "Get current display resolution",                 params: ["screen"],                      write: false, admin: false, category: "display" },
  { method: "windows.display.resolution.set", description: "Change display resolution",                     params: ["width","height"],              write: true,  admin: true,  category: "display" },
  { method: "windows.display.list",          description: "List all connected displays",                    params: [],                              write: false, admin: false, category: "display" },

  // ── Network ──────────────────────────────────────────────────
  { method: "windows.network.adapters",      description: "List network adapters via WMI",                  params: [],                              write: false, admin: false, category: "network" },
  { method: "windows.network.ip",           description: "Get IP configuration",                           params: [],                              write: false, admin: false, category: "network" },
  { method: "windows.network.wifi.list",     description: "List available Wi-Fi networks",                  params: [],                              write: false, admin: false, category: "network" },
  { method: "windows.network.wifi.connect",  description: "Connect to a Wi-Fi network",                    params: ["ssid","password"],             write: true,  admin: true,  category: "network" },
  { method: "windows.network.wifi.disconnect", description: "Disconnect from current Wi-Fi",               params: [],                              write: true,  admin: false, category: "network" },
  { method: "windows.network.dns.flush",     description: "Flush the DNS resolver cache",                  params: [],                              write: true,  admin: true,  category: "network" },

  // ── Installed Apps ───────────────────────────────────────────
  { method: "windows.apps.installed",        description: "List installed applications",                    params: [],                              write: false, admin: false, category: "apps" },
  { method: "windows.apps.uninstall",        description: "Uninstall an application",                      params: ["name","silent"],               write: true,  admin: true,  category: "apps" },

  // ── Device Management ────────────────────────────────────────
  { method: "windows.device.list",           description: "List hardware devices (optional category filter)", params: ["category"],                   write: false, admin: false, category: "device" },
  { method: "windows.device.enable",         description: "Enable a disabled device",                       params: ["deviceId"],                    write: true,  admin: true,  category: "device" },
  { method: "windows.device.disable",        description: "Disable a hardware device",                      params: ["deviceId"],                    write: true,  admin: true,  category: "device" },

  // ── Vision (VLM) ─────────────────────────────────────────────
  { method: "windows.vision.analyze",        description: "Analyze an image with a VLM prompt",             params: ["imagePath","prompt"],           write: false, admin: false, category: "vision" },
  { method: "windows.vision.describe",       description: "Describe an image using VLM",                    params: ["imagePath"],                   write: false, admin: false, category: "vision" },
  { method: "windows.vision.find_element",   description: "Find a UI element in a screenshot via VLM",      params: ["imagePath","element"],          write: false, admin: false, category: "vision" },
  { method: "windows.vision.ocr",           description: "Extract text from an image (OCR)",               params: ["imagePath"],                   write: false, admin: false, category: "vision" },

  // ── Meta ─────────────────────────────────────────────────────
  { method: "windows.capabilities",          description: "List all available Windows control capabilities", params: [],                              write: false, admin: false, category: "meta" },
];

/** Get all capabilities */
export function getWindowsCapabilities(): {
  total: number;
  categories: string[];
  capabilities: WindowsCapability[];
} {
  const categories = [...new Set(caps.map((c) => c.category))].toSorted();
  return { total: caps.length, categories, capabilities: caps };
}

/** Get capabilities filtered by category */
export function getCapabilitiesByCategory(category: string): WindowsCapability[] {
  return caps.filter((c) => c.category === category);
}

/** Check if a specific method exists */
export function hasCapability(method: string): boolean {
  return caps.some((c) => c.method === method);
}
