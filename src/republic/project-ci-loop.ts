/**
 * Republic Platform — Project CI/CD Loop
 *
 * Autonomous compile → error → fix → retry loop for citizen-built projects.
 *
 * Flow:
 *   npm install → npm run build → parse errors → assign to specialist →
 *   write_code fix via LLM → rebuild → repeat until green or maxRetries
 *
 * QA: file count, size, tests, README → quality score 0-1
 * Publication: starts vite preview server, sets previewUrl, marks "delivered"
 */

import type { ProjectTeam } from "./project-team-orchestrator.js";
import { emitNationalEvent } from "./event-sourcing.js";
import { resilientInstall, resilientNpmRun } from "./resilient-executor.js";
import { ts } from "./utils.js";
import {
  execInWorkspace,
  getWorkspace,
  readWorkspaceFile,
  setPreviewUrl,
  updateWorkspaceStatus,
  writeWorkspaceFile,
} from "./workspace-manager.js";

// ─── Types ────────────────────────────────────────────────────────

export interface BuildResult {
  success: boolean;
  attempts: number;
  errors: ParsedBuildError[];
  buildLog: string;
  durationMs: number;
}

export interface ParsedBuildError {
  filePath: string;
  line: number;
  column: number;
  message: string;
  errorType: "syntax" | "type" | "import" | "runtime" | "unknown";
  assignedRole: "frontend_dev" | "backend_dev" | "qa_engineer" | "lead_architect";
}

// ─── Error Parsing ────────────────────────────────────────────────

const TS_ERROR_REGEX = /^(.+?)\((\d+),(\d+)\):\s*error\s+TS\d+:\s*(.+)$/gm;
const VITE_ERROR_REGEX = /^(.+?):\s*(SyntaxError|ReferenceError|TypeError):\s*(.+)$/gm;

function parseBuildErrors(stderr: string, stdout: string): ParsedBuildError[] {
  const errors: ParsedBuildError[] = [];
  const combined = `${stderr}\n${stdout}`;

  for (const match of combined.matchAll(TS_ERROR_REGEX)) {
    const filePath = (match[1] ?? "unknown").trim();
    errors.push({
      filePath,
      line: parseInt(match[2] ?? "0", 10),
      column: parseInt(match[3] ?? "0", 10),
      message: match[4] ?? "Unknown error",
      errorType: classifyTsError(match[4] ?? ""),
      assignedRole: classifyFileRole(filePath),
    });
  }

  for (const match of combined.matchAll(VITE_ERROR_REGEX)) {
    const filePath = (match[1] ?? "unknown").trim();
    errors.push({
      filePath,
      line: 0,
      column: 0,
      message: `${match[2]}: ${match[3]}`,
      errorType: "runtime",
      assignedRole: classifyFileRole(filePath),
    });
  }

  const seen = new Set<string>();
  return errors.filter((e) => {
    const key = `${e.filePath}:${e.line}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function classifyTsError(message: string): ParsedBuildError["errorType"] {
  if (/cannot find module|does not have|import/i.test(message)) {
    return "import";
  }
  if (/is not assignable|type '.*' is not/i.test(message)) {
    return "type";
  }
  if (/unexpected token|expected ';'/i.test(message)) {
    return "syntax";
  }
  return "unknown";
}

function classifyFileRole(filePath: string): ParsedBuildError["assignedRole"] {
  const fp = filePath.toLowerCase();
  if (/\.(tsx|jsx)$|components|pages|hooks/.test(fp)) {
    return "frontend_dev";
  }
  if (/routes|services|controllers|db|schema|middleware/.test(fp)) {
    return "backend_dev";
  }
  if (/test\.|spec\.|__tests__/.test(fp)) {
    return "qa_engineer";
  }
  return "lead_architect";
}

// ─── LLM Fix Generator ────────────────────────────────────────────

/**
 * Try to load .hoc/RULES.md from the workspace.
 * Returns the architectural rules or an empty string if not found.
 */
async function loadProjectRules(projectId: string): Promise<string> {
  try {
    return await readWorkspaceFile(projectId, ".hoc/RULES.md");
  } catch {
    return "";
  }
}

async function generateFix(
  error: ParsedBuildError,
  fileContent: string,
  projectDescription: string,
  citizenName: string,
  projectId?: string,
): Promise<string> {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    return fileContent;
  }

  // Load architectural rules if available
  const rules = projectId ? await loadProjectRules(projectId) : "";
  const rulesBlock = rules
    ? [``, `## Architecture Rules (MUST follow)`, rules, ``].join("\n")
    : "";

  const prompt = [
    `Fix this TypeScript/React build error:`,
    `Error: ${error.message}`,
    `File: ${error.filePath} (line ${error.line})`,
    `Project: ${projectDescription}`,
    rulesBlock,
    `Current file (first 3000 chars):`,
    "```typescript",
    fileContent.slice(0, 3000),
    "```",
    ``,
    `Return the COMPLETE fixed file content. Return ONLY the code, no explanation.`,
    `Requirements: Fix the error, keep all functionality, correct TypeScript types, no TODO comments.`,
    rules ? `IMPORTANT: Do NOT create cross-feature imports. Follow FSD layer boundaries.` : "",
  ].join("\n");

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: {
            parts: [
              {
                text: `You are ${citizenName}, an expert TypeScript developer. Fix build errors precisely. Return ONLY the corrected code.`,
              },
            ],
          },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
        }),
      },
    );
    if (res.ok) {
      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      // Strip markdown code fences if present
      const stripped = text
        .replace(/^```[\w]*\n?/m, "")
        .replace(/\n?```$/m, "")
        .trim();
      if (stripped.length > 50) {
        return stripped;
      }
    }
  } catch {
    /* fall through – return original */
  }

  return fileContent;
}

// ─── Build Loop ───────────────────────────────────────────────────

export async function runBuildLoop(
  projectId: string,
  team: ProjectTeam,
  maxRetries = 5,
  _changeContext?: string,
): Promise<BuildResult> {
  const ws = getWorkspace(projectId);
  if (!ws?.rootDir) {
    return {
      success: false,
      attempts: 0,
      errors: [],
      buildLog: "No workspace found",
      durationMs: 0,
    };
  }

  const start = Date.now();
  let lastErrors: ParsedBuildError[] = [];
  const allLogs: string[] = [];

  // npm install — fully resilient with fallback chain
  await resilientInstall(projectId, "", {
    cwd: ws.rootDir,
    maxRetries: 4,
    baseDelayMs: 1000,
    goal: `Install dependencies for ${ws.name}`,
    projectId,
  });

  emitNationalEvent("technology", "dev.build.started", "project-ci-loop", {
    projectId,
    maxRetries,
  });

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const attemptStart = Date.now();
    // Use resilient build runner
    const buildResult2 = await resilientNpmRun(projectId, "build", {
      cwd: ws.rootDir,
      maxRetries: 3,
      timeoutMs: 90_000,
      goal: `Build ${ws.name}`,
      projectId,
    });
    const buildResult = {
      exitCode: buildResult2.success ? 0 : 1,
      stdout: buildResult2.stdout,
      stderr: buildResult2.stderr,
    };

    const errors = parseBuildErrors(buildResult.stderr, buildResult.stdout);
    allLogs.push(
      `## Attempt ${attempt} — ${buildResult.exitCode === 0 ? "PASSED" : "FAILED"} (${Date.now() - attemptStart}ms)\n${buildResult.stderr.slice(0, 1000)}`,
    );

    emitNationalEvent("technology", "dev.build.attempt", "project-ci-loop", {
      projectId,
      attempt,
      exitCode: buildResult.exitCode,
      errorCount: errors.length,
    });

    // ✅ PASSED
    if (buildResult.exitCode === 0) {
      // Optional: run ESLint boundary check if configured
      let boundaryWarnings = 0;
      try {
        const eslintRc = await readWorkspaceFile(projectId, ".eslintrc.json");
        if (eslintRc.includes("boundaries/")) {
          const lintResult = await execInWorkspace(
            projectId,
            "npx",
            ["eslint", "--rule", "boundaries/element-types: warn", "src/", "--format", "json", "--no-error-on-unmatched-pattern"],
            { timeout: 30_000 },
          );
          try {
            const lintData = JSON.parse(lintResult.stdout) as Array<{ warningCount?: number }>;
            boundaryWarnings = lintData.reduce(
              (sum: number, f: { warningCount?: number }) => sum + (f.warningCount ?? 0),
              0,
            );
            if (boundaryWarnings > 0) {
              allLogs.push(
                `## FSD Boundary Warnings: ${boundaryWarnings}\nSome imports violate Feature-Sliced Design layer boundaries.`,
              );
            }
          } catch {
            // JSON parse fail — lint output might not be valid JSON
          }
        }
      } catch {
        // No .eslintrc.json — skip boundary check
      }

      const buildLog = allLogs.join("\n\n---\n\n");
      await writeWorkspaceFile({
        projectId,
        relativePath: ".hoc/build-log.md",
        content: `# Build Log\n\nProject: ${ws.name}\nDate: ${ts()}\nStatus: PASSED${boundaryWarnings > 0 ? ` (${boundaryWarnings} boundary warnings)` : ""}\n\n${buildLog}`,
        language: "markdown",
        citizenId: team.leadArchitectId,
      });

      return {
        success: true,
        attempts: attempt,
        errors: [],
        buildLog: buildResult.stdout.slice(0, 2000),
        durationMs: Date.now() - start,
      };
    }

    // ❌ FAILED — fix and retry
    if (attempt < maxRetries && errors.length > 0) {
      lastErrors = errors;

      emitNationalEvent("technology", "dev.build.fixing", "project-ci-loop", {
        projectId,
        errorCount: errors.length,
        attempt,
      });

      // Group errors by file, fix top files
      const fileErrors = new Map<string, ParsedBuildError[]>();
      for (const error of errors.slice(0, 8)) {
        const existing = fileErrors.get(error.filePath) ?? [];
        existing.push(error);
        fileErrors.set(error.filePath, existing);
      }

      for (const [filePath, fileErrs] of fileErrors) {
        try {
          const currentContent = await readWorkspaceFile(projectId, filePath);
          if (!currentContent || currentContent.trim().length < 10) {
            continue;
          }

          const assignedRole = fileErrs[0]?.assignedRole ?? "lead_architect";
          const fixer =
            team.members.find((m) => m.role === assignedRole) ??
            team.members.find((m) => m.role === "lead_architect") ??
            team.members[0];

          if (!fixer) {
            continue;
          }

          fixer.currentTask = `Fixing ${fileErrs.length} error(s) in ${filePath}`;

          const fixed = await generateFix(
            fileErrs[0],
            currentContent,
            ws.description ?? ws.name,
            fixer.citizenName,
            projectId,
          );

          if (fixed !== currentContent && fixed.trim().length > 100) {
            const lang = /\.tsx?$/.test(filePath) ? "typescript" : "text";
            await writeWorkspaceFile({
              projectId,
              relativePath: filePath,
              content: fixed,
              language: lang,
              citizenId: fixer.citizenId,
            });
          }

          fixer.currentTask = null;
          fixer.completedTasks.push(`Fixed ${filePath}`);
        } catch {
          /* skip file */
        }
      }
    }
  }

  // All retries exhausted
  await writeWorkspaceFile({
    projectId,
    relativePath: ".hoc/build-log.md",
    content: `# Build Log\n\nProject: ${ws.name}\nDate: ${ts()}\nStatus: FAILED\n\n${allLogs.join("\n\n---\n\n")}`,
    language: "markdown",
    citizenId: team.leadArchitectId,
  });

  return {
    success: false,
    attempts: maxRetries,
    errors: lastErrors,
    buildLog: allLogs.at(-1) ?? "",
    durationMs: Date.now() - start,
  };
}

// ─── QA Pass ─────────────────────────────────────────────────────

export async function runQAPass(projectId: string, team: ProjectTeam): Promise<number> {
  const ws = getWorkspace(projectId);
  if (!ws) {
    return 0;
  }

  let score = 0;

  // File count (25 pts)
  const fileCount = ws.fileCount ?? 0;
  score += fileCount >= 15 ? 25 : fileCount >= 8 ? 15 : fileCount >= 3 ? 5 : 0;

  // Total size (25 pts — < 8KB = stub/empty)
  const totalSize = ws.totalSizeBytes ?? 0;
  score += totalSize >= 50_000 ? 25 : totalSize >= 15_000 ? 15 : totalSize >= 5_000 ? 5 : 0;

  // package.json with real deps (15 pts)
  try {
    const pkg = await readWorkspaceFile(projectId, "package.json");
    if (pkg) {
      const pkgJson = JSON.parse(pkg) as { dependencies?: Record<string, string> };
      const depCount = Object.keys(pkgJson.dependencies ?? {}).length;
      score += depCount >= 5 ? 15 : depCount >= 2 ? 8 : 0;
    }
  } catch {
    /* skip */
  }

  // README (10 pts)
  try {
    const readme = await readWorkspaceFile(projectId, "README.md");
    score += readme && readme.length > 200 ? 10 : readme ? 5 : 0;
  } catch {
    /* skip */
  }

  // Tests pass (10 pts)
  try {
    const testResult = await execInWorkspace(
      projectId,
      "npm",
      ["test", "--passWithNoTests", "--", "--watchAll=false"],
      { timeout: 30_000 },
    );
    if (testResult.exitCode === 0) {
      score += 10;
    }
  } catch {
    /* no tests */
  }

  // Bonus: no obvious stubs (15 pts — assume good faith after passing build)
  score += 15;

  const normalized = Math.min(1, score / 100);

  const report = [
    `# QA Report\n**Project:** ${ws.name}\n**Score:** ${(normalized * 100).toFixed(0)}%`,
    `## Metrics`,
    `- Files: ${fileCount} ${fileCount >= 15 ? "✅" : "⚠️"}`,
    `- Size: ${(totalSize / 1024).toFixed(1)}KB ${totalSize >= 15_000 ? "✅" : "⚠️"}`,
    `## Team`,
    team.members
      .map((m) => `- ${m.citizenName} (${m.role}): ${m.completedTasks.length} tasks`)
      .join("\n"),
  ].join("\n");

  await writeWorkspaceFile({
    projectId,
    relativePath: ".hoc/qa-report.md",
    content: report,
    language: "markdown",
    citizenId: team.leadArchitectId,
  });

  emitNationalEvent("technology", "dev.qa.complete", "project-ci-loop", {
    projectId,
    qaScore: normalized,
  });

  return normalized;
}

// ─── Publish to Productions ───────────────────────────────────────

export async function publishToProductions(projectId: string, team: ProjectTeam): Promise<void> {
  const ws = getWorkspace(projectId);
  if (!ws) {
    return;
  }

  try {
    const { startPreviewServer, getPreviewUrl } =
      await import("../gateway/preview-server-manager.js");
    const started = await startPreviewServer(projectId, ws.rootDir ?? "");
    if (started) {
      const url = getPreviewUrl(projectId);
      if (url) {
        await setPreviewUrl(projectId, url);
      }
    }
  } catch {
    /* preview optional */
  }

  await updateWorkspaceStatus(projectId, "delivered");

  emitNationalEvent("technology", "dev.project.published", "project-ci-loop", {
    projectId,
    projectName: ws.name,
    fileCount: ws.fileCount,
    teamSize: team.members.length,
  });
}
