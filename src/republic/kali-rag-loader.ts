/**
 * Kali RAG Loader — Ingests tool documentation into vector store
 *
 * Loads per-tool prompts, man pages, and scan patterns into the
 * existing agentic-rag / document-ingestion pipeline for retrieval
 * by micro-orchestrators during scan execution.
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { getLogger } from "../logging.js";

const logger = getLogger();

// ─── Types ──────────────────────────────────────────────────────

export interface ToolPrompt {
  cat: string;
  cmd: string;
  desc: string;
  prompt: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  flags?: Record<string, string>;
  timeout: number;
  parse: string;
}

export interface ScanPattern {
  desc: string;
  tools: string[];
  skip: string[];
  priority: string;
  notes: string;
}

export interface ToolPromptsConfig {
  meta: { version: string; format: string; description: string };
  categories: string[];
  tools: Record<string, ToolPrompt>;
  scan_patterns: Record<string, ScanPattern>;
}

// ─── Singleton cache ────────────────────────────────────────────

let _config: ToolPromptsConfig | null = null;

function loadConfig(): ToolPromptsConfig {
  if (_config) { return _config; }

  const promptPath = join(import.meta.dirname, "kali-prompts", "tool-prompts.json");
  if (!existsSync(promptPath)) {
    logger.error(`Tool prompts not found at ${promptPath}`);
    throw new Error(`Kali tool prompts not found: ${promptPath}`);
  }

  _config = JSON.parse(readFileSync(promptPath, "utf-8")) as ToolPromptsConfig;
  logger.info(`Loaded ${Object.keys(_config.tools).length} tool prompts, ${Object.keys(_config.scan_patterns).length} scan patterns`);
  return _config;
}

// ─── Public API ─────────────────────────────────────────────────

/** Get the system prompt for a specific tool micro-orchestrator */
export function getToolPrompt(toolName: string): ToolPrompt | undefined {
  const config = loadConfig();
  return config.tools[toolName];
}

/** Get all tools for a specific category */
export function getToolsByCategory(category: string): Record<string, ToolPrompt> {
  const config = loadConfig();
  const result: Record<string, ToolPrompt> = {};
  for (const [name, tool] of Object.entries(config.tools)) {
    if (tool.cat === category) { result[name] = tool; }
  }
  return result;
}

/** Get scan pattern for a target type */
export function getScanPattern(patternId: string): ScanPattern | undefined {
  const config = loadConfig();
  return config.scan_patterns[patternId];
}

/** Get all available scan patterns */
export function getAllPatterns(): Record<string, ScanPattern> {
  const config = loadConfig();
  return config.scan_patterns;
}

/** Get all tool names */
export function getAllToolNames(): string[] {
  const config = loadConfig();
  return Object.keys(config.tools);
}

/** Get all categories */
export function getCategories(): string[] {
  const config = loadConfig();
  return config.categories;
}

/**
 * Build a lean system prompt for a tool micro-orchestrator.
 * Returns ONLY the context needed — no bloat.
 *
 * Format (TOON):
 * {role, tool, target, scope, prompt, schema_in, schema_out}
 */
export function buildToolAgentPrompt(
  toolName: string,
  target: string,
  scope: { ports?: string; auth?: string; mode?: string } = {},
): string {
  const tool = getToolPrompt(toolName);
  if (!tool) { return `Unknown tool: ${toolName}`; }

  // Build minimal TOON prompt
  const lines = [
    `ROLE: ${toolName} specialist`,
    `TOOL: ${tool.cmd}`,
    `TARGET: ${target}`,
    `TIMEOUT: ${tool.timeout}s`,
    `OUTPUT_FORMAT: ${tool.parse}`,
    "",
    tool.prompt,
    "",
    `INPUT_SCHEMA: ${JSON.stringify(tool.input)}`,
    `OUTPUT_SCHEMA: ${JSON.stringify(tool.output)}`,
  ];

  if (tool.flags && scope.mode && tool.flags[scope.mode]) {
    lines.push(`FLAGS: ${tool.flags[scope.mode]}`);
  }
  if (scope.ports) { lines.push(`PORTS: ${scope.ports}`); }
  if (scope.auth && scope.auth !== "none") { lines.push(`AUTH: ${scope.auth}`); }

  lines.push("", "Respond with TOON JSON only. No prose. No markdown. Raw JSON.");

  return lines.join("\n");
}

/**
 * Build the command string for a tool based on target and mode.
 * This is a deterministic builder — no LLM needed for standard commands.
 */
export function buildToolCommand(
  toolName: string,
  target: string,
  opts: { ports?: string; mode?: string; auth?: string; wordlist?: string; output?: string } = {},
): string | null {
  const tool = getToolPrompt(toolName);
  if (!tool) { return null; }

  const { ports = "1-1000", mode = "quick", auth, wordlist, output } = opts;
  const outFlag = output || `/evidence/${toolName}_${Date.now()}.out`;

  switch (toolName) {
    case "nmap": {
      const flags = tool.flags?.[mode] || "-sS -sV --top-ports 100";
      return `nmap ${flags.replace("{ports}", ports)} -oX ${outFlag}.xml ${target}`;
    }
    case "masscan":
      return `masscan ${target} -p${ports} --rate=${opts.mode === "fast" ? "5000" : "1000"} -oJ ${outFlag}.json`;
    case "dnsrecon":
      return `dnsrecon -d ${target} -t std,brt -j ${outFlag}.json`;
    case "amass":
      return `amass enum -d ${target} ${mode === "passive" ? "-passive" : ""} -json ${outFlag}.json`;
    case "whois":
      return `whois ${target}`;
    case "sslyze":
      return `sslyze --regular --json_out=${outFlag}.json ${target}`;
    case "theharvester":
      return `theHarvester -d ${target} -l 200 -b all`;
    case "nikto":
      return `nikto -h ${target.startsWith("http") ? target : `https://${target}`} -Format json -output ${outFlag}.json${auth ? ` -id ${auth}` : ""}`;
    case "gobuster":
      return `gobuster dir -u ${target.startsWith("http") ? target : `https://${target}`} -w ${wordlist || "/usr/share/wordlists/dirb/common.txt"} -t 20 -x php,html,txt,js,json -o ${outFlag}.txt${auth ? ` -c "${auth}"` : ""}`;
    case "sqlmap":
      return `sqlmap -u "${target}" --batch --level=2 --risk=1 --output-dir=${outFlag}_dir${auth ? ` --cookie="${auth}"` : ""}`;
    case "wpscan":
      return `wpscan --url ${target.startsWith("http") ? target : `https://${target}`} --enumerate vp,vt,u --format json -o ${outFlag}.json`;
    case "wafw00f":
      return `wafw00f ${target.startsWith("http") ? target : `https://${target}`}`;
    case "ffuf":
      return `ffuf -u ${target.startsWith("http") ? target : `https://${target}`}/FUZZ -w ${wordlist || "/usr/share/wordlists/dirb/common.txt"} -mc 200,301,302,403 -o ${outFlag}.json -of json`;
    case "hydra":
      return `hydra -l admin -P /usr/share/wordlists/rockyou.txt ${target} ${opts.mode || "ssh"} -t 4 -f`;
    case "traceroute":
      return `traceroute -m 30 ${target}`;
    case "lynis":
      return `lynis audit system ${mode === "quick" ? "--quick" : ""}`;
    case "httrack": {
      const url = target.startsWith("http") ? target : `https://${target}`;
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const safeName = target.replace(/[^a-zA-Z0-9.-]/g, "_");
      return `httrack "${url}" -O /evidence/web-clones/${safeName}_${ts} -r${opts.mode === "deep" ? "5" : "3"} --max-rate=500000 --connection-per-second=2 -s0 --timeout=30`;
    }
    case "linkchecker":
      return `linkchecker --no-robots --recursion-level=2 --check-extern --timeout=10 --output=text "${target.startsWith("http") ? target : `https://${target}`}"`;
    case "searchsploit":
      return `searchsploit "${target}" --json`;
    case "enum4linux":
      return `enum4linux -a ${target}`;
    case "tcpdump":
      return `tcpdump -i any host ${target} -c 100 -nn -w ${outFlag}.pcap`;
    case "tshark":
      return `tshark -i any -f "host ${target}" -c 100`;
    case "whatweb": {
      const aggression = opts.mode === "detailed" ? "3" : "1";
      return `whatweb -a ${aggression} --log-json=${outFlag}.json "${target.startsWith("http") ? target : `https://${target}`}"`;
    }
    case "hashcat":
      return `hashcat -m ${opts.mode || "0"} "${target}" ${wordlist || "/usr/share/wordlists/rockyou.txt"} --potfile-path=${outFlag}.pot --runtime=${opts.mode === "fast" ? "60" : "300"} --force 2>&1`;
    case "hping3":
      return `hping3 -S -p ${ports || "80"} -c 10 ${target}`;
    case "arp-scan":
      return `arp-scan --localnet`;
    case "foremost":
      return `foremost -t all -i "${target}" -o ${outFlag}_carved`;
    case "exiftool":
      return `exiftool -json "${target}"`;
    case "steghide":
      return `steghide info "${target}" -p ""`;
    case "nc":
      return `nc -z -v -w 3 ${target} ${ports || "1-1000"} 2>&1`;
    default:
      return null;
  }
}

/**
 * Get the list of tools to run for a given scan pattern, in order.
 * Returns tool names and their recommended modes.
 */
export function getToolChain(patternId: string): Array<{ tool: string; mode?: string }> {
  const pattern = getScanPattern(patternId);
  if (!pattern) { return []; }

  return pattern.tools.map(entry => {
    const [tool, mode] = entry.split(":");
    return { tool, mode };
  });
}

/**
 * Determine the best scan pattern for a target based on fingerprinting hints.
 */
export function matchScanPattern(hints: {
  hasWordPress?: boolean;
  isSPA?: boolean;
  isAPI?: boolean;
  isNetwork?: boolean;
  isEcommerce?: boolean;
}): string {
  if (hints.hasWordPress) { return "wordpress"; }
  if (hints.isAPI) { return "api_rest"; }
  if (hints.isSPA) { return "spa_react_vue"; }
  if (hints.isEcommerce) { return "ecommerce"; }
  if (hints.isNetwork) { return "network_infra"; }
  return "full_pentest";
}
