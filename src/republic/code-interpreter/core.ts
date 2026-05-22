/**
 * Code Interpreter — Core Execution Engine
 *
 * Enhanced code execution that captures:
 * - stdout/stderr with proper encoding
 * - Generated files (images, CSVs, charts)
 * - Auto-detection of matplotlib/plotly chart outputs
 * - Structured result with inline base64 for small files
 */

import type {
  ExecutionRequest,
  ExecutionResult,
  OutputFile,
  InterpreterDiagnostics,
  InterpreterLanguage,
} from "./types.js";

// ─── Stats ───────────────────────────────────────────────────────

let totalExecs = 0;
let totalSuccess = 0;
let totalDurationMs = 0;
let totalFiles = 0;
const langCounts: Record<string, number> = {};

// ─── Sandbox Integration ─────────────────────────────────────────

type SandboxExecFn = (
  cmd: string,
  cwd: string,
  timeout: number,
) => Promise<{ exitCode: number; stdout: string; stderr: string }>;

type SandboxWriteFileFn = (path: string, content: string) => Promise<void>;
type SandboxReadFileFn = (path: string) => Promise<string>;

/** Execute code in the sandbox with output capture */
export async function executeCode(
  req: ExecutionRequest,
  sandbox: {
    exec: SandboxExecFn;
    writeFile: SandboxWriteFileFn;
    readFile: SandboxReadFileFn;
  },
): Promise<ExecutionResult> {
  const start = performance.now();
  const lang = req.language ?? "python";
  const cwd = req.cwd ?? "/workspace";
  const timeout = req.timeoutSec ?? 120;
  const outputDir = "/workspace/.interpreter_output";

  // Set up output directory
  await sandbox.exec(`mkdir -p ${outputDir} && rm -f ${outputDir}/*`, cwd, 5);

  // Upload input files if any
  if (req.inputFiles) {
    for (const [name, b64] of Object.entries(req.inputFiles)) {
      const decoded = Buffer.from(b64, "base64").toString("utf8");
      await sandbox.writeFile(`${cwd}/${name}`, decoded);
    }
  }

  // Prepare execution script
  const { scriptPath, command } = prepareScript(lang, req.code, outputDir);
  await sandbox.writeFile(scriptPath, req.code);

  // Snapshot files before execution (for diff)
  const beforeFiles = await listFiles(sandbox.exec, outputDir);

  // Execute
  const result = await sandbox.exec(command, cwd, timeout);
  const durationMs = Math.round(performance.now() - start);

  // Capture new output files
  const outputFiles: OutputFile[] = [];
  if (req.captureOutputFiles !== false) {
    const afterFiles = await listFiles(sandbox.exec, cwd);
    const newFiles = findNewFiles(beforeFiles, afterFiles);

    for (const file of newFiles.slice(0, 20)) {
      const fileInfo = await getFileInfo(sandbox, file);
      if (fileInfo) {
        outputFiles.push(fileInfo);
        totalFiles++;
      }
    }
  }

  // Also check the output dir for any saved charts
  const chartFiles = await listFiles(sandbox.exec, outputDir);
  for (const file of chartFiles.slice(0, 10)) {
    const fullPath = `${outputDir}/${file}`;
    const fileInfo = await getFileInfo(sandbox, fullPath);
    if (fileInfo && !outputFiles.some((f) => f.path === fullPath)) {
      outputFiles.push(fileInfo);
      totalFiles++;
    }
  }

  // Track stats
  totalExecs++;
  totalDurationMs += durationMs;
  if (result.exitCode === 0) {
    totalSuccess++;
  }
  langCounts[lang] = (langCounts[lang] ?? 0) + 1;

  return {
    exitCode: result.exitCode,
    stdout: result.stdout.slice(0, 50_000),
    stderr: result.stderr.slice(0, 10_000),
    durationMs,
    outputFiles,
    timedOut: result.stderr.includes("timeout") || result.stderr.includes("SIGTERM"),
    language: lang,
  };
}

// ─── Script Preparation ──────────────────────────────────────────

function prepareScript(
  lang: InterpreterLanguage,
  code: string,
  outputDir: string,
): { scriptPath: string; command: string } {
  switch (lang) {
    case "python": {
      // Inject matplotlib savefig auto-redirect
      const preamble = `
import os as _os
_os.environ.setdefault("MPLBACKEND", "Agg")
_OUTPUT_DIR = "${outputDir}"
try:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as _plt
    _orig_show = _plt.show
    _chart_idx = [0]
    def _auto_save(*a, **kw):
        _chart_idx[0] += 1
        _plt.savefig(f"{_OUTPUT_DIR}/chart_{_chart_idx[0]:03d}.png", dpi=150, bbox_inches="tight")
        _plt.close("all")
    _plt.show = _auto_save
except ImportError:
    pass
`;
      const _fullCode = preamble + "\n" + code;
      const scriptPath = "/tmp/_interpreter.py";
      return { scriptPath, command: `python3 ${scriptPath} 2>&1` };
    }
    case "javascript":
      return {
        scriptPath: "/tmp/_interpreter.js",
        command: `node /tmp/_interpreter.js 2>&1`,
      };
    case "typescript":
      return {
        scriptPath: "/tmp/_interpreter.ts",
        command: `npx tsx /tmp/_interpreter.ts 2>&1`,
      };
    case "bash":
      return {
        scriptPath: "/tmp/_interpreter.sh",
        command: `bash /tmp/_interpreter.sh 2>&1`,
      };
  }

  // Write the code with preamble for Python
  if (lang === "python") {
    void code; // already handled above
  }
}

// ─── File Utilities ──────────────────────────────────────────────

async function listFiles(exec: SandboxExecFn, dir: string): Promise<string[]> {
  const r = await exec(
    `find '${dir}' -maxdepth 2 -type f -newer /tmp/_interpreter_marker 2>/dev/null | head -50`,
    "/",
    5,
  );
  return r.stdout.trim().split("\n").filter(Boolean);
}

function findNewFiles(before: string[], after: string[]): string[] {
  const beforeSet = new Set(before);
  return after.filter((f) => !beforeSet.has(f));
}

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "svg", "webp", "gif"]);
const MAX_INLINE_SIZE = 2 * 1024 * 1024; // 2MB

async function getFileInfo(
  sandbox: { exec: SandboxExecFn; readFile: SandboxReadFileFn },
  path: string,
): Promise<OutputFile | null> {
  const stat = await sandbox.exec(`stat -c '%s' '${path}' 2>/dev/null`, "/", 3);
  if (stat.exitCode !== 0) {
    return null;
  }

  const sizeBytes = parseInt(stat.stdout.trim(), 10);
  if (isNaN(sizeBytes) || sizeBytes === 0) {
    return null;
  }

  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const mimeType = getMimeType(ext);

  let base64: string | undefined;
  if (sizeBytes < MAX_INLINE_SIZE && (IMAGE_EXTS.has(ext) || ext === "csv" || ext === "json")) {
    const b64 = await sandbox.exec(`base64 -w0 '${path}' 2>/dev/null`, "/", 10);
    if (b64.exitCode === 0) {
      base64 = b64.stdout.trim();
    }
  }

  return { path, mimeType, sizeBytes, base64 };
}

function getMimeType(ext: string): string {
  const map: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    webp: "image/webp",
    csv: "text/csv",
    json: "application/json",
    html: "text/html",
    pdf: "application/pdf",
    txt: "text/plain",
    md: "text/markdown",
  };
  return map[ext] ?? "application/octet-stream";
}

// ─── Diagnostics ─────────────────────────────────────────────────

export function getInterpreterDiagnostics(): InterpreterDiagnostics {
  return {
    totalExecutions: totalExecs,
    successRate: totalExecs > 0 ? totalSuccess / totalExecs : 1,
    avgDurationMs: totalExecs > 0 ? Math.round(totalDurationMs / totalExecs) : 0,
    languageBreakdown: { ...langCounts },
    totalFilesGenerated: totalFiles,
  };
}
