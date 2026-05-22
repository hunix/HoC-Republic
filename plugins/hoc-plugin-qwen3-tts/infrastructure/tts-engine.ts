/**
 * Infrastructure — TTS Engine
 *
 * Spawns Python scripts that call the qwen_tts API.
 * Each TTS mode generates a temp Python script, executes it,
 * and reads the resulting WAV file path from stdout.
 *
 * ZERO-CONFIG: Auto-detects Python, auto-installs qwen-tts
 * via pip on first use. No user setup required.
 */

import { execFile, execFileSync as nodeExecFileSync, execSync, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { TtsConfig, TtsLanguage } from "../domain/types.ts";

// ─── Installation Detection ─────────────────────────────────────

export interface InstallationStatus {
  installed: boolean;
  pythonAvailable: boolean;
  qwenTtsAvailable: boolean;
  cudaAvailable: boolean;
  autoInstalled: boolean;
  detectedPython: string;
  errors: string[];
}

function execFileSyncSafe(cmd: string, args: string[], options?: Record<string, unknown>): string {
  return nodeExecFileSync(cmd, args, {
    encoding: "utf-8",
    timeout: 15_000,
    ...options,
  });
}

// ─── Auto-Detect Python ─────────────────────────────────────────

/**
 * Find a working Python 3 executable.
 * Tries python3, python, py -3, and returns the command string.
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

  return "python"; // fallback
}

// ─── Auto-Install qwen-tts ─────────────────────────────────────

/**
 * Ensure the qwen-tts package is installed.
 * Auto-runs `pip install -U qwen-tts` if not found.
 * Returns { installed, autoInstalled, error? }.
 */
export function ensureQwenTtsPackage(pythonCmd: string): {
  installed: boolean;
  autoInstalled: boolean;
  error?: string;
} {
  // Build the correct check command args
  const checkArgs =
    pythonCmd === "py"
      ? ["-3", "-c", "import qwen_tts; print('ok')"]
      : ["-c", "import qwen_tts; print('ok')"];

  // Check if already installed
  try {
    execFileSyncSafe(pythonCmd, checkArgs);
    return { installed: true, autoInstalled: false };
  } catch {
    // Not installed — auto-install
  }

  // Try pip install
  try {
    const pipArgs =
      pythonCmd === "py"
        ? ["-3", "-m", "pip", "install", "-U", "qwen-tts"]
        : ["-m", "pip", "install", "-U", "qwen-tts"];

    execSync(`${pythonCmd} ${pipArgs.join(" ")}`, {
      timeout: 300_000, // 5 minutes for download + install
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Verify installation
    try {
      execFileSyncSafe(pythonCmd, checkArgs);
      return { installed: true, autoInstalled: true };
    } catch {
      return {
        installed: false,
        autoInstalled: false,
        error: "pip install succeeded but qwen_tts still not importable",
      };
    }
  } catch (err: unknown) {
    const e = err as { message?: string };
    return {
      installed: false,
      autoInstalled: false,
      error: `Auto-install failed: ${e.message ?? "unknown error"}. Try manually: pip install -U qwen-tts`,
    };
  }
}

// ─── Full Detection ─────────────────────────────────────────────

export function detectInstallation(config: TtsConfig): InstallationStatus {
  const errors: string[] = [];
  let pythonAvailable = false;
  let qwenTtsAvailable = false;
  let cudaAvailable = false;
  let autoInstalled = false;
  const detectedPython = config.pythonPath;

  // Build args for the detected python command
  const versionArgs = detectedPython === "py" ? ["-3", "--version"] : ["--version"];

  // Step 1: Check Python
  try {
    const result = execFileSyncSafe(detectedPython, versionArgs);
    pythonAvailable = result.includes("Python 3.");
    if (!pythonAvailable) {
      errors.push(`Python 3.10+ required, found: ${result.trim()}`);
    }
  } catch {
    errors.push("Python not found at: " + detectedPython);
  }

  // Step 2: Auto-install qwen-tts if needed
  if (pythonAvailable) {
    const pkgResult = ensureQwenTtsPackage(detectedPython);
    qwenTtsAvailable = pkgResult.installed;
    autoInstalled = pkgResult.autoInstalled;
    if (pkgResult.error) {
      errors.push(pkgResult.error);
    }
  }

  // Step 3: Check CUDA
  if (pythonAvailable) {
    const cudaArgs =
      detectedPython === "py"
        ? ["-3", "-c", "import torch; print(torch.cuda.is_available())"]
        : ["-c", "import torch; print(torch.cuda.is_available())"];
    try {
      const result = execFileSyncSafe(detectedPython, cudaArgs);
      cudaAvailable = result.trim() === "True";
      if (!cudaAvailable) {
        errors.push("CUDA not available — TTS will be very slow on CPU");
      }
    } catch {
      errors.push("Could not check CUDA (torch may not be installed yet)");
    }
  }

  return {
    installed: pythonAvailable && qwenTtsAvailable,
    pythonAvailable,
    qwenTtsAvailable,
    cudaAvailable,
    autoInstalled,
    detectedPython,
    errors,
  };
}

// ─── Python Script Generation ───────────────────────────────────

function escapeForPython(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

function buildAttnArg(config: TtsConfig): string {
  return config.useFlashAttn ? 'attn_implementation="flash_attention_2"' : "";
}

function generateCustomVoiceScript(
  config: TtsConfig,
  text: string,
  language: TtsLanguage,
  speaker: string,
  outputPath: string,
  instruct?: string,
): string {
  const attn = buildAttnArg(config);
  const instructLine = instruct ? `instruct="${escapeForPython(instruct)}",` : "";

  return `
import torch
import soundfile as sf
from qwen_tts import Qwen3TTSModel

model = Qwen3TTSModel.from_pretrained(
    "${escapeForPython(config.customVoiceModel)}",
    device_map="${config.device}",
    dtype=torch.${config.dtype},
    ${attn}
)
wavs, sr = model.generate_custom_voice(
    text="${escapeForPython(text)}",
    language="${language}",
    speaker="${escapeForPython(speaker)}",
    ${instructLine}
)
sf.write("${escapeForPython(outputPath)}", wavs[0], sr)
print("OUTPUT:" + "${escapeForPython(outputPath)}")
`.trim();
}

function generateVoiceDesignScript(
  config: TtsConfig,
  text: string,
  language: TtsLanguage,
  instruct: string,
  outputPath: string,
): string {
  const attn = buildAttnArg(config);

  return `
import torch
import soundfile as sf
from qwen_tts import Qwen3TTSModel

model = Qwen3TTSModel.from_pretrained(
    "${escapeForPython(config.voiceDesignModel)}",
    device_map="${config.device}",
    dtype=torch.${config.dtype},
    ${attn}
)
wavs, sr = model.generate_voice_design(
    text="${escapeForPython(text)}",
    language="${language}",
    instruct="${escapeForPython(instruct)}",
)
sf.write("${escapeForPython(outputPath)}", wavs[0], sr)
print("OUTPUT:" + "${escapeForPython(outputPath)}")
`.trim();
}

function generateVoiceCloneScript(
  config: TtsConfig,
  text: string,
  language: TtsLanguage,
  refAudio: string,
  refText: string,
  outputPath: string,
): string {
  const attn = buildAttnArg(config);

  return `
import torch
import soundfile as sf
from qwen_tts import Qwen3TTSModel

model = Qwen3TTSModel.from_pretrained(
    "${escapeForPython(config.baseModel)}",
    device_map="${config.device}",
    dtype=torch.${config.dtype},
    ${attn}
)
wavs, sr = model.generate_voice_clone(
    text="${escapeForPython(text)}",
    language="${language}",
    ref_audio="${escapeForPython(refAudio)}",
    ref_text="${escapeForPython(refText)}",
)
sf.write("${escapeForPython(outputPath)}", wavs[0], sr)
print("OUTPUT:" + "${escapeForPython(outputPath)}")
`.trim();
}

// ─── Script Execution ───────────────────────────────────────────

export interface RunningTtsProcess {
  process: ChildProcess;
  scriptPath: string;
  outputPath: string;
  startedAt: number;
}

function runPythonScript(
  config: TtsConfig,
  script: string,
  outputPath: string,
  onProgress?: (line: string) => void,
  onComplete?: (exitCode: number, outputFile: string | null) => void,
): RunningTtsProcess {
  // Write temp script
  const scriptPath = path.join(
    os.tmpdir(),
    `qwen3_tts_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.py`,
  );
  fs.writeFileSync(scriptPath, script, "utf-8");

  // Handle "py" launcher: need "-3" arg before script
  const pyCmd = config.pythonPath === "py" ? "py" : config.pythonPath;
  const pyArgs = config.pythonPath === "py" ? ["-3", scriptPath] : [scriptPath];

  const cp = execFile(pyCmd, pyArgs, { timeout: config.jobTimeoutMs }, (err) => {
    // Cleanup temp script
    try {
      fs.unlinkSync(scriptPath);
    } catch {
      /* ignore */
    }

    if (err) {
      onComplete?.(1, null);
    } else {
      onComplete?.(0, outputPath);
    }
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

  return { process: cp, scriptPath, outputPath, startedAt: Date.now() };
}

// ─── Public Synthesis API ───────────────────────────────────────

export function synthesizeCustomVoice(
  config: TtsConfig,
  text: string,
  language: TtsLanguage,
  speaker: string,
  outputPath: string,
  instruct?: string,
  onProgress?: (line: string) => void,
  onComplete?: (exitCode: number, outputFile: string | null) => void,
): RunningTtsProcess {
  const script = generateCustomVoiceScript(config, text, language, speaker, outputPath, instruct);
  return runPythonScript(config, script, outputPath, onProgress, onComplete);
}

export function synthesizeVoiceDesign(
  config: TtsConfig,
  text: string,
  language: TtsLanguage,
  instruct: string,
  outputPath: string,
  onProgress?: (line: string) => void,
  onComplete?: (exitCode: number, outputFile: string | null) => void,
): RunningTtsProcess {
  const script = generateVoiceDesignScript(config, text, language, instruct, outputPath);
  return runPythonScript(config, script, outputPath, onProgress, onComplete);
}

export function synthesizeVoiceClone(
  config: TtsConfig,
  text: string,
  language: TtsLanguage,
  refAudio: string,
  refText: string,
  outputPath: string,
  onProgress?: (line: string) => void,
  onComplete?: (exitCode: number, outputFile: string | null) => void,
): RunningTtsProcess {
  const script = generateVoiceCloneScript(config, text, language, refAudio, refText, outputPath);
  return runPythonScript(config, script, outputPath, onProgress, onComplete);
}

/**
 * Kill a running TTS process.
 */
export function killTtsProcess(running: RunningTtsProcess): boolean {
  try {
    running.process.kill("SIGTERM");
    setTimeout(() => {
      try {
        running.process.kill("SIGKILL");
      } catch {
        /* dead */
      }
    }, 5000);
    // Cleanup script file
    try {
      fs.unlinkSync(running.scriptPath);
    } catch {
      /* ignore */
    }
    return true;
  } catch {
    return false;
  }
}
