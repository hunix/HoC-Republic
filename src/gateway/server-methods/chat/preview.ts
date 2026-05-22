/**
 * Chat Handler — Sandbox Preview Port Probe
 *
 * Detects whether a web preview server is running inside the sandbox container
 * by probing common dev server ports via HTTP GET.
 */

const SANDBOX_PREVIEW_PORTS = [8080, 3000, 5000, 5173, 4200];
const SANDBOX_HOST = "127.0.0.1";

export async function probeSandboxPreviewPort(): Promise<string | null> {
  for (const port of SANDBOX_PREVIEW_PORTS) {
    const url = await probePortWithContent(port);
    if (url) {
      return url;
    }
  }
  return null;
}

/**
 * Probe port via HTTP GET (using fetch) and check that the response
 * looks like an HTML page (not the default directory listing from
 * python -m http.server on an empty dir).
 */
async function probePortWithContent(port: number): Promise<string | null> {
  const url = `http://${SANDBOX_HOST}:${port}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) {
      return null;
    }
    const body = (await res.text()).toLowerCase();

    // Check for actual HTML content — not just a directory listing
    const isHtml =
      body.includes("<!doctype html") ||
      body.includes("<html") ||
      body.includes("<h1") ||
      body.includes("<title");
    const isDirListing =
      body.includes("directory listing for") ||
      (body.includes("<li>") && body.includes("href") && !body.includes("<html"));

    return isHtml && !isDirListing ? url : null;
  } catch {
    return null;
  }
}
