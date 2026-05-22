/**
 * Collaborative Browser Session Manager
 *
 * Enables user ↔ agent hand-off for browser-based tasks:
 *   1. Agent starts browsing (Playwright persistent context)
 *   2. Agent hits login/OTP/CAPTCHA → requests user control
 *   3. User takes over via noVNC (port 6080)
 *   4. User authenticates, then clicks "Resume Agent"
 *   5. Agent continues with the authenticated session (cookies intact)
 *
 * Key architecture decisions:
 *   - Uses Playwright persistent context pointing to /workspace/.browser-data/
 *   - The same Chrome profile is visible in the noVNC Xvfb session
 *   - Cookies and localStorage persist across session restarts
 *   - Auth tokens can be exported/imported per domain
 */

import { createSubsystemLogger } from "../logging/subsystem.js";

const logger = createSubsystemLogger("browser-collab");

// ─── Types ──────────────────────────────────────────────────────

export type SessionState =
  | "idle"
  | "agent-controlled"
  | "paused-for-user"
  | "user-active"
  | "agent-resumed"
  | "stopped";

export interface CollabSession {
  id: string;
  state: SessionState;
  startUrl: string;
  currentUrl: string;
  startedAt: number;
  pausedAt?: number;
  resumedAt?: number;
  stoppedAt?: number;
  pauseReason?: string;
  screenshotPath?: string;
  authDomains: string[];
  history: SessionEvent[];
}

export interface SessionEvent {
  type: "started" | "paused" | "resumed" | "stopped" | "auth_detected" | "screenshot" | "url_changed";
  timestamp: number;
  url?: string;
  reason?: string;
  screenshotPath?: string;
}

export interface AuthToken {
  domain: string;
  cookies: CookieData[];
  localStorage?: Record<string, string>;
  savedAt: number;
  source: string;
}

export interface CookieData {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "Strict" | "Lax" | "None";
}

// ─── State ──────────────────────────────────────────────────────

let currentSession: CollabSession | null = null;
const savedAuthTokens: Map<string, AuthToken> = new Map();
let sessionCounter = 0;

const BROWSER_DATA_DIR = "/workspace/.browser-data";
const AUTH_TOKENS_DIR = "/workspace/.auth-tokens";
const SCREENSHOT_DIR = "/workspace/.screenshots";

// ─── Session Lifecycle ──────────────────────────────────────────

/**
 * Start a new collaborative browser session.
 * Launches Chromium with persistent user data in the sandbox.
 */
export async function startCollabSession(url: string): Promise<CollabSession> {
  if (currentSession && currentSession.state !== "stopped" && currentSession.state !== "idle") {
    throw new Error(`Session already active (state: ${currentSession.state}). Stop it first.`);
  }

  const sessionId = `collab-${++sessionCounter}-${Date.now()}`;

  // Ensure directories exist in sandbox
  const { sandboxExec } = await import("./agent-sandbox.js");
  await sandboxExec(`mkdir -p ${BROWSER_DATA_DIR} ${AUTH_TOKENS_DIR} ${SCREENSHOT_DIR}`, "/workspace", 10);

  // Launch browser with persistent context
  // This writes to the same user data dir that Chromium on the Xvfb display uses
  await sandboxExec(
    `DISPLAY=:99 chromium-browser --user-data-dir=${BROWSER_DATA_DIR} --no-first-run --disable-gpu --disable-dev-shm-usage "${url}" &`,
    "/workspace",
    10,
  );

  currentSession = {
    id: sessionId,
    state: "agent-controlled",
    startUrl: url,
    currentUrl: url,
    startedAt: Date.now(),
    authDomains: [],
    history: [{
      type: "started",
      timestamp: Date.now(),
      url,
    }],
  };

  logger.info(`Started collaborative session ${sessionId}: ${url}`);
  return currentSession;
}

/**
 * Pause the session for user control.
 * Called by the agent when it hits a login/OTP/CAPTCHA.
 */
export function pauseForUser(reason: string): CollabSession {
  if (!currentSession || currentSession.state === "stopped") {
    throw new Error("No active session to pause");
  }

  currentSession.state = "paused-for-user";
  currentSession.pausedAt = Date.now();
  currentSession.pauseReason = reason;
  currentSession.history.push({
    type: "paused",
    timestamp: Date.now(),
    reason,
    url: currentSession.currentUrl,
  });

  logger.info(`Session paused for user: ${reason}`);
  return currentSession;
}

/**
 * Resume agent control after user intervention.
 * Called when user clicks "Resume Agent" in the UI.
 */
export function resumeAgent(): CollabSession {
  if (!currentSession) {
    throw new Error("No session to resume");
  }
  if (currentSession.state !== "paused-for-user" && currentSession.state !== "user-active") {
    throw new Error(`Cannot resume from state: ${currentSession.state}`);
  }

  currentSession.state = "agent-resumed";
  currentSession.resumedAt = Date.now();
  currentSession.history.push({
    type: "resumed",
    timestamp: Date.now(),
    url: currentSession.currentUrl,
  });

  logger.info("Session resumed — agent control restored");
  return currentSession;
}

/**
 * Stop the collaborative session.
 */
export function stopSession(): CollabSession | null {
  if (!currentSession) { return null; }

  currentSession.state = "stopped";
  currentSession.stoppedAt = Date.now();
  currentSession.history.push({
    type: "stopped",
    timestamp: Date.now(),
  });

  logger.info(`Session ${currentSession.id} stopped`);
  const session = currentSession;
  currentSession = null;
  return session;
}

/**
 * Get the current session status.
 */
export function getSessionStatus(): CollabSession | { state: "idle" } {
  if (!currentSession) { return { state: "idle" }; }
  return { ...currentSession };
}

// ─── Screenshot ─────────────────────────────────────────────────

/**
 * Take a screenshot of the current browser state.
 */
export async function takeScreenshot(): Promise<string> {
  const { sandboxExec } = await import("./agent-sandbox.js");
  const filename = `screenshot-${Date.now()}.png`;
  const filepath = `${SCREENSHOT_DIR}/${filename}`;

  // Use xdotool or import to capture the Xvfb display
  await sandboxExec(
    `DISPLAY=:99 import -window root ${filepath} 2>/dev/null || DISPLAY=:99 scrot ${filepath} 2>/dev/null || echo "screenshot-failed"`,
    "/workspace",
    10,
  );

  if (currentSession) {
    currentSession.screenshotPath = filepath;
    currentSession.history.push({
      type: "screenshot",
      timestamp: Date.now(),
      screenshotPath: filepath,
    });
  }

  return filepath;
}

// ─── Auth Token Management ──────────────────────────────────────

/**
 * Export auth tokens (cookies + localStorage) for a domain.
 * Saves to persistent storage in the sandbox.
 */
export async function exportAuthTokens(domain: string): Promise<AuthToken> {
  const { sandboxExec, sandboxWriteFile } = await import("./agent-sandbox.js");

  // Extract cookies from Chrome's cookie database
  const cookieDbPath = `${BROWSER_DATA_DIR}/Default/Cookies`;
  const extractScript = `
import sqlite3, json, sys
try:
    conn = sqlite3.connect('${cookieDbPath}')
    c = conn.cursor()
    c.execute("SELECT name, value, host_key, path, expires_utc, is_httponly, is_secure FROM cookies WHERE host_key LIKE ?", ('%${domain}%',))
    cookies = []
    for row in c.fetchall():
        cookies.append({
            'name': row[0], 'value': row[1], 'domain': row[2],
            'path': row[3], 'expires': row[4],
            'httpOnly': bool(row[5]), 'secure': bool(row[6]),
            'sameSite': 'Lax'
        })
    conn.close()
    print(json.dumps(cookies))
except Exception as e:
    print(json.dumps([]))
    print(str(e), file=sys.stderr)
`.trim();

  await sandboxWriteFile("/tmp/extract_cookies.py", extractScript);
  const result = await sandboxExec("python3 /tmp/extract_cookies.py", "/workspace", 10);

  let cookies: CookieData[] = [];
  try {
    cookies = JSON.parse(result.stdout.trim() || "[]") as CookieData[];
  } catch {
    logger.warn(`Failed to parse cookies for ${domain}: ${result.stdout}`);
  }

  const authToken: AuthToken = {
    domain,
    cookies,
    savedAt: Date.now(),
    source: currentSession?.id || "manual",
  };

  // Save to persistent storage
  savedAuthTokens.set(domain, authToken);
  await sandboxExec(`mkdir -p ${AUTH_TOKENS_DIR}`, "/workspace", 5);
  await sandboxWriteFile(
    `${AUTH_TOKENS_DIR}/${domain.replace(/\./g, "_")}.json`,
    JSON.stringify(authToken, null, 2),
  );

  if (currentSession && !currentSession.authDomains.includes(domain)) {
    currentSession.authDomains.push(domain);
    currentSession.history.push({
      type: "auth_detected",
      timestamp: Date.now(),
      url: `https://${domain}`,
    });
  }

  logger.info(`Exported ${cookies.length} cookies for ${domain}`);
  return authToken;
}

/**
 * Import previously saved auth tokens for a domain.
 * Injects cookies back into the browser session.
 */
export async function importAuthTokens(domain: string): Promise<boolean> {
  const { sandboxExec, sandboxReadFile, sandboxWriteFile } = await import("./agent-sandbox.js");

  // Try in-memory first, then persistent storage
  let authToken = savedAuthTokens.get(domain);
  if (!authToken) {
    const filename = `${AUTH_TOKENS_DIR}/${domain.replace(/\./g, "_")}.json`;
    const content = await sandboxReadFile(filename);
    if (content) {
      try {
        authToken = JSON.parse(content) as AuthToken;
        savedAuthTokens.set(domain, authToken);
      } catch {
        logger.warn(`Failed to parse saved auth for ${domain}`);
        return false;
      }
    }
  }

  if (!authToken || authToken.cookies.length === 0) {
    logger.warn(`No saved auth tokens for ${domain}`);
    return false;
  }

  // Inject cookies via Playwright CDP or cookie injection script
  const injectScript = `
import sqlite3, json, sys
try:
    cookies = json.loads('''${JSON.stringify(authToken.cookies).replace(/'/g, "\\'")}''')
    conn = sqlite3.connect('${BROWSER_DATA_DIR}/Default/Cookies')
    c = conn.cursor()
    for cookie in cookies:
        c.execute('''INSERT OR REPLACE INTO cookies
            (host_key, name, value, path, expires_utc, is_httponly, is_secure, creation_utc, last_access_utc)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)''',
            (cookie['domain'], cookie['name'], cookie['value'], cookie.get('path', '/'),
             cookie.get('expires', 0), int(cookie.get('httpOnly', False)),
             int(cookie.get('secure', False)), 0, 0))
    conn.commit()
    conn.close()
    print(f"Injected {len(cookies)} cookies")
except Exception as e:
    print(f"Failed: {e}", file=sys.stderr)
`.trim();

  await sandboxWriteFile("/tmp/inject_cookies.py", injectScript);
  const result = await sandboxExec("python3 /tmp/inject_cookies.py", "/workspace", 10);

  logger.info(`Imported auth tokens for ${domain}: ${result.stdout.trim()}`);
  return result.exitCode === 0;
}

/**
 * List all saved auth token sets.
 */
export function listAuthTokens(): Array<{ domain: string; cookieCount: number; savedAt: number; source: string }> {
  return [...savedAuthTokens.entries()].map(([domain, token]) => ({
    domain,
    cookieCount: token.cookies.length,
    savedAt: token.savedAt,
    source: token.source,
  }));
}

/**
 * Load all auth tokens from persistent storage on startup.
 */
export async function loadPersistedAuthTokens(): Promise<number> {
  try {
    const { sandboxExec, sandboxReadFile } = await import("./agent-sandbox.js");
    const listResult = await sandboxExec(`ls -1 ${AUTH_TOKENS_DIR}/*.json 2>/dev/null || echo ""`, "/workspace", 5);
    const files = listResult.stdout.trim().split("\n").filter(f => f.endsWith(".json"));

    for (const file of files) {
      const content = await sandboxReadFile(file);
      if (content) {
        try {
          const token = JSON.parse(content) as AuthToken;
          savedAuthTokens.set(token.domain, token);
        } catch { /* skip invalid */ }
      }
    }
    return savedAuthTokens.size;
  } catch {
    return 0;
  }
}
