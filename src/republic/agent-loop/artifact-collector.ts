/**
 * Artifact Manifest Collection — gathers output files and snapshots from the sandbox.
 */

import { sandboxExec, sandboxReadFile } from "../agent-sandbox.js";

export async function collectArtifactManifest(previewUrl: string | null): Promise<{
  snapshotBase64: string | null;
  artifactType: string;
  artifactFiles: Array<{ name: string; size: string }>;
}> {
  let snapshotBase64: string | null = null;
  let artifactType = "unknown";
  const artifactFiles: Array<{ name: string; size: string }> = [];

  try {
    const snapData = await sandboxReadFile("/workspace/.preview-snapshot.png");
    if (snapData && snapData.length > 100) {
      const b64Result = await sandboxExec(
        "base64 -w 0 /workspace/.preview-snapshot.png 2>/dev/null || base64 /workspace/.preview-snapshot.png",
        "/workspace",
        10,
      );
      if (b64Result.exitCode === 0 && b64Result.stdout.length > 100) {
        snapshotBase64 = b64Result.stdout.trim();
      }
    }

    const lsResult = await sandboxExec(
      'find /workspace -maxdepth 2 -type f \\( -name "*.pptx" -o -name "*.pdf" -o -name "*.docx" -o -name "*.html" -o -name "*.zip" -o -name "*.tar.gz" -o -name "*.mp4" -o -name "*.png" -o -name "*.jpg" -o -name "*.svg" \\) ! -name ".*" -printf "%P\\t%s\\n" 2>/dev/null | head -20',
      "/workspace",
      5,
    );
    if (lsResult.exitCode === 0 && lsResult.stdout.trim()) {
      for (const line of lsResult.stdout.trim().split("\n")) {
        const [fname, fsize] = line.split("\t");
        if (!fname) {
          continue;
        }
        const sizeNum = parseInt(fsize ?? "0", 10);
        const sizeStr =
          sizeNum > 1_000_000
            ? `${(sizeNum / 1_000_000).toFixed(1)} MB`
            : `${Math.ceil(sizeNum / 1000)} KB`;
        artifactFiles.push({ name: fname, size: sizeStr });
      }
    }

    const exts = artifactFiles.map((f) => f.name.split(".").pop()?.toLowerCase() ?? "");
    if (exts.some((e) => ["pptx", "ppt"].includes(e))) {
      artifactType = "presentation";
    } else if (exts.some((e) => ["pdf"].includes(e))) {
      artifactType = "document";
    } else if (exts.some((e) => ["docx", "doc"].includes(e))) {
      artifactType = "document";
    } else if (exts.some((e) => ["mp4", "webm", "avi"].includes(e))) {
      artifactType = "video";
    } else if (exts.some((e) => ["png", "jpg", "jpeg", "svg", "webp"].includes(e))) {
      artifactType = "image";
    } else if (exts.some((e) => ["zip", "tar.gz", "tar"].includes(e))) {
      artifactType = "archive";
    } else if (exts.some((e) => ["html", "htm"].includes(e))) {
      artifactType = "website";
    } else if (previewUrl) {
      artifactType = "website";
    }
  } catch {
    // Non-critical
  }

  return { snapshotBase64, artifactType, artifactFiles };
}
