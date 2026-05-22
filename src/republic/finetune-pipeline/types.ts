/**
 * Fine-Tune Pipeline — Types
 *
 * Training job definitions, dataset formats, LoRA configurations.
 */

// ─── Training Job ────────────────────────────────────────────────

export type TrainingStatus =
  | "pending"
  | "preparing"
  | "training"
  | "evaluating"
  | "merging"
  | "complete"
  | "failed";
export type DatasetFormat = "sharegpt" | "alpaca" | "openai" | "custom";
export type TrainingMethod = "lora" | "qlora" | "full" | "dpo" | "ppo";

export interface TrainingJob {
  id: string;
  /** Human-readable name */
  name: string;
  /** Base model to fine-tune */
  baseModel: string;
  /** Training method */
  method: TrainingMethod;
  /** Dataset configuration */
  dataset: DatasetConfig;
  /** LoRA configuration */
  loraConfig: LoRAConfig;
  /** Training hyperparameters */
  hyperparams: HyperParams;
  /** Current status */
  status: TrainingStatus;
  /** Progress (0-100) */
  progress: number;
  /** Training metrics */
  metrics: TrainingMetrics;
  /** Output path for the merged model */
  outputPath?: string;
  /** Error message (if failed) */
  error?: string;
  /** Timestamps */
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

// ─── Dataset ─────────────────────────────────────────────────────

export interface DatasetConfig {
  /** Dataset format */
  format: DatasetFormat;
  /** Path to training data */
  trainPath: string;
  /** Path to validation data (optional) */
  validPath?: string;
  /** Number of training samples */
  numSamples?: number;
  /** Source of data (chat_logs, documents, manual) */
  source: string;
}

export interface DatasetEntry {
  /** For ShareGPT format */
  conversations?: Array<{ from: "human" | "gpt" | "system"; value: string }>;
  /** For Alpaca format */
  instruction?: string;
  input?: string;
  output?: string;
}

// ─── LoRA ────────────────────────────────────────────────────────

export interface LoRAConfig {
  /** LoRA rank (default: 16) */
  rank: number;
  /** LoRA alpha (default: 32) */
  alpha: number;
  /** Dropout (default: 0.05) */
  dropout: number;
  /** Target modules */
  targetModules: string[];
  /** Quantization bits for QLoRA (4 or 8) */
  quantBits?: 4 | 8;
}

// ─── Hyperparameters ─────────────────────────────────────────────

export interface HyperParams {
  /** Learning rate */
  learningRate: number;
  /** Number of epochs */
  epochs: number;
  /** Batch size */
  batchSize: number;
  /** Gradient accumulation steps */
  gradAccumSteps: number;
  /** Warmup ratio */
  warmupRatio: number;
  /** Max sequence length */
  maxSeqLen: number;
  /** Weight decay */
  weightDecay: number;
}

// ─── Metrics ─────────────────────────────────────────────────────

export interface TrainingMetrics {
  /** Current training loss */
  loss: number;
  /** Validation loss */
  evalLoss?: number;
  /** Current epoch */
  epoch: number;
  /** Current step */
  step: number;
  /** Total steps */
  totalSteps: number;
  /** Tokens per second */
  tokensPerSec: number;
  /** Estimated time remaining in seconds */
  etaSeconds: number;
  /** Loss history for charting */
  lossHistory: Array<{ step: number; loss: number }>;
}

// ─── Diagnostics ─────────────────────────────────────────────────

export interface FineTuneDiagnostics {
  totalJobs: number;
  activeJobs: number;
  completedJobs: number;
  failedJobs: number;
  avgTrainingTimeMinutes: number;
  modelsProduced: number;
}
