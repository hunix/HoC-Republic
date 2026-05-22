/**
 * Chat Feature — File Management Hook
 *
 * Manages file attachments, session file extraction from messages,
 * artifact preview parsing, and file-related UI state.
 * Extracted from useChatState.ts per DDD file limits (400L max).
 */

import { useState, useRef, useCallback, useMemo } from "react";
import { useToast } from "@/contexts/ToastContext";
import type { Message, AttachedFile, SessionFile } from "./chat.types";

export function useChatFiles(messages: Message[]) {
  const { toast } = useToast();

  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [filesPanelOpen, setFilesPanelOpen] = useState(false);

  // ── File attachment handlers ──────────────────────────────────────────────
  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) {
        return;
      }
      Array.from(files).forEach((file) => {
        if (file.size > 5_000_000) {
          toast({
            variant: "error",
            title: "File too large",
            message: `${file.name} exceeds 5MB limit`,
          });
          return;
        }
        const reader = new FileReader();
        reader.addEventListener("load", () => {
          const base64 = (reader.result as string).split(",")[1] ?? "";
          const preview = file.type.startsWith("image/") ? (reader.result as string) : undefined;
          setAttachedFiles((prev) => [
            ...prev,
            {
              name: file.name,
              type: file.type,
              size: file.size,
              base64,
              preview,
            },
          ]);
        });
        reader.readAsDataURL(file);
      });
      e.target.value = "";
    },
    [toast],
  );

  const removeAttachment = useCallback((idx: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const clearAttachedFiles = useCallback(() => {
    setAttachedFiles([]);
  }, []);

  // ── Extract session files from messages ────────────────────────────────────
  const sessionFiles = useMemo((): SessionFile[] => {
    const files: SessionFile[] = [];
    const seen = new Set<string>();
    for (const msg of messages) {
      if (msg.role !== "assistant") {
        continue;
      }
      const patterns = [
        /<file_download\s+url="([^"]+)"\s+filename="([^"]+)"\s+(?:size="([^"]+)")?\s*\/?>(?:[^<]*<\/file_download>)?/g,
        /File written:\s*(\S+)\s*(?:\(([^)]+)\))?/g,
        /saved (?:to|as):\s*(\S+)\s*(?:\(([^)]+)\))?/gi,
        /sandbox_write_file\s*→?\s*(\S+)\s*(?:\(([^)]+)\))?/g,
        /(?:Created|Generated|Downloaded|Output|Saved|Wrote|Produced)\s+file:?\s*(\S+\.\w{2,5})\s*(?:\(([^)]+)\))?/gi,
        /📁\s*(\S+\.\w{2,5})\s*(?:\(([^)]+)\))?/g,
        /→\s*(\/workspace\/\S+)/g,
        /(?:https?:\/\/127\.0\.0\.1:8080\/)(\\S+\.\w{2,5})/g,
        /(?:https?:\/\/localhost:8080\/)(\\S+\.\w{2,5})/g,
        /(?:\/sandbox\/)(\\S+\.\w{2,5})/g,
        /✅\s*(?:Presentation|Document|Archive)\s+created:\s*(\S+)/gi,
        /Presentation saved:\s*(\S+\.\w{2,5})/gi,
      ];
      for (const pattern of patterns) {
        let match;
        const isFileDownloadTag = pattern.source.includes("file_download");
        while ((match = pattern.exec(msg.content ?? "")) !== null) {
          let filePath: string;
          let fileName: string;
          let fileSize: string | undefined;

          if (isFileDownloadTag) {
            const url = match[1] ?? "";
            fileName = match[2] ?? url.split("/").pop() ?? "";
            fileSize = match[3];
            filePath = url;
          } else {
            filePath = match[1] ?? "";
            fileSize = match[2];
            fileName = filePath.split("/").pop() ?? filePath;
          }

          if (!fileName || fileName.length < 3) {
            continue;
          }
          if (seen.has(fileName)) {
            continue;
          }
          seen.add(fileName);
          const downloadUrl =
            filePath.startsWith("/republic-output/") ||
            filePath.startsWith("/research/") ||
            filePath.startsWith("/games/") ||
            filePath.startsWith("/sandbox-files/")
              ? filePath
              : filePath.startsWith("http")
                ? filePath.replace(/https?:\/\/(127\.0\.0\.1|localhost):8080\//, "/sandbox-files/")
                : `/sandbox-files/${fileName}`;
          files.push({
            name: fileName,
            path: filePath,
            size: fileSize,
            timestamp: msg.ts,
            downloadUrl,
          });
        }
      }
    }
    return files;
  }, [messages]);

  // ── Extract artifact preview data from messages ────────────────────────────
  const artifactPreview = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role !== "assistant") {
        continue;
      }

      const artifactMatch = /\[SANDBOX_ARTIFACT:([^\]]+)\]/.exec(msg.content ?? "");
      if (!artifactMatch || !artifactMatch[1]) {
        continue;
      }

      const raw = artifactMatch[1];
      const parts = raw.split("|");
      let type = "unknown";
      let filesStr = "";
      let snapshotUrl: string | null = null;

      for (const part of parts) {
        if (part.startsWith("type=")) {
          type = part.slice(5);
        } else if (part.startsWith("files=")) {
          filesStr = part.slice(6);
        } else if (part.startsWith("snapshot=")) {
          snapshotUrl = part.slice(9);
        }
      }

      const filesList = filesStr
        ? filesStr
            .split(",")
            .map((f) => {
              const m = /^(.+?)\(([^)]+)\)$/.exec(f.trim());
              return m ? { name: m[1], size: m[2] } : { name: f.trim(), size: "" };
            })
            .filter((f) => f.name)
        : [];

      const previewMatch = /\[SANDBOX_PREVIEW:([^\]|]+)/.exec(msg.content ?? "");
      const liveUrl = previewMatch ? (previewMatch[1] ?? null) : null;

      return { type, files: filesList, snapshotUrl, liveUrl };
    }
    return null;
  }, [messages]);

  return {
    attachedFiles,
    setAttachedFiles,
    fileInputRef,
    filesPanelOpen,
    setFilesPanelOpen,
    handleFileSelect,
    removeAttachment,
    clearAttachedFiles,
    sessionFiles,
    artifactPreview,
  };
}
