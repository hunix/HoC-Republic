/**
 * ClawRouter Feature — Types
 *
 * Co-located TypeScript interfaces for the ClawRouter feature module.
 * Extracted from the monolithic ClawRouter.tsx (1049 lines) to enable
 * independent testing and cleaner imports between tab components.
 */

export interface ClawStatus {
  running: boolean;
  version: string;
  proxyPort?: number;
  walletAddress?: string;
  uptime?: {
    metrics?: {
      totalRequests: number;
      successRate: number;
      avgLatencyMs: number;
      p95LatencyMs: number;
      failureCount: number;
      totalCostUSD: number;
      cacheHitRate: number;
    };
    allTime?: {
      totalRequests: number;
      totalCostUSD: number;
      totalTokensIn: number;
      totalTokensOut: number;
    };
  };
  cluster?: {
    nodeCount: number;
    healthyNodes: number;
    currentLoad: number;
  };
  subsystems?: Record<string, unknown>;
}

export interface ClawMetrics {
  window?: {
    totalRequests: number;
    successRate: number;
    avgLatencyMs: number;
    p95LatencyMs: number;
    p99LatencyMs: number;
    failureCount: number;
    totalCostUSD: number;
    cacheHitRate: number;
  };
  allTime?: {
    totalRequests: number;
    totalCostUSD: number;
    totalTokensIn: number;
    totalTokensOut: number;
  };
  providers?: Record<
    string,
    {
      requests: number;
      successes: number;
      avgLatencyMs: number;
      totalCost: number;
      circuitState: string;
    }
  >;
  topModels?: Array<{ modelId: string; requests: number; avgLatencyMs: number; totalCost: number }>;
  circuits?: Record<string, { state: string; failures: number; lastFailure: string | null }>;
}

export interface ClawModel {
  id: string;
  name: string;
  provider: string;
  reasoning: boolean;
  vision: boolean;
  agentic: boolean;
  tier: string;
  contextWindow: number;
  costPerMToken: number;
  inputPrice: number;
  outputPrice: number;
}

export interface ClawConfig {
  routingProfile: string;
  compressionEnabled: boolean;
  compressionThresholdKB: number;
  cacheTTLMs: number;
  rateLimitPerMinute: number;
  maxConcurrentRequests: number;
  costBudgetDailyUSD: number;
  fallbackEnabled: boolean;
  circuitBreakerThreshold: number;
  circuitBreakerResetMs: number;
}

export interface AprStats {
  totalRoutedRequests: number;
  fastPathCount: number;
  partitionedCount: number;
  avgChunksPerRequest: number;
  avgValidationScore: number;
  avgCostMultiplier: number;
  fallbackCount: number;
  recentDecisions: Array<{
    ts: number;
    strategy: string;
    chunkCount: number;
    costMultiplier: number;
    validationScore: number;
    usedFallback: boolean;
  }>;
}

export interface AprStatus {
  enabled: boolean;
  costEfficiency: string;
  stats: AprStats;
  inferenceMetrics: { totalRequests: number; totalCostUSD: number; avgLatencyMs: number };
}

export interface CitizenCost {
  citizenId: string;
  todayCost: number;
  totalCost: number;
}

export interface QueueStatus {
  queue: Record<string, unknown>;
  modelPool: Record<string, unknown>;
  citizenCount: number;
  topCostCitizens: CitizenCost[];
  accessTierBreakdown: Record<string, number>;
}
