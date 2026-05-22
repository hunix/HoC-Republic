/**
 * Infrastructure — Bark Engine
 *
 * Manages Bark lifecycle:
 *   1. Auto-detect Python 3 with PyTorch
 *   2. Install bark via pip
 *   3. Preload models on first use
 *   4. Generate audio via subprocess
 */

import { execFile, execSync, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import type { AudioRequest, BarkConfig } from "../domain/types.ts";

// ─── Python Detection ───────────────────────────────────────────

export function detectPython(): string | null {
  const candidates = ["python3", "python", "py -3"];
  for (const cmd of candidates) {
    try {
      const ver = execSync(`${cmd} --version`, {
        timeout: 10_000,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      if (ver.includes("Python 3")) {
        return cmd.split(" ")[0];
      }
    } catch {
      /* skip */
    }
  }
  return null;
}

// ─── Dependency Management ──────────────────────────────────────

export function installBark(pythonPath: string): {
  installed: boolean;
  error?: string;
} {
  try {
    execSync(`${pythonPath} -m pip install git+https://github.com/suno-ai/bark.git scipy`, {
      timeout: 600_000,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { installed: true };
  } catch (err: unknown) {
    const e = err as { message?: string };
    return { installed: false, error: `pip install failed: ${e.message ?? "unknown"}` };
  }
}

export function verifyBark(pythonPath: string): boolean {
  try {
    execSync(`${pythonPath} -c "from bark import generate_audio, SAMPLE_RATE; print('ok')"`, {
      timeout: 60_000,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
}

// ─── Installation Status ────────────────────────────────────────

export interface BarkInstallStatus {
  ready: boolean;
  pythonFound: boolean;
  pythonPath: string;
  depsInstalled: boolean;
  importVerified: boolean;
  errors: string[];
}

export function detectInstallation(_config: BarkConfig): BarkInstallStatus {
  const errors: string[] = [];

  const python = detectPython();
  if (!python) {
    errors.push("Python 3 not found");
  }

  let depsInstalled = false;
  let importVerified = false;

  if (python) {
    importVerified = verifyBark(python);
    if (!importVerified) {
      const depResult = installBark(python);
      depsInstalled = depResult.installed;
      if (!depResult.installed && depResult.error) {
        errors.push(depResult.error);
      }
      if (depsInstalled) {
        importVerified = verifyBark(python);
      }
    } else {
      depsInstalled = true;
    }
  }

  return {
    ready: !!python && depsInstalled && importVerified,
    pythonFound: !!python,
    pythonPath: python ?? "python",
    depsInstalled,
    importVerified,
    errors,
  };
}

// ─── Audio Generation ───────────────────────────────────────────

export function generateAudio(
  config: BarkConfig,
  request: AudioRequest,
  onComplete?: (outputPath: string) => void,
  onError?: (err: string) => void,
): ChildProcess {
  const outputPath = `${config.outputDir}/bark_${Date.now()}.${request.outputFormat}`;
  fs.mkdirSync(config.outputDir, { recursive: true });

  const presetArg = request.voicePreset ? `, history_prompt="${request.voicePreset}"` : "";

  const script = `
import json, numpy as np
from bark import generate_audio, preload_models, SAMPLE_RATE
from scipy.io.wavfile import write as write_wav

preload_models()

text = """${request.text.replace(/"/g, '\\"')}"""

audio_array = generate_audio(
    text,
    text_temp=${request.textTemp},
    waveform_temp=${request.waveformTemp}${presetArg}
)

write_wav("${outputPath.replace(/\\/g, "/")}", SAMPLE_RATE, audio_array)
duration_ms = int(len(audio_array) / SAMPLE_RATE * 1000)
print(json.dumps({"status": "complete", "output": "${outputPath.replace(/\\/g, "/")}", "duration_ms": duration_ms}))
`;

  const proc = execFile(
    config.pythonPath,
    ["-c", script],
    { timeout: config.timeoutMs },
    (error, stdout, stderr) => {
      if (error) {
        onError?.(stderr || error.message);
        return;
      }
      try {
        const result = JSON.parse(stdout.trim().split("\n").pop() ?? "{}");
        if (result.status === "complete") {
          onComplete?.(result.output ?? outputPath);
        }
      } catch {
        onComplete?.(outputPath);
      }
    },
  );

  return proc;
}
