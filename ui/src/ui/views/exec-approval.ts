import { html, nothing } from "lit";
import type { AppViewState } from "../app-view-state.ts";

// ─── Risk Assessment ──────────────────────────────────────────────

type RiskLevel = "low" | "medium" | "high" | "critical";

interface RiskAssessment {
  level: RiskLevel;
  score: number; // 0-100
  category: string;
  reasoning: string;
}

const DANGEROUS_PATTERNS: [RegExp, string, RiskLevel][] = [
  [/rm\s+(-rf?|--recursive)\s+[/\\]/, "Recursive delete from root", "critical"],
  [/format\s+[a-zA-Z]:/, "Disk format command", "critical"],
  [/del\s+\/s\s+\/q/, "Recursive silent delete", "critical"],
  [/mkfs\./, "Filesystem format", "critical"],
  [/dd\s+if=.*of=\/dev\//, "Raw disk write", "critical"],
  [/:(){ :\|:& };:/, "Fork bomb", "critical"],
  [/shutdown|reboot|halt|poweroff/, "System power command", "high"],
  [/curl.*\|\s*(ba)?sh/, "Pipe to shell from network", "high"],
  [/wget.*\|\s*(ba)?sh/, "Pipe to shell from network", "high"],
  [/chmod\s+777/, "World-writable permissions", "high"],
  [/iptables|netsh\s+advfirewall/, "Firewall modification", "high"],
  [/reg\s+(add|delete)/, "Registry modification", "high"],
  [/npm\s+install\s+-g/, "Global package install", "medium"],
  [/pip\s+install/, "Python package install", "medium"],
  [/git\s+push\s+.*--force/, "Force push to remote", "medium"],
  [/docker\s+rm/, "Docker container removal", "medium"],
  [/DROP\s+TABLE|DELETE\s+FROM/i, "Database destructive query", "high"],
  [/net\s+user\s+.*\/add/, "User account creation", "high"],
  [/sc\s+(delete|stop)/, "Service control", "medium"],
];

const CATEGORY_PATTERNS: [RegExp, string][] = [
  [/rm|del|unlink|rmdir|shutil\.rmtree/, "🗑️ Filesystem: Delete"],
  [/mkdir|touch|cp|copy|mv|move|rename/, "📁 Filesystem: Modify"],
  [/cat|ls|dir|find|grep|head|tail|type/, "👁️ Filesystem: Read"],
  [/curl|wget|fetch|http|https|ssh|scp/, "🌐 Network"],
  [/git\s/, "🔀 Git"],
  [/npm|yarn|pnpm|pip|cargo/, "📦 Package Manager"],
  [/docker|podman|kubectl/, "🐳 Container"],
  [/node|python|ruby|go\s+run|java/, "⚙️ Process: Execute"],
  [/kill|taskkill|pkill/, "💀 Process: Kill"],
  [/systemctl|sc\s|service\s/, "🔧 System Service"],
];

function assessRisk(command: string): RiskAssessment {
  // Check dangerous patterns first
  for (const [pattern, reasoning, level] of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return {
        level,
        score: level === "critical" ? 100 : level === "high" ? 75 : 50,
        category: categorizeCommand(command),
        reasoning,
      };
    }
  }

  // Length-based heuristic: very long commands are suspicious
  if (command.length > 500) {
    return {
      level: "medium",
      score: 40,
      category: categorizeCommand(command),
      reasoning: "Unusually long command",
    };
  }

  // Pipe chains increase risk
  const pipeCount = (command.match(/\|/g) ?? []).length;
  if (pipeCount >= 3) {
    return {
      level: "medium",
      score: 35,
      category: categorizeCommand(command),
      reasoning: `Complex pipe chain (${pipeCount} pipes)`,
    };
  }

  return {
    level: "low",
    score: 10,
    category: categorizeCommand(command),
    reasoning: "Standard operation",
  };
}

function categorizeCommand(command: string): string {
  for (const [pattern, category] of CATEGORY_PATTERNS) {
    if (pattern.test(command)) {
      return category;
    }
  }
  return "📋 General";
}

const RISK_COLORS: Record<RiskLevel, string> = {
  low: "#22c55e",
  medium: "#f59e0b",
  high: "#f97316",
  critical: "#ef4444",
};

const RISK_ICONS: Record<RiskLevel, string> = {
  low: "✅",
  medium: "⚠️",
  high: "🔶",
  critical: "🛑",
};

// ─── Render ───────────────────────────────────────────────────────

function formatRemaining(ms: number): string {
  const remaining = Math.max(0, ms);
  const totalSeconds = Math.floor(remaining / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}

function renderMetaRow(label: string, value?: string | null) {
  if (!value) {
    return nothing;
  }
  return html`<div class="exec-approval-meta-row"><span>${label}</span><span>${value}</span></div>`;
}

export function renderExecApprovalPrompt(state: AppViewState) {
  const active = state.execApprovalQueue[0];
  if (!active) {
    return nothing;
  }
  const request = active.request;
  const remainingMs = active.expiresAtMs - Date.now();
  const remaining = remainingMs > 0 ? `expires in ${formatRemaining(remainingMs)}` : "expired";
  const queueCount = state.execApprovalQueue.length;
  const risk = assessRisk(request.command);

  return html`
    <div class="exec-approval-overlay" role="dialog" aria-live="polite">
      <div class="exec-approval-card">
        <div class="exec-approval-header">
          <div>
            <div class="exec-approval-title">Exec approval needed</div>
            <div class="exec-approval-sub">${remaining}</div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            ${
              queueCount > 1
                ? html`<div class="exec-approval-queue">${queueCount} pending</div>`
                : nothing
            }
          </div>
        </div>

        <!-- Risk Assessment Badge -->
        <div style="display: flex; align-items: center; gap: 12px; padding: 10px 14px; margin-bottom: 12px; border-radius: 8px; background: ${RISK_COLORS[risk.level]}15; border: 1px solid ${RISK_COLORS[risk.level]}30;">
          <span style="font-size: 20px;">${RISK_ICONS[risk.level]}</span>
          <div style="flex: 1;">
            <div style="font-weight: 600; color: ${RISK_COLORS[risk.level]}; text-transform: uppercase; font-size: 12px; letter-spacing: 0.5px;">
              ${risk.level} risk
            </div>
            <div style="font-size: 12px; color: var(--muted, #94a3b8); margin-top: 2px;">
              ${risk.category} — ${risk.reasoning}
            </div>
          </div>
          <div style="font-size: 20px; font-weight: 700; color: ${RISK_COLORS[risk.level]};">
            ${risk.score}
          </div>
        </div>

        <div class="exec-approval-command mono">${request.command}</div>
        <div class="exec-approval-meta">
          ${renderMetaRow("Host", request.host)}
          ${renderMetaRow("Agent", request.agentId)}
          ${renderMetaRow("Session", request.sessionKey)}
          ${renderMetaRow("CWD", request.cwd)}
          ${renderMetaRow("Resolved", request.resolvedPath)}
          ${renderMetaRow("Security", request.security)}
          ${renderMetaRow("Ask", request.ask)}
        </div>
        ${
          state.execApprovalError
            ? html`<div class="exec-approval-error">${state.execApprovalError}</div>`
            : nothing
        }
        <div class="exec-approval-actions">
          <button type="button"
            class="republic-btn republic-btn--primary"
            ?disabled=${state.execApprovalBusy || risk.level === "critical"}
            @click=${() => state.handleExecApprovalDecision("allow-once")}
          >
            ${risk.level === "critical" ? "⛔ Blocked" : "Allow once"}
          </button>
          <button type="button"
            class="republic-btn"
            ?disabled=${state.execApprovalBusy || risk.level === "critical" || risk.level === "high"}
            @click=${() => state.handleExecApprovalDecision("allow-always")}
          >
            Always allow
          </button>
          <button type="button"
            class="republic-btn republic-btn--danger"
            ?disabled=${state.execApprovalBusy}
            @click=${() => state.handleExecApprovalDecision("deny")}
          >
            Deny
          </button>
        </div>
      </div>
    </div>
  `;
}
