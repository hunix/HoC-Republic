/**
 * Kali Web Scraping & Exploit DB Tools
 *
 * Phase 6: Web Scraping & Cloning (4 tools)
 *   - websiteClone (httrack), webCrawl (scrapy), frontendAudit, jsAnalysis
 *
 * Phase 7: Exploit DB & CVE Dictionary (3 tools)
 *   - syncExploitDb, cveEnrich, exploitDictSearch
 */

import type { PhaseResult, Finding } from "./kali-types.js";
import { kaliExec } from "./kali-types.js";

// ─── Phase 6: Web Scraping & Cloning ────────────────────────────

export async function websiteClone(target: string, depth = 3): Promise<PhaseResult> {
  const start = Date.now();
  const url = target.startsWith("http") ? target : `https://${target}`;
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const safeName = target.replace(/[^a-zA-Z0-9.-]/g, "_");
  const outDir = `/evidence/web-clones/${safeName}_${ts}`;

  const cmd = [
    `mkdir -p "${outDir}"`,
    `httrack "${url}" -O "${outDir}" -r${depth}`,
    `--max-rate=500000`,
    `--connection-per-second=2`,
    `--sockets=4`,
    `-s0`,
    `--timeout=30`,
    `--retries=2`,
    `-%e0`,
    `+*.css +*.js +*.html +*.htm +*.png +*.jpg +*.gif +*.svg +*.woff +*.woff2 +*.ttf +*.eot +*.ico +*.json +*.xml`,
    `2>&1 | tail -40`,
  ].join(" ");

  const result = await kaliExec(cmd, 600);

  // Count cloned files
  const countResult = await kaliExec(`find "${outDir}" -type f | wc -l`, 10);
  const fileCount = parseInt(countResult.stdout.trim()) || 0;

  // Get total size
  const sizeResult = await kaliExec(`du -sh "${outDir}" 2>/dev/null | cut -f1`, 10);
  const totalSize = sizeResult.stdout.trim() || "unknown";

  return {
    phase: "web-scraping",
    tool: "httrack",
    command: cmd,
    output: result.stdout,
    exitCode: result.exitCode,
    duration: Date.now() - start,
    findings: [
      {
        severity: "info",
        title: `Website Cloned: ${target}`,
        description: `Full offline mirror created — ${fileCount} files (${totalSize}) at depth ${depth}`,
        evidence: `Clone stored at ${outDir} — ${fileCount} files, ${totalSize}`,
        remediation:
          "Review cloned content for sensitive data exposure, unprotected admin panels, and information leaks.",
        tool: "httrack",
        phase: "web-scraping",
      },
    ],
  };
}

export async function webCrawl(target: string): Promise<PhaseResult> {
  const start = Date.now();
  const url = target.startsWith("http") ? target : `https://${target}`;
  const ts = Date.now();
  const outFile = `/evidence/crawl_${target.replace(/[^a-zA-Z0-9]/g, "_")}_${ts}.json`;

  // Use scrapy's command-line API for structured crawling
  const cmd = [
    `python3 -c "`,
    `import scrapy, json, sys`,
    `from scrapy.crawler import CrawlerProcess`,
    `results = []`,
    `class AuditSpider(scrapy.Spider):`,
    `    name = 'audit'`,
    `    start_urls = ['${url}']`,
    `    custom_settings = {'DEPTH_LIMIT': 3, 'DOWNLOAD_DELAY': 0.5, 'CLOSESPIDER_PAGECOUNT': 100, 'LOG_LEVEL': 'ERROR'}`,
    `    def parse(self, response):`,
    `        page = {`,
    `            'url': response.url,`,
    `            'status': response.status,`,
    `            'title': response.css('title::text').get(''),`,
    `            'meta_desc': response.css('meta[name=description]::attr(content)').get(''),`,
    `            'h1_count': len(response.css('h1')),`,
    `            'forms': len(response.css('form')),`,
    `            'scripts': len(response.css('script[src]')),`,
    `            'inline_scripts': len(response.css('script:not([src])')),`,
    `            'links': len(response.css('a[href]')),`,
    `            'images_no_alt': len(response.css('img:not([alt]), img[alt=\\\\"\\\\"]')),`,
    `            'external_scripts': [s.attrib.get('src','') for s in response.css('script[src]') if '://' in s.attrib.get('src','')],`,
    `        }`,
    `        results.append(page)`,
    `        for href in response.css('a::attr(href)').getall():`,
    `            yield response.follow(href, self.parse)`,
    `process = CrawlerProcess()`,
    `process.crawl(AuditSpider)`,
    `process.start()`,
    `with open('${outFile}', 'w') as f: json.dump(results, f, indent=2)`,
    `print(json.dumps({'pages': len(results), 'file': '${outFile}'}))",`,
    `2>&1 | tail -20`,
  ].join("\n");

  const result = await kaliExec(cmd, 300);

  // Read results summary
  const readResult = await kaliExec(
    `cat ${outFile} 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'{len(d)} pages crawled')" 2>/dev/null || echo "0 pages crawled"`,
    10,
  );

  return {
    phase: "web-scraping",
    tool: "scrapy",
    command: "scrapy structured crawl",
    output: result.stdout,
    exitCode: result.exitCode,
    duration: Date.now() - start,
    findings: [
      {
        severity: "info",
        title: `Web Crawl: ${target}`,
        description: `Structured crawl completed — ${readResult.stdout.trim()}. Extracted URLs, forms, scripts, meta tags.`,
        evidence: `Results stored at ${outFile}`,
        remediation:
          "Review crawl data for exposed forms, inline scripts, and missing security headers.",
        tool: "scrapy",
        phase: "web-scraping",
      },
    ],
  };
}

export async function frontendAudit(target: string): Promise<PhaseResult> {
  const start = Date.now();
  const url = target.startsWith("http") ? target : `https://${target}`;

  // Multi-step frontend analysis
  const checks: string[] = [];

  // 1. HTTP Security Headers
  const headersCmd = `curl -sI "${url}" 2>/dev/null`;
  const headers = await kaliExec(headersCmd, 30);
  const headerFindings: Finding[] = [];

  const requiredHeaders: Record<string, { severity: Finding["severity"]; remediation: string }> = {
    "content-security-policy": {
      severity: "high",
      remediation: "Add Content-Security-Policy header to prevent XSS and data injection attacks.",
    },
    "strict-transport-security": {
      severity: "high",
      remediation: "Add Strict-Transport-Security (HSTS) header to enforce HTTPS.",
    },
    "x-frame-options": {
      severity: "medium",
      remediation: "Add X-Frame-Options: DENY or SAMEORIGIN to prevent clickjacking.",
    },
    "x-content-type-options": {
      severity: "medium",
      remediation: "Add X-Content-Type-Options: nosniff to prevent MIME-type sniffing.",
    },
    "referrer-policy": {
      severity: "low",
      remediation: "Add Referrer-Policy header to control referrer information leakage.",
    },
    "permissions-policy": {
      severity: "low",
      remediation: "Add Permissions-Policy to restrict browser feature access.",
    },
  };

  const headerLower = headers.stdout.toLowerCase();
  for (const [header, info] of Object.entries(requiredHeaders)) {
    if (!headerLower.includes(header)) {
      headerFindings.push({
        severity: info.severity,
        title: `Missing Security Header: ${header}`,
        description: `The response from ${target} does not include the ${header} header`,
        evidence: `Header check: ${header} NOT FOUND`,
        remediation: info.remediation,
        tool: "curl",
        phase: "web-scraping",
      });
    }
  }

  // 2. Mixed content check
  if (url.startsWith("https")) {
    const mixedCmd = `curl -sL "${url}" 2>/dev/null | grep -ioP 'src=["\\'"]http://[^"\\'"]+["\\'"]' | head -20`;
    const mixed = await kaliExec(mixedCmd, 30);
    if (mixed.stdout.trim()) {
      headerFindings.push({
        severity: "medium",
        title: "Mixed Content Detected",
        description: `HTTPS page loads resources over HTTP, degrading security`,
        evidence: mixed.stdout.slice(0, 500),
        remediation:
          "Update all resource URLs to use HTTPS. Use CSP upgrade-insecure-requests directive.",
        tool: "curl+grep",
        phase: "web-scraping",
      });
    }
  }

  // 3. Link checker — broken links & outdated references
  const linkCmd = `linkchecker --no-robots --recursion-level=2 --check-extern --timeout=10 --output=text "${url}" 2>&1 | grep -E "^(URL|Result|Real URL|Warning)" | head -60`;
  const links = await kaliExec(linkCmd, 120);
  const brokenCount = (links.stdout.match(/Error/gi) || []).length;
  if (brokenCount > 0) {
    headerFindings.push({
      severity: "low",
      title: `${brokenCount} Broken Links Found`,
      description: `${brokenCount} broken or dead links detected on ${target}`,
      evidence: links.stdout.slice(0, 1000),
      remediation:
        "Fix or remove broken links. Broken links reduce SEO rankings and indicate unmaintained content.",
      tool: "linkchecker",
      phase: "web-scraping",
    });
  }

  // 4. Exposed sensitive files check
  const sensitiveFiles = [
    ".env",
    ".git/config",
    "wp-config.php",
    "config.php",
    ".htaccess",
    "web.config",
    "phpinfo.php",
    "server-status",
    ".svn/entries",
    "crossdomain.xml",
    "robots.txt",
    "sitemap.xml",
    ".well-known/security.txt",
    "package.json",
    "composer.json",
  ];
  const sensitiveChecks = sensitiveFiles.map(
    (f) => `curl -sI "${url}/${f}" -o /dev/null -w "${f}:%{http_code}" 2>/dev/null`,
  );
  const sensResult = await kaliExec(sensitiveChecks.join(" && echo '|' && "), 60);
  const exposed = sensResult.stdout
    .split("|")
    .map((s) => s.trim())
    .filter((s) => {
      const parts = s.split(":");
      const code = parts.pop();
      return code === "200" || code === "301";
    });

  for (const exp of exposed) {
    const file = exp.split(":").slice(0, -1).join(":");
    const isCritical = [".env", ".git/config", "wp-config.php"].some((f) => file.includes(f));
    headerFindings.push({
      severity: isCritical ? "critical" : "medium",
      title: `Exposed File: ${file}`,
      description: `Sensitive file ${file} is accessible on ${target}`,
      evidence: `${url}/${file} returned 200/301`,
      remediation: `Block access to ${file} via web server configuration. Move sensitive files outside the web root.`,
      cvss: isCritical ? 9.0 : 5.0,
      tool: "curl",
      phase: "web-scraping",
    });
  }

  checks.push(`Headers: ${headerFindings.length} issues`);
  checks.push(`Broken links: ${brokenCount}`);
  checks.push(`Sensitive files checked: ${sensitiveFiles.length}`);

  return {
    phase: "web-scraping",
    tool: "frontend-audit",
    command: "multi-check (headers + mixed content + links + sensitive files)",
    output: checks.join("\n") + "\n\n" + headers.stdout.slice(0, 500),
    exitCode: 0,
    duration: Date.now() - start,
    findings: headerFindings,
  };
}

export async function jsAnalysis(target: string): Promise<PhaseResult> {
  const start = Date.now();
  const url = target.startsWith("http") ? target : `https://${target}`;

  // Extract and analyze JavaScript
  const cmd = [
    // Grab all JS URLs from the page
    `JS_URLS=$(curl -sL "${url}" 2>/dev/null | grep -oP 'src="[^"]*\\.js[^"]*"' | sed 's/src="//;s/"$//' | head -20)`,
    // Download and scan each for secrets
    `echo "=== JS Analysis for ${target} ==="`,
    `SECRET_COUNT=0`,
    `for js in $JS_URLS; do`,
    `  FULL_URL=$js`,
    `  [[ "$js" != http* ]] && FULL_URL="${url}/$js"`,
    `  CONTENT=$(curl -sL "$FULL_URL" 2>/dev/null)`,
    `  echo "--- $js ($(echo "$CONTENT" | wc -c) bytes) ---"`,
    // Check for exposed secrets/API keys
    `  SECRETS=$(echo "$CONTENT" | grep -ioP "(api[_-]?key|secret|token|password|auth|bearer)['\\"\\s]*[:=]['\\"\\s]*[a-zA-Z0-9_\\-]{8,}" | head -5)`,
    `  if [ -n "$SECRETS" ]; then`,
    `    echo "⚠️  SECRETS FOUND:"`,
    `    echo "$SECRETS"`,
    `    SECRET_COUNT=$((SECRET_COUNT + 1))`,
    `  fi`,
    // Check for localStorage/sessionStorage usage
    `  STORAGE=$(echo "$CONTENT" | grep -ioP "(localStorage|sessionStorage)\\.(setItem|getItem)\\(['\\"](.*?)['"]" | head -5)`,
    `  [ -n "$STORAGE" ] && echo "📦 Storage usage: $STORAGE"`,
    // Check for eval() usage
    `  EVALS=$(echo "$CONTENT" | grep -c "eval(" 2>/dev/null || echo "0")`,
    `  [ "$EVALS" -gt 0 ] && echo "⚠️  eval() calls: $EVALS"`,
    `done`,
    `echo "SECRET_TOTAL=$SECRET_COUNT"`,
  ].join("\n");

  const result = await kaliExec(cmd, 120);

  const findings: Finding[] = [];
  if (result.stdout.includes("SECRETS FOUND")) {
    findings.push({
      severity: "critical",
      title: "Hardcoded Secrets in JavaScript",
      description: `API keys, tokens, or passwords found in client-side JavaScript on ${target}`,
      evidence:
        result.stdout.match(/⚠️\s+SECRETS FOUND:[\s\S]*?(?=---|$)/)?.[0]?.slice(0, 500) || "",
      remediation:
        "Remove all secrets from client-side code. Use environment variables and server-side proxies for API calls.",
      cvss: 9.0,
      cve: "CWE-798",
      tool: "js-analysis",
      phase: "web-scraping",
    });
  }

  if (result.stdout.includes("eval(")) {
    findings.push({
      severity: "high",
      title: "Dangerous eval() Usage in JavaScript",
      description: `eval() calls detected in JavaScript bundles — potential XSS vector`,
      evidence: result.stdout.match(/eval\(\) calls: \d+/)?.[0] || "",
      remediation:
        "Replace eval() with safer alternatives (JSON.parse, Function constructor). eval() enables code injection.",
      cvss: 7.5,
      cve: "CWE-95",
      tool: "js-analysis",
      phase: "web-scraping",
    });
  }

  if (findings.length === 0) {
    findings.push({
      severity: "info",
      title: "JavaScript Analysis Complete",
      description: `No critical issues found in client-side JavaScript on ${target}`,
      evidence: result.stdout.slice(0, 500),
      remediation:
        "Continue regular JS audits. Consider using Subresource Integrity (SRI) for external scripts.",
      tool: "js-analysis",
      phase: "web-scraping",
    });
  }

  return {
    phase: "web-scraping",
    tool: "js-analysis",
    command: "curl+grep JS secret scanner",
    output: result.stdout,
    exitCode: result.exitCode,
    duration: Date.now() - start,
    findings,
  };
}

// ─── Phase 7: Exploit DB & CVE Dictionary ───────────────────────

export async function syncExploitDb(): Promise<PhaseResult> {
  const start = Date.now();
  const cmd = `/opt/sync-exploitdb.sh 2>&1`;
  const result = await kaliExec(cmd, 600);
  return {
    phase: "exploit-db",
    tool: "sync",
    command: cmd,
    output: result.stdout,
    exitCode: result.exitCode,
    duration: Date.now() - start,
    findings: [
      {
        severity: "info",
        title: "Exploit Database Synchronized",
        description: `Local ExploitDB and NVD CVE feeds updated`,
        evidence: result.stdout.slice(-500),
        remediation: "Run sync weekly to keep vulnerability data current.",
        tool: "sync-exploitdb",
        phase: "exploit-db",
      },
    ],
  };
}

export async function cveEnrich(findings: Finding[]): Promise<Finding[]> {
  // Enrich findings with CVE data from local NVD feeds
  const enriched: Finding[] = [];
  for (const f of findings) {
    if (f.cve && f.cve.startsWith("CVE-")) {
      // Search local NVD feeds for CVE details
      const searchCmd = `grep -r "${f.cve}" /opt/nvd-feeds/*.json 2>/dev/null | head -1 | python3 -c "
import sys, json
try:
  line = sys.stdin.readline().strip()
  if ':' in line:
    data = json.loads(line.split(':', 1)[1] if '.json:' in line else line)
    desc = data.get('cve', {}).get('description', {}).get('description_data', [{}])[0].get('value', '')
    cvss = data.get('impact', {}).get('baseMetricV3', {}).get('cvssV3', {}).get('baseScore', 0)
    print(json.dumps({'description': desc[:200], 'cvss': cvss}))
  else:
    print('{}')
except:
  print('{}')
" 2>/dev/null || echo '{}'`;
      const result = await kaliExec(searchCmd, 10);
      try {
        const cveMeta = JSON.parse(result.stdout.trim() || "{}");
        if (cveMeta.cvss) {
          f.cvss = cveMeta.cvss;
        }
        if (cveMeta.description) {
          f.description = `${f.description}\n\nNVD: ${cveMeta.description}`;
        }
      } catch {
        /* parse failure — keep original */
      }
    }
    enriched.push(f);
  }
  return enriched;
}

export async function exploitDictSearch(query: string, maxResults = 20): Promise<PhaseResult> {
  const start = Date.now();

  // Search ExploitDB
  const exploitCmd = `searchsploit "${query}" --json 2>/dev/null | head -10000`;
  const exploitResult = await kaliExec(exploitCmd, 30);

  // Search local NVD feeds
  const nvdCmd = `grep -ril "${query}" /opt/nvd-feeds/*.json 2>/dev/null | head -5 | while read f; do
    python3 -c "
import json, sys
with open('$f') as fh:
  data = json.load(fh)
  items = data.get('CVE_Items', [])
  matches = [i for i in items if '${query}'.lower() in json.dumps(i).lower()][:5]
  for m in matches:
    cve_id = m.get('cve', {}).get('CVE_data_meta', {}).get('ID', '?')
    desc = m.get('cve', {}).get('description', {}).get('description_data', [{}])[0].get('value', '')[:100]
    cvss = m.get('impact', {}).get('baseMetricV3', {}).get('cvssV3', {}).get('baseScore', 0)
    print(f'{cve_id} | CVSS:{cvss} | {desc}')
" 2>/dev/null
  done | head -${maxResults}`;
  const nvdResult = await kaliExec(nvdCmd, 60);

  const findings: Finding[] = [];

  // Parse ExploitDB results
  try {
    const data = JSON.parse(exploitResult.stdout);
    const exploits = (data.RESULTS_EXPLOIT || []).slice(0, maxResults);
    for (const exp of exploits) {
      findings.push({
        severity: "high",
        title: `ExploitDB: ${exp.Title || "Unknown"}`,
        description: `EDB-ID: ${exp["EDB-ID"] || "?"} — ${exp.Title || "?"}`,
        evidence: `Path: ${exp.Path || "?"} | Platform: ${exp.Platform || "?"}`,
        remediation:
          "Check if target is running the affected version. Patch immediately if vulnerable.",
        tool: "searchsploit",
        phase: "exploit-db",
      });
    }
  } catch {
    // Non-JSON output
    const lines = exploitResult.stdout.split("\n").filter((l) => l.includes("|"));
    for (const line of lines.slice(0, maxResults)) {
      findings.push({
        severity: "medium",
        title: `ExploitDB: ${line.trim().slice(0, 80)}`,
        description: `ExploitDB match for "${query}"`,
        evidence: line,
        remediation: "Verify version and apply patches.",
        tool: "searchsploit",
        phase: "exploit-db",
      });
    }
  }

  // Parse NVD results
  const nvdLines = nvdResult.stdout.split("\n").filter(Boolean);
  for (const line of nvdLines.slice(0, maxResults)) {
    const parts = line.split("|").map((s) => s.trim());
    findings.push({
      severity: "high",
      title: `NVD: ${parts[0] || "?"}`,
      description: parts[2] || `NVD CVE match for "${query}"`,
      evidence: line,
      cve: parts[0],
      cvss: parseFloat(parts[1]?.replace("CVSS:", "")) || undefined,
      remediation: `Check vendor advisory for ${parts[0]}. Apply patches or mitigations.`,
      tool: "nvd-search",
      phase: "exploit-db",
    });
  }

  return {
    phase: "exploit-db",
    tool: "exploit-dict-search",
    command: `searchsploit + nvd-search for "${query}"`,
    output: `ExploitDB: ${findings.filter((f) => f.tool === "searchsploit").length} results\nNVD: ${findings.filter((f) => f.tool === "nvd-search").length} results`,
    exitCode: 0,
    duration: Date.now() - start,
    findings,
  };
}
