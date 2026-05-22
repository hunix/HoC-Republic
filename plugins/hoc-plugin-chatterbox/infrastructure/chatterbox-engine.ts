/**
 * Infrastructure — Chatterbox Engine
 *
 * Manages the Chatterbox TTS Python environment:
 *   1. Auto-detects Python 3
 *   2. Auto-installs via pip install chatterbox-tts
 *   3. Spawns Python subprocess for TTS generation
 *
 * Supports three model variants:
 *   - ChatterboxTurboTTS  (350M, low-latency, paralinguistic tags)
 *   - ChatterboxTTS       (English, high-quality)
 *   - ChatterboxMultilingualTTS (23 languages)
 */

import { execFile, execSync, type ChildProcess } from "node:child_process";
import type { ChatterboxConfig, ChatterboxModel, LanguageId } from "../domain/types.ts";

// ─── Auto-Detection Helpers ─────────────────────────────────────

function execFileSyncSafe(cmd: string, args: string[]): string {
  const { execFileSync: efs } = require("node:child_process");
  return efs(cmd, args, {
    encoding: "utf-8",
    timeout: 10_000,
    stdio: ["pipe", "pipe", "pipe"],
  }) as string;
}

/**
 * Auto-detect a working Python 3 executable.
 */
export function findPython(): string {
  const candidates = [
    { cmd: "python3", args: ["--version"] },
    { cmd: "python", args: ["--version"] },
    { cmd: "py", args: ["-3", "--version"] },
  ];

  for (const { cmd, args } of candidates) {
    try {
      const result = execFileSyncSafe(cmd, args);
      if (result.includes("Python 3.")) {
        return cmd === "py" ? "py" : cmd;
      }
    } catch {
      // try next
    }
  }
  return "python";
}

// ─── Installation Status ────────────────────────────────────────

export interface ChatterboxInstallStatus {
  ready: boolean;
  pythonAvailable: boolean;
  packageInstalled: boolean;
  autoInstalledPackage: boolean;
  detectedPython: string;
  errors: string[];
}

/**
 * Check if chatterbox-tts is importable.
 */
function checkPackage(pythonCmd: string): boolean {
  try {
    const args =
      pythonCmd === "py"
        ? ["-3", "-c", "from chatterbox.tts import ChatterboxTTS"]
        : ["-c", "from chatterbox.tts import ChatterboxTTS"];
    execSync(`${pythonCmd} ${args.join(" ")}`, {
      timeout: 15_000,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Auto-install chatterbox-tts via pip.
 */
function ensurePackageInstalled(pythonCmd: string): {
  installed: boolean;
  autoInstalled: boolean;
  error?: string;
} {
  if (checkPackage(pythonCmd)) {
    return { installed: true, autoInstalled: false };
  }

  try {
    const pip = pythonCmd === "py" ? `${pythonCmd} -3 -m pip` : `${pythonCmd} -m pip`;
    execSync(`${pip} install chatterbox-tts`, {
      timeout: 300_000,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { installed: true, autoInstalled: true };
  } catch (err: unknown) {
    const e = err as { message?: string };
    return {
      installed: false,
      autoInstalled: false,
      error: `Auto-install failed: ${e.message ?? "unknown"}`,
    };
  }
}

/**
 * Full detection + auto-bootstrap.
 */
export function detectInstallation(config: ChatterboxConfig): ChatterboxInstallStatus {
  const errors: string[] = [];
  let pythonAvailable = false;

  // 1. Check Python
  try {
    const result = execFileSyncSafe(config.pythonPath, ["--version"]);
    pythonAvailable = result.includes("Python 3.");
    if (!pythonAvailable) {
      errors.push(`Python 3.11+ required, found: ${result.trim()}`);
    }
  } catch {
    errors.push("Python not found: " + config.pythonPath);
  }

  if (!pythonAvailable) {
    return {
      ready: false,
      pythonAvailable: false,
      packageInstalled: false,
      autoInstalledPackage: false,
      detectedPython: config.pythonPath,
      errors,
    };
  }

  // 2. Auto-install chatterbox-tts
  const pkgResult = ensurePackageInstalled(config.pythonPath);
  if (!pkgResult.installed && pkgResult.error) {
    errors.push(pkgResult.error);
  }

  return {
    ready: pythonAvailable && pkgResult.installed,
    pythonAvailable,
    packageInstalled: pkgResult.installed,
    autoInstalledPackage: pkgResult.autoInstalled,
    detectedPython: config.pythonPath,
    errors,
  };
}

// ─── Speech Generation ──────────────────────────────────────────

export interface GenerationResult {
  process: ChildProcess;
  outputPath: string;
}

/**
 * Spawn a Python subprocess to generate speech using Chatterbox.
 */
export function generateSpeech(
  config: ChatterboxConfig,
  opts: {
    model: ChatterboxModel;
    text: string;
    audioPromptPath?: string;
    languageId?: LanguageId;
    exaggeration: number;
    cfgWeight: number;
    outputPath: string;
  },
  onProgress?: (line: string) => void,
  onComplete?: (exitCode: number) => void,
): GenerationResult {
  const outPath = opts.outputPath.replace(/\\/g, "/");
  const audioPromptLine = opts.audioPromptPath
    ? `audio_prompt_path="${opts.audioPromptPath.replace(/\\/g, "/")}"`
    : "";

  let script: string;

  if (opts.model === "turbo") {
    script = `
import torchaudio as ta
from chatterbox.tts_turbo import ChatterboxTurboTTS

model = ChatterboxTurboTTS.from_pretrained(device="${config.device}")
wav = model.generate(
    "${opts.text.replace(/"/g, '\\"')}",
    ${audioPromptLine ? audioPromptLine + "," : ""}
)
ta.save("${outPath}", wav, model.sr)
print("GENERATION_COMPLETE")
`.trim();
  } else if (opts.model === "multilingual") {
    script = `
import torchaudio as ta
from chatterbox.mtl_tts import ChatterboxMultilingualTTS

model = ChatterboxMultilingualTTS.from_pretrained(device="${config.device}")
wav = model.generate(
    "${opts.text.replace(/"/g, '\\"')}",
    language_id="${opts.languageId ?? "en"}",
    ${audioPromptLine ? audioPromptLine + "," : ""}
)
ta.save("${outPath}", wav, model.sr)
print("GENERATION_COMPLETE")
`.trim();
  } else {
    // Standard English model
    script = `
import torchaudio as ta
from chatterbox.tts import ChatterboxTTS

model = ChatterboxTTS.from_pretrained(device="${config.device}")
wav = model.generate(
    "${opts.text.replace(/"/g, '\\"')}",
    exaggeration=${opts.exaggeration},
    cfg_weight=${opts.cfgWeight},
    ${audioPromptLine ? audioPromptLine + "," : ""}
)
ta.save("${outPath}", wav, model.sr)
print("GENERATION_COMPLETE")
`.trim();
  }

  const pyArgs = config.pythonPath === "py" ? ["-3", "-c", script] : ["-c", script];

  const cp = execFile(config.pythonPath, pyArgs, { timeout: config.timeoutMs }, (err) => {
    onComplete?.(err ? 1 : 0);
  });

  if (cp.stdout && onProgress) {
    cp.stdout.on("data", (data: Buffer) => {
      for (const line of data
        .toString()
        .split("\n")
        .filter((l) => l.trim())) {
        onProgress(line);
      }
    });
  }
  if (cp.stderr && onProgress) {
    cp.stderr.on("data", (data: Buffer) => {
      onProgress(`[stderr] ${data.toString().trim()}`);
    });
  }

  return { process: cp, outputPath: opts.outputPath };
}

/**
 * Kill a running generation process.
 */
export function killProcess(result: GenerationResult): boolean {
  try {
    result.process.kill("SIGTERM");
    setTimeout(() => {
      try {
        result.process.kill("SIGKILL");
      } catch {
        /* dead */
      }
    }, 5000);
    return true;
  } catch {
    return false;
  }
}
