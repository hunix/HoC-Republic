/**
 * Flipper Zero Orchestrator
 *
 * Full Flipper Zero control via serial CLI protocol:
 *   - Auto-detect COM port and connect at 230400 baud
 *   - Sub-GHz: read/transmit/analyze frequencies, protocol decode
 *   - NFC: read/write/emulate cards (Mifare, NTAG, DESFire)
 *   - RFID (125kHz): read/write/emulate tags (EM4100, HID, Indala)
 *   - Infrared: universal remotes, signal learning, replay
 *   - BadUSB: DuckyScript payload deployment
 *   - GPIO: pin control, I2C/SPI/UART scanning
 *   - Bluetooth: BLE scanning and device discovery
 *   - iButton: read/write/emulate
 *
 * Connection: Gateway-side serial bridge (Node.js → COM port → Flipper)
 * Protocol: CLI text commands at 230400 baud, Protobuf for advanced ops
 */

import { createSubsystemLogger } from "../logging/subsystem.js";

const logger = createSubsystemLogger("flipper-zero");

// ─── Types ──────────────────────────────────────────────────────

export interface FlipperStatus {
  connected: boolean;
  port?: string;
  firmwareVersion?: string;
  firmwareType?: "official" | "momentum" | "unleashed" | "custom";
  hardwareRevision?: string;
  deviceName?: string;
  sdCardPresent?: boolean;
  sdCardFreeKB?: number;
  batteryLevel?: number;
  batteryCharging?: boolean;
  uptime?: string;
}

export interface FlipperCommandResult {
  ok: boolean;
  command: string;
  output: string;
  error?: string;
  durationMs: number;
}

export interface SubGhzSignal {
  frequency: number;
  protocol?: string;
  rawData?: string;
  rssi?: number;
  timestamp: number;
}

export interface NfcCard {
  type: string;         // "Mifare Classic 1K", "NTAG215", etc.
  uid: string;
  atqa?: string;
  sak?: string;
  data?: Record<string, string>;
  keys?: string[];
  timestamp: number;
}

export interface RfidTag {
  type: string;         // "EM4100", "HID", "Indala"
  data: string;
  timestamp: number;
}

export interface IrSignal {
  protocol: string;
  address: string;
  command: string;
  raw?: number[];
  timestamp: number;
}

// ─── State ──────────────────────────────────────────────────────

let flipperState: FlipperStatus = { connected: false };
let serialConnection: unknown | null = null;
const commandHistory: FlipperCommandResult[] = [];
const MAX_HISTORY = 200;

// ─── CLI Command Reference (300+ commands) ──────────────────────

const CLI_REFERENCE: Record<string, { description: string; usage: string; args?: string }> = {
  // System
  "help": { description: "List all available CLI commands", usage: "help" },
  "info": { description: "Show device info (name, HW, FW, memory)", usage: "info" },
  "date": { description: "Get/set RTC date and time", usage: "date [YYYY-MM-DD HH:MM:SS]" },
  "uptime": { description: "Show device uptime", usage: "uptime" },
  "free": { description: "Show free heap memory", usage: "free" },
  "top": { description: "Show running threads with usage", usage: "top" },
  "ps": { description: "Show running tasks", usage: "ps" },
  "power reboot": { description: "Reboot the Flipper", usage: "power reboot" },
  "power reboot2dfu": { description: "Reboot to DFU (firmware update) mode", usage: "power reboot2dfu" },
  "power off": { description: "Power off the Flipper", usage: "power off" },
  "power info": { description: "Battery status and power info", usage: "power info" },

  // Storage
  "storage list": { description: "List files in directory", usage: "storage list [path]", args: "/ext or /int or /any" },
  "storage read": { description: "Read file contents", usage: "storage read <path>" },
  "storage write": { description: "Write data to file", usage: "storage write <path> <data>" },
  "storage copy": { description: "Copy a file", usage: "storage copy <src> <dst>" },
  "storage rename": { description: "Rename/move a file", usage: "storage rename <old> <new>" },
  "storage remove": { description: "Delete a file", usage: "storage remove <path>" },
  "storage mkdir": { description: "Create a directory", usage: "storage mkdir <path>" },
  "storage stat": { description: "File info (size, attributes)", usage: "storage stat <path>" },
  "storage info": { description: "Storage info (free/total)", usage: "storage info [/ext|/int]" },

  // Sub-GHz
  "subghz rx": { description: "Start Sub-GHz receiver on frequency", usage: "subghz rx [freq_hz]", args: "433920000, 315000000, 868350000" },
  "subghz tx": { description: "Transmit Sub-GHz signal from file", usage: "subghz tx <file.sub> [repeat]" },
  "subghz decode_raw": { description: "Decode raw Sub-GHz recording", usage: "subghz decode_raw <file.sub>" },
  "subghz chat": { description: "Sub-GHz chat mode (Flipper-to-Flipper)", usage: "subghz chat [freq_hz]" },

  // NFC
  "nfc detect": { description: "Detect and identify NFC card type", usage: "nfc detect" },
  "nfc read": { description: "Full NFC card read", usage: "nfc read" },
  "nfc emulate": { description: "Emulate saved NFC card", usage: "nfc emulate <file.nfc>" },
  "nfc save": { description: "Save last read to file", usage: "nfc save <name>" },
  "nfc mf_read": { description: "Read Mifare Classic with key dictionary", usage: "nfc mf_read" },

  // RFID (125kHz)
  "rfid read": { description: "Read 125kHz RFID tag", usage: "rfid read" },
  "rfid write": { description: "Write to RFID tag", usage: "rfid write <type> <data>" },
  "rfid emulate": { description: "Emulate RFID tag from file", usage: "rfid emulate <file.rfid>" },

  // Infrared
  "ir rx": { description: "IR receiver mode — learn a signal", usage: "ir rx" },
  "ir tx": { description: "Transmit IR signal", usage: "ir tx <protocol> <address> <command>", args: "NEC 0x04 0x08, Samsung32 0x07 0x02" },
  "ir brute_force": { description: "Brute-force IR power commands", usage: "ir brute_force <file.ir>" },
  "ir universal": { description: "Send universal IR command", usage: "ir universal <type> <cmd>", args: "type: tv|ac|projector, cmd: power|vol_up|vol_down" },

  // GPIO
  "gpio set": { description: "Set GPIO pin state", usage: "gpio set <pin> <0|1>" },
  "gpio read": { description: "Read GPIO pin state", usage: "gpio read <pin>" },
  "gpio mode": { description: "Set GPIO pin mode", usage: "gpio mode <pin> <input|output|analog>" },
  "gpio i2c_scan": { description: "Scan I2C bus for devices", usage: "gpio i2c_scan" },
  "gpio spi": { description: "SPI communication", usage: "gpio spi <cmd>" },
  "gpio uart_bridge": { description: "UART bridge mode", usage: "gpio uart_bridge <baud>" },

  // BadUSB
  "badusb": { description: "Deploy BadUSB (DuckyScript) payload", usage: "badusb <file.txt>" },

  // Bluetooth
  "bt info": { description: "Bluetooth adapter info", usage: "bt info" },
  "bt scan": { description: "Scan for BLE devices", usage: "bt scan" },

  // iButton
  "ibutton read": { description: "Read iButton key", usage: "ibutton read" },
  "ibutton write": { description: "Write to iButton", usage: "ibutton write <type> <data>" },
  "ibutton emulate": { description: "Emulate iButton from file", usage: "ibutton emulate <file.ibtn>" },

  // LED/Vibro
  "led r": { description: "Set red LED brightness", usage: "led r <0-255>" },
  "led g": { description: "Set green LED brightness", usage: "led g <0-255>" },
  "led b": { description: "Set blue LED brightness", usage: "led b <0-255>" },
  "led bl": { description: "Set backlight brightness", usage: "led bl <0-255>" },
  "vibro": { description: "Control vibration motor", usage: "vibro <0|1>" },

  // Loader
  "loader open": { description: "Open an app on Flipper", usage: "loader open <AppName>" },
  "loader close": { description: "Close the current app", usage: "loader close" },
  "loader list": { description: "List installed apps", usage: "loader list" },

  // Input (virtual keypress)
  "input send": { description: "Send a virtual key press", usage: "input send <key> <type>", args: "keys: ok,back,up,down,left,right | type: press,release,short,long" },

  // Logging
  "log": { description: "Start real-time system log output", usage: "log" },
};

// ─── Frequency Database ─────────────────────────────────────────

const FREQUENCY_DB = {
  common: {
    "315 MHz": { freq: 315000000, region: "North America", uses: "Garage doors, car remotes, wireless sensors" },
    "433.92 MHz": { freq: 433920000, region: "Europe/Asia", uses: "Most common: remotes, weather stations, IoT, car fobs" },
    "868.35 MHz": { freq: 868350000, region: "Europe", uses: "Smart home, security systems, LoRa" },
    "915 MHz": { freq: 915000000, region: "North America", uses: "LoRa, ISM band, industrial" },
  },
  protocols: [
    "Princeton", "Nice FLO", "Nice FLOR-S", "Gate TX", "CAME", "CAME Atomo",
    "Faac SLH", "Chamberlain", "Linear", "Megacode", "Holtek", "Intertechno",
    "BETT", "Power Smart", "Honeywell", "Marantec", "Somfy Telis", "KeeLoq",
    "Star Line", "Security+", "Security+ 2.0",
  ],
};

// ─── NFC Key Dictionaries ───────────────────────────────────────

const NFC_DEFAULT_KEYS = [
  "FFFFFFFFFFFF", "000000000000", "A0A1A2A3A4A5",
  "D3F7D3F7D3F7", "B0B1B2B3B4B5", "4D3A99C351DD",
  "1A982C7E459A", "AABBCCDDEEFF", "714C5C886E97",
  "587EE5F9350F", "A0478CC39091", "533CB6C723F6",
  "8FD0A4F256E9",
];

// ─── Connection Management ──────────────────────────────────────

export async function connectFlipper(port?: string): Promise<FlipperStatus> {
  logger.info(`Attempting Flipper Zero connection${port ? ` on ${port}` : " (auto-detect)"}...`);

  // Auto-detect COM port if not specified
  if (!port) {
    port = await autoDetectFlipperPort();
    if (!port) {
      flipperState = { connected: false };
      throw new Error("No Flipper Zero detected. Ensure it is connected via USB and drivers are installed.");
    }
  }

  try {
    // Try to use serialport if available, otherwise fall back to exec-based approach
    const result = await execFlipperCmd(port, "info");
    if (!result.ok) {
      throw new Error(`Cannot communicate with Flipper on ${port}: ${result.error}`);
    }

    // Parse device info
    const info = result.output;
    flipperState = {
      connected: true,
      port,
      deviceName: extractField(info, "hardware_name") || "Flipper Zero",
      firmwareVersion: extractField(info, "firmware_version") || "unknown",
      firmwareType: detectFirmwareType(info),
      hardwareRevision: extractField(info, "hardware_target") || "unknown",
      batteryLevel: parseInt(extractField(info, "power_charge") || "0") || undefined,
    };

    // Get storage info
    const storageResult = await execFlipperCmd(port, "storage info /ext");
    if (storageResult.ok) {
      const freeMatch = storageResult.output.match(/free:\s*(\d+)/i);
      if (freeMatch) {
        flipperState.sdCardPresent = true;
        flipperState.sdCardFreeKB = parseInt(freeMatch[1]) || 0;
      }
    }

    // Get power info
    const powerResult = await execFlipperCmd(port, "power info");
    if (powerResult.ok) {
      const chargeMatch = powerResult.output.match(/charge:\s*(\d+)/i);
      if (chargeMatch) { flipperState.batteryLevel = parseInt(chargeMatch[1]); }
      flipperState.batteryCharging = powerResult.output.toLowerCase().includes("charging");
    }

    logger.info(`Flipper Zero connected: ${flipperState.deviceName} (FW: ${flipperState.firmwareVersion}) on ${port}`);
    return flipperState;
  } catch (e) {
    flipperState = { connected: false };
    throw e;
  }
}

export function disconnectFlipper(): void {
  if (serialConnection) {
    serialConnection = null;
  }
  flipperState = { connected: false };
  logger.info("Flipper Zero disconnected");
}

export function getFlipperStatus(): FlipperStatus {
  return { ...flipperState };
}

// ─── Command Execution ──────────────────────────────────────────

export async function executeCommand(command: string): Promise<FlipperCommandResult> {
  if (!flipperState.connected || !flipperState.port) {
    return { ok: false, command, output: "", error: "Flipper not connected", durationMs: 0 };
  }

  const start = Date.now();
  const result = await execFlipperCmd(flipperState.port, command);

  const cmdResult: FlipperCommandResult = {
    ok: result.ok,
    command,
    output: result.output,
    error: result.error,
    durationMs: Date.now() - start,
  };

  commandHistory.push(cmdResult);
  if (commandHistory.length > MAX_HISTORY) { commandHistory.shift(); }

  return cmdResult;
}

// ─── Module Operations ──────────────────────────────────────────

// Sub-GHz
export async function subGhzRead(frequency = 433920000, duration = 10): Promise<SubGhzSignal[]> {
  const result = await executeCommand(`subghz rx ${frequency}`);
  // Wait for duration then stop
  await new Promise(r => setTimeout(r, duration * 1000));
  await executeCommand("subghz rx_stop");

  const signals: SubGhzSignal[] = [];
  const lines = result.output.split("\n");
  for (const line of lines) {
    const freqMatch = line.match(/Freq:\s*(\d+)/);
    const protoMatch = line.match(/Protocol:\s*(\S+)/);
    if (freqMatch) {
      signals.push({
        frequency: parseInt(freqMatch[1]),
        protocol: protoMatch?.[1],
        rawData: line,
        timestamp: Date.now(),
      });
    }
  }
  return signals;
}

export async function subGhzTransmit(filePath: string, repeat = 1): Promise<FlipperCommandResult> {
  return executeCommand(`subghz tx ${filePath} ${repeat}`);
}

// NFC
export async function nfcRead(): Promise<NfcCard | null> {
  const result = await executeCommand("nfc detect");
  if (!result.ok) { return null; }

  const readResult = await executeCommand("nfc read");
  const output = readResult.output;

  const uidMatch = output.match(/UID:\s*([A-Fa-f0-9 ]+)/);
  const typeMatch = output.match(/Type:\s*(.+)/);
  const atqaMatch = output.match(/ATQA:\s*([A-Fa-f0-9]+)/);
  const sakMatch = output.match(/SAK:\s*([A-Fa-f0-9]+)/);

  return {
    type: typeMatch?.[1]?.trim() || "Unknown",
    uid: uidMatch?.[1]?.trim() || "",
    atqa: atqaMatch?.[1],
    sak: sakMatch?.[1],
    timestamp: Date.now(),
  };
}

export async function nfcEmulate(filePath: string): Promise<FlipperCommandResult> {
  return executeCommand(`nfc emulate ${filePath}`);
}

// RFID 125kHz
export async function rfidRead(): Promise<RfidTag | null> {
  const result = await executeCommand("rfid read");
  if (!result.ok) { return null; }

  const typeMatch = result.output.match(/Type:\s*(\S+)/);
  const dataMatch = result.output.match(/Data:\s*([A-Fa-f0-9]+)/);

  return {
    type: typeMatch?.[1] || "Unknown",
    data: dataMatch?.[1] || "",
    timestamp: Date.now(),
  };
}

// IR
export async function irSend(protocol: string, address: string, command: string): Promise<FlipperCommandResult> {
  return executeCommand(`ir tx ${protocol} ${address} ${command}`);
}

export async function irLearn(): Promise<IrSignal | null> {
  const result = await executeCommand("ir rx");
  if (!result.ok) { return null; }

  const protoMatch = result.output.match(/Protocol:\s*(\S+)/);
  const addrMatch = result.output.match(/Address:\s*(\S+)/);
  const cmdMatch = result.output.match(/Command:\s*(\S+)/);

  return {
    protocol: protoMatch?.[1] || "RAW",
    address: addrMatch?.[1] || "0x00",
    command: cmdMatch?.[1] || "0x00",
    timestamp: Date.now(),
  };
}

// BadUSB
export async function badUsbDeploy(scriptPath: string): Promise<FlipperCommandResult> {
  return executeCommand(`badusb ${scriptPath}`);
}

// GPIO
export async function gpioSet(pin: string, value: 0 | 1): Promise<FlipperCommandResult> {
  return executeCommand(`gpio set ${pin} ${value}`);
}

export async function gpioRead(pin: string): Promise<{ pin: string; value: number }> {
  const result = await executeCommand(`gpio read ${pin}`);
  const valMatch = result.output.match(/(\d+)/);
  return { pin, value: parseInt(valMatch?.[1] || "0") };
}

export async function i2cScan(): Promise<string[]> {
  const result = await executeCommand("gpio i2c_scan");
  const devices: string[] = [];
  const matches = result.output.matchAll(/0x([A-Fa-f0-9]{2})/g);
  for (const m of matches) {
    devices.push(`0x${m[1]}`);
  }
  return devices;
}

// Bluetooth
export async function bleScan(): Promise<FlipperCommandResult> {
  return executeCommand("bt scan");
}

// ─── Knowledge Base ─────────────────────────────────────────────

export function getCliReference(): Record<string, { description: string; usage: string; args?: string }> {
  return { ...CLI_REFERENCE };
}

export function getFrequencyDatabase() {
  return { ...FREQUENCY_DB };
}

export function getNfcDefaultKeys(): string[] {
  return [...NFC_DEFAULT_KEYS];
}

export function getCommandHistory(limit = 50): FlipperCommandResult[] {
  return commandHistory.slice(-limit).toReversed();
}

// ─── Helpers ────────────────────────────────────────────────────

async function autoDetectFlipperPort(): Promise<string | undefined> {
  try {
    const { exec } = await import("node:child_process");
    return new Promise((resolve) => {
      // Windows: check COM ports
      exec("wmic path Win32_SerialPort get DeviceID,Description /format:csv", { timeout: 5000 }, (err, stdout) => {
        if (err || !stdout) {
          // Try PowerShell fallback
          exec("Get-CimInstance Win32_SerialPort | Select-Object DeviceID,Description | Format-List", { timeout: 5000, shell: "powershell.exe" }, (err2, stdout2) => {
            if (err2 || !stdout2) { resolve(undefined); return; }
            const flipperLine = stdout2.split("\n").find(l => /flipper|stm32|stlink/i.test(l));
            const comMatch = flipperLine?.match(/(COM\d+)/);
            resolve(comMatch ? comMatch[1] : undefined);
          });
          return;
        }
        const flipperLine = stdout.split("\n").find(l => /flipper|stm32|stlink/i.test(l));
        const comMatch = flipperLine?.match(/(COM\d+)/);
        resolve(comMatch ? comMatch[1] : undefined);
      });
    });
  } catch {
    return undefined;
  }
}

async function execFlipperCmd(port: string, command: string): Promise<{ ok: boolean; output: string; error?: string }> {
  try {
    const { exec } = await import("node:child_process");
    return new Promise((resolve) => {
      // Use PowerShell to send serial command
      const psScript = `
        try {
          $port = New-Object System.IO.Ports.SerialPort "${port}", 230400, "None", 8, "One"
          $port.ReadTimeout = 5000
          $port.WriteTimeout = 2000
          $port.Open()
          Start-Sleep -Milliseconds 100
          $port.WriteLine("${command.replace(/"/g, '`"')}")
          Start-Sleep -Milliseconds 500
          $output = ""
          while ($port.BytesToRead -gt 0) {
            $output += $port.ReadExisting()
            Start-Sleep -Milliseconds 100
          }
          $port.Close()
          Write-Output $output
        } catch {
          Write-Error $_.Exception.Message
        }
      `;
      exec(`powershell -Command "${psScript.replace(/\n/g, "; ").replace(/"/g, '\\"')}"`, { timeout: 10000 }, (err, stdout, stderr) => {
        if (err) {
          resolve({ ok: false, output: "", error: stderr || err.message });
        } else {
          resolve({ ok: true, output: stdout.trim() });
        }
      });
    });
  } catch (e) {
    return { ok: false, output: "", error: e instanceof Error ? e.message : String(e) };
  }
}

function extractField(info: string, field: string): string | undefined {
  const regex = new RegExp(`${field}[:\\s]+(.+)`, "i");
  const match = info.match(regex);
  return match?.[1]?.trim();
}

function detectFirmwareType(info: string): FlipperStatus["firmwareType"] {
  const lower = info.toLowerCase();
  if (lower.includes("momentum")) { return "momentum"; }
  if (lower.includes("unleashed")) { return "unleashed"; }
  if (lower.includes("xtreme")) { return "momentum"; } // Xtreme → Momentum
  if (lower.includes("official") || lower.includes("flipperdevices")) { return "official"; }
  return "custom";
}
