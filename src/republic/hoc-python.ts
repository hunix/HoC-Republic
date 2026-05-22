/**
 * HoC Python Runtime Configuration
 *
 * Provides a single source of truth for the repo-local Python 3.12 installation.
 * All modules that need to call Python should import getHocPython() from here
 * instead of scanning PATH or using "python3" / "python" directly.
 *
 * CUDA/PyTorch Compatibility:
 *   - PyTorch + CUDA requires Python ≤3.12 (3.13+ NOT supported)
 *   - We ship Python 3.12 embeddable in runtime/python/
 *   - If runtime/python/ is missing, we auto-download it
 *   - System Python 3.14 is ONLY used for non-CUDA tasks (HuggingFace downloads, etc.)
 *
 * Layout:
 *   runtime/python/python.exe        — Python 3.12 embeddable
 *   runtime/python/Lib/site-packages — pip-installed packages (torch, etc.)
 */

import { exec as execCb } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs";
import * as path from "node:path";

const execAsync = promisify(execCb);

/** Walk up from a start directory to find the repo root (contains package.json) */
function findRepoRoot(startDir: string): string {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, "package.json"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) { break; }
    dir = parent;
  }
  // Fallback — assume two levels up from source location
  return path.resolve(startDir, "..", "..");
}

/** Absolute path to the repo-local runtime/python directory */
const _startDir = path.resolve(
  new URL(".", import.meta.url).pathname.replace(/^\/([A-Z]:)/i, "$1"),
);
const _repoRoot = findRepoRoot(_startDir);
const _runtimeDir = path.join(_repoRoot, "runtime", "python");

const _pyExe = path.join(_runtimeDir, process.platform === "win32" ? "python.exe" : "python3");

/**
 * Supported Python version range for PyTorch + CUDA.
 * Major = 3, minor must be in [10, 12] (3.10 through 3.12 inclusive).
 */
const CUDA_COMPAT_MIN_MINOR = 10;
const CUDA_COMPAT_MAX_MINOR = 12;

/**
 * Check if a Python version string (e.g. "Python 3.12.10") is CUDA-compatible.
 */
function isCudaCompatible(versionStr: string): boolean {
  const match = versionStr.match(/Python\s+3\.(\d+)/);
  if (!match) { return false; }
  const minor = parseInt(match[1], 10);
  return minor >= CUDA_COMPAT_MIN_MINOR && minor <= CUDA_COMPAT_MAX_MINOR;
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * Get the absolute path to the HoC-bundled Python binary.
 *
 * Priority:
 *   1. HOC_PYTHON_PATH env override (for CI/custom setups)
 *   2. runtime/python/python.exe (the repo-embedded Python 3.12)
 *   3. System Python — prefer CUDA-compatible (py -3.12, py -3.11, py -3.10)
 *   4. Generic system fallback (python3 → python → py)
 *
 * Throws if no Python is found anywhere.
 */
let _cachedPythonPath: string | null = null;

export function getHocPython(): string {
  // Return cached path if already discovered
  if (_cachedPythonPath) { return _cachedPythonPath; }

  // 1. Env override
  const envPath = process.env.HOC_PYTHON_PATH;
  if (envPath && fs.existsSync(envPath)) {
    _cachedPythonPath = envPath;
    return envPath;
  }

  // 2. Repo-local Python (always CUDA-compatible — we ship 3.12)
  if (fs.existsSync(_pyExe)) {
    _cachedPythonPath = _pyExe;
    return _pyExe;
  }

  // 3. System fallback — return first candidate and verify async later
  _cachedPythonPath = "python3";
  return _cachedPythonPath;
}

/**
 * Async version that actually verifies python availability.
 * Strongly prefers CUDA-compatible Python versions (3.10–3.12).
 * Should be called at boot to prime the cache.
 */
export async function discoverHocPython(): Promise<string> {
  // 1. Env override
  const envPath = process.env.HOC_PYTHON_PATH;
  if (envPath && fs.existsSync(envPath)) {
    _cachedPythonPath = envPath;
    return envPath;
  }

  // 2. Repo-local Python (always CUDA-compatible — we ship 3.12)
  if (fs.existsSync(_pyExe)) {
    _cachedPythonPath = _pyExe;
    return _pyExe;
  }

  // 3. Try py launcher with specific compatible versions first (Windows)
  if (process.platform === "win32") {
    const pyLauncherVersions = ["3.12", "3.11", "3.10"];
    for (const ver of pyLauncherVersions) {
      try {
        const { stdout } = await execAsync(`py -${ver} --version`, {
          timeout: 5_000,
          encoding: "utf-8",
        });
        if (stdout.includes("Python 3")) {
          _cachedPythonPath = `py -${ver}`;
          return _cachedPythonPath;
        }
      } catch {
        /* skip */
      }
    }
  }

  // 4. Check well-known install locations for CUDA-compatible Python
  const wellKnownDirs =
    process.platform === "win32"
      ? [
          "C:\\Python312\\python.exe",
          "C:\\Python311\\python.exe",
          "C:\\Python310\\python.exe",
          path.join(process.env.LOCALAPPDATA ?? "", "Programs", "Python", "Python312", "python.exe"),
          path.join(process.env.LOCALAPPDATA ?? "", "Programs", "Python", "Python311", "python.exe"),
          path.join(process.env.LOCALAPPDATA ?? "", "Programs", "Python", "Python310", "python.exe"),
        ]
      : ["/usr/bin/python3.12", "/usr/bin/python3.11", "/usr/bin/python3.10"];

  for (const p of wellKnownDirs) {
    if (p && fs.existsSync(p)) {
      _cachedPythonPath = p;
      return p;
    }
  }

  // 5. Generic system fallback (any Python 3 — may be 3.14, works for non-CUDA tasks)
  const candidates = ["python3", "python", "py"];
  for (const cmd of candidates) {
    try {
      const { stdout: ver } = await execAsync(`${cmd} --version`, {
        timeout: 5_000,
        encoding: "utf-8",
      });
      if (ver.includes("Python 3")) {
        _cachedPythonPath = cmd;
        return cmd;
      }
    } catch {
      /* skip */
    }
  }

  // 6. Auto-provision: download Python 3.12 embeddable
  try {
    await autoProvisionPython312();
    if (fs.existsSync(_pyExe)) {
      _cachedPythonPath = _pyExe;
      return _pyExe;
    }
  } catch {
    /* provisioning failed */
  }

  throw new Error(
    "Python 3 not found. Install Python 3.12 into runtime/python/ or set HOC_PYTHON_PATH.",
  );
}

/**
 * Auto-download Python 3.12 embeddable into runtime/python/.
 * Only runs on Windows. Non-blocking, best-effort.
 */
async function autoProvisionPython312(): Promise<void> {
  if (process.platform !== "win32") { return; }

  const zipUrl = "https://www.python.org/ftp/python/3.12.10/python-3.12.10-embed-amd64.zip";
  const zipPath = path.join(_repoRoot, "runtime", "python-3.12.10-embed.zip");

  fs.mkdirSync(_runtimeDir, { recursive: true });

  // Download
  const resp = await fetch(zipUrl, { signal: AbortSignal.timeout(120_000) });
  if (!resp.ok || !resp.body) { throw new Error(`Download failed: ${resp.status}`); }

  const arrayBuffer = await resp.arrayBuffer();
  fs.writeFileSync(zipPath, Buffer.from(arrayBuffer));

  // Extract using PowerShell
  await execAsync(
    `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${_runtimeDir}' -Force"`,
    { timeout: 60_000 },
  );

  // Enable site-packages
  const pthFiles = fs.readdirSync(_runtimeDir).filter((f) => f.endsWith("._pth"));
  for (const pth of pthFiles) {
    const pthPath = path.join(_runtimeDir, pth);
    let content = fs.readFileSync(pthPath, "utf-8");
    content = content.replace("#import site", "import site");
    fs.writeFileSync(pthPath, content);
  }

  // Install pip
  const getPipUrl = "https://bootstrap.pypa.io/get-pip.py";
  const getPipPath = path.join(_runtimeDir, "get-pip.py");
  const pipResp = await fetch(getPipUrl, { signal: AbortSignal.timeout(60_000) });
  if (pipResp.ok && pipResp.body) {
    const buf = await pipResp.arrayBuffer();
    fs.writeFileSync(getPipPath, Buffer.from(buf));
    await execAsync(`"${_pyExe}" "${getPipPath}" --no-warn-script-location`, { timeout: 120_000 });
  }

  // Cleanup
  try { fs.unlinkSync(zipPath); } catch { /* best-effort */ }
}

/**
 * Get the absolute path to the HoC-bundled pip (as a module invocation array).
 * Usage: spawn(getHocPython(), ["-m", "pip", "install", ...])
 */
export function getHocPip(): [string, string[]] {
  return [getHocPython(), ["-m", "pip"]];
}

/**
 * Check if the repo-local Python is available and report details.
 */
export async function getHocPythonInfo(): Promise<{
  path: string;
  isLocal: boolean;
  version: string;
  hasTorch: boolean;
  hasCuda: boolean;
  cudaCompatible: boolean;
}> {
  const pyPath = await discoverHocPython();
  const isLocal = pyPath === _pyExe || pyPath === process.env.HOC_PYTHON_PATH;

  let version = "unknown";
  let hasTorch = false;
  let hasCuda = false;

  try {
    const { stdout: verOut } = await execAsync(`"${pyPath}" --version`, {
      timeout: 5_000,
      encoding: "utf-8",
    });
    version = verOut.trim();

    const { stdout: torchCheck } = await execAsync(
      `"${pyPath}" -c "import torch; print(f'torch={torch.__version__} cuda={torch.cuda.is_available()}')"`,
      { timeout: 10_000, encoding: "utf-8" },
    );
    hasTorch = torchCheck.includes("torch=");
    hasCuda = torchCheck.includes("cuda=True");
  } catch {
    /* info is best-effort */
  }

  return { path: pyPath, isLocal, version, hasTorch, hasCuda, cudaCompatible: isCudaCompatible(version) };
}

/** The runtime directory for reference (e.g. for .gitignore entries) */
export const HOC_PYTHON_RUNTIME_DIR = _runtimeDir;
