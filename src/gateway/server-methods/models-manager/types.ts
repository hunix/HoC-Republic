/**
 * Model Manager — Types & Interfaces
 */

export type ModelCategory =
  | "gguf"
  | "bitnet"
  | "plugin"
  | "embedding"
  | "ollama"
  | "diffusion"
  | "tts"
  | "audio"
  | "3d"
  | "face"
  | "video";

export type DownloadType = "single-file" | "hf-repo" | "git-clone";

export interface ModelFile {
  name: string;
  subDir?: string;
  sizeEstimate?: string;
}

export interface ManagedModel {
  id: string;
  name: string;
  category: ModelCategory;
  repo: string;
  filename: string;
  /** Full local path (undefined = not downloaded) */
  localPath?: string;
  /** Disk size in bytes (undefined = not present) */
  sizeBytes?: number;
  status: "available" | "downloading" | "downloaded" | "error" | "paused";
  /** 0–100 while downloading */
  downloadProgress?: number;
  /** MB/s while downloading */
  downloadSpeed?: number;
  description: string;
  /** Required RAM in GB */
  ramGB: number;
  /** Disk size estimate in GB */
  diskGB: number;
  quantization?: string;
  capabilities: string[];
  license: string;
  isCore: boolean;
  ollamaTag?: string;
  /** For multi-file HF repos (Bark, Chatterbox, etc.) */
  files?: ModelFile[];
  /** How this model should be downloaded */
  downloadType?: DownloadType;
  /** true = uses ~/.cache/huggingface/hub/ layout */
  hfCacheLayout?: boolean;
  /** Which plugin requires this model */
  pluginId?: string;
  /** Required VRAM in GB (0 = CPU-only) */
  vramGB?: number;
  /** Runtime prerequisites description */
  prerequisites?: string[];
}
