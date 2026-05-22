# ─────────────────────────────────────────────────────────────────
#  HoC Kali Sandbox — Cybersecurity Penetration Testing Container
#  Base: kalilinux/kali-rolling
# ─────────────────────────────────────────────────────────────────
FROM kalilinux/kali-rolling

ENV DEBIAN_FRONTEND=noninteractive
ENV LANG=C.UTF-8

# ── System + Core Dependencies ───────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl wget git jq python3 python3-pip ca-certificates \
    dnsutils net-tools iputils-ping iproute2 procps \
    pandoc \
    && rm -rf /var/lib/apt/lists/*

# ── Phase 1: Reconnaissance Tools ───────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    nmap masscan whois \
    dnsrecon amass theharvester \
    enum4linux smbclient \
    && rm -rf /var/lib/apt/lists/*

# ── Phase 2: Web Application Testing ────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    nikto gobuster dirb \
    sqlmap wpscan whatweb wafw00f \
    sslyze testssl.sh \
    ffuf \
    && rm -rf /var/lib/apt/lists/*

# ── Phase 3: Exploitation & Password ────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    exploitdb hydra \
    john hashcat \
    metasploit-framework \
    && rm -rf /var/lib/apt/lists/*

# ── Phase 4: Network Analysis ───────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    tshark tcpdump \
    netcat-openbsd \
    arp-scan hping3 traceroute \
    && rm -rf /var/lib/apt/lists/*

# ── Phase 5: Forensics & Compliance ─────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    binwalk foremost libimage-exiftool-perl \
    steghide \
    lynis \
    && rm -rf /var/lib/apt/lists/*

# ── Phase 6: Web Scraping & Cloning ─────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    httrack \
    linkchecker \
    chromium \
    python3-scrapy \
    && rm -rf /var/lib/apt/lists/*

# ── Phase 7: Exploit DB & NVD Infrastructure ────────────────────
# ExploitDB already installed via `exploitdb`. Add nmap vulners scripts.
RUN apt-get update && apt-get install -y --no-install-recommends \
    nmap \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /opt/nse-scripts \
    && curl -fsSLo /opt/nse-scripts/vulners.nse \
       https://raw.githubusercontent.com/vulnersCom/nmap-vulners/master/vulners.nse 2>/dev/null || true \
    && cp /opt/nse-scripts/vulners.nse /usr/share/nmap/scripts/ 2>/dev/null || true \
    && nmap --script-updatedb 2>/dev/null || true

# NVD CVE sync script — downloads NIST feeds on demand
RUN mkdir -p /opt/exploit-db /opt/nvd-feeds && cat > /opt/sync-exploitdb.sh << 'SYNCEOF'
#!/bin/bash
set -e
echo "[sync] Updating ExploitDB..."
searchsploit -u 2>/dev/null || echo "[sync] searchsploit update skipped"

echo "[sync] Downloading NVD CVE data via NVD 2.0 API..."
YEARS=$(seq 2020 $(date +%Y))
for y in $YEARS; do
  OUT="/opt/nvd-feeds/nvdcve-${y}.json"
  if [ ! -f "$OUT" ] || [ $(find "$OUT" -mtime +7 -print 2>/dev/null | wc -l) -gt 0 ]; then
    echo "[sync] Fetching CVEs for ${y}..."
    curl -fsSL "https://services.nvd.nist.gov/rest/json/cves/2.0?pubStartDate=${y}-01-01T00:00:00.000&pubEndDate=${y}-12-31T23:59:59.999&resultsPerPage=2000" \
      -o "$OUT" 2>/dev/null || echo "[sync] Failed to fetch ${y} CVEs"
    # NVD rate limit: 5 requests per 30 seconds without API key
    sleep 6
  fi
done

echo "[sync] Done. $(ls /opt/nvd-feeds/*.json 2>/dev/null | wc -l) CVE feeds available."
SYNCEOF

RUN chmod +x /opt/sync-exploitdb.sh

# ── Node.js for API Server ──────────────────────────────────────
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# ── Working Directory ───────────────────────────────────────────
RUN mkdir -p /workspace /reports /evidence
WORKDIR /workspace

# ── Lightweight API Server ───────────────────────────────────────
# Minimal Express-like server for gateway communication
RUN cat > /opt/kali-api.mjs << 'APIEOF'
import http from "node:http";
import { execSync, spawn } from "node:child_process";
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const PORT = 3104;

// Track running scans
const scans = new Map();

function parseBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try { resolve(JSON.parse(body || "{}")); } catch { resolve({}); }
    });
  });
}

function exec(command, timeout = 300) {
  try {
    const stdout = execSync(command, {
      timeout: timeout * 1000,
      maxBuffer: 50 * 1024 * 1024,
      encoding: "utf-8",
      cwd: "/workspace",
    });
    return { ok: true, stdout: stdout || "", exitCode: 0 };
  } catch (e) {
    return {
      ok: false,
      stdout: e.stdout || "",
      stderr: e.stderr || e.message || "",
      exitCode: e.status || 1,
    };
  }
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  const body = await parseBody(req);

  if (req.url === "/health") {
    res.end(JSON.stringify({ ok: true, tools: getInstalledTools() }));
    return;
  }

  if (req.url === "/exec") {
    const { command, timeout = 300 } = body;
    if (!command) {
      res.statusCode = 400;
      res.end(JSON.stringify({ ok: false, error: "command required" }));
      return;
    }
    const result = exec(command, timeout);
    res.end(JSON.stringify(result));
    return;
  }

  if (req.url === "/reports") {
    try {
      if (!existsSync("/reports")) mkdirSync("/reports", { recursive: true });
      const files = readdirSync("/reports").map((f) => {
        const s = statSync(join("/reports", f));
        return { name: f, size: s.size, modified: s.mtime };
      });
      res.end(JSON.stringify({ ok: true, files }));
    } catch (e) {
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }

  if (req.url === "/report") {
    const { name } = body;
    try {
      const content = readFileSync(join("/reports", name), "utf-8");
      res.end(JSON.stringify({ ok: true, content }));
    } catch (e) {
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }

  if (req.url === "/evidence") {
    const { name, data } = body;
    try {
      if (!existsSync("/evidence")) mkdirSync("/evidence", { recursive: true });
      writeFileSync(join("/evidence", name), data);
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ ok: false, error: "not found" }));
});

function getInstalledTools() {
  const tools = [];
  const checks = [
    "nmap", "masscan", "whois", "dnsrecon", "amass", "theHarvester",
    "nikto", "gobuster", "dirb", "sqlmap", "wpscan", "whatweb", "wafw00f",
    "sslyze", "testssl.sh", "ffuf",
    "searchsploit", "hydra", "john", "hashcat", "msfconsole",
    "tshark", "tcpdump", "nc", "arp-scan", "hping3", "traceroute",
    "binwalk", "foremost", "exiftool", "steghide", "lynis",
    "httrack", "linkchecker", "scrapy", "enum4linux",
  ];
  for (const t of checks) {
    try { execSync(`which ${t} 2>/dev/null`); tools.push(t); } catch {}
  }
  return tools;
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[kali-api] Listening on port ${PORT}`);
  console.log(`[kali-api] Tools available: ${getInstalledTools().length}`);
});
APIEOF

EXPOSE 3104
CMD ["node", "/opt/kali-api.mjs"]
