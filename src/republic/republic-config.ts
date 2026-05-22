/**
 * Republic Platform — Configuration Manager
 *
 * Central configuration store for all Republic settings.
 * Credentials, thresholds, wallet modes, and marketplace
 * visibility are all editable from the settings UI or chat.
 *
 * Secrets are stored in-memory only. Persistence to disk
 * should encrypt at rest via the republic-store layer.
 */

import type { RepublicConfig, RepublicState } from "./types.js";
import { ts } from "./utils.js";

// ─── Default Configuration ──────────────────────────────────────

const DEFAULT_CONFIG: RepublicConfig = {
  crypto: {
    ethereum: { rpcUrl: "https://mainnet.infura.io/v3/YOUR_KEY" },
    bitcoin: { network: "mainnet" },
  },
  approval: {
    autoApproveBelow: 50,
    councilApproveAbove: 50,
    requireHumanQueue: false,
  },
  walletMode: "hot",
  marketplace: {
    publicEnabled: true,
    internalEnabled: true,
  },
  email: {
    domain: "zenithr.app",
    provider: "resend",
  },
  trading: {
    enabled: false,
    mode: "paper",
  },
};

// ─── State ──────────────────────────────────────────────────────

let currentConfig: RepublicConfig = structuredClone(DEFAULT_CONFIG);

// ─── Getters ────────────────────────────────────────────────────

export function getConfig(): Readonly<RepublicConfig> {
  return currentConfig;
}

export function getConfigFromState(s: RepublicState): Readonly<RepublicConfig> {
  return s.republicConfig ?? currentConfig;
}

export function isPayPalConfigured(): boolean {
  return !!(currentConfig.paypal?.clientId && currentConfig.paypal?.secret);
}

export function isEthereumConfigured(): boolean {
  return !!(
    currentConfig.crypto.ethereum &&
    (currentConfig.crypto.ethereum.privateKey || currentConfig.crypto.ethereum.hdSeed)
  );
}

export function isBitcoinConfigured(): boolean {
  return !!(
    currentConfig.crypto.bitcoin &&
    (currentConfig.crypto.bitcoin.privateKey || currentConfig.crypto.bitcoin.hdSeed)
  );
}

export function getApprovalThreshold(): {
  autoBelow: number;
  councilAbove: number;
  humanQueue: boolean;
} {
  return {
    autoBelow: currentConfig.approval.autoApproveBelow,
    councilAbove: currentConfig.approval.councilApproveAbove,
    humanQueue: currentConfig.approval.requireHumanQueue,
  };
}

/**
 * Evaluate whether a transaction amount requires council approval.
 * Supports custom formulas or the default threshold logic.
 */
export function requiresApproval(amountUSD: number): "auto" | "council" | "human_queue" {
  if (currentConfig.approval.requireHumanQueue) {
    return "human_queue";
  }

  // Custom formula support (e.g., "amount > 100 && amount < 500 ? 'council' : 'auto'")
  if (currentConfig.approval.customFormula) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const fn = new Function("amount", `return (${currentConfig.approval.customFormula})`);
      const result = fn(amountUSD);
      if (result === "council" || result === "human_queue" || result === "auto") {
        return result as "auto" | "council" | "human_queue";
      }
    } catch {
      // Fall through to default logic on formula errors
    }
  }

  if (amountUSD >= currentConfig.approval.councilApproveAbove) {
    return "council";
  }
  return "auto";
}

// ─── Setters ────────────────────────────────────────────────────

export function updateConfig(patch: Partial<RepublicConfig>): RepublicConfig {
  currentConfig = { ...currentConfig, ...patch };
  return currentConfig;
}

export function setPayPalCredentials(clientId: string, secret: string, sandbox = true): void {
  currentConfig.paypal = { clientId, secret, sandbox };
}

export function clearPayPalCredentials(): void {
  currentConfig.paypal = undefined;
}

export function setEthereumConfig(config: {
  privateKey?: string;
  hdSeed?: string;
  rpcUrl?: string;
}): void {
  currentConfig.crypto.ethereum = {
    ...currentConfig.crypto.ethereum,
    rpcUrl:
      config.rpcUrl ??
      currentConfig.crypto.ethereum?.rpcUrl ??
      "https://mainnet.infura.io/v3/YOUR_KEY",
    privateKey: config.privateKey ?? currentConfig.crypto.ethereum?.privateKey,
    hdSeed: config.hdSeed ?? currentConfig.crypto.ethereum?.hdSeed,
  };
}

export function setBitcoinConfig(config: {
  privateKey?: string;
  hdSeed?: string;
  network?: "mainnet" | "testnet";
}): void {
  currentConfig.crypto.bitcoin = {
    ...currentConfig.crypto.bitcoin,
    network: config.network ?? currentConfig.crypto.bitcoin?.network ?? "mainnet",
    privateKey: config.privateKey ?? currentConfig.crypto.bitcoin?.privateKey,
    hdSeed: config.hdSeed ?? currentConfig.crypto.bitcoin?.hdSeed,
  };
}

export function setApprovalThresholds(config: {
  autoApproveBelow?: number;
  councilApproveAbove?: number;
  customFormula?: string;
  requireHumanQueue?: boolean;
}): void {
  currentConfig.approval = {
    ...currentConfig.approval,
    ...config,
  };
}

export function setWalletMode(mode: "hot" | "cold" | "hybrid"): void {
  currentConfig.walletMode = mode;
}

export function setMarketplaceVisibility(config: {
  publicEnabled?: boolean;
  internalEnabled?: boolean;
}): void {
  currentConfig.marketplace = {
    ...currentConfig.marketplace,
    ...config,
  };
}

export function setEmailConfig(config: {
  domain?: string;
  provider?: "smtp" | "resend" | "sendgrid";
}): void {
  currentConfig.email = {
    ...currentConfig.email,
    ...config,
  };
}

// ─── Sync with RepublicState ────────────────────────────────────

/**
 * Persist config into RepublicState for serialization.
 * Strips secrets (private keys) for safe storage — only
 * non-sensitive settings are saved. Secrets must be re-entered.
 */
export function syncConfigToState(s: RepublicState): void {
  const safeConfig = structuredClone(currentConfig);
  // Strip private keys from serialized state — they stay in memory only
  if (safeConfig.crypto.ethereum) {
    safeConfig.crypto.ethereum.privateKey = undefined;
    safeConfig.crypto.ethereum.hdSeed = undefined;
  }
  if (safeConfig.crypto.bitcoin) {
    safeConfig.crypto.bitcoin.privateKey = undefined;
    safeConfig.crypto.bitcoin.hdSeed = undefined;
  }
  if (safeConfig.paypal) {
    safeConfig.paypal.secret = "***";
  }
  if (safeConfig.trading) {
    safeConfig.trading.binanceApiKey = undefined;
    safeConfig.trading.binanceSecret = undefined;
  }
  s.republicConfig = safeConfig;
}

/**
 * Load non-secret config from RepublicState on startup.
 */
export function loadConfigFromState(s: RepublicState): void {
  if (s.republicConfig) {
    currentConfig = {
      ...DEFAULT_CONFIG,
      ...s.republicConfig,
      // Re-apply defaults for stripped secret fields
      crypto: {
        ...DEFAULT_CONFIG.crypto,
        ...s.republicConfig.crypto,
      },
    };
  }
}

export function resetConfig(): void {
  currentConfig = structuredClone(DEFAULT_CONFIG);
}

// ─── Diagnostics ────────────────────────────────────────────────

export interface ConfigDiagnostics {
  paypalConfigured: boolean;
  ethereumConfigured: boolean;
  bitcoinConfigured: boolean;
  walletMode: string;
  approvalThreshold: number;
  humanQueueEnabled: boolean;
  marketplacePublic: boolean;
  marketplaceInternal: boolean;
  emailDomain: string;
  emailProvider: string;
  lastUpdated: string;
}

export function getConfigDiagnostics(): ConfigDiagnostics {
  return {
    paypalConfigured: isPayPalConfigured(),
    ethereumConfigured: isEthereumConfigured(),
    bitcoinConfigured: isBitcoinConfigured(),
    walletMode: currentConfig.walletMode,
    approvalThreshold: currentConfig.approval.councilApproveAbove,
    humanQueueEnabled: currentConfig.approval.requireHumanQueue,
    marketplacePublic: currentConfig.marketplace.publicEnabled,
    marketplaceInternal: currentConfig.marketplace.internalEnabled,
    emailDomain: currentConfig.email.domain,
    emailProvider: currentConfig.email.provider,
    lastUpdated: ts(),
  };
}
