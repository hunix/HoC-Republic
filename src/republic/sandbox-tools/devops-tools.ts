/**
 * DevOps Tools — Archive, Docker, build analysis, diffs, logs, i18n, image processing
 * Handles: archive_files, extract_archive, docker_compose, bundle_analyze,
 *          diff_patch, monitor_logs, i18n_setup, image_process
 */

import type { ToolInput, ToolHandlerMap, ToolSummaryMap, SandboxContext } from "./types.js";

/** Cached Kali container name with 60s TTL — avoids sync execFileSync per call */
let kaliContainerCache = { name: "", ts: 0 };

export function createDevopsToolsHandlers(ctx: SandboxContext): ToolHandlerMap {
  const { sandboxExec } = ctx;

  return {
    archive_files: async (input: ToolInput) => {
      const {
        files: filesJson = '["."]',
        output_name = "archive.zip",
        format: archiveFormat = "zip",
      } = input;
      try {
        let fileList: string[];
        try {
          fileList = JSON.parse(filesJson) as string[];
        } catch {
          fileList = [filesJson];
        }

        const filePaths = fileList
          .map((f) => (f.startsWith("/") ? f : `/workspace/${f}`))
          .join(" ");
        const outputPath = output_name.startsWith("/") ? output_name : `/workspace/${output_name}`;

        let cmd: string;
        if (archiveFormat === "tar.gz") {
          cmd = `cd /workspace && tar czf "${outputPath}" ${filePaths}`;
        } else if (archiveFormat === "tar.bz2") {
          cmd = `cd /workspace && tar cjf "${outputPath}" ${filePaths}`;
        } else {
          cmd = `cd /workspace && zip -r "${outputPath}" ${filePaths}`;
        }

        const result = await sandboxExec(cmd, "/workspace", 120);
        if (result.exitCode !== 0) {
          return `Archive creation failed (exit ${result.exitCode}): ${result.stderr.slice(0, 500)}`;
        }

        const sizeResult = await sandboxExec(
          `stat -c %s "${outputPath}" 2>/dev/null || wc -c < "${outputPath}"`,
          "/workspace",
          5,
        );
        const sizeBytes = parseInt(sizeResult.stdout.trim()) || 0;
        const sizeStr =
          sizeBytes > 1_000_000
            ? `${(sizeBytes / 1_000_000).toFixed(1)} MB`
            : `${(sizeBytes / 1000).toFixed(0)} KB`;

        const downloadUrl = `/sandbox-files/${output_name}`;
        return [
          `✅ Archive created: ${output_name} (${sizeStr})`,
          `Files included: ${fileList.join(", ")}`,
          `Format: ${archiveFormat}`,
          "",
          `<file_download url="${downloadUrl}" filename="${output_name}" size="${sizeStr}" />`,
        ].join("\n");
      } catch (e) {
        return `Archive error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },

    extract_archive: async (input: ToolInput) => {
      const {
        archive_path: archivePath = "",
        output_dir: extractDir = "/workspace/extracted",
        list_only: listOnlyFlag = false,
      } = input;
      try {
        if (!archivePath) {
          return "Error: archive_path is required";
        }

        const ext = archivePath.toLowerCase();
        let listCmd: string;
        let extractCmd: string;

        if (ext.endsWith(".zip")) {
          listCmd = `unzip -l "${archivePath}"`;
          extractCmd = `mkdir -p "${extractDir}" && unzip -o "${archivePath}" -d "${extractDir}"`;
        } else if (ext.endsWith(".tar.gz") || ext.endsWith(".tgz")) {
          listCmd = `tar tzf "${archivePath}"`;
          extractCmd = `mkdir -p "${extractDir}" && tar xzf "${archivePath}" -C "${extractDir}"`;
        } else if (ext.endsWith(".tar.bz2") || ext.endsWith(".tbz2")) {
          listCmd = `tar tjf "${archivePath}"`;
          extractCmd = `mkdir -p "${extractDir}" && tar xjf "${archivePath}" -C "${extractDir}"`;
        } else if (ext.endsWith(".tar")) {
          listCmd = `tar tf "${archivePath}"`;
          extractCmd = `mkdir -p "${extractDir}" && tar xf "${archivePath}" -C "${extractDir}"`;
        } else if (ext.endsWith(".rar")) {
          await sandboxExec(
            "apt-get install -y unrar 2>/dev/null || dpkg -s unrar",
            "/workspace",
            30,
          );
          listCmd = `unrar l "${archivePath}"`;
          extractCmd = `mkdir -p "${extractDir}" && unrar x -o+ "${archivePath}" "${extractDir}/"`;
        } else if (ext.endsWith(".7z")) {
          await sandboxExec(
            "apt-get install -y p7zip-full 2>/dev/null || dpkg -s p7zip-full",
            "/workspace",
            30,
          );
          listCmd = `7z l "${archivePath}"`;
          extractCmd = `mkdir -p "${extractDir}" && 7z x -o"${extractDir}" -y "${archivePath}"`;
        } else {
          return `Unsupported archive format: ${archivePath}\nSupported: .zip, .tar.gz, .tgz, .tar.bz2, .tar, .rar, .7z`;
        }

        if (listOnlyFlag) {
          const listResult = await sandboxExec(listCmd, "/workspace", 30);
          return `Archive contents of ${archivePath}:\n${listResult.stdout.slice(0, 5000)}`;
        }

        const result = await sandboxExec(extractCmd, "/workspace", 120);
        if (result.exitCode !== 0) {
          return `Extraction failed (exit ${result.exitCode}): ${result.stderr.slice(0, 500)}`;
        }

        const lsResult = await sandboxExec(
          `find "${extractDir}" -type f | head -50`,
          "/workspace",
          10,
        );
        const fileCount = lsResult.stdout.trim().split("\n").filter(Boolean).length;

        return [
          `✅ Extracted ${fileCount} files to ${extractDir}`,
          "",
          "Files:",
          lsResult.stdout.slice(0, 3000),
        ].join("\n");
      } catch (e) {
        return `Extraction error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },

    docker_compose: async (input: ToolInput) => {
      const dcAction = (input.action as string) || "status";
      const dcServices = (input.services as string) || "";
      const composeFile = "/workspace/docker-compose.yml";

      switch (dcAction) {
        case "create": {
          const yaml = input.compose_yaml as string;
          if (!yaml) {
            return "Error: compose_yaml content is required for create action";
          }
          await sandboxExec(`cat > '${composeFile}' << 'DCEOF'\n${yaml}\nDCEOF`, "/workspace", 5);
          return `🐳 docker-compose.yml created at ${composeFile}`;
        }
        case "up": {
          const result = await sandboxExec(
            `docker compose -f '${composeFile}' up -d ${dcServices} 2>&1`,
            "/workspace",
            120,
          );
          return `🐳 Services started:\n${result.stdout.slice(0, 3000)}`;
        }
        case "down": {
          const result = await sandboxExec(
            `docker compose -f '${composeFile}' down ${dcServices} 2>&1`,
            "/workspace",
            60,
          );
          return `🐳 Services stopped:\n${result.stdout.slice(0, 2000)}`;
        }
        case "status": {
          const result = await sandboxExec(
            `docker compose -f '${composeFile}' ps 2>&1 || docker ps --format 'table {{.Names}}\\t{{.Status}}\\t{{.Ports}}' 2>&1`,
            "/workspace",
            15,
          );
          return `🐳 Service status:\n${result.stdout.slice(0, 3000)}`;
        }
        case "logs": {
          const tail = input.follow ? "--follow --tail=50" : "--tail=100";
          const timeout = input.follow ? 15 : 30;
          const result = await sandboxExec(
            `docker compose -f '${composeFile}' logs ${tail} ${dcServices} 2>&1`,
            "/workspace",
            timeout,
          );
          return `🐳 Service logs:\n${result.stdout.slice(0, 5000)}`;
        }
        default:
          return `Unknown docker_compose action: ${dcAction}. Valid: up, down, status, logs, create`;
      }
    },

    bundle_analyze: async (input: ToolInput) => {
      const buildDir = (input.build_dir as string) || "dist";
      const exists = await sandboxExec(
        `[ -d /workspace/${buildDir} ] && echo "yes" || echo "no"`,
        "/workspace",
        5,
      );
      if (exists.stdout.trim() === "no") {
        return `Build directory /workspace/${buildDir} not found. Run 'npm run build' first.`;
      }

      const totalResult = await sandboxExec(
        `du -sh /workspace/${buildDir} 2>/dev/null | cut -f1`,
        "/workspace",
        10,
      );
      const filesResult = await sandboxExec(
        `find /workspace/${buildDir} -type f -name '*.js' -o -name '*.css' -o -name '*.html' -o -name '*.map' | xargs ls -lhS 2>/dev/null | head -20 | awk '{print $5, $NF}'`,
        "/workspace",
        10,
      );
      const gzipResult = await sandboxExec(
        `for f in $(find /workspace/${buildDir} -name '*.js' -type f | head -10); do orig=$(wc -c < "$f"); gz=$(gzip -c "$f" | wc -c); echo "$(basename $f): \${orig}B -> \${gz}B gzip $(( (orig-gz)*100/orig ))% saved"; done 2>&1`,
        "/workspace",
        15,
      );
      const dupeResult = await sandboxExec(
        `[ -f /workspace/node_modules/.package-lock.json ] && node -e "const d=JSON.parse(require('fs').readFileSync('/workspace/node_modules/.package-lock.json','utf8'));const pkgs={};Object.keys(d.packages||{}).filter(k=>k.includes('node_modules')).forEach(k=>{const n=k.split('node_modules/').pop();pkgs[n]=(pkgs[n]||0)+1});Object.entries(pkgs).filter(([,v])=>v>1).sort((a,b)=>b[1]-a[1]).slice(0,10).forEach(([k,v])=>console.log(k+': '+v+' copies'))" 2>/dev/null || echo "N/A"`,
        "/workspace",
        10,
      );

      let report = `📦 Bundle Analysis: /workspace/${buildDir}\n\n`;
      report += `📐 Total Size: ${totalResult.stdout.trim()}\n\n`;
      report += `📊 Largest Files:\n${filesResult.stdout}\n`;
      report += `\n🗜️ Gzip Analysis:\n${gzipResult.stdout}\n`;
      if (dupeResult.stdout.trim() !== "N/A") {
        report += `\n⚠️ Duplicate Packages:\n${dupeResult.stdout}`;
      }
      return report;
    },

    diff_patch: async (input: ToolInput) => {
      const diffAction = (input.action as string) || "diff";
      switch (diffAction) {
        case "diff": {
          const fileA = input.file_a as string;
          const fileB = input.file_b as string;
          if (fileA && fileB) {
            const result = await sandboxExec(
              `diff -u '${fileA}' '${fileB}' 2>&1 || true`,
              "/workspace",
              10,
            );
            return result.stdout || "Files are identical";
          }
          const result = await sandboxExec(
            `cd /workspace && git diff 2>&1 || echo "Not a git repo"`,
            "/workspace",
            10,
          );
          return `📝 Current Changes:\n\n${result.stdout.slice(0, 8000)}`;
        }
        case "patch": {
          const patchContent = input.patch_content as string;
          if (!patchContent) {
            return "Error: patch_content is required";
          }
          await sandboxExec(
            `cat > /tmp/_patch.diff << 'PATCHEOF'\n${patchContent}\nPATCHEOF`,
            "/workspace",
            5,
          );
          const result = await sandboxExec(
            `cd /workspace && patch -p1 < /tmp/_patch.diff 2>&1`,
            "/workspace",
            10,
          );
          return `🩹 Patch applied:\n${result.stdout}`;
        }
        case "staged": {
          const result = await sandboxExec(
            `cd /workspace && git diff --staged 2>&1 || echo "Not a git repo"`,
            "/workspace",
            10,
          );
          return `📝 Staged Changes:\n\n${result.stdout.slice(0, 8000)}`;
        }
        default:
          return `Unknown diff action: ${diffAction}. Valid: diff, patch, staged`;
      }
    },

    monitor_logs: async (input: ToolInput) => {
      const logSource = (input.source as string) || "dev-server";
      const logDuration = (input.duration as number) || 10;
      const logFilter = input.filter as string;

      let logCmd = "";
      switch (logSource) {
        case "dev-server":
          logCmd = `(lsof -i :8080 -t 2>/dev/null | head -1 | xargs -I {} tail -f /proc/{}/fd/1 2>/dev/null & sleep ${logDuration} && kill %1 2>/dev/null) || (timeout ${logDuration} npm run dev 2>&1 | tail -100) || echo "No dev server found on port 8080"`;
          break;
        case "docker":
          logCmd = `docker compose -f /workspace/docker-compose.yml logs --tail=100 2>&1 || docker logs $(docker ps -q | head -1) --tail=100 2>&1 || echo "No Docker containers found"`;
          break;
        case "file": {
          const logFile = (input.file_path as string) || "/workspace/app.log";
          logCmd = `tail -n 200 '${logFile}' 2>&1 || echo "Log file not found: ${logFile}"`;
          break;
        }
        default:
          return `Unknown log source: ${logSource}. Valid: dev-server, docker, file`;
      }

      const result = await sandboxExec(logCmd, "/workspace", Math.min(logDuration + 5, 30));

      const lines = result.stdout.split("\n");
      const errors = lines.filter((l) =>
        /error|ERR|ENOENT|TypeError|ReferenceError|SyntaxError|FATAL/i.test(l),
      );
      const warnings = lines.filter((l) => /warn|WARN|deprecated/i.test(l));
      const filtered = logFilter
        ? lines.filter((l) => l.toLowerCase().includes(logFilter.toLowerCase()))
        : [];

      let summary = `📋 Logs (${logSource}, ${lines.length} lines):\n`;
      if (errors.length > 0) {
        summary += `\n🔴 ${errors.length} Error(s):\n${errors.slice(0, 10).join("\n")}\n`;
      }
      if (warnings.length > 0) {
        summary += `\n🟡 ${warnings.length} Warning(s):\n${warnings.slice(0, 5).join("\n")}\n`;
      }
      if (logFilter && filtered.length > 0) {
        summary += `\n🔍 Filter "${logFilter}" (${filtered.length} matches):\n${filtered.slice(0, 10).join("\n")}\n`;
      }
      if (errors.length === 0 && warnings.length === 0) {
        summary += "\n✅ No errors or warnings detected\n";
      }
      summary += `\n📝 Last 20 lines:\n${lines.slice(-20).join("\n")}`;
      return summary;
    },

    image_process: async (input: ToolInput) => {
      const imgAction = (input.action as string) || "resize";
      const imgInput = input.input_path as string;
      if (!imgInput) {
        return "Error: input_path is required";
      }
      const imgOutput =
        (input.output_path as string) || imgInput.replace(/(\.\w+)$/, `-processed$1`);
      const imgW = input.width as number;
      const imgH = input.height as number;
      const quality = (input.quality as number) || 85;
      const outFmt = input.output_format as string;

      switch (imgAction) {
        case "resize": {
          const dims = imgW && imgH ? `${imgW}x${imgH}` : imgW ? `${imgW}x` : `x${imgH || 512}`;
          const result = await sandboxExec(
            `convert '${imgInput}' -resize '${dims}' -quality ${quality} '${imgOutput}' 2>&1 && echo "OK" && identify '${imgOutput}'`,
            "/workspace",
            30,
          );
          return result.exitCode === 0
            ? `🖼️ Resized: ${imgOutput}\nDimensions: ${dims}\n${result.stdout}`
            : `Resize failed: ${result.stdout}`;
        }
        case "crop": {
          const dims = `${imgW || 512}x${imgH || 512}+0+0`;
          const result = await sandboxExec(
            `convert '${imgInput}' -gravity center -crop '${dims}' +repage '${imgOutput}' 2>&1 && echo "OK"`,
            "/workspace",
            15,
          );
          return result.exitCode === 0
            ? `✂️ Cropped: ${imgOutput} (${dims})`
            : `Crop failed: ${result.stdout}`;
        }
        case "optimize": {
          const sizeBefore = await sandboxExec(
            `stat -c %s '${imgInput}' 2>/dev/null || wc -c < '${imgInput}'`,
            "/workspace",
            5,
          );
          await sandboxExec(
            `convert '${imgInput}' -strip -quality ${quality} -sampling-factor 4:2:0 -interlace Plane '${imgOutput}' 2>&1 && echo "OK"`,
            "/workspace",
            15,
          );
          const sizeAfter = await sandboxExec(
            `stat -c %s '${imgOutput}' 2>/dev/null || wc -c < '${imgOutput}'`,
            "/workspace",
            5,
          );
          const before = parseInt(sizeBefore.stdout.trim()) || 0;
          const after = parseInt(sizeAfter.stdout.trim()) || 0;
          const saved = before > 0 ? Math.round((1 - after / before) * 100) : 0;
          return `📦 Optimized: ${imgOutput}\nBefore: ${(before / 1024).toFixed(1)}KB → After: ${(after / 1024).toFixed(1)}KB (${saved}% smaller)`;
        }
        case "convert": {
          const fmt = outFmt || "webp";
          const out = imgOutput.replace(/\.\w+$/, `.${fmt}`);
          const result = await sandboxExec(
            `convert '${imgInput}' -quality ${quality} '${out}' 2>&1 && echo "OK"`,
            "/workspace",
            15,
          );
          return result.exitCode === 0
            ? `🔄 Converted: ${out} (${fmt})`
            : `Convert failed: ${result.stdout}`;
        }
        case "favicon": {
          const sizes = [16, 32, 48, 192, 512];
          await sandboxExec(`mkdir -p /workspace/public`, "/workspace", 5);
          for (const s of sizes) {
            await sandboxExec(
              `convert '${imgInput}' -resize ${s}x${s} '/workspace/public/favicon-${s}x${s}.png' 2>&1`,
              "/workspace",
              10,
            );
          }
          await sandboxExec(
            `convert '${imgInput}' -resize 32x32 '/workspace/public/favicon.ico' 2>&1`,
            "/workspace",
            10,
          );
          return `🎯 Favicon set generated:\n${sizes.map((s) => `  /workspace/public/favicon-${s}x${s}.png`).join("\n")}\n  /workspace/public/favicon.ico`;
        }
        case "responsive": {
          const widths = [320, 640, 1024, 1920];
          const labels = ["sm", "md", "lg", "xl"];
          await sandboxExec(`mkdir -p /workspace/public/images`, "/workspace", 5);
          const base =
            imgInput
              .split("/")
              .pop()
              ?.replace(/\.\w+$/, "") || "image";
          for (let i = 0; i < widths.length; i++) {
            await sandboxExec(
              `convert '${imgInput}' -resize ${widths[i]}x -quality ${quality} '/workspace/public/images/${base}-${labels[i]}.webp' 2>&1`,
              "/workspace",
              10,
            );
          }
          return `📐 Responsive set:\n${widths.map((w, i) => `  ${labels[i]}: ${w}px → /workspace/public/images/${base}-${labels[i]}.webp`).join("\n")}`;
        }
        default:
          return `Unknown image action: ${imgAction}. Valid: resize, crop, optimize, convert, favicon, responsive`;
      }
    },
    kali_exec: async (input: ToolInput) => {
      const kaliCmd = (input.command as string) || "";
      if (!kaliCmd) {
        return "Error: command is required";
      }
      const kaliTimeout = (input.timeout as number) || 60;
      const kaliCwd = (input.cwd as string) || "/root";

      const { execFile } = await import("node:child_process");

      // ── Cached async Kali container discovery (60s TTL) ──
      // Avoids two blocking execFileSync calls per tool invocation.
      const now = Date.now();
      if (!kaliContainerCache.name || now - kaliContainerCache.ts > 60_000) {
        const discovered = await new Promise<string>((resolve) => {
          execFile(
            "docker",
            [
              "ps",
              "--filter",
              "name=hoc-kali",
              "--filter",
              "status=running",
              "--format",
              "{{.Names}}",
            ],
            { timeout: 5000 },
            (_err, stdout) => {
              resolve((stdout ?? "").trim().split("\n")[0] ?? "");
            },
          );
        });
        kaliContainerCache = { name: discovered, ts: now };
      }

      const kaliContainer = kaliContainerCache.name;

      if (!kaliContainer) {
        // Check if stopped (also async)
        const stopped = await new Promise<string>((resolve) => {
          execFile(
            "docker",
            ["ps", "-a", "--filter", "name=hoc-kali", "--format", "{{.Names}}\t{{.State}}"],
            { timeout: 5000 },
            (_err, stdout) => {
              resolve((stdout ?? "").trim());
            },
          );
        });
        if (stopped) {
          kaliContainerCache = { name: "", ts: 0 }; // invalidate so next call retries
          return `⚠️ Kali container found but not running (${stopped.split("\t")[0]}).\n\nStart it first:\n\`container_manage\` action="start" container_type="kali"\n\nThis will start the existing container.`;
        }
        return `⚠️ No Kali container found (looked for name prefix 'hoc-kali'). Start with: container_manage action="start" container_type="kali"`;
      }

      return new Promise<string>((resolve) => {
        const args = ["exec", "-w", kaliCwd, kaliContainer, "bash", "-c", kaliCmd];
        execFile("docker", args, { timeout: kaliTimeout * 1000 + 5000 }, (err, stdout, stderr) => {
          let outText = stdout ?? "";
          const exitCode = (err as unknown as { code?: number })?.code ?? (err ? 1 : 0);

          if (exitCode !== 0 && !outText) {
            outText = stderr ?? err?.message ?? "Command failed";
          }

          resolve(
            outText.trim()
              ? `\`\`\`\n${outText.slice(0, 8000)}\n\`\`\``
              : exitCode === 0
                ? "✅ Command completed (no output)"
                : `Command failed (exit ${exitCode}):\n${(stderr || err?.message || "").slice(0, 2000)}`,
          );
        });
      });
    },

    video_process: async (input: ToolInput) => {
      const vpAction = (input.action as string) || "info";
      const vpInput = (input.input_path as string) || "";
      const vpOutput = (input.output_path as string) || "";

      // Ensure ffmpeg is available
      const ffmpegCheck = await sandboxExec(
        "which ffmpeg 2>/dev/null || echo 'MISSING'",
        "/workspace",
        5,
      );
      if (ffmpegCheck.stdout.includes("MISSING")) {
        return `❌ ffmpeg not found. Install with:\n\nkali_exec: apt-get install -y ffmpeg\n\nOr in agent sandbox: sandbox_exec command="apt-get install -y ffmpeg"\n\nThen retry.`;
      }

      if (!vpInput && vpAction !== "concat") {
        return "Error: input_path is required";
      }

      switch (vpAction) {
        case "info": {
          const r = await sandboxExec(
            `ffprobe -v quiet -print_format json -show_streams -show_format '${vpInput}' 2>&1`,
            "/workspace",
            15,
          );
          try {
            const info = JSON.parse(r.stdout);
            const fmt = info.format || {};
            const streams = (info.streams || [])
              .map(
                (s: {
                  codec_type: string;
                  codec_name: string;
                  width?: number;
                  height?: number;
                  duration?: number;
                  bit_rate?: string;
                }) =>
                  `  ${s.codec_type}: ${s.codec_name}${s.width ? ` (${s.width}x${s.height})` : ""}`,
              )
              .join("\n");
            return `🎬 Video Info: ${vpInput}\n\nDuration: ${fmt.duration ? `${parseFloat(fmt.duration).toFixed(1)}s` : "N/A"}\nSize: ${fmt.size ? `${(fmt.size / 1048576).toFixed(1)}MB` : "N/A"}\nBitrate: ${fmt.bit_rate ? `${Math.round(fmt.bit_rate / 1000)}kbps` : "N/A"}\n\nStreams:\n${streams}`;
          } catch {
            return `ffprobe output:\n${r.stdout.slice(0, 2000)}`;
          }
        }
        case "trim": {
          const start = (input.start_time as string) || "0";
          const duration = (input.duration as unknown as string) || "30";
          const out = vpOutput || vpInput.replace(/\.([^.]+)$/, `_trim.$1`);
          const r = await sandboxExec(
            `ffmpeg -i '${vpInput}' -ss ${start} -t ${duration} -c copy '${out}' -y 2>&1 | tail -5`,
            "/workspace",
            120,
          );
          return r.exitCode === 0
            ? `✂️ Trimmed: ${vpInput} → ${out}\nFrom: ${start}s, Duration: ${duration}s`
            : `Trim failed:\n${r.stdout.slice(0, 500)}`;
        }
        case "compress": {
          const crf = (input.crf as number) || 28;
          const preset = (input.preset as string) || "fast";
          const out = vpOutput || vpInput.replace(/\.([^.]+)$/, `_compressed.mp4`);
          const r = await sandboxExec(
            `ffmpeg -i '${vpInput}' -vcodec libx264 -crf ${crf} -preset ${preset} -movflags +faststart '${out}' -y 2>&1 | tail -5`,
            "/workspace",
            300,
          );
          return r.exitCode === 0
            ? `💾 Compressed: ${vpInput} → ${out}\nCRF: ${crf} (lower = better quality, bigger file)`
            : `Compress failed:\n${r.stdout.slice(0, 500)}`;
        }
        case "convert": {
          const fmt = (input.format as string) || "mp4";
          const out = vpOutput || vpInput.replace(/\.([^.]+)$/, `.${fmt}`);
          const r = await sandboxExec(
            `ffmpeg -i '${vpInput}' '${out}' -y 2>&1 | tail -5`,
            "/workspace",
            300,
          );
          return r.exitCode === 0
            ? `🔄 Converted: ${vpInput} → ${out}`
            : `Convert failed:\n${r.stdout.slice(0, 500)}`;
        }
        case "extract_frames": {
          const fps = (input.fps as number) || 1;
          const outDir = vpOutput || `/workspace/frames_${Date.now()}`;
          await sandboxExec(`mkdir -p '${outDir}'`, "/workspace", 5);
          const r = await sandboxExec(
            `ffmpeg -i '${vpInput}' -vf fps=${fps} '${outDir}/frame_%04d.png' -y 2>&1 | tail -5`,
            "/workspace",
            120,
          );
          const count = await sandboxExec(`ls '${outDir}' | wc -l`, "/workspace", 5);
          return r.exitCode === 0
            ? `🎞️ Extracted ${count.stdout.trim()} frames @ ${fps}fps → ${outDir}/`
            : `Extract failed:\n${r.stdout.slice(0, 500)}`;
        }
        case "add_audio": {
          const audioPath = (input.audio_path as string) || "";
          if (!audioPath) {
            return "Error: audio_path required for add_audio action";
          }
          const out = vpOutput || vpInput.replace(/\.([^.]+)$/, `_audio.$1`);
          const r = await sandboxExec(
            `ffmpeg -i '${vpInput}' -i '${audioPath}' -c:v copy -c:a aac -map 0:v:0 -map 1:a:0 -shortest '${out}' -y 2>&1 | tail -5`,
            "/workspace",
            120,
          );
          return r.exitCode === 0
            ? `🎵 Audio added: ${vpInput} + ${audioPath} → ${out}`
            : `Add audio failed:\n${r.stdout.slice(0, 500)}`;
        }
        case "concat": {
          const files = (input.files as string) || "";
          if (!files) {
            return "Error: files (comma-separated paths) required for concat action";
          }
          const out = vpOutput || `/workspace/concat_${Date.now()}.mp4`;
          const filelist = files.split(",").map((f: string) => f.trim());
          const listContent = filelist.map((f: string) => `file '${f}'`).join("\n");
          await sandboxExec(`echo '${listContent}' > /tmp/ffmpeg_concat_list.txt`, "/workspace", 5);
          const r = await sandboxExec(
            `ffmpeg -f concat -safe 0 -i /tmp/ffmpeg_concat_list.txt -c copy '${out}' -y 2>&1 | tail -5`,
            "/workspace",
            300,
          );
          return r.exitCode === 0
            ? `📎 Concatenated ${filelist.length} files → ${out}`
            : `Concat failed:\n${r.stdout.slice(0, 500)}`;
        }
        case "thumbnail": {
          const timestamp = (input.timestamp as string) || "00:00:05";
          const out = vpOutput || vpInput.replace(/\.([^.]+)$/, `_thumb.jpg`);
          const r = await sandboxExec(
            `ffmpeg -i '${vpInput}' -ss ${timestamp} -vframes 1 '${out}' -y 2>&1 | tail -3`,
            "/workspace",
            30,
          );
          return r.exitCode === 0
            ? `🌄 Thumbnail: ${out} (at ${timestamp})`
            : `Thumbnail failed:\n${r.stdout.slice(0, 300)}`;
        }
        default:
          return `Unknown video action: ${vpAction}. Valid: info, trim, compress, convert, extract_frames, add_audio, concat, thumbnail`;
      }
    },
  };
}

export const devopsToolsSummary: ToolSummaryMap = {
  archive_files: (input) => `📦 Archive: ${input.output_name ?? "archive.zip"}`,
  extract_archive: (input) => `📂 Extract: ${input.archive_path ?? "?"}`,
  docker_compose: (input) => `🐳 Compose: ${input.action ?? "status"}`,
  bundle_analyze: (input) => `📦 Bundle: ${input.build_dir ?? "dist"}`,
  diff_patch: (input) => `📝 Diff: ${input.action ?? "diff"}`,
  monitor_logs: (input) => `📋 Logs: ${input.source ?? "dev-server"}`,
  image_process: (input) => `🖼️ Image: ${input.action ?? "resize"} ${input.input_path ?? "?"}`,
  kali_exec: (input) => `🔒 Kali: ${((input.command as string) ?? "").slice(0, 60)}`,
  video_process: (input) => `🎬 Video: ${input.action ?? "info"} ${input.input_path ?? ""}`,
};
