/**
 * Design Tools — Color palettes, fonts, branding, SEO, PWA, i18n, env management
 * Handles: color_palette, font_pair, brand_save, brand_load, seo_meta,
 *          pwa_setup, i18n_setup, env_manager, claude_code, claude_review,
 *          provision_n8n_workflow, container_manage, web_app_bridge, mcp_connect
 */

import type { ToolInput, ToolHandlerMap, ToolSummaryMap, SandboxContext } from "./types.js";

export function createDesignToolsHandlers(ctx: SandboxContext): ToolHandlerMap {
  const { sandboxExec, sandboxWriteFile, sandboxReadFile } = ctx;

  return {
    color_palette: async (input: ToolInput) => {
      const seedColor = (input.seed_color as string) || "#2563eb";
      const mode = (input.mode as string) || "triadic";
      const count = Math.min((input.count as number) || 5, 12);
      const pyScript = `\nimport json, colorsys\ndef hex_to_hsl(hex_color):\n    hex_color = hex_color.lstrip('#')\n    r, g, b = int(hex_color[0:2], 16)/255, int(hex_color[2:4], 16)/255, int(hex_color[4:6], 16)/255\n    h, l, s = colorsys.rgb_to_hls(r, g, b)\n    return h * 360, s * 100, l * 100\ndef hsl_to_hex(h, s, l):\n    r, g, b = colorsys.hls_to_rgb(h / 360, l / 100, s / 100)\n    return '#{:02x}{:02x}{:02x}'.format(int(r*255), int(g*255), int(b*255))\nseed = '${seedColor}'\nmode = '${mode}'\ncount = ${count}\nh, s, l = hex_to_hsl(seed)\npalette = [{'hex': seed, 'role': 'seed'}]\nif mode == 'complementary':\n    palette.append({'hex': hsl_to_hex((h+180)%360, s, l), 'role': 'complement'})\nelif mode == 'analogous':\n    for i in range(1, count): palette.append({'hex': hsl_to_hex((h + 30*i) % 360, s, l), 'role': f'analogous-{i}'})\nelif mode == 'triadic':\n    palette.append({'hex': hsl_to_hex((h+120)%360, s, l), 'role': 'triadic-1'})\n    palette.append({'hex': hsl_to_hex((h+240)%360, s, l), 'role': 'triadic-2'})\nelif mode == 'monochromatic':\n    for i in range(1, count):\n        nl = max(10, min(90, l - 30 + (60*i/(count-1))))\n        palette.append({'hex': hsl_to_hex(h, s, nl), 'role': f'shade-{i}'})\nelse:\n    for i in range(1, count): palette.append({'hex': hsl_to_hex((h + (360/count)*i) % 360, s, l), 'role': f'color-{i}'})\ncss = '\\\\n'.join([f"  --color-{c['role']}: {c['hex']};" for c in palette])\nresult = {'mode': mode, 'seed': seed, 'palette': palette[:count], 'css': f':root {{\\\\n{css}\\\\n}}'}\nprint(json.dumps(result, indent=2))\n`;
      await sandboxWriteFile("/tmp/palette.py", pyScript);
      const result = await sandboxExec("python3 /tmp/palette.py", "/workspace", 10);
      return result.exitCode === 0 ? result.stdout.trim() : `Error: ${result.stderr.slice(0, 500)}`;
    },

    font_pair: async (input: ToolInput) => {
      const style = (input.style as string) || "modern";
      const pairings: Record<string, Array<{ heading: string; body: string; vibe: string }>> = {
        modern: [{ heading: "Inter", body: "Roboto", vibe: "Clean and professional" }, { heading: "Outfit", body: "Source Sans 3", vibe: "Fresh and approachable" }, { heading: "Plus Jakarta Sans", body: "DM Sans", vibe: "Sleek startup aesthetic" }],
        classic: [{ heading: "Playfair Display", body: "Lato", vibe: "Timeless elegance" }, { heading: "Merriweather", body: "Open Sans", vibe: "Readable and refined" }],
        bold: [{ heading: "Bebas Neue", body: "Montserrat", vibe: "High impact" }, { heading: "Oswald", body: "Raleway", vibe: "Strong and contemporary" }],
        elegant: [{ heading: "Cormorant Garamond", body: "Nunito", vibe: "Luxury brand" }, { heading: "DM Serif Display", body: "DM Sans", vibe: "Sophisticated modern" }],
        tech: [{ heading: "Space Grotesk", body: "JetBrains Mono", vibe: "Developer aesthetic" }, { heading: "Geist", body: "Geist Mono", vibe: "Next.js/Vercel style" }],
      };
      const pairs = pairings[style] || pairings.modern;
      const output = pairs.map((p, i) => `### Option ${i + 1}: ${p.vibe}\n- **Heading**: ${p.heading}\n- **Body**: ${p.body}\n- **CSS**: \`--font-heading: '${p.heading}'; --font-body: '${p.body}';\``).join("\n\n");
      return `🔤 **Font Pairings (${style})**\n\n${output}`;
    },

    brand_save: async (input: ToolInput) => {
      const company = (input.company as string) || "";
      if (!company) { return "Error: company name is required"; }
      const slug = company.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const brandData = { company, slug, savedAt: new Date().toISOString(), colors: { primary: input.primary_color || "#2563eb", secondary: input.secondary_color || "#64748b", accent: input.accent_color || "#f59e0b" }, fonts: { heading: input.font_heading || "Inter", body: input.font_body || "Open Sans" }, logo: input.logo_url || null, tagline: input.tagline || null };
      await sandboxExec("mkdir -p /workspace/.brands", "/workspace", 5);
      const ok = await sandboxWriteFile(`/workspace/.brands/${slug}.json`, JSON.stringify(brandData, null, 2));
      return ok ? `✅ Brand saved: ${company} → /workspace/.brands/${slug}.json` : `Failed to save brand for ${company}`;
    },

    brand_load: async (input: ToolInput) => {
      const company = (input.company as string) || "";
      if (!company) { return "Error: company name is required"; }
      const slug = company.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const content = await sandboxReadFile(`/workspace/.brands/${slug}.json`);
      if (!content) {
        const lsResult = await sandboxExec("ls /workspace/.brands/ 2>/dev/null || echo ''", "/workspace", 5);
        const available = lsResult.stdout.trim().replace(/\.json$/gm, "").split("\n").filter(Boolean);
        return `Brand "${company}" not found. ${available.length > 0 ? `Available: ${available.join(", ")}` : "No brands saved."}`;
      }
      return content;
    },

    seo_meta: async (input: ToolInput) => {
      const seoAction = (input.action as string) || "all";
      const siteUrl = (input.site_url as string) || "https://example.com";
      const siteTitle = (input.title as string) || "My App";
      const siteDesc = (input.description as string) || "A modern web application";
      const results: string[] = [];
      if (seoAction === "meta" || seoAction === "all") {
        const metaHtml = `<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${siteTitle}</title><meta name="description" content="${siteDesc}"/><meta property="og:title" content="${siteTitle}"/><meta property="og:description" content="${siteDesc}"/><meta property="og:url" content="${siteUrl}"/>`;
        await sandboxExec(`mkdir -p /workspace/public && cat > /workspace/public/seo-meta.html << 'SEOEOF'\n${metaHtml}\nSEOEOF`, "/workspace", 5);
        results.push(`📋 Meta tags → /workspace/public/seo-meta.html`);
      }
      if (seoAction === "sitemap" || seoAction === "all") {
        let pageList = ["/"]; try { pageList = JSON.parse(input.pages as string || '["/"]'); } catch {}
        const entries = pageList.map(p => `  <url><loc>${siteUrl}${p}</loc></url>`).join("\n");
        await sandboxExec(`cat > /workspace/public/sitemap.xml << 'SMEOF'\n<?xml version="1.0"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\nSMEOF`, "/workspace", 5);
        results.push(`🗺️ Sitemap → /workspace/public/sitemap.xml`);
      }
      if (seoAction === "robots" || seoAction === "all") {
        await sandboxExec(`cat > /workspace/public/robots.txt << 'RBEOF'\nUser-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\nRBEOF`, "/workspace", 5);
        results.push(`🤖 Robots → /workspace/public/robots.txt`);
      }
      return `🔍 SEO Setup:\n\n${results.join("\n")}`;
    },

    env_manager: async (input: ToolInput) => {
      const action = (input.action as string) || "list";
      const envFile = (input.file as string) || "/workspace/.env.local";
      const envKey = input.key as string;
      const envValue = input.value as string;
      switch (action) {
        case "set": {
          if (input.vars) {
            let vars: Record<string, string>;
            try { vars = JSON.parse(input.vars as string); } catch { return "Error: vars must be valid JSON"; }
            let content = (await sandboxReadFile(envFile)) || "";
            for (const [k, v] of Object.entries(vars)) {
              const regex = new RegExp(`^${k}=.*$`, "m");
              content = regex.test(content) ? content.replace(regex, `${k}=${v}`) : content + `\n${k}=${v}`;
            }
            await sandboxWriteFile(envFile, content.trim() + "\n");
            return `✅ Set ${Object.keys(vars).length} variables in ${envFile}`;
          }
          if (!envKey) { return "Error: key is required"; }
          let content = (await sandboxReadFile(envFile)) || "";
          const regex = new RegExp(`^${envKey}=.*$`, "m");
          content = regex.test(content) ? content.replace(regex, `${envKey}=${envValue ?? ""}`) : content + `\n${envKey}=${envValue ?? ""}`;
          await sandboxWriteFile(envFile, content.trim() + "\n");
          return `✅ Set ${envKey} in ${envFile}`;
        }
        case "get": {
          if (!envKey) { return "Error: key is required"; }
          const content = await sandboxReadFile(envFile);
          if (!content) { return `File not found: ${envFile}`; }
          const match = new RegExp(`^${envKey}=(.*)$`, "m").exec(content);
          return match ? `${envKey}=${match[1]}` : `${envKey} not found`;
        }
        case "list": {
          const content = await sandboxReadFile(envFile);
          if (!content) { return `File not found: ${envFile}`; }
          return content.split("\n").filter(l => l.trim() && !l.startsWith("#")).map(l => {
            const eq = l.indexOf("=");
            if (eq < 0) { return l; }
            const k = l.slice(0, eq), v = l.slice(eq + 1);
            return `${k}=${v.length > 8 ? v.slice(0, 4) + "****" + v.slice(-2) : "****"}`;
          }).join("\n") || "Empty";
        }
        case "template": {
          const content = await sandboxReadFile(envFile);
          if (!content) { return `File not found: ${envFile}`; }
          const template = content.split("\n").map(l => { if (!l.trim() || l.startsWith("#")) { return l; } const eq = l.indexOf("="); return eq >= 0 ? `${l.slice(0, eq)}=` : l; }).join("\n");
          const templatePath = envFile.replace(/\.env.*/, ".env.example");
          await sandboxWriteFile(templatePath, template);
          return `✅ Template: ${templatePath}`;
        }
        default:
          return `Unknown env action: ${action}. Use: set, get, list, template`;
      }
    },

    claude_code: async (input: ToolInput) => {
      const { task, cwd = "/workspace", max_turns = 30, effort = "high", model = "claude-sonnet-4-20250514" } = input;
      if (!task) { return "Error: task is required"; }
      const escapedTask = (task as string).replace(/'/g, "'\"'\"'");
      const cmd = `claude -p '${escapedTask}' --dangerously-skip-permissions --output-format json --max-turns ${Math.min(max_turns as number, 50)} --effort ${effort} --model ${model} --no-session-persistence`;
      const result = await sandboxExec(`cd ${cwd} && ${cmd}`, cwd as string, 600);
      if (result.exitCode !== 0) { return `Claude Code failed (exit ${result.exitCode}):\n${(result.stderr || result.stdout).slice(0, 2000)}`; }
      try {
        const jsonOutput = JSON.parse(result.stdout);
        const response = jsonOutput.result || jsonOutput.content || result.stdout;
        const cost = jsonOutput.cost_usd ? ` | $${jsonOutput.cost_usd.toFixed(4)}` : "";
        return `Claude Code done (${result.durationMs}ms${cost}):\n\n${typeof response === "string" ? response : JSON.stringify(response, null, 2)}`;
      } catch { return `Claude Code done (${result.durationMs}ms):\n${result.stdout.slice(0, 12000)}`; }
    },

    claude_review: async (input: ToolInput) => {
      const { path: reviewPath = "/workspace", focus = "all" } = input;
      const focusStr = (focus as string) === "all" ? "Review code for bugs, security, performance, edge cases." : `Focus on ${focus}.`;
      const reviewTask = `Review code at '${reviewPath}'. ${focusStr} Rate quality 1-10.`;
      const escapedReview = reviewTask.replace(/'/g, "'\"'\"'");
      const cmd = `claude -p '${escapedReview}' --dangerously-skip-permissions --output-format json --max-turns 10 --effort high --no-session-persistence`;
      const result = await sandboxExec(`cd /workspace && ${cmd}`, "/workspace", 300);
      if (result.exitCode !== 0) { return `Review failed:\n${(result.stderr || result.stdout).slice(0, 2000)}`; }
      try {
        const jsonOutput = JSON.parse(result.stdout);
        const response = jsonOutput.result || jsonOutput.content || result.stdout;
        const cost = jsonOutput.cost_usd ? ` | $${jsonOutput.cost_usd.toFixed(4)}` : "";
        return `📋 Code Review (${result.durationMs}ms${cost}):\n\n${typeof response === "string" ? response : JSON.stringify(response, null, 2)}`;
      } catch { return `📋 Code Review:\n${result.stdout.slice(0, 12000)}`; }
    },

    provision_n8n_workflow: async (input: ToolInput) => {
      const templateType = input.template_type as import("../citizen-n8n.js").WorkflowTemplateType;
      if (!templateType) { return "Error: template_type is required"; }
      let workflowParams: Record<string, string> = {};
      if (input.params) { try { workflowParams = JSON.parse(input.params as string); } catch { return "Error: params must be valid JSON"; } }
      try {
        const { provisionWorkflow } = await import("../citizen-n8n.js");
        const workflow = await provisionWorkflow("sandbox", "Sandbox", templateType, workflowParams);
        return `✅ n8n workflow '${workflow.name}' provisioned!\nStatus: ${workflow.status}\nWebhook: ${workflow.webhookUrl || "N/A"}`;
      } catch (err) { return `n8n error: ${err instanceof Error ? err.message : String(err)}`; }
    },
  };
}

export const designToolsSummary: ToolSummaryMap = {
  color_palette: (input) => `🎨 Palette: ${input.mode ?? "triadic"} (${input.seed_color ?? "#2563eb"})`,
  font_pair: (input) => `🔤 Fonts: ${input.style ?? "modern"}`,
  brand_save: (input) => `💾 Brand: ${input.company ?? "?"}`,
  brand_load: (input) => `📂 Brand: ${input.company ?? "?"}`,
  seo_meta: (input) => `🔍 SEO: ${input.action ?? "all"}`,
  env_manager: (input) => `⚙️ Env: ${input.action ?? "list"}`,
  claude_code: (input) => `🤖 Claude Code: "${((input.task as string) ?? "").slice(0, 40)}"`,
  claude_review: (input) => `📋 Review: ${input.path ?? "/workspace"}`,
  provision_n8n_workflow: (input) => `🔄 n8n: ${input.template_type ?? "?"}`,
};
