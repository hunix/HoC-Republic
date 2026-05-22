/**
 * HoC Resource Monitor
 *
 * Continuous monitoring of system resources (CPU, RAM, GPU, processes)
 * for resource-aware task scheduling and feature governance.
 *
 * Features:
 * - Periodic CPU / RAM / GPU polling (configurable interval)
 * - Process-level resource tracking for HoC child processes
 * - Resource policy enforcement (max CPU%, max RAM%, VRAM headroom)
 * - Feature governor: cost/benefit analysis for feature on/off decisions
 * - Event-based resource alerts
 *
 * Usage:
 *   import { resourceMonitor } from './resource-monitor.js';
 *   resourceMonitor.start();
 *   const snapshot = resourceMonitor.getSnapshot();
 */

import { cpus, freemem, totalmem, loadavg } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { EventEmitter } from "node:events";

const execFileAsync = promisify(execFile);

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GpuInfo {
  name: string;
  vramTotalGB: number;
  vramUsedGB: number;
  vramFreeGB: number;
  utilization: number;   // 0-100
  temperature: number;   // Celsius
}

export interface ResourceSnapshot {
  timestamp: number;
  cpu: {
    cores: number;
    usagePercent: number;    // 0-100 average across cores
    loadAvg1m: number;
    loadAvg5m: number;
    loadAvg15m: number;
  };
  ram: {
    totalGB: number;
    freeGB: number;
    usedGB: number;
    usedPercent: number;
  };
  gpu: GpuInfo[];
  totalVramGB: number;
  totalVramUsedGB: number;
  totalVramFreeGB: number;
}

export interface ResourcePolicy {
  maxCpuPercent: number;     // Don't schedule CPU tasks above this (default: 85)
  maxRamPercent: number;     // Leave RAM headroom (default: 80)
  maxVramPercent: number;    // GPU can run hotter (default: 90)
  reservedRamGB: number;     // Always keep this much free (default: 4)
  pollIntervalMs: number;    // How often to poll (default: 10_000)
}

export type ResourceAlert =
  | { type: "cpu_high"; usagePercent: number }
  | { type: "ram_high"; usedPercent: number; freeGB: number }
  | { type: "vram_high"; gpu: string; usedPercent: number }
  | { type: "gpu_hot"; gpu: string; temperature: number }
  | { type: "resources_ok" };

// ─── CPU Usage Measurement ──────────────────────────────────────────────────

interface CpuTick {
  idle: number;
  total: number;
}

function getCpuTick(): CpuTick {
  const cores = cpus();
  let idle = 0;
  let total = 0;
  for (const core of cores) {
    const t = core.times;
    idle += t.idle;
    total += t.user + t.nice + t.sys + t.idle + t.irq;
  }
  return { idle, total };
}

// ─── GPU Query ──────────────────────────────────────────────────────────────

async function queryGpuInfo(): Promise<GpuInfo[]> {
  try {
    const { stdout } = await execFileAsync("nvidia-smi", [
      "--query-gpu=name,memory.total,memory.used,utilization.gpu,temperature.gpu",
      "--format=csv,noheader,nounits",
    ], { encoding: "utf-8", timeout: 5000 });

    const gpus: GpuInfo[] = [];
    for (const line of stdout.trim().split("\n")) {
      const parts = line.split(",").map((s) => s.trim());
      if (parts.length >= 5) {
        const totalMB = parseInt(parts[1], 10);
        const usedMB = parseInt(parts[2], 10);
        const freeMB = totalMB - usedMB;
        gpus.push({
          name: parts[0],
          vramTotalGB: Math.round(totalMB / 1024 * 10) / 10,
          vramUsedGB: Math.round(usedMB / 1024 * 10) / 10,
          vramFreeGB: Math.round(freeMB / 1024 * 10) / 10,
          utilization: parseInt(parts[3], 10) || 0,
          temperature: parseInt(parts[4], 10) || 0,
        });
      }
    }
    return gpus;
  } catch {
    return [];
  }
}

// ─── Resource Monitor ────────────────────────────────────────────────────────

class ResourceMonitor extends EventEmitter {
  private policy: ResourcePolicy;
  private snapshot: ResourceSnapshot | null = null;
  private prevCpuTick: CpuTick | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private started = false;

  constructor(policy?: Partial<ResourcePolicy>) {
    super();
    this.policy = {
      maxCpuPercent: policy?.maxCpuPercent ?? 85,
      maxRamPercent: policy?.maxRamPercent ?? 80,
      maxVramPercent: policy?.maxVramPercent ?? 90,
      reservedRamGB: policy?.reservedRamGB ?? 4,
      pollIntervalMs: policy?.pollIntervalMs ?? 10_000,
    };
  }

  /** Start continuous monitoring */
  start(): void {
    if (this.started) { return; }
    this.started = true;
    this.prevCpuTick = getCpuTick();

    // Initial poll
    this.poll().catch(() => {});

    this.timer = setInterval(() => {
      this.poll().catch((err) => {
        console.error("[resource-monitor] Poll error:", err);
      });
    }, this.policy.pollIntervalMs);
    this.timer.unref?.();

    console.info(
      `[resource-monitor] ✅ Started (poll every ${this.policy.pollIntervalMs / 1000}s, ` +
      `CPU limit: ${this.policy.maxCpuPercent}%, RAM limit: ${this.policy.maxRamPercent}%)`,
    );
  }

  /** Stop monitoring */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.started = false;
  }

  /** Get the latest resource snapshot */
  getSnapshot(): ResourceSnapshot | null {
    return this.snapshot;
  }

  /** Check if resources are available for a given task class */
  canSchedule(taskClass: "cpu" | "gpu" | "io" | "network" | "mixed"): {
    allowed: boolean;
    reason?: string;
  } {
    if (!this.snapshot) { return { allowed: true }; } // No data yet → optimistic

    const s = this.snapshot;

    switch (taskClass) {
      case "cpu":
        if (s.cpu.usagePercent > this.policy.maxCpuPercent) {
          return { allowed: false, reason: `CPU at ${s.cpu.usagePercent}% (limit: ${this.policy.maxCpuPercent}%)` };
        }
        break;
      case "gpu":
        if (s.gpu.length === 0) {
          return { allowed: false, reason: "No GPU available" };
        }
        for (const g of s.gpu) {
          const usedPct = (g.vramUsedGB / g.vramTotalGB) * 100;
          if (usedPct > this.policy.maxVramPercent) {
            return { allowed: false, reason: `GPU ${g.name} VRAM at ${Math.round(usedPct)}%` };
          }
        }
        break;
      case "mixed":
        if (s.cpu.usagePercent > this.policy.maxCpuPercent) {
          return { allowed: false, reason: `CPU at ${s.cpu.usagePercent}%` };
        }
        if (s.ram.usedPercent > this.policy.maxRamPercent) {
          return { allowed: false, reason: `RAM at ${Math.round(s.ram.usedPercent)}%` };
        }
        break;
      case "io":
      case "network":
        // I/O and network tasks are generally always allowed
        break;
    }

    // Global RAM check
    if (s.ram.freeGB < this.policy.reservedRamGB) {
      return { allowed: false, reason: `Only ${s.ram.freeGB} GB RAM free (need ${this.policy.reservedRamGB} GB)` };
    }

    return { allowed: true };
  }

  /**
   * Feature Governor — evaluate whether a feature should stay ON or be paused.
   *
   * Returns a confidence score (0-1) that the feature can run without affecting
   * system stability, along with a recommendation.
   */
  evaluateFeature(featureName: string, resourceNeeds: {
    cpuWeight?: number;    // 0-1 how CPU-intensive
    ramGB?: number;        // estimated RAM needed
    vramGB?: number;       // estimated VRAM needed
    priority?: number;     // 0-10 (0=critical, 10=background)
  }): {
    confidence: number;
    recommendation: "run" | "defer" | "pause";
    reason: string;
  } {
    if (!this.snapshot) {
      return { confidence: 0.8, recommendation: "run", reason: "No resource data yet — optimistic" };
    }

    const s = this.snapshot;
    let score = 1.0;
    const reasons: string[] = [];

    // CPU availability
    const cpuHeadroom = Math.max(0, this.policy.maxCpuPercent - s.cpu.usagePercent) / this.policy.maxCpuPercent;
    const cpuWeight = resourceNeeds.cpuWeight ?? 0.3;
    score *= (cpuHeadroom * cpuWeight + (1 - cpuWeight));
    if (cpuHeadroom < 0.1) {
      reasons.push(`CPU headroom only ${Math.round(cpuHeadroom * 100)}%`);
    }

    // RAM availability
    if (resourceNeeds.ramGB) {
      if (s.ram.freeGB < resourceNeeds.ramGB + this.policy.reservedRamGB) {
        score *= 0.3;
        reasons.push(`Need ${resourceNeeds.ramGB} GB RAM, only ${s.ram.freeGB} GB free`);
      }
    }

    // VRAM availability
    if (resourceNeeds.vramGB && s.gpu.length > 0) {
      const totalFree = s.gpu.reduce((sum, g) => sum + g.vramFreeGB, 0);
      if (totalFree < resourceNeeds.vramGB) {
        score *= 0.2;
        reasons.push(`Need ${resourceNeeds.vramGB} GB VRAM, only ${totalFree} GB free`);
      }
    }

    // Priority-based adjustment (background tasks yield to foreground)
    const priority = resourceNeeds.priority ?? 5;
    if (priority > 7 && score < 0.6) {
      score *= 0.5; // Low-priority + low resources → strongly defer
    }

    const recommendation =
      score > 0.7 ? "run" :
      score > 0.4 ? "defer" :
      "pause";

    return {
      confidence: Math.round(score * 100) / 100,
      recommendation,
      reason: reasons.length > 0
        ? `${featureName}: ${reasons.join("; ")}`
        : `${featureName}: resources adequate (confidence ${Math.round(score * 100)}%)`,
    };
  }

  private async poll(): Promise<void> {
    // CPU measurement
    const currentTick = getCpuTick();
    let cpuUsage = 0;
    if (this.prevCpuTick) {
      const idleDelta = currentTick.idle - this.prevCpuTick.idle;
      const totalDelta = currentTick.total - this.prevCpuTick.total;
      cpuUsage = totalDelta > 0 ? Math.round((1 - idleDelta / totalDelta) * 100) : 0;
    }
    this.prevCpuTick = currentTick;

    // RAM measurement
    const totalMem = totalmem();
    const freeMem = freemem();
    const usedMem = totalMem - freeMem;

    // GPU measurement (async, non-blocking)
    const gpus = await queryGpuInfo();

    const totalVramGB = gpus.reduce((s, g) => s + g.vramTotalGB, 0);
    const totalVramUsedGB = gpus.reduce((s, g) => s + g.vramUsedGB, 0);

    const load = loadavg();

    this.snapshot = {
      timestamp: Date.now(),
      cpu: {
        cores: cpus().length,
        usagePercent: cpuUsage,
        loadAvg1m: Math.round(load[0] * 100) / 100,
        loadAvg5m: Math.round(load[1] * 100) / 100,
        loadAvg15m: Math.round(load[2] * 100) / 100,
      },
      ram: {
        totalGB: Math.round(totalMem / 1e9 * 10) / 10,
        freeGB: Math.round(freeMem / 1e9 * 10) / 10,
        usedGB: Math.round(usedMem / 1e9 * 10) / 10,
        usedPercent: Math.round(usedMem / totalMem * 100),
      },
      gpu: gpus,
      totalVramGB,
      totalVramUsedGB,
      totalVramFreeGB: totalVramGB - totalVramUsedGB,
    };

    // Emit alerts
    this.checkAlerts();
  }

  private checkAlerts(): void {
    if (!this.snapshot) { return; }
    const s = this.snapshot;

    if (s.cpu.usagePercent > this.policy.maxCpuPercent) {
      this.emit("alert", { type: "cpu_high", usagePercent: s.cpu.usagePercent } satisfies ResourceAlert);
    }
    if (s.ram.usedPercent > this.policy.maxRamPercent || s.ram.freeGB < this.policy.reservedRamGB) {
      this.emit("alert", { type: "ram_high", usedPercent: s.ram.usedPercent, freeGB: s.ram.freeGB } satisfies ResourceAlert);
    }
    for (const g of s.gpu) {
      const usedPct = g.vramTotalGB > 0 ? (g.vramUsedGB / g.vramTotalGB) * 100 : 0;
      if (usedPct > this.policy.maxVramPercent) {
        this.emit("alert", { type: "vram_high", gpu: g.name, usedPercent: Math.round(usedPct) } satisfies ResourceAlert);
      }
      if (g.temperature > 85) {
        this.emit("alert", { type: "gpu_hot", gpu: g.name, temperature: g.temperature } satisfies ResourceAlert);
      }
    }
  }
}

/** Singleton resource monitor */
export const resourceMonitor = new ResourceMonitor();
