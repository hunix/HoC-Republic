/**
 * Vision Engine — Types
 *
 * Interfaces for AI-powered image understanding via local and cloud vision models.
 */

// ─── Provider ────────────────────────────────────────────────────

export type VisionProvider = "gemma4" | "gemini" | "openai" | "ollama" | "local";

export interface VisionProviderConfig {
  provider: VisionProvider;
  model: string;
  endpoint: string;
  apiKey?: string;
  maxImageSizeMB: number;
  supportedFormats: string[];
}

// ─── Request / Response ──────────────────────────────────────────

export type VisionAction =
  | "describe"
  | "ocr"
  | "analyze_chart"
  | "screenshot"
  | "objects"
  | "compare"
  | "classify"
  | "extract_text"
  | "qa";

export interface VisionRequest {
  /** Base64-encoded image data or file path */
  image: string;
  /** Type of analysis to perform */
  action: VisionAction;
  /** Optional question for QA mode */
  question?: string;
  /** Second image for comparison */
  imageB?: string;
  /** Preferred provider (auto-selects if omitted) */
  provider?: VisionProvider;
  /** Max tokens for response */
  maxTokens?: number;
  /** Language for OCR/description */
  language?: string;
}

export interface VisionResponse {
  /** Provider that handled the request */
  provider: VisionProvider;
  /** Model used */
  model: string;
  /** Text description / analysis result */
  text: string;
  /** Structured data (if extractable) */
  structured?: Record<string, unknown>;
  /** Confidence score (0-1) */
  confidence: number;
  /** Processing time in ms */
  latencyMs: number;
  /** Token usage */
  tokensUsed?: number;
}

// ─── Diagnostics ─────────────────────────────────────────────────

export interface VisionDiagnostics {
  availableProviders: VisionProvider[];
  totalRequests: number;
  avgLatencyMs: number;
  successRate: number;
  providerStats: Record<string, { requests: number; avgLatencyMs: number; errors: number }>;
}
