/**
 * Kali Linux Autonomous Mitigation Engine
 *
 * Allows the orchestrator to automatically generate defensive mitigations
 * (e.g., iptables firewalls, snort signatures, basic WAF rules) using LLM
 * insight derived from vulnerabilities found during the scanning phase.
 */

export interface MitigationResult {
  ok: boolean;
  mitigationCode: string;
  mitigationType: string;
}

/**
 * Generates IPTables commands to block a specific attack vector or malicious host.
 */
export async function generateIptablesRules(cveData: string, maliciousIp?: string): Promise<MitigationResult> {
  let rule = `# Auto-Generated IPTables Rules Based on: ${cveData}\n`;
  rule += `iptables -A INPUT -m conntrack --ctstate INVALID -j DROP\n`;

  if (maliciousIp) {
    const safeIp = maliciousIp.replace(/[^0-9./]/g, "");
    if (safeIp) {
      rule += `iptables -A INPUT -s ${safeIp} -j DROP\n`;
    }
  } else {
    // Generic throttling for common exploits like password bruteforcing or DDOS
    rule += `iptables -A INPUT -p tcp --dport 22 -m state --state NEW -m recent --set\n`;
    rule += `iptables -A INPUT -p tcp --dport 22 -m state --state NEW -m recent --update --seconds 60 --hitcount 4 -j DROP\n`;
  }

  return {
    ok: true,
    mitigationType: "iptables",
    mitigationCode: rule,
  };
}

/**
 * Generates an Nginx/ModSecurity basic WAF block string for an identified attack.
 */
export async function generateWafRules(attackVector: string): Promise<MitigationResult> {
  const safeVector = attackVector.replace(/['";\\]/g, "");
  
  const rule = `SecRule REQUEST_URI "@contains ${safeVector}" \\
  "id:999999, \\
  phase:1, \\
  deny, \\
  status:403, \\
  msg:'HoC Auto-Mitigated Attack Vector'"`;

  return {
    ok: true,
    mitigationType: "modsecurity-waf",
    mitigationCode: rule,
  };
}

/**
 * Drafts a generic Snort rule to detect an in-flight payload.
 */
export async function generateSnortSignature(payload: string): Promise<MitigationResult> {
  // Snort payload matcher (hex-encoding content is usually better but raw string for simplicity here)
  const safePayload = payload.replace(/"/g, "'");

  const rule = `alert tcp $EXTERNAL_NET any -> $HTTP_SERVERS $HTTP_PORTS (msg:"HoC Auto-Signature Match"; flow:established,to_server; content:"${safePayload}"; nocase; sid:9000001; rev:1;)`;

  return {
    ok: true,
    mitigationType: "snort-ids",
    mitigationCode: rule,
  };
}
