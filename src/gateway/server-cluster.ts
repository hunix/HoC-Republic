/**
 * Gateway Cluster Integration
 * Initializes and manages cluster functionality for high-availability deployments
 *
 * Fixes applied:
 * - Uses `getClusterManager()` singleton instead of creating a duplicate instance
 * - Uses `loadClusterConfigWithAutoDetect()` for seamless auto-clustering
 * - NodeDiscovery gets consistent gatewayId from cluster manager
 * - NodeDiscovery gets role dynamically from cluster manager
 */

import { loadClusterConfigWithAutoDetect } from "../cluster/cluster-config.js";
import { getClusterManager, resetClusterManager } from "../cluster/gateway-cluster-manager.js";
import { NodeDiscovery } from "../cluster/node-discovery.js";
import { resetStateStore } from "../cluster/redis-state-store.js";
import { WhatsAppSessionManager } from "../cluster/whatsapp-session-manager.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("cluster");

export interface ClusterServices {
  clusterManager?: ReturnType<typeof getClusterManager>;
  nodeDiscovery?: NodeDiscovery;
  whatsappSessionManager?: WhatsAppSessionManager;
  isEnabled: boolean;
}

/**
 * Initialize cluster services if enabled.
 * Uses auto-detection: if Redis is reachable, clustering is automatically enabled.
 */
export async function initializeClusterServices(): Promise<ClusterServices> {
  try {
    const config = await loadClusterConfigWithAutoDetect();

    if (!config.enabled) {
      log.info("Cluster mode disabled (Redis not available or explicitly disabled)");
      return { isEnabled: false };
    }

    log.info("Initializing cluster services...");

    // Use the singleton cluster manager (not a new instance)
    const clusterManager = getClusterManager();
    await clusterManager.start();

    // Initialize node discovery with consistent gatewayId from the cluster manager,
    // and a roleGetter that dynamically returns the current role
    const gatewayPort = parseInt(process.env.OPENCLAW_GATEWAY_PORT || "18789", 10);
    const nodeDiscovery = new NodeDiscovery(
      true,
      clusterManager.getGatewayId(),
      gatewayPort,
      () => clusterManager.getRole(),
    );
    await nodeDiscovery.start();

    // Initialize WhatsApp session manager
    const whatsappSessionManager = new WhatsAppSessionManager();

    log.info("Cluster services initialized successfully");

    return {
      clusterManager,
      nodeDiscovery,
      whatsappSessionManager,
      isEnabled: true,
    };
  } catch (error) {
    log.warn("Cluster services unavailable, running in standalone mode", {
      reason: error instanceof Error ? error.message : String(error),
    });
    // Graceful fallback: if cluster init fails, run in standalone mode
    return { isEnabled: false };
  }
}

/**
 * Shutdown cluster services gracefully
 */
export async function shutdownClusterServices(services: ClusterServices): Promise<void> {
  if (!services.isEnabled) {
    return;
  }

  try {
    log.info("Shutting down cluster services...");

    await Promise.all([
      services.clusterManager?.stop(),
      services.nodeDiscovery?.stop(),
    ]);

    // Reset singletons
    resetClusterManager();
    resetStateStore();

    log.info("Cluster services shut down successfully");
  } catch (error) {
    log.error("Error shutting down cluster services", { error });
  }
}

/**
 * Check if this gateway is the cluster leader
 */
export function isClusterLeader(services: ClusterServices): boolean {
  if (!services.isEnabled || !services.clusterManager) {
    return true; // Non-clustered gateways are always "leaders"
  }

  return services.clusterManager.isPrimary();
}

/**
 * Get cluster health status
 */
export async function getClusterHealth(services: ClusterServices): Promise<Record<string, unknown>> {
  if (!services.isEnabled) {
    return { enabled: false };
  }

  try {
    const discoveredGateways = services.nodeDiscovery?.getDiscoveredGateways();

    return {
      enabled: true,
      isLeader: services.clusterManager?.isPrimary(),
      role: services.clusterManager?.isPrimary() ? "primary" : "standby",
      gatewayId: services.clusterManager?.getGatewayId(),
      discoveredGateways,
    };
  } catch (error) {
    log.warn("Error getting cluster health", { error: error instanceof Error ? error.message : String(error) });
    return { enabled: true, error: String(error) };
  }
}
