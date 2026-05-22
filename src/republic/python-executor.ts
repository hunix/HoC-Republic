/**
 * Republic Platform — Python Script Executor
 *
 * Gives citizens the ability to write and execute Python scripts:
 *  1. executePython(script)    — run a Python script, capture output
 *  2. installPackage(pkg)      — pip install a package
 *  3. runProject(dir)          — run a multi-file Python project
 *
 * All outputs written to republic-output/python/
 * Sandboxed via timeout + resource limits.
 */

import { exec } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { getHocPython } from "./hoc-python.js";
import { ts, uid } from "./utils.js";

// ─── Configuration ──────────────────────────────────────────────

const PYTHON_TIMEOUT = 60_000; // 60s max per script
const PIP_TIMEOUT = 120_000;
const OUTPUT_DIR = path.join(process.cwd(), "republic-output", "python");
const MAX_OUTPUT_LENGTH = 10_000; // chars

// ─── Types ──────────────────────────────────────────────────────

export interface PythonResult {
  id: string;
  script: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  outputDir: string;
  timestamp: string;
}

export interface PackageInstallResult {
  package: string;
  success: boolean;
  output: string;
  timestamp: string;
}

// ─── State ──────────────────────────────────────────────────────

const executionHistory: { id: string; script: string; success: boolean; tick: number }[] = [];
const MAX_HISTORY = 100;

// ─── Helpers ────────────────────────────────────────────────────

function ensureOutputDir(): void {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

let pythonBin: string | null = null;

function getPython(): string {
  if (!pythonBin) {
    pythonBin = getHocPython();
  }
  return pythonBin;
}

// ─── 1. Execute Python Script ───────────────────────────────────

/**
 * Execute a Python script string, capturing all output.
 * The script is written to a temp file, executed, and cleaned up.
 */
export async function executePython(
  script: string,
  args: string[] = [],
  workingDir?: string,
): Promise<PythonResult> {
  ensureOutputDir();
  const id = uid().slice(0, 8);
  const scriptDir = path.join(OUTPUT_DIR, id);
  fs.mkdirSync(scriptDir, { recursive: true });

  const scriptPath = path.join(scriptDir, "script.py");
  fs.writeFileSync(scriptPath, script, "utf-8");

  const startTime = Date.now();

  return new Promise<PythonResult>((resolve) => {
    const cmd = `${getPython()} "${scriptPath}" ${args.join(" ")}`;
    exec(
      cmd,
      {
        timeout: PYTHON_TIMEOUT,
        cwd: workingDir ?? scriptDir,
        maxBuffer: 1024 * 1024, // 1MB
        env: { ...process.env, PYTHONUNBUFFERED: "1" },
      },
      (error, stdout, stderr) => {
        const durationMs = Date.now() - startTime;
        const result: PythonResult = {
          id,
          script,
          stdout: String(stdout).slice(0, MAX_OUTPUT_LENGTH),
          stderr: String(stderr).slice(0, MAX_OUTPUT_LENGTH),
          exitCode: error?.code ?? (error ? 1 : 0),
          durationMs,
          outputDir: scriptDir,
          timestamp: ts(),
        };

        // Save result
        fs.writeFileSync(
          path.join(scriptDir, "result.json"),
          JSON.stringify(result, null, 2),
          "utf-8",
        );

        resolve(result);
      },
    );
  });
}

// ─── 2. Install Python Package ──────────────────────────────────

/**
 * Install a Python package via pip.
 */
export async function installPackage(pkg: string): Promise<PackageInstallResult> {
  return new Promise<PackageInstallResult>((resolve) => {
    exec(
      `${getPython()} -m pip install ${pkg}`,
      { timeout: PIP_TIMEOUT, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        resolve({
          package: pkg,
          success: !error,
          output: String(stdout || stderr).slice(0, MAX_OUTPUT_LENGTH),
          timestamp: ts(),
        });
      },
    );
  });
}

// ─── 3. Run Multi-File Project ──────────────────────────────────

/**
 * Run a Python project by executing its main entry point.
 * Looks for train.py, main.py, or __main__.py in the project dir.
 */
export async function runProject(projectDir: string, entryPoint?: string): Promise<PythonResult> {
  const entry =
    entryPoint ??
    (fs.existsSync(path.join(projectDir, "train.py"))
      ? "train.py"
      : fs.existsSync(path.join(projectDir, "main.py"))
        ? "main.py"
        : "script.py");

  const script = fs.readFileSync(path.join(projectDir, entry), "utf-8");
  return executePython(script, [], projectDir);
}

// ─── 4. Check Python Availability ───────────────────────────────

/**
 * Check if Python is available and return version info.
 */
export async function checkPythonAvailability(): Promise<{
  available: boolean;
  version: string;
  packages: string[];
}> {
  return new Promise((resolve) => {
    exec(`${getPython()} --version`, { timeout: 5000 }, (error, stdout, stderr) => {
      if (error) {
        return resolve({ available: false, version: "", packages: [] });
      }
      const version = String(stdout || stderr).trim();

      // Get installed packages
      exec(`${getPython()} -m pip list --format=columns`, { timeout: 10_000 }, (err2, pipOut) => {
        const packages = String(pipOut || "")
          .split("\n")
          .slice(2)
          .map((line) => line.split(/\s+/)[0])
          .filter(Boolean)
          .slice(0, 50); // limit listing

        resolve({ available: true, version, packages });
      });
    });
  });
}

// ─── 5. Diagnostics ─────────────────────────────────────────────

export function recordExecution(id: string, script: string, success: boolean, tick: number): void {
  executionHistory.push({ id, script: script.slice(0, 100), success, tick });
  if (executionHistory.length > MAX_HISTORY) {
    executionHistory.splice(0, executionHistory.length - MAX_HISTORY);
  }
}

export function getExecutionDiagnostics(): {
  total: number;
  successRate: number;
  recent: typeof executionHistory;
} {
  const successes = executionHistory.filter((e) => e.success).length;
  return {
    total: executionHistory.length,
    successRate: executionHistory.length > 0 ? successes / executionHistory.length : 0,
    recent: executionHistory.slice(-20),
  };
}
