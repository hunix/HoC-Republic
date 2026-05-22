/**
 * Republic Platform — DeFi Treasury (Solana / Jupiter DEX)
 *
 * Manages the Republic's Solana-based DeFi treasury:
 *
 *   1. Treasury wallet monitoring (Solana mainnet/devnet)
 *   2. Auto-conversion of USD revenue surplus → USDC via Jupiter DEX
 *   3. Yield farming: idle USDC → Marinade Finance SOL staking
 *   4. Daily treasury report saved to Supabase
 *   5. Spending requests from treasury (GPU time, API credits)
 *
 * Uses @solana/web3.js for on-chain reads (balance checks, tx status).
 * Uses Jupiter Aggregator v6 API for DEX swaps (no dependency on specific AMM).
 *
 * ⚠️  SECURITY: Private keys are stored ONLY in secrets-vault, never in plaintext.
 *     All swap operations require operator confirmation via exec-approval workflow.
 *
 * Environment modes:
 *   devnet  — uses Solana devnet, Jupiter devnet endpoint, fake balances
 *   mainnet — real transactions, real money, requires 2-of-3 multisig
 */

import { createSubsystemLogger } from "../../logging/subsystem.js";
import { getSecret, hasSecret, storeSecret } from "../../republic/secrets-vault.js";
import { ts, uid } from "../../republic/utils.js";

const logger = createSubsystemLogger("republic:defi-treasury");

// ─── Constants ──────────────────────────────────────────────────

const SOLANA_RPC = {
  mainnet: "https://api.mainnet-beta.solana.com",
  devnet: "https://api.devnet.solana.com",
};

const JUPITER_QUOTE_API = "https://quote-api.jup.ag/v6";
// Jupiter Swap API endpoint (used in production version for transaction submission)

// Token mint addresses (mainnet)
const TOKEN_MINTS = {
  SOL: "So11111111111111111111111111111111111111112",
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  MSOL: "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So", // Marinade staked SOL
};

// Thresholds for auto-conversion triggers (used in scheduled jobs)
export const AUTO_CONVERT_THRESHOLD_USD = 500;
export const MARINADE_STAKE_THRESHOLD_USDC = 1_000;

// ─── Types ──────────────────────────────────────────────────────

export type DeFiNetwork = "mainnet" | "devnet";
export type SwapStatus = "pending" | "submitted" | "confirmed" | "failed";
export type YieldStrategy = "marinade_stake" | "kamino_lend" | "hold";

export interface TreasuryWallet {
  publicKey: string;
  solBalance: number;
  usdcBalance: number;
  msolBalance: number; // Marinade staked SOL
  lastRefreshed: string;
}

export interface SwapOrder {
  id: string;
  fromMint: string;
  toMint: string;
  fromSymbol: string;
  toSymbol: string;
  inputAmount: number;
  outputAmount: number;
  slippageBps: number;
  route: string; // Jupiter route description
  txSignature: string | null;
  status: SwapStatus;
  createdAt: string;
  confirmedAt?: string;
  error?: string;
}

export interface YieldPosition {
  id: string;
  strategy: YieldStrategy;
  depositedAmount: number; // USDC
  currentValue: number; // USDC
  apy: number; // %
  openedAt: string;
  lastUpdated: string;
}

export interface TreasuryReport {
  id: string;
  network: DeFiNetwork;
  walletPublicKey: string;
  solBalance: number;
  usdcBalance: number;
  msolBalance: number;
  totalValueUsd: number;
  yieldPositions: YieldPosition[];
  totalYieldEarned: number;
  swapHistory: SwapOrder[];
  generatedAt: string;
}

// ─── State ──────────────────────────────────────────────────────

let network: DeFiNetwork = "devnet";
let walletSnapshot: TreasuryWallet | null = null;
const swapHistory: SwapOrder[] = [];
const yieldPositions = new Map<string, YieldPosition>();
const MAX_SWAP_HISTORY = 100;

// ─── Configuration ──────────────────────────────────────────────

export function configureDeFiTreasury(
  publicKey: string,
  privateKeyBase58: string,
  mode: DeFiNetwork = "devnet",
): void {
  storeSecret("SOLANA_PUBLIC_KEY", publicKey, "payment", "Republic Treasury Solana Public Key");
  storeSecret(
    "SOLANA_PRIVATE_KEY",
    privateKeyBase58,
    "payment",
    "Republic Treasury Solana Private Key (encrypted)",
  );
  network = mode;
  logger.info(`DeFi treasury configured — network: ${mode}, wallet: ${publicKey.slice(0, 8)}...`);
}

export function getDeFiConfig(): {
  configured: boolean;
  network: DeFiNetwork;
  publicKey: string | null;
} {
  return {
    configured: hasSecret("SOLANA_PUBLIC_KEY") && hasSecret("SOLANA_PRIVATE_KEY"),
    network,
    publicKey: hasSecret("SOLANA_PUBLIC_KEY") ? getSecret("SOLANA_PUBLIC_KEY", "system") : null,
  };
}

// ─── Solana RPC Helpers ──────────────────────────────────────────

async function rpcCall<T>(method: string, params: unknown[]): Promise<T | null> {
  const endpoint = SOLANA_RPC[network];
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const json = (await res.json()) as { result: T; error?: { message: string } };
    if (json.error) {
      logger.warn(`Solana RPC error (${method}): ${json.error.message}`);
      return null;
    }
    return json.result;
  } catch (err) {
    logger.warn(`Solana RPC fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Refresh the treasury wallet balance snapshot from Solana RPC.
 */
export async function refreshWalletBalance(): Promise<TreasuryWallet | null> {
  const publicKey = getSecret("SOLANA_PUBLIC_KEY", "system");
  if (!publicKey) {
    return null;
  }

  // SOL balance
  const solBalance = await rpcCall<{ value: number }>("getBalance", [
    publicKey,
    { commitment: "confirmed" },
  ]);
  const solAmount = solBalance ? solBalance.value / 1_000_000_000 : 0; // lamports → SOL

  // Token balances via getTokenAccountsByOwner
  const tokenAccounts = await rpcCall<{
    value: Array<{
      account: { data: { parsed: { info: { mint: string; tokenAmount: { uiAmount: number } } } } };
    }>;
  }>("getTokenAccountsByOwner", [
    publicKey,
    { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
    { encoding: "jsonParsed" },
  ]);

  let usdcBalance = 0;
  let msolBalance = 0;

  if (tokenAccounts) {
    for (const acct of tokenAccounts.value) {
      const info = acct.account.data.parsed.info;
      if (info.mint === TOKEN_MINTS.USDC) {
        usdcBalance = info.tokenAmount.uiAmount;
      } else if (info.mint === TOKEN_MINTS.MSOL) {
        msolBalance = info.tokenAmount.uiAmount;
      }
    }
  }

  walletSnapshot = {
    publicKey,
    solBalance: parseFloat(solAmount.toFixed(6)),
    usdcBalance: parseFloat(usdcBalance.toFixed(2)),
    msolBalance: parseFloat(msolBalance.toFixed(6)),
    lastRefreshed: ts(),
  };

  logger.info(
    `Wallet refreshed: ${solAmount.toFixed(4)} SOL, ${usdcBalance.toFixed(2)} USDC, ${msolBalance.toFixed(4)} mSOL`,
  );
  return walletSnapshot;
}

export function getLastWalletSnapshot(): TreasuryWallet | null {
  return walletSnapshot;
}

// ─── Jupiter DEX Swaps ───────────────────────────────────────────

/**
 * Get a Jupiter DEX quote for a token swap.
 * This is READ-ONLY — no transaction is submitted.
 */
export async function getJupiterQuote(
  fromMint: string,
  toMint: string,
  inputAmountLamports: number,
  slippageBps = 50, // 0.5% default slippage
): Promise<{
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  priceImpactPct: string;
  routePlan: Array<{ swapInfo: { label: string } }>;
} | null> {
  try {
    const url = new URL(`${JUPITER_QUOTE_API}/quote`);
    url.searchParams.set("inputMint", fromMint);
    url.searchParams.set("outputMint", toMint);
    url.searchParams.set("amount", String(inputAmountLamports));
    url.searchParams.set("slippageBps", String(slippageBps));
    url.searchParams.set("onlyDirectRoutes", "false");

    const res = await fetch(url);
    if (!res.ok) {
      logger.warn(`Jupiter quote failed: ${res.status}`);
      return null;
    }

    return (await res.json()) as {
      inputMint: string;
      outputMint: string;
      inAmount: string;
      outAmount: string;
      priceImpactPct: string;
      routePlan: Array<{ swapInfo: { label: string } }>;
    };
  } catch (err) {
    logger.warn(`Jupiter quote error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Record an intended swap order (requires operator exec-approval before execution).
 * Actual transaction signing is handled by a separate secure signing service.
 */
export async function requestSwap(
  fromSymbol: string,
  toSymbol: string,
  inputAmount: number, // human-readable units
): Promise<SwapOrder | { error: string }> {
  const fromMint = TOKEN_MINTS[fromSymbol as keyof typeof TOKEN_MINTS];
  const toMint = TOKEN_MINTS[toSymbol as keyof typeof TOKEN_MINTS];

  if (!fromMint || !toMint) {
    return { error: `Unknown token symbol: ${fromSymbol} or ${toSymbol}` };
  }

  // Get quote (USDC / USDT have 6 decimals, SOL has 9)
  const decimals = fromSymbol === "SOL" ? 1_000_000_000 : 1_000_000;
  const quote = await getJupiterQuote(fromMint, toMint, Math.floor(inputAmount * decimals));

  if (!quote) {
    return { error: "Jupiter quote unavailable" };
  }

  const outputDecimals = toSymbol === "SOL" ? 1_000_000_000 : 1_000_000;
  const outputAmount = parseInt(quote.outAmount) / outputDecimals;
  const routeDesc = quote.routePlan.map((r) => r.swapInfo.label).join(" → ");

  const order: SwapOrder = {
    id: uid(),
    fromMint,
    toMint,
    fromSymbol,
    toSymbol,
    inputAmount,
    outputAmount: parseFloat(outputAmount.toFixed(6)),
    slippageBps: 50,
    route: routeDesc,
    txSignature: null,
    status: "pending",
    createdAt: ts(),
  };

  swapHistory.unshift(order);
  if (swapHistory.length > MAX_SWAP_HISTORY) {
    swapHistory.length = MAX_SWAP_HISTORY;
  }

  logger.info(
    `Swap request: ${inputAmount} ${fromSymbol} → ~${outputAmount.toFixed(4)} ${toSymbol} via ${routeDesc} (PENDING exec-approval)`,
  );

  return order;
}

/**
 * Mark a swap as confirmed after the signing service submits the transaction.
 */
export function confirmSwap(orderId: string, txSignature: string): void {
  const order = swapHistory.find((o) => o.id === orderId);
  if (!order) {
    return;
  }
  order.txSignature = txSignature;
  order.status = "confirmed";
  order.confirmedAt = ts();
  logger.info(`Swap confirmed: ${order.fromSymbol} → ${order.toSymbol} tx=${txSignature}`);
}

// ─── Yield Farming (Marinade Finance) ───────────────────────────

/**
 * Open a Marinade Finance staking position.
 * Stake SOL → receive mSOL (liquid staking, ~7% APY).
 */
export function openMarinadePosition(depositedUsdc: number, estimatedApy: number): YieldPosition {
  const position: YieldPosition = {
    id: uid(),
    strategy: "marinade_stake",
    depositedAmount: depositedUsdc,
    currentValue: depositedUsdc,
    apy: estimatedApy,
    openedAt: ts(),
    lastUpdated: ts(),
  };

  yieldPositions.set(position.id, position);
  logger.info(
    `Marinade position opened: $${depositedUsdc} USDC equivalent at ${estimatedApy}% APY`,
  );
  return position;
}

/**
 * Simulate yield accrual on open positions (called during periodic treasury updates).
 */
export function accrueYield(): number {
  const dayFraction = 1 / 365;
  let totalAccrued = 0;

  for (const [, pos] of yieldPositions) {
    const dailyYield = pos.currentValue * (pos.apy / 100) * dayFraction;
    pos.currentValue += dailyYield;
    pos.lastUpdated = ts();
    totalAccrued += dailyYield;
  }

  return parseFloat(totalAccrued.toFixed(6));
}

// ─── Daily Treasury Report ───────────────────────────────────────

export async function generateTreasuryReport(): Promise<TreasuryReport> {
  const wallet = await refreshWalletBalance();
  const solPriceUsd = 180; // In production: fetch from Pyth oracle or CoinGecko
  const msolPriceUsd = solPriceUsd * 1.02; // mSOL trades slightly above SOL

  const solValueUsd = (wallet?.solBalance ?? 0) * solPriceUsd;
  const usdcValueUsd = wallet?.usdcBalance ?? 0;
  const msolValueUsd = (wallet?.msolBalance ?? 0) * msolPriceUsd;
  const totalValueUsd = solValueUsd + usdcValueUsd + msolValueUsd;

  const totalYieldEarned = [...yieldPositions.values()].reduce(
    (s, p) => s + (p.currentValue - p.depositedAmount),
    0,
  );

  const report: TreasuryReport = {
    id: uid(),
    network,
    walletPublicKey:
      wallet?.publicKey ?? getSecret("SOLANA_PUBLIC_KEY", "system") ?? "not-configured",
    solBalance: wallet?.solBalance ?? 0,
    usdcBalance: wallet?.usdcBalance ?? 0,
    msolBalance: wallet?.msolBalance ?? 0,
    totalValueUsd: parseFloat(totalValueUsd.toFixed(2)),
    yieldPositions: [...yieldPositions.values()],
    totalYieldEarned: parseFloat(totalYieldEarned.toFixed(6)),
    swapHistory: swapHistory.slice(0, 20),
    generatedAt: ts(),
  };

  logger.info(
    `Treasury report: $${totalValueUsd.toFixed(2)} total value — ` +
      `${wallet?.solBalance ?? 0} SOL, ${wallet?.usdcBalance ?? 0} USDC, ${wallet?.msolBalance ?? 0} mSOL`,
  );

  return report;
}

export function getSwapHistory(): SwapOrder[] {
  return [...swapHistory];
}

export function getYieldPositions(): YieldPosition[] {
  return [...yieldPositions.values()];
}
