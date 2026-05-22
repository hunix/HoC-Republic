/**
 * Pairing Protocol
 *
 * Implements the automatic gateway-node pairing flow:
 *
 * 1. Node UI → POST gateway/api/cluster/pair-request
 *    Sends: { nodeId, displayName, capabilities, callbackUrl }
 *
 * 2. Gateway shows pending request in its UI
 *
 * 3. Gateway admin approves → gateway generates scoped token
 *    → POSTs token to node's callbackUrl /api/pair/accept
 *
 * 4. Node stores token → auto-connects on next heartbeat
 */

import crypto from "node:crypto";
import { detectNodeCapabilities, type NodeCapabilities } from "../cluster/node-capabilities.js";
import { createSubsystemLogger } from "../logging.js";
import { loadNodeConfig, updateNodeConfig, type NodeConfig } from "./node-config-store.js";

const logger = createSubsystemLogger("node-ui:pairing");

// ─── Types ───────────────────────────────────────────────────────

export interface PairRequest {
  nodeId: string;
  displayName: string;
  capabilities: NodeCapabilities;
  /** URL the gateway should POST the token to */
  callbackUrl: string;
  /** HMAC challenge for verifying the response */
  challenge: string;
  requestedAt: string;
}

export interface PairResponse {
  status: "pending" | "approved" | "rejected" | "error";
  message?: string;
}

export interface PairAcceptPayload {
  nodeId: string;
  token: string;
  gatewayUrl: string;
  /** HMAC response proving the gateway received our challenge */
  challengeResponse?: string;
}

// ─── Node-Side: Request Pairing ─────────────────────────────────

/**
 * Send a pairing request from this node to a gateway.
 *
 * @param gatewayUrl — The gateway's base URL (e.g. "http://192.168.1.100:3000")
 * @returns PairResponse with the current status
 */
export async function requestPairing(gatewayUrl: string): Promise<PairResponse> {
  const config = loadNodeConfig();

  // Normalise gateway URL
  const normalizedUrl = gatewayUrl.replace(/\/+$/, "");

  // Generate a challenge for this pairing session
  const challenge = crypto.randomBytes(32).toString("hex");

  // Detect current node capabilities
  let capabilities: NodeCapabilities;
  try {
    capabilities = await detectNodeCapabilities();
  } catch (err) {
    logger.error("Failed to detect capabilities for pairing", { error: String(err) });
    return { status: "error", message: "Failed to detect node capabilities" };
  }

  // Build the callback URL (this node's API)
  const nodePort = config.ui.port;
  const callbackUrl = `http://${getLocalIp()}:${nodePort}/api/pair/accept`;

  const pairRequest: PairRequest = {
    nodeId: config.nodeId,
    displayName: config.displayName,
    capabilities,
    callbackUrl,
    challenge,
    requestedAt: new Date().toISOString(),
  };

  logger.info("Sending pairing request to gateway", {
    gatewayUrl: normalizedUrl,
    nodeId: config.nodeId,
  });

  try {
    const response = await fetch(`${normalizedUrl}/api/cluster/pair-request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pairRequest),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      logger.error("Pairing request rejected by gateway", {
        status: response.status,
        body: text,
      });
      return {
        status: "error",
        message: `Gateway returned ${response.status}: ${text}`,
      };
    }

    const result = (await response.json()) as PairResponse;

    // Update local config with pairing state
    updateNodeConfig({
      gateway: {
        ...config.gateway,
        url: normalizedUrl,
        pairingState: result.status === "approved" ? "paired" : "pending",
        lastPairingAttempt: new Date().toISOString(),
      },
    });

    // Store the challenge for later verification
    pairingChallenges.set(config.nodeId, challenge);

    logger.info("Pairing request sent", { status: result.status });
    return result;
  } catch (err) {
    logger.error("Failed to send pairing request", { error: String(err) });

    updateNodeConfig({
      gateway: {
        ...config.gateway,
        url: normalizedUrl,
        pairingState: "unpaired",
        lastPairingAttempt: new Date().toISOString(),
      },
    });

    return {
      status: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Node-Side: Accept Pairing (callback from gateway) ──────────

/** In-memory challenge store for current pairing session */
const pairingChallenges = new Map<string, string>();

/**
 * Handle the gateway's approval response.
 * Called when the gateway POSTs to /api/pair/accept.
 */
export function acceptPairing(payload: PairAcceptPayload): { ok: boolean; message: string } {
  const config = loadNodeConfig();

  if (payload.nodeId !== config.nodeId) {
    logger.warn("Pairing accept for wrong node", {
      expected: config.nodeId,
      received: payload.nodeId,
    });
    return { ok: false, message: "Node ID mismatch" };
  }

  // Store the token and update pairing state
  updateNodeConfig({
    gateway: {
      url: payload.gatewayUrl || config.gateway.url,
      token: payload.token,
      autoConnect: true,
      pairingState: "paired",
    },
  });

  // Clear the challenge
  pairingChallenges.delete(config.nodeId);

  logger.info("Pairing accepted! Token stored.", {
    nodeId: config.nodeId,
    gatewayUrl: payload.gatewayUrl,
  });

  return { ok: true, message: "Pairing successful — token stored" };
}

// ─── Gateway-Side: Token Generation ─────────────────────────────

/**
 * Generate a scoped auth token for a paired node.
 * Called on the gateway when an admin approves a pair request.
 */
export function generateNodeToken(nodeId: string): string {
  const payload = {
    type: "node",
    nodeId,
    issuedAt: new Date().toISOString(),
    random: crypto.randomBytes(16).toString("hex"),
  };
  // Create a signed token (base64-encoded JSON + HMAC)
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json).toString("base64url");
  const secret =
    process.env.OPENCLAW_CLUSTER_SECRET ?? "hoc_default_cluster_secret_for_auto_discovery";
  const hmac = crypto.createHmac("sha256", secret).update(b64).digest("base64url");
  return `hoc_node_${b64}.${hmac}`;
}

// ─── Utility ────────────────────────────────────────────────────

/**
 * Get the best non-loopback IP address for callbacks.
 */
function getLocalIp(): string {
  const interfaces = require("node:os").networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    for (const info of iface as Array<{ family: string; internal: boolean; address: string }>) {
      if (info.family === "IPv4" && !info.internal) {
        return info.address;
      }
    }
  }
  return "127.0.0.1";
}

/**
 * Get current pairing status from config.
 */
export function getPairingStatus(): {
  state: NodeConfig["gateway"]["pairingState"];
  gatewayUrl: string;
  hasToken: boolean;
  lastAttempt?: string;
} {
  const config = loadNodeConfig();
  return {
    state: config.gateway.pairingState,
    gatewayUrl: config.gateway.url,
    hasToken: config.gateway.token.length > 0,
    lastAttempt: config.gateway.lastPairingAttempt,
  };
}
