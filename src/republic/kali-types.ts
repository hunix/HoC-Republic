/**
 * Kali Agent Types, State & Container Communication
 *
 * Foundation module: exported interfaces, shared state maps, and the
 * container-exec helper that every other kali-* module depends on.
 */

import { exec } from "node:child_process";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { listContainers, launchPreset } from "./docker-orchestrator.js";

const logger = createSubsystemLogger("kali-agent-loop");

// ─── Types ──────────────────────────────────────────────────────

export interface KaliScanRequest {
  target: string;
  scanType?: "full" | "recon" | "web" | "network" | "compliance" | "quick";
  ports?: string;
  scope?: string[];
  options?: Record<string, unknown>;
}

export interface KaliScanResult {
  id: string;
  target: string;
  scanType: string;
  status: "running" | "completed" | "failed" | "cancelled";
  startedAt: number;
  completedAt?: number;
  phases: PhaseResult[];
  findings: Finding[];
  summary?: ExecutiveSummary;
  reportPath?: string;
}

export interface PhaseResult {
  phase: string;
  tool: string;
  command: string;
  output: string;
  exitCode: number;
  duration: number;
  findings: Finding[];
}

export interface Finding {
  severity: "critical" | "high" | "medium" | "low" | "info";
  title: string;
  description: string;
  evidence: string;
  remediation: string;
  cvss?: number;
  cve?: string;
  tool: string;
  phase: string;
}

export interface ExecutiveSummary {
  targetInfo: string;
  riskLevel: string;
  totalFindings: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  topRisks: string[];
  recommendations: string[];
}

// ─── State ──────────────────────────────────────────────────────

export const activeScans = new Map<string, KaliScanResult>();
export const completedScans: KaliScanResult[] = [];

// ─── Kali Container Communication ───────────────────────────────

export async function kaliExec(
  command: string,
  timeout = 300,
): Promise<{
  ok: boolean;
  stdout: string;
  stderr?: string;
  exitCode: number;
}> {
  try {
    const containers = listContainers();
    const kaliContainer = containers.find(
      (c) => c.status === "running" && (c.name.includes("kali") || c.image.includes("kali")),
    );
    if (!kaliContainer) {
      return { ok: false, stdout: "", stderr: "Kali container is not running", exitCode: 1 };
    }

    return new Promise((resolve) => {
      exec(
        `docker exec ${kaliContainer.name} bash -c ${JSON.stringify(command)}`,
        { timeout: timeout * 1000 },
        (err, stdout, stderr) => {
          resolve({
            ok: !err || (err as { code?: number }).code === 0,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            exitCode:
              err && typeof (err as { code?: number }).code === "number"
                ? (err as { code?: number }).code!
                : 0,
          });
        },
      );
    });
  } catch (e) {
    return {
      ok: false,
      stdout: "",
      stderr: `${e instanceof Error ? e.message : String(e)}`,
      exitCode: 1,
    };
  }
}

export async function ensureKaliRunning(): Promise<boolean> {
  const containers = listContainers();
  const isRunning = containers.some(
    (c) => c.status === "running" && (c.name.includes("kali") || c.image.includes("kali")),
  );
  if (isRunning) {
    return true;
  }
  logger.info("Starting Kali container preset...");
  const result = await launchPreset("kali-linux", "kali-agent");
  return !!result.container;
}
