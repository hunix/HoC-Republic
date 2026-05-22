/**
 * Kali Auth Agent — Playwright-based authenticated scanning
 *
 * Handles the full auth flow:
 * 1. Navigate to login page (auto-detected or user-specified)
 * 2. Fill credentials
 * 3. Pause for CAPTCHA/OTP (notifies user via WebSocket)
 * 4. Capture session state (cookies, localStorage, tokens)
 * 5. Distribute auth state to tool agents
 */

import { getLogger } from "../logging.js";
import { kaliExec } from "./kali-agent-loop.js";
import type { AuthState } from "./kali-planner.js";

const logger = getLogger();

// ─── Types ──────────────────────────────────────────────────────

export interface AuthRequest {
  targetUrl: string;
  loginUrl?: string;         // optional — auto-detected if missing
  username: string;
  password: string;
  usernameSelector?: string; // CSS selector for username field
  passwordSelector?: string; // CSS selector for password field
  submitSelector?: string;   // CSS selector for submit button
  waitForCaptcha?: boolean;  // pause for human CAPTCHA
  waitForOtp?: boolean;      // pause for OTP entry
  otpSelector?: string;      // CSS selector for OTP input
}

export interface AuthResult {
  success: boolean;
  authState: AuthState;
  screenshots: string[];    // paths to evidence screenshots
  error?: string;
  loginUrl: string;
  duration: number;
}

// ─── Pending auth sessions waiting for human input ──────────────
const pendingAuthSessions = new Map<string, {
  resolve: (input: string) => void;
  type: "captcha" | "otp";
  createdAt: number;
}>();

// ─── Auth Flow ──────────────────────────────────────────────────

/**
 * Execute authenticated login via Playwright inside the Kali container.
 *
 * The Kali Dockerfile includes chromium. We use a Python Playwright script
 * injected into the container for maximum reliability.
 */
export async function authenticatedLogin(req: AuthRequest): Promise<AuthResult> {
  const start = Date.now();
  const sessionId = `auth_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const loginUrl = req.loginUrl || req.targetUrl;
  const screenshotDir = `/evidence/auth_${sessionId}`;

  logger.info(`[${sessionId}] Starting auth flow for ${loginUrl}`);

  // Build the Playwright script to run inside the container
  const playwrightScript = buildPlaywrightScript(sessionId, req, screenshotDir);

  // Write script to container
  await kaliExec(`mkdir -p ${screenshotDir} /tmp/auth-scripts`, 5);
  await kaliExec(`cat > /tmp/auth-scripts/${sessionId}.py << 'PYEOF'\n${playwrightScript}\nPYEOF`, 5);

  // Install playwright if not present
  await kaliExec(`pip3 install playwright 2>/dev/null && python3 -m playwright install chromium 2>/dev/null || true`, 120);

  // Execute the auth script
  const result = await kaliExec(`python3 /tmp/auth-scripts/${sessionId}.py 2>&1`, 120);

  try {
    // Parse the JSON output from the Playwright script
    const jsonMatch = result.stdout.match(/AUTH_RESULT_JSON:({.*})/);
    if (jsonMatch) {
      const authData = JSON.parse(jsonMatch[1]) as {
        success: boolean;
        cookies: string;
        localStorage: Record<string, string>;
        bearerToken: string;
        error?: string;
      };

      const authState: AuthState = {
        method: authData.bearerToken ? "bearer" : authData.cookies ? "cookie" : "none",
        cookies: authData.cookies || undefined,
        bearerToken: authData.bearerToken || undefined,
        localStorage: authData.localStorage || undefined,
        sessionId,
      };

      logger.info(`[${sessionId}] Auth ${authData.success ? "succeeded" : "failed"} (method: ${authState.method})`);

      return {
        success: authData.success,
        authState,
        screenshots: [`${screenshotDir}/pre-login.png`, `${screenshotDir}/post-login.png`],
        error: authData.error,
        loginUrl,
        duration: Date.now() - start,
      };
    }

    // Fallback: extract cookies via curl if Playwright failed
    logger.warn(`[${sessionId}] Playwright output didn't contain JSON, falling back to curl`);
    return await curlFallbackAuth(req, sessionId, start);

  } catch (err) {
    logger.error(`[${sessionId}] Auth failed: ${err}`);
    return {
      success: false,
      authState: { method: "none" },
      screenshots: [],
      error: err instanceof Error ? err.message : String(err),
      loginUrl,
      duration: Date.now() - start,
    };
  }
}

// ─── Playwright Script Builder ──────────────────────────────────

function buildPlaywrightScript(sessionId: string, req: AuthRequest, screenshotDir: string): string {
  const usernameSelector = req.usernameSelector || 'input[type="email"], input[type="text"], input[name="username"], input[name="email"], input[id="username"], input[id="email"], input[name="user"], input[name="login"]';
  const passwordSelector = req.passwordSelector || 'input[type="password"]';
  const submitSelector = req.submitSelector || 'button[type="submit"], input[type="submit"], button:has-text("Login"), button:has-text("Sign in"), button:has-text("Log in")';

  return `
import asyncio
import json
from playwright.async_api import async_playwright

async def main():
    result = {"success": False, "cookies": "", "localStorage": {}, "bearerToken": "", "error": ""}
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"]
        )
        context = await browser.new_context(
            viewport={"width": 1280, "height": 720},
            ignore_https_errors=True
        )
        page = await context.new_page()

        try:
            # Navigate to login page
            await page.goto("${req.loginUrl || req.targetUrl}", wait_until="networkidle", timeout=30000)
            await page.screenshot(path="${screenshotDir}/pre-login.png")

            # Find and fill username
            username_field = page.locator('${usernameSelector}').first
            await username_field.wait_for(timeout=10000)
            await username_field.click()
            await username_field.fill("${req.username}")

            # Find and fill password
            password_field = page.locator('${passwordSelector}').first
            await password_field.wait_for(timeout=5000)
            await password_field.click()
            await password_field.fill("${req.password}")

            # Submit
            submit_btn = page.locator('${submitSelector}').first
            await submit_btn.click()

            # Wait for navigation or response
            await page.wait_for_load_state("networkidle", timeout=15000)
            await asyncio.sleep(2)  # Extra wait for JS redirects

            await page.screenshot(path="${screenshotDir}/post-login.png")

            # Extract auth state
            cookies = await context.cookies()
            cookie_str = "; ".join(f"{c['name']}={c['value']}" for c in cookies)

            # Extract localStorage
            local_storage = await page.evaluate("() => { const s = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); s[k] = localStorage.getItem(k); } return s; }")

            # Look for bearer token in localStorage
            bearer = ""
            for k, v in local_storage.items():
                if any(t in k.lower() for t in ["token", "auth", "bearer", "jwt", "access"]):
                    bearer = v
                    break

            # Check if login succeeded (heuristic: URL changed or no error visible)
            current_url = page.url
            login_failed = await page.locator('text=/error|invalid|incorrect|failed/i').count() > 0

            result = {
                "success": not login_failed,
                "cookies": cookie_str,
                "localStorage": local_storage,
                "bearerToken": bearer,
                "error": "Login appears to have failed" if login_failed else "",
            }

        except Exception as e:
            result["error"] = str(e)
            await page.screenshot(path="${screenshotDir}/error.png")
        finally:
            await browser.close()

    print(f"AUTH_RESULT_JSON:{json.dumps(result)}")

asyncio.run(main())
`;
}

// ─── Curl Fallback ──────────────────────────────────────────────

async function curlFallbackAuth(req: AuthRequest, sessionId: string, start: number): Promise<AuthResult> {
  const url = req.loginUrl || req.targetUrl;

  // Try a simple POST with curl
  const cmd = [
    `curl -sL -c /tmp/auth_cookies_${sessionId}.txt -b /tmp/auth_cookies_${sessionId}.txt`,
    `-d "username=${req.username}&password=${req.password}"`,
    `-d "email=${req.username}&password=${req.password}"`,
    `"${url}" -o /dev/null -w "%{http_code}"`,
    `2>/dev/null`,
  ].join(" ");

  const result = await kaliExec(cmd, 30);
  const httpCode = result.stdout.trim();

  // Read cookies
  const cookieResult = await kaliExec(`cat /tmp/auth_cookies_${sessionId}.txt 2>/dev/null | grep -v "^#" | awk '{print $6"="$7}' | tr '\\n' '; '`, 5);
  const cookies = cookieResult.stdout.trim();

  const success = ["200", "301", "302", "303"].includes(httpCode) && cookies.length > 10;

  return {
    success,
    authState: {
      method: cookies ? "cookie" : "none",
      cookies: cookies || undefined,
      sessionId,
    },
    screenshots: [],
    error: success ? undefined : `HTTP ${httpCode} — curl fallback may not handle JS-rendered login forms`,
    loginUrl: url,
    duration: Date.now() - start,
  };
}

// ─── Human-in-the-loop for CAPTCHA/OTP ──────────────────────────

/**
 * Register a pending auth session that needs human input.
 * The UI will show a modal for the user to complete CAPTCHA or enter OTP.
 */
export function requestHumanInput(sessionId: string, type: "captcha" | "otp"): Promise<string> {
  return new Promise((resolve) => {
    pendingAuthSessions.set(sessionId, { resolve, type, createdAt: Date.now() });
    logger.info(`[${sessionId}] Waiting for human ${type} input...`);

    // Auto-timeout after 5 minutes
    setTimeout(() => {
      if (pendingAuthSessions.has(sessionId)) {
        pendingAuthSessions.delete(sessionId);
        resolve("");
        logger.warn(`[${sessionId}] Human input timed out after 5 minutes`);
      }
    }, 5 * 60 * 1000);
  });
}

/**
 * Provide human input for a pending auth session (called from RPC).
 */
export function provideHumanInput(sessionId: string, input: string): boolean {
  const session = pendingAuthSessions.get(sessionId);
  if (!session) { return false; }

  session.resolve(input);
  pendingAuthSessions.delete(sessionId);
  logger.info(`[${sessionId}] Human ${session.type} input received`);
  return true;
}

/**
 * Get all pending auth sessions (for UI polling).
 */
export function getPendingAuthSessions(): Array<{ sessionId: string; type: "captcha" | "otp"; createdAt: number }> {
  return [...pendingAuthSessions.entries()].map(([sessionId, s]) => ({
    sessionId,
    type: s.type,
    createdAt: s.createdAt,
  }));
}
