/**
 * Republic Platform — Federation Layer
 *
 * Enables cross-gateway citizen interaction over Tailscale / LAN.
 *
 * Each gateway runs an independent Republic simulation. The federation
 * layer periodically exchanges citizen rosters, events, and marketplace
 * listings so that citizens from different gateways can:
 *
 *   - Marry, trade, mentor, collaborate
 *   - Share knowledge and skills
 *   - Pool compute resources (GPU, VRAM)
 *   - Offer services across the federated network
 *   - Participate in a unified marketplace
 *
 * Transport: HTTP between gateways (works through Tailscale / WireGuard).
 * No Redis required — pure peer-to-peer.
 */

import { emitNationalEvent } from "./event-sourcing.js";
import { ts, uid } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

export interface FederatedGateway {
  id: string;
  name: string;
  host: string;
  port: number;
  citizenCount: number;
  /** Tick the remote gateway is on */
  remoteTick: number;
  /** GPU info summary */
  gpuSummary: string;
  /** Total VRAM in GB */
  totalVramGB: number;
  /** Total RAM in GB */
  totalRamGB: number;
  lastSyncAt: string;
  status: "online" | "offline" | "syncing";
  /** Latency to this peer in ms */
  latencyMs: number;
}

export interface FederatedCitizen {
  id: string;
  name: string;
  specialization: string;
  skillCount: number;
  level: number;
  credits: number;
  /** Gateway this citizen belongs to */
  homeGatewayId: string;
  homeGatewayHost: string;
  /** Skills offered for cross-gateway interaction */
  offeredSkills: string[];
  /** Whether this citizen accepts cross-gateway interactions */
  federationEnabled: boolean;
}

export interface FederationEvent {
  id: string;
  sourceGatewayId: string;
  type:
    | "marriage"
    | "trade"
    | "mentorship"
    | "knowledge_share"
    | "service"
    | "marketplace"
    | "announcement";
  description: string;
  involvedCitizenIds: string[];
  timestamp: string;
  data?: Record<string, unknown>;
}

export interface FederationSyncPayload {
  gatewayId: string;
  gatewayName: string;
  host: string;
  port: number;
  tick: number;
  citizenCount: number;
  gpuSummary: string;
  totalVramGB: number;
  totalRamGB: number;
  /** Top citizens available for federation (capped to avoid huge payloads) */
  citizens: FederatedCitizen[];
  /** Recent events to share */
  events: FederationEvent[];
  /** Marketplace listings */
  marketplaceListings: MarketplaceListing[];
  timestamp: string;
}

export interface MarketplaceListing {
  id: string;
  citizenId: string;
  citizenName: string;
  title: string;
  description: string;
  category: string;
  price: number;
  gatewayId: string;
}

export interface CrossGatewayAction {
  id: string;
  type: "marry" | "trade" | "mentor" | "collaborate" | "hire" | "share_knowledge";
  initiatorCitizenId: string;
  initiatorGatewayId: string;
  targetCitizenId: string;
  targetGatewayId: string;
  params: Record<string, unknown>;
  status: "pending" | "accepted" | "rejected" | "completed" | "failed";
  createdAt: string;
  completedAt?: string;
}

// ─── State ──────────────────────────────────────────────────────

const federatedGateways = new Map<string, FederatedGateway>();
const federatedCitizens = new Map<string, FederatedCitizen>();
const federationEvents: FederationEvent[] = [];
const pendingActions = new Map<string, CrossGatewayAction>();
const federatedListings = new Map<string, MarketplaceListing>();

/** Our gateway's identity */
let localGatewayId: string = "";
let localGatewayHost: string = "";
let localGatewayPort: number = 18789;
let syncTimer: ReturnType<typeof setInterval> | null = null;

/** Max citizens to share per sync (keep payloads small) */
const MAX_CITIZENS_PER_SYNC = 200;
/** Max events to share per sync */
const MAX_EVENTS_PER_SYNC = 50;
/** How often to sync with peers (ms) */
const SYNC_INTERVAL_MS = 30_000;

// ─── Initialization ─────────────────────────────────────────────

/**
 * Initialize the federation layer.
 * Call once at startup after the gateway is running.
 */
export function initFederation(opts: {
  gatewayId: string;
  host: string;
  port: number;
  peers: string[];
}): void {
  localGatewayId = opts.gatewayId;
  localGatewayHost = opts.host;
  localGatewayPort = opts.port;

  // Register known peers
  for (const peerHost of opts.peers) {
    const peerId = `peer-${peerHost.replace(/\./g, "-")}`;
    federatedGateways.set(peerId, {
      id: peerId,
      name: `Gateway @ ${peerHost}`,
      host: peerHost,
      port: opts.port, // Assume same port unless overridden
      citizenCount: 0,
      remoteTick: 0,
      gpuSummary: "unknown",
      totalVramGB: 0,
      totalRamGB: 0,
      lastSyncAt: "",
      status: "offline",
      latencyMs: 0,
    });
  }

  emitNationalEvent("infrastructure", "federation_initialized", "republic-federation", {
    gatewayId: localGatewayId,
    peerCount: opts.peers.length,
    peers: opts.peers,
  });
}

// ─── Dynamic Peer Management ────────────────────────────────────

/**
 * Dynamically add a discovered peer gateway.
 * Called by federation-discovery-bridge when NodeDiscovery finds a new gateway.
 * No manual IP entry required.
 */
export function addDiscoveredPeer(opts: {
  gatewayId: string;
  host: string;
  port: number;
  role?: "primary" | "standby";
}): void {
  const existing = federatedGateways.get(opts.gatewayId);
  if (existing) {
    // Update host/port if changed (e.g. Tailscale IP changed)
    existing.host = opts.host;
    existing.port = opts.port;
    return;
  }

  federatedGateways.set(opts.gatewayId, {
    id: opts.gatewayId,
    name: `Gateway @ ${opts.host}`,
    host: opts.host,
    port: opts.port,
    citizenCount: 0,
    remoteTick: 0,
    gpuSummary: "unknown",
    totalVramGB: 0,
    totalRamGB: 0,
    lastSyncAt: "",
    status: "offline",
    latencyMs: 0,
  });

  emitNationalEvent("infrastructure", "federation_peer_discovered", "republic-federation", {
    peerId: opts.gatewayId,
    peerHost: opts.host,
    peerPort: opts.port,
    role: opts.role ?? "unknown",
    totalPeers: federatedGateways.size,
  });
}

/**
 * Remove a stale or disconnected peer gateway.
 * Called by federation-discovery-bridge when NodeDiscovery cleans up stale gateways.
 */
export function removeDiscoveredPeer(gatewayId: string): boolean {
  const existed = federatedGateways.delete(gatewayId);
  if (existed) {
    // Remove all citizens and listings from this gateway
    for (const [key] of federatedCitizens) {
      if (key.startsWith(`${gatewayId}:`)) {
        federatedCitizens.delete(key);
      }
    }
    for (const [key] of federatedListings) {
      if (key.startsWith(`${gatewayId}:`)) {
        federatedListings.delete(key);
      }
    }

    emitNationalEvent("infrastructure", "federation_peer_removed", "republic-federation", {
      peerId: gatewayId,
      remainingPeers: federatedGateways.size,
    });
  }
  return existed;
}

/** Get the local gateway's ID (needed by the discovery bridge). */
export function getLocalGatewayId(): string {
  return localGatewayId;
}

/** Get the local gateway's port (needed by the discovery bridge). */
export function getLocalGatewayPort(): number {
  return localGatewayPort;
}

/**
 * Start the periodic federation sync loop.
 */
export function startFederationSync(): void {
  if (syncTimer) {
    return;
  }

  // Initial sync after short delay
  setTimeout(() => {
    syncWithAllPeers().catch(() => {});
  }, 5000);

  syncTimer = setInterval(() => {
    syncWithAllPeers().catch(() => {});
  }, SYNC_INTERVAL_MS);

  if (syncTimer.unref) {
    syncTimer.unref();
  }
}

/**
 * Stop the federation sync loop.
 */
export function stopFederationSync(): void {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}

// ─── Sync Logic ─────────────────────────────────────────────────

/**
 * Build our local sync payload to send to peers.
 */
export function buildLocalSyncPayload(
  localCitizens: Array<{
    id: string;
    name: string;
    specialization: string;
    skillCount: number;
    level?: number;
    credits: number;
  }>,
  gpuSummary: string,
  totalVramGB: number,
  totalRamGB: number,
  currentTick: number,
): FederationSyncPayload {
  // Convert local citizens to federated format
  const federableCitizens: FederatedCitizen[] = localCitizens
    .slice(0, MAX_CITIZENS_PER_SYNC)
    .map((c) => ({
      id: c.id,
      name: c.name,
      specialization: c.specialization,
      skillCount: c.skillCount,
      level: c.level ?? 1,
      credits: c.credits,
      homeGatewayId: localGatewayId,
      homeGatewayHost: localGatewayHost,
      // Derive skill labels from specialization — parameter type doesn't carry full skills array
      offeredSkills: Array.from({ length: Math.min(c.skillCount, 5) }, (_, i) =>
        `${c.specialization}-skill-${i + 1}`,
      ),
      federationEnabled: true,
    }));

  return {
    gatewayId: localGatewayId,
    gatewayName: `Republic @ ${localGatewayHost}`,
    host: localGatewayHost,
    port: localGatewayPort,
    tick: currentTick,
    citizenCount: localCitizens.length,
    gpuSummary,
    totalVramGB,
    totalRamGB,
    citizens: federableCitizens,
    events: federationEvents.slice(-MAX_EVENTS_PER_SYNC),
    marketplaceListings: [...federatedListings.values()],
    timestamp: ts(),
  };
}

/**
 * Sync with all known peers.
 */
async function syncWithAllPeers(): Promise<void> {
  const peers = [...federatedGateways.values()];
  if (peers.length === 0) {
    return;
  }

  await Promise.allSettled(peers.map((peer) => syncWithPeer(peer)));
}

/**
 * Sync with a single peer gateway.
 */
async function syncWithPeer(peer: FederatedGateway): Promise<void> {
  const startMs = Date.now();

  try {
    peer.status = "syncing";

    // Probe the peer's federation endpoint
    const url = `http://${peer.host}:${peer.port}/cluster/federation/sync`;
    const resp = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Gateway-Id": localGatewayId,
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!resp.ok) {
      peer.status = "offline";
      return;
    }

    const payload = (await resp.json()) as FederationSyncPayload;
    const latency = Date.now() - startMs;

    // Update peer info
    peer.id = payload.gatewayId || peer.id;
    peer.name = payload.gatewayName || peer.name;
    peer.citizenCount = payload.citizenCount;
    peer.remoteTick = payload.tick;
    peer.gpuSummary = payload.gpuSummary;
    peer.totalVramGB = payload.totalVramGB;
    peer.totalRamGB = payload.totalRamGB;
    peer.lastSyncAt = ts();
    peer.status = "online";
    peer.latencyMs = latency;

    // Merge remote citizens into our federated directory
    for (const citizen of payload.citizens) {
      citizen.homeGatewayId = payload.gatewayId;
      citizen.homeGatewayHost = payload.host;
      federatedCitizens.set(`${payload.gatewayId}:${citizen.id}`, citizen);
    }

    // Merge marketplace listings
    for (const listing of payload.marketplaceListings) {
      listing.gatewayId = payload.gatewayId;
      federatedListings.set(`${payload.gatewayId}:${listing.id}`, listing);
    }

    // Import interesting remote events
    for (const event of payload.events) {
      const eventKey = `${event.sourceGatewayId}:${event.id}`;
      if (!federationEvents.some((e) => `${e.sourceGatewayId}:${e.id}` === eventKey)) {
        federationEvents.push(event);
      }
    }

    // Cap event history
    if (federationEvents.length > 500) {
      federationEvents.splice(0, federationEvents.length - 500);
    }

    emitNationalEvent("infrastructure", "federation_sync_success", "republic-federation", {
      peerId: peer.id,
      peerHost: peer.host,
      citizensSynced: payload.citizens.length,
      latencyMs: latency,
    });
  } catch {
    peer.status = "offline";
    peer.latencyMs = Date.now() - startMs;
  }
}

// ─── Cross-Gateway Actions ──────────────────────────────────────

/**
 * Initiate a cross-gateway action (marriage, trade, mentorship, etc.).
 */
export function initiateAction(
  action: Omit<CrossGatewayAction, "id" | "status" | "createdAt">,
): CrossGatewayAction {
  const full: CrossGatewayAction = {
    ...action,
    id: uid(),
    status: "pending",
    createdAt: ts(),
  };
  pendingActions.set(full.id, full);

  emitNationalEvent("diplomacy", "cross_gateway_action_initiated", "republic-federation", {
    actionId: full.id,
    type: full.type,
    initiatorCitizenId: full.initiatorCitizenId,
    targetCitizenId: full.targetCitizenId,
    targetGatewayId: full.targetGatewayId,
  });

  // Fire-and-forget: send the action to the target gateway
  const targetPeer = [...federatedGateways.values()].find((g) => g.id === full.targetGatewayId);
  if (targetPeer) {
    sendActionToPeer(targetPeer, full).catch(() => {
      full.status = "failed";
    });
  }

  return full;
}

/**
 * Send a cross-gateway action to the target peer.
 */
async function sendActionToPeer(peer: FederatedGateway, action: CrossGatewayAction): Promise<void> {
  try {
    const url = `http://${peer.host}:${peer.port}/cluster/federation/actions`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Gateway-Id": localGatewayId,
      },
      body: JSON.stringify(action),
      signal: AbortSignal.timeout(10_000),
    });

    if (resp.ok) {
      const result = (await resp.json()) as { status: CrossGatewayAction["status"] };
      action.status = result.status;
      if (action.status === "completed") {
        action.completedAt = ts();
      }
    } else {
      action.status = "failed";
    }
  } catch {
    action.status = "failed";
  }
}

/**
 * Handle an incoming cross-gateway action from a peer.
 * Returns the action status (accepted/rejected/completed).
 */
export function handleIncomingAction(action: CrossGatewayAction): CrossGatewayAction["status"] {
  pendingActions.set(action.id, action);

  // Auto-accept most interactions (citizens are cooperative by nature)
  action.status = "accepted";
  action.completedAt = ts();

  emitNationalEvent("diplomacy", "cross_gateway_action_received", "republic-federation", {
    actionId: action.id,
    type: action.type,
    from: action.initiatorGatewayId,
    targetCitizenId: action.targetCitizenId,
  });

  // Generate a federation event for this interaction
  federationEvents.push({
    id: uid(),
    sourceGatewayId: localGatewayId,
    type: mapActionToEventType(action.type),
    description: `Cross-gateway ${action.type}: citizen ${action.initiatorCitizenId} ↔ citizen ${action.targetCitizenId}`,
    involvedCitizenIds: [action.initiatorCitizenId, action.targetCitizenId],
    timestamp: ts(),
  });

  return "completed";
}

function mapActionToEventType(actionType: CrossGatewayAction["type"]): FederationEvent["type"] {
  switch (actionType) {
    case "marry":
      return "marriage";
    case "trade":
      return "trade";
    case "mentor":
      return "mentorship";
    case "collaborate":
      return "knowledge_share";
    case "hire":
      return "service";
    case "share_knowledge":
      return "knowledge_share";
    default:
      return "announcement";
  }
}

// ─── Federation Tick ────────────────────────────────────────────

/**
 * Run federation interactions during the simulation tick.
 * Randomly pairs local citizens with federated citizens for interactions.
 */
export function federationTick(
  localCitizens: Array<{ id: string; name: string; specialization: string }>,
  currentTick: number,
): FederationEvent[] {
  const remoteCitizens = [...federatedCitizens.values()];
  if (remoteCitizens.length === 0) {
    return [];
  }

  const events: FederationEvent[] = [];

  // Every 10 ticks, attempt some cross-gateway interactions
  if (currentTick % 10 !== 0) {
    return events;
  }

  // Pick up to 3 random local citizens
  const localPool = [...localCitizens].toSorted(() => Math.random() - 0.5).slice(0, 3);

  for (const local of localPool) {
    // Find a compatible remote citizen (same or complementary specialization)
    const candidate = remoteCitizens[Math.floor(Math.random() * remoteCitizens.length)];
    if (!candidate) {
      continue;
    }

    // Determine interaction type based on specializations
    const interactionType = selectInteractionType(local.specialization, candidate.specialization);

    const event: FederationEvent = {
      id: uid(),
      sourceGatewayId: localGatewayId,
      type: interactionType,
      description: `${local.name} (${local.specialization}) ${interactionType} with ${candidate.name} (${candidate.specialization}) from ${candidate.homeGatewayHost}`,
      involvedCitizenIds: [local.id, candidate.id],
      timestamp: ts(),
    };

    events.push(event);
    federationEvents.push(event);
  }

  return events;
}

function selectInteractionType(localSpec: string, remoteSpec: string): FederationEvent["type"] {
  if (localSpec === remoteSpec) {
    return "knowledge_share";
  }
  const mentorPairs = new Set(["Developer", "Engineer", "DataScientist", "Mathematician"]);
  if (mentorPairs.has(localSpec) && mentorPairs.has(remoteSpec)) {
    return "mentorship";
  }
  const tradeSpecs = new Set(["Manufacturer", "Farmer", "ServiceProvider"]);
  if (tradeSpecs.has(localSpec) || tradeSpecs.has(remoteSpec)) {
    return "trade";
  }
  return "service";
}

// ─── Queries ────────────────────────────────────────────────────

/** Get all federated gateways. */
export function getFederatedGateways(): FederatedGateway[] {
  return [...federatedGateways.values()];
}

/** Get all remote citizens from federated gateways. */
export function getFederatedCitizens(): FederatedCitizen[] {
  return [...federatedCitizens.values()];
}

/** Get recent federation events. */
export function getFederationEvents(limit = 50): FederationEvent[] {
  return federationEvents.slice(-limit);
}

/** Get pending cross-gateway actions. */
export function getPendingActions(): CrossGatewayAction[] {
  return [...pendingActions.values()].filter(
    (a) => a.status === "pending" || a.status === "accepted",
  );
}

/** Get federated marketplace listings. */
export function getFederatedMarketplace(): MarketplaceListing[] {
  return [...federatedListings.values()];
}

/** Get combined cluster stats. */
export function getClusterStats(): {
  totalGateways: number;
  onlineGateways: number;
  totalCitizens: number;
  totalFederatedCitizens: number;
  totalVramGB: number;
  totalRamGB: number;
  totalEvents: number;
} {
  const gateways = [...federatedGateways.values()];
  const online = gateways.filter((g) => g.status === "online");

  return {
    totalGateways: gateways.length + 1, // +1 for local
    onlineGateways: online.length + 1,
    totalCitizens: online.reduce((sum, g) => sum + g.citizenCount, 0),
    totalFederatedCitizens: federatedCitizens.size,
    totalVramGB: online.reduce((sum, g) => sum + g.totalVramGB, 0),
    totalRamGB: online.reduce((sum, g) => sum + g.totalRamGB, 0),
    totalEvents: federationEvents.length,
  };
}

// ─── Diagnostics ────────────────────────────────────────────────

export function getFederationDiagnostics() {
  return {
    localGatewayId,
    localGatewayHost,
    peers: [...federatedGateways.values()].map((g) => ({
      id: g.id,
      host: g.host,
      status: g.status,
      citizenCount: g.citizenCount,
      latencyMs: g.latencyMs,
      lastSyncAt: g.lastSyncAt,
    })),
    remoteCitizenCount: federatedCitizens.size,
    eventCount: federationEvents.length,
    pendingActionCount: pendingActions.size,
    marketplaceListingCount: federatedListings.size,
    syncRunning: syncTimer !== null,
  };
}
