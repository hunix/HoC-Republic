/**
 * Kali Linux Nuclei Framework Bridge
 *
 * Provides orchestration for ProjectDiscovery's Nuclei, enabling mass
 * vulnerability scanning and custom, AI-authored YAML template execution.
 */

import { kaliExec } from "./kali-agent-loop.js";

export interface NucleiResult {
  ok: boolean;
  output: string;
  findings: unknown[];
  exitCode: number;
}

/**
 * Run a Nuclei scan against a target.
 * @param target The target URL or IP.
 * @param tags Optional comma-separated tags (e.g. "cve,misconfig").
 * @param severity Optional severity filter (e.g. "critical,high").
 * @param customTemplate Optional path to a specific template to run instead of the default corpus.
 */
export async function nucleiScan(
  target: string,
  tags?: string,
  severity?: string,
  customTemplate?: string
): Promise<NucleiResult> {
  const safeTarget = target.replace(/[^a-zA-Z0-9_\-.:/]/g, "");
  
  let cmd = `nuclei -u ${safeTarget} -json-export /tmp/nuclei_out.json -silent`;

  if (customTemplate) {
    const safeTemplate = customTemplate.replace(/[^a-zA-Z0-9_\-./]/g, "");
    cmd += ` -t ${safeTemplate}`;
  } else {
    // Standard filters
    if (tags) {
      const safeTags = tags.replace(/[^a-zA-Z0-9_,]/g, "");
      cmd += ` -tags ${safeTags}`;
    }
    if (severity) {
      const safeSev = severity.replace(/[^a-zA-Z0-9_,]/g, "");
      cmd += ` -severity ${safeSev}`;
    }
  }

  // Pre-clean previous output just in case
  await kaliExec(`rm -f /tmp/nuclei_out.json`, 10);

  // Execute Nuclei
  const result = await kaliExec(cmd, 600); // 10 minutes max running time

  // Read JSON results
  const readResult = await kaliExec(`cat /tmp/nuclei_out.json`, 10);
  let findings: unknown[] = [];
  
  if (readResult.stdout) {
    // Nuclei outputs NDJSON (newline-delimited JSON)
    findings = readResult.stdout
      .split("\n")
      .filter((l) => l.trim() !== "")
      .map((l) => {
        try { return JSON.parse(l); } catch { return null; }
      })
      .filter(Boolean);
  }

  return {
    ok: result.ok,
    output: result.stdout || result.stderr || "",
    findings,
    exitCode: result.exitCode,
  };
}

/**
 * Authors a custom Nuclei template inside the container for immediate execution.
 * @param id The reference ID for the template (e.g., "cve-2026-xxxxx")
 * @param yamlContent The raw YAML string defining the Nuclei template.
 * @returns The absolute path to the generated template on the Kali container.
 */
export async function nucleiAuthorTemplate(id: string, yamlContent: string): Promise<{ ok: boolean; path: string; error?: string }> {
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, "");
  const templatePath = `/root/data/nuclei-templates/custom_${safeId}.yaml`;
  
  // Ensure the directory exists
  await kaliExec(`mkdir -p /root/data/nuclei-templates`, 10);
  
  // Write the file
  // We use base64 to avoid quote and EOF escaping issues parsing raw YAML within bash
  const b64Data = Buffer.from(yamlContent).toString("base64");
  const writeCmd = `echo "${b64Data}" | base64 -d > ${templatePath}`;
  
  const result = await kaliExec(writeCmd, 10);

  return {
    ok: result.ok,
    path: templatePath,
    error: result.stderr,
  };
}
