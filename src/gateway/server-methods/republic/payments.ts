/**
 * Republic Platform — Payments & Store RPC Handlers (Sprint 2)
 *
 * Exposes payment, AI Store, and DeFi treasury capabilities via gateway RPC:
 *
 *   Binance Pay:
 *     republic.binance.configure
 *     republic.binance.order.create
 *     republic.binance.order.status
 *     republic.binance.diagnostics
 *
 *   Revenue Allocator:
 *     republic.revenue.treasury
 *     republic.revenue.wallets
 *     republic.revenue.wallet.get
 *     republic.revenue.sale.history
 *     republic.revenue.withdrawal.request
 *     republic.revenue.withdrawals
 *     republic.revenue.redistribution.apply
 *
 *   AI Store:
 *     republic.store.products.list
 *     republic.store.product.get
 *     republic.store.product.create
 *     republic.store.product.purchase
 *     republic.store.stats
 *     republic.store.generation.queue
 *
 *   DeFi Treasury:
 *     republic.defi.config
 *     republic.defi.configure
 *     republic.defi.wallet.balance
 *     republic.defi.swap.quote
 *     republic.defi.swap.request
 *     republic.defi.report
 *     republic.defi.yield
 */

import type { GatewayRequestHandlers } from "../types.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";
import {
  configureBinancePay,
  createBinanceOrder,
  queryBinanceOrder,
  getBinanceDiagnostics,
  getBinanceOrders,
  verifyBinanceWebhook,
  processBinanceWebhook,
} from "../../../republic/binance-pay-connector.js";
import {
  listProducts,
  getProduct,
  createProduct,
  recordPurchase,
  getStoreStats,
  getGenerationQueue,
  queueGeneration,
} from "../../../republic/economy/ai-store-pipeline.js";
import {
  getDeFiConfig,
  configureDeFiTreasury,
  refreshWalletBalance,
  getLastWalletSnapshot,
  getJupiterQuote,
  requestSwap,
  generateTreasuryReport,
  getSwapHistory,
  getYieldPositions,
  accrueYield,
} from "../../../republic/economy/defi-treasury.js";
import {
  getTreasurySnapshot,
  getAllWallets,
  getWallet,
  getSaleHistory,
  requestWithdrawal,
  getWithdrawalQueue,
  applyRedistributionTax,
} from "../../../republic/economy/revenue-allocator.js";

export const paymentsHandlers: Partial<GatewayRequestHandlers> = {
  // ── Binance Pay ────────────────────────────────────────────────

  "republic.binance.configure": ({ params, respond }) => {
    const { apiKey, apiSecret } = params as { apiKey: string; apiSecret: string };
    if (!apiKey || !apiSecret) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "apiKey and apiSecret required"));
      return;
    }
    configureBinancePay(apiKey, apiSecret);
    respond(true, { ok: true }, undefined);
  },

  "republic.binance.order.create": async ({ params, respond }) => {
    const { currency, amount, description, citizenId, productId } = params as {
      currency: "USDT" | "BNB" | "BTC" | "ETH";
      amount: number;
      description: string;
      citizenId?: string;
      productId?: string;
    };
    const order = await createBinanceOrder(currency, amount, description, citizenId, productId);
    respond(true, order, undefined);
  },

  "republic.binance.order.status": async ({ params, respond }) => {
    const { orderId } = params as { orderId: string };
    const status = await queryBinanceOrder(orderId);
    respond(true, { status }, undefined);
  },

  "republic.binance.orders": ({ params, respond }) => {
    const { status } = params as { status?: string };
    respond(
      true,
      { orders: getBinanceOrders(status as Parameters<typeof getBinanceOrders>[0]) },
      undefined,
    );
  },

  "republic.binance.diagnostics": ({ respond }) => {
    respond(true, getBinanceDiagnostics(), undefined);
  },

  "republic.binance.webhook.verify": ({ params, respond }) => {
    const { timestamp, nonce, body, signature } = params as {
      timestamp: string;
      nonce: string;
      body: string;
      signature: string;
    };
    const valid = verifyBinanceWebhook(timestamp, nonce, body, signature);
    respond(true, { valid }, undefined);
  },

  "republic.binance.webhook.process": async ({ params, respond }) => {
    const payload = params as Parameters<typeof processBinanceWebhook>[0];
    await processBinanceWebhook(payload);
    respond(true, { ok: true }, undefined);
  },

  // ── Revenue Allocator ──────────────────────────────────────────

  "republic.revenue.treasury": ({ respond }) => {
    respond(true, getTreasurySnapshot(), undefined);
  },

  "republic.revenue.wallets": ({ respond }) => {
    respond(true, { wallets: getAllWallets() }, undefined);
  },

  "republic.revenue.wallet.get": ({ params, respond }) => {
    const { citizenId } = params as { citizenId: string };
    const wallet = getWallet(citizenId);
    if (!wallet) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `No wallet for citizen ${citizenId}`));
      return;
    }
    respond(true, wallet, undefined);
  },

  "republic.revenue.sale.history": ({ params, respond }) => {
    const { limit } = params as { limit?: number };
    respond(true, { sales: getSaleHistory(limit ?? 50) }, undefined);
  },

  "republic.revenue.withdrawal.request": ({ params, respond }) => {
    const { citizenId, amount, method, destination } = params as {
      citizenId: string;
      amount: number;
      method: "paypal" | "binance_usdt";
      destination: string;
    };
    const result = requestWithdrawal(citizenId, amount, method, destination);
    if ("error" in result) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, result.error!));
      return;
    }
    respond(true, result, undefined);
  },

  "republic.revenue.withdrawals": ({ respond }) => {
    respond(true, { withdrawals: getWithdrawalQueue() }, undefined);
  },

  "republic.revenue.redistribution.apply": ({ params, respond }) => {
    const { gini } = params as { gini: number };
    const result = applyRedistributionTax(gini ?? 0);
    respond(true, result, undefined);
  },

  // ── AI Store ───────────────────────────────────────────────────

  "republic.store.products.list": ({ params, respond }) => {
    const opts = (params ?? {}) as {
      category?: import("../../../republic/economy/ai-store-pipeline.js").ProductCategory;
      status?: import("../../../republic/economy/ai-store-pipeline.js").ProductStatus;
      creatorId?: string;
      limit?: number;
      sortBy?: "price" | "revenue" | "purchases" | "newest";
    };
    respond(true, { products: listProducts(opts) }, undefined);
  },

  "republic.store.product.get": ({ params, respond }) => {
    const { productId } = params as { productId: string };
    const product = getProduct(productId);
    if (!product) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `Product ${productId} not found`));
      return;
    }
    respond(true, product, undefined);
  },

  "republic.store.product.create": ({ params, respond }) => {
    const p = params as {
      title: string;
      description: string;
      category: import("../../../republic/economy/ai-store-pipeline.js").ProductCategory;
      creatorIds: string[];
      creatorNames: string[];
      priceUsd: number;
      tags?: string[];
      metadata?: Record<string, unknown>;
    };
    const product = createProduct(
      p.title,
      p.description,
      p.category,
      p.creatorIds,
      p.creatorNames,
      p.priceUsd,
      { tags: p.tags, metadata: p.metadata },
    );
    respond(true, product, undefined);
  },

  "republic.store.generation.queue": ({ params, respond }) => {
    const { productId, prompt, citizenId } = params as {
      productId: string;
      prompt: string;
      citizenId: string;
    };
    const result = queueGeneration(productId, prompt, citizenId);
    if ("error" in result) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, (result as { error: string }).error));
      return;
    }
    respond(true, result, undefined);
  },

  "republic.store.generation.list": ({ params, respond }) => {
    const { status } = params as { status?: string };
    respond(
      true,
      { queue: getGenerationQueue(status as Parameters<typeof getGenerationQueue>[0]) },
      undefined,
    );
  },

  "republic.store.product.purchase": ({ params, respond }) => {
    const { productId, amountUsd, paymentMethod, buyerEmail, paymentRef } = params as {
      productId: string;
      amountUsd: number;
      paymentMethod: "paypal" | "binance" | "credits";
      buyerEmail?: string;
      paymentRef?: string;
    };
    const result = recordPurchase(productId, amountUsd, paymentMethod, {
      buyerEmail,
      paymentRef,
    });
    if ("error" in result) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, result.error));
      return;
    }
    respond(true, result, undefined);
  },

  "republic.store.stats": ({ respond }) => {
    respond(true, getStoreStats(), undefined);
  },

  // ── DeFi Treasury ──────────────────────────────────────────────

  "republic.defi.config": ({ respond }) => {
    respond(true, getDeFiConfig(), undefined);
  },

  "republic.defi.configure": ({ params, respond }) => {
    const { publicKey, privateKey, network } = params as {
      publicKey: string;
      privateKey: string;
      network?: "mainnet" | "devnet";
    };
    configureDeFiTreasury(publicKey, privateKey, network);
    respond(true, { ok: true }, undefined);
  },

  "republic.defi.wallet.balance": async ({ respond }) => {
    const wallet = await refreshWalletBalance();
    respond(true, wallet ?? getLastWalletSnapshot(), undefined);
  },

  "republic.defi.swap.quote": async ({ params, respond }) => {
    const { fromSymbol, toSymbol, amount, slippage } = params as {
      fromSymbol: string;
      toSymbol: string;
      amount: number;
      slippage?: number;
    };
    const TOKEN_MINTS: Record<string, string> = {
      SOL: "So11111111111111111111111111111111111111112",
      USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    };
    const fromMint = TOKEN_MINTS[fromSymbol];
    const toMint = TOKEN_MINTS[toSymbol];
    if (!fromMint || !toMint) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Unknown symbol: ${fromSymbol} or ${toSymbol}`));
      return;
    }
    const decimals = fromSymbol === "SOL" ? 1_000_000_000 : 1_000_000;
    const quote = await getJupiterQuote(
      fromMint,
      toMint,
      Math.floor(amount * decimals),
      slippage ?? 50,
    );
    respond(true, quote, undefined);
  },

  "republic.defi.swap.request": async ({ params, respond }) => {
    const { fromSymbol, toSymbol, inputAmount } = params as {
      fromSymbol: string;
      toSymbol: string;
      inputAmount: number;
    };
    const result = await requestSwap(fromSymbol, toSymbol, inputAmount);
    if ("error" in result) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, (result as { error: string }).error));
      return;
    }
    respond(true, result, undefined);
  },

  "republic.defi.report": async ({ respond }) => {
    const report = await generateTreasuryReport();
    respond(true, report, undefined);
  },

  "republic.defi.swap.history": ({ respond }) => {
    respond(true, { swaps: getSwapHistory() }, undefined);
  },

  "republic.defi.yield.positions": ({ respond }) => {
    const positions = getYieldPositions();
    const accrued = accrueYield();
    respond(true, { positions, dailyAccrued: accrued }, undefined);
  },
};
