/**
 * Sandbox Tool Definitions — web-browser tools
 */

export const WEB_BROWSER_TOOLS = [
  {
    name: "web_scrape",
    description: `Scrape a URL using Scrapling (pre-installed). Returns extracted data as JSON.
Supports CSS selectors and multiple scraping modes.

Modes:
• 'scrape' — fast HTTP fetch + parse (default, works for most sites)
• 'stealth' — anti-detection with realistic headers and TLS fingerprinting
• 'dynamic' — full browser rendering via Playwright (for JS-heavy sites, SPAs)

Use this for: extracting company info, product data, contact details, testimonials,
article content, pricing tables, social media posts, etc.`,
    input_schema: {
      type: "object" as const,
      properties: {
        url: {
          type: "string",
          description: "URL to scrape",
        },
        selectors: {
          type: "string",
          description:
            "Comma-separated CSS selectors (e.g., 'h1::text,.about-text::text,img::attr(src)')",
        },
        mode: {
          type: "string",
          enum: ["scrape", "stealth", "dynamic"],
          description: "Scraping mode (default: scrape)",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "clone_website",
    description: `Clone an entire website offline with all assets (HTML, CSS, JS, images, fonts, videos).
Creates a complete local mirror in a folder structure preserving the original site layout.

This is perfect for:
• Saving full websites for offline viewing
• Extracting all assets from a site (images, scripts, styles)
• Creating templates from existing sites
• Archiving web content
• Research and competitive analysis`,
    input_schema: {
      type: "object" as const,
      properties: {
        url: {
          type: "string",
          description: "URL of the website to clone",
        },
        output_dir: {
          type: "string",
          description: "Output directory (default: /workspace/cloned-sites/<domain>)",
        },
        depth: {
          type: "number",
          description: "Max crawl depth (default: 3, max: 10). Higher = more pages.",
        },
        include_assets: {
          type: "boolean",
          description: "Download all assets (images, CSS, JS, fonts). Default: true",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "browser_interact",
    description: `Automate browser interactions using Playwright inside the sandbox.
Supports navigation, clicking, form filling, screenshots, and JavaScript evaluation.
Use this for any task requiring web interaction: scraping dynamic sites, filling forms,
testing web apps, capturing screenshots of live pages, or extracting data from SPAs.

Actions:
• navigate: Open a URL
• click: Click an element by CSS selector
• fill: Fill a form field
• screenshot: Capture the page
• evaluate: Run JavaScript on the page
• get_text: Extract text from an element
• get_links: Get all links on the page
• wait: Wait for an element to appear
• scroll: Scroll the page
• pdf: Generate a PDF of the page`,
    input_schema: {
      type: "object" as const,
      properties: {
        action: {
          type: "string",
          enum: [
            "navigate",
            "click",
            "fill",
            "screenshot",
            "evaluate",
            "get_text",
            "get_links",
            "wait",
            "scroll",
            "pdf",
          ],
          description: "Browser action to perform",
        },
        url: {
          type: "string",
          description: "URL to navigate to (for 'navigate' action)",
        },
        selector: {
          type: "string",
          description: "CSS selector for the target element",
        },
        value: {
          type: "string",
          description: "Value to fill (for 'fill' action) or JS code (for 'evaluate')",
        },
        output_path: {
          type: "string",
          description: "File path for screenshot/pdf output (default: /workspace/screenshot.png)",
        },
      },
      required: ["action"],
    },
  },
  {
    name: "browser_request_user_control",
    description: `Request user to take over browser control when you hit a login page, OTP verification,
CAPTCHA, or any authentication barrier you cannot bypass autonomously.

This tool:
1. Pauses the agent's browser session
2. Shows an interactive card in chat with a link to the noVNC browser view (port 6080)
3. Waits for the user to authenticate manually
4. Resumes when the user clicks "Resume Agent"

The browser session uses a PERSISTENT Chrome profile, so cookies and auth tokens survive across sessions.
After the user authenticates, their session cookies are automatically saved for future use.

Use this INSTEAD of trying to guess passwords, bypass CAPTCHAs, or fake OTP codes.
NEVER attempt to log in to the user's accounts without their explicit intervention.`,
    input_schema: {
      type: "object" as const,
      properties: {
        url: {
          type: "string",
          description: "The URL where authentication is needed",
        },
        reason: {
          type: "string",
          description:
            "Why user intervention is needed (e.g., 'Login required', 'OTP verification', 'CAPTCHA detected')",
        },
        service_name: {
          type: "string",
          description: "Name of the service (e.g., 'Google', 'GitHub', 'LinkedIn')",
        },
      },
      required: ["url", "reason"],
    },
  },
  {
    name: "web_search",
    description: `Search the web using DuckDuckGo — NO API key required.
Returns structured results (title, URL, snippet) from organic search results.

Use this when you need to:
• Research technologies, libraries, or frameworks
• Find documentation, tutorials, or examples
• Look up company information, pricing, or comparisons
• Gather facts for documents, presentations, or reports
• Find the latest news or trends on a topic

The search runs directly inside the sandbox container using curl + parsing.
Returns up to 20 results per query. Chain multiple searches for deep research.`,
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Search query string",
        },
        num_results: {
          type: "number",
          description: "Number of results to return (default: 10, max: 20)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "http_request",
    description: `Make raw HTTP requests to any API. Unlike web_scrape (which extracts page text) this tool sends
structured API calls with custom methods, headers, bodies, and auth.

Use for: REST API integration, webhook testing, OAuth flows, GraphQL queries, health checks.

Returns: status code, response headers, and body (auto-parsed as JSON when possible).`,
    input_schema: {
      type: "object" as const,
      properties: {
        url: { type: "string", description: "Full URL to request" },
        method: {
          type: "string",
          description: "HTTP method: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS (default: GET)",
        },
        headers: {
          type: "string",
          description: 'JSON object of request headers, e.g. \'{"Authorization": "Bearer xxx"}\' ',
        },
        body: { type: "string", description: "Request body — JSON string, form data, or raw text" },
        content_type: {
          type: "string",
          description: "Content-Type header shorthand: json, form, text, xml (default: json)",
        },
        auth_type: {
          type: "string",
          description: "Auth shorthand: bearer, basic, api-key. Reads token from auth_token param.",
        },
        auth_token: { type: "string", description: "Auth token/key value (used with auth_type)" },
        timeout_seconds: {
          type: "number",
          description: "Request timeout in seconds (default: 30, max: 120)",
        },
        follow_redirects: { type: "boolean", description: "Follow HTTP redirects (default: true)" },
        save_to: {
          type: "string",
          description: "Save response body to this file path instead of returning inline",
        },
      },
      required: ["url"],
    },
  },
];
