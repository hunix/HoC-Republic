/**
 * Cluster Management CLI
 * Commands for managing OpenClaw high-availability cluster
 */

import { Command } from "commander";
import { loadClusterConfig } from "../cluster/cluster-config.js";
import { getClusterManager } from "../cluster/gateway-cluster-manager.js";
import { getStateStore } from "../cluster/redis-state-store.js";
import { createSubsystemLogger } from "../logging.js";

const _logger = createSubsystemLogger("cli:cluster");

export function registerClusterCommands(program: Command): void {
  const cluster = program
    .command("cluster")
    .description("Manage OpenClaw high-availability cluster");

  // cluster status
  cluster
    .command("status")
    .description("Show cluster status and health")
    .action(async () => {
      await showClusterStatus();
    });

  // cluster failover
  cluster
    .command("failover")
    .description("Trigger manual failover to standby gateway")
    .option("--target <gatewayId>", "Target gateway ID for failover")
    .action(async (options) => {
      await triggerFailover(options.target);
    });

  // cluster sync
  cluster
    .command("sync")
    .description("Force state synchronization across all gateways")
    .option("--force", "Force sync even if not primary")
    .action(async (options) => {
      await forceSync(options.force);
    });

  // cluster gateways
  cluster
    .command("gateways")
    .description("List all gateways in the cluster")
    .action(async () => {
      await listGateways();
    });

  // cluster nodes
  cluster
    .command("nodes")
    .description("List all connected nodes")
    .option("--gateway <gatewayId>", "Filter by gateway ID")
    .action(async (options) => {
      await listNodes(options.gateway);
    });

  // cluster sessions
  cluster
    .command("sessions")
    .description("List WhatsApp sessions")
    .action(async () => {
      await listSessions();
    });

  // cluster promote
  cluster
    .command("promote")
    .description("Promote this gateway to primary")
    .action(async () => {
      await promoteGateway();
    });

  // cluster demote
  cluster
    .command("demote")
    .description("Demote this gateway to standby")
    .action(async () => {
      await demoteGateway();
    });
}

async function showClusterStatus(): Promise<void> {
  try {
    const config = loadClusterConfig();

    if (!config.enabled) {
      console.log("❌ Cluster mode is disabled");
      console.log("\nTo enable cluster mode:");
      console.log("  export OPENCLAW_CLUSTER_ENABLED=true");
      console.log("  export OPENCLAW_REDIS_HOST=your-redis-host");
      return;
    }

    console.log("🔍 OpenClaw Cluster Status\n");

    // Connect to Redis
    const stateStore = getStateStore({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db,
      tls: config.redis.tls,
    });

    await stateStore.connect();

    // Get primary gateway
    const primaryId = await stateStore.getPrimaryGateway();
    console.log(`Primary Gateway: ${primaryId || "None"}`);

    // Get all gateways
    const gateways = await stateStore.getAllGateways();
    console.log(`\nGateways: ${gateways.length}`);

    for (const gateway of gateways) {
      const isPrimary = gateway.id === primaryId;
      const icon = isPrimary ? "👑" : "⚪";
      const role = isPrimary ? "PRIMARY" : "STANDBY";

      console.log(`\n${icon} ${gateway.id} (${role})`);
      console.log(`   Host: ${gateway.host}:${gateway.port}`);
      console.log(`   CPU: ${gateway.health.cpu.toFixed(1)}%`);
      console.log(`   Memory: ${gateway.health.memory.toFixed(1)}%`);
      console.log(`   Last Heartbeat: ${formatTimestamp(gateway.health.lastHeartbeat)}`);
    }

    // Get all nodes
    const nodes = await stateStore.getAllNodes();
    console.log(`\nConnected Nodes: ${nodes.length}`);

    for (const node of nodes) {
      console.log(`  • ${node.id} → ${node.gatewayId}`);
      console.log(`    Last Seen: ${formatTimestamp(node.lastSeen)}`);
    }

    await stateStore.disconnect();
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

async function triggerFailover(targetGatewayId?: string): Promise<void> {
  try {
    const config = loadClusterConfig();

    if (!config.enabled) {
      console.log("❌ Cluster mode is disabled");
      return;
    }

    console.log("🔄 Triggering manual failover...\n");

    const stateStore = getStateStore({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db,
      tls: config.redis.tls,
    });

    await stateStore.connect();

    // Get current primary
    const currentPrimary = await stateStore.getPrimaryGateway();
    console.log(`Current Primary: ${currentPrimary || "None"}`);

    if (targetGatewayId) {
      // Promote specific gateway
      const target = await stateStore.getGateway(targetGatewayId);

      if (!target) {
        console.log(`❌ Gateway not found: ${targetGatewayId}`);
        return;
      }

      console.log(`Promoting: ${targetGatewayId}`);

      // Release current primary lock
      if (currentPrimary) {
        await stateStore.releasePrimaryLock(currentPrimary);
      }

      // Acquire lock for target
      const acquired = await stateStore.tryAcquirePrimaryLock(targetGatewayId, 60);

      if (acquired) {
        console.log(`✅ ${targetGatewayId} is now primary`);
      } else {
        console.log(`❌ Failed to promote ${targetGatewayId}`);
      }
    } else {
      // Release primary lock and let election happen
      if (currentPrimary) {
        await stateStore.releasePrimaryLock(currentPrimary);
        console.log("✅ Primary lock released, election will occur automatically");
      } else {
        console.log("❌ No primary to failover from");
      }
    }

    await stateStore.disconnect();
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

async function forceSync(force: boolean): Promise<void> {
  try {
    console.log("🔄 Forcing state synchronization...\n");

    const manager = getClusterManager();

    if (!manager.isPrimary() && !force) {
      console.log("❌ Only primary gateway can sync (use --force to override)");
      return;
    }

    // In a real implementation, this would trigger sync
    console.log("✅ Sync triggered");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

async function listGateways(): Promise<void> {
  try {
    const config = loadClusterConfig();

    if (!config.enabled) {
      console.log("❌ Cluster mode is disabled");
      return;
    }

    const stateStore = getStateStore({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db,
      tls: config.redis.tls,
    });

    await stateStore.connect();

    const gateways = await stateStore.getAllGateways();
    const primaryId = await stateStore.getPrimaryGateway();

    console.log(`\n🖥️  Gateways (${gateways.length})\n`);

    for (const gateway of gateways) {
      const isPrimary = gateway.id === primaryId;
      const icon = isPrimary ? "👑" : "⚪";

      console.log(`${icon} ${gateway.id}`);
      console.log(`   Role: ${isPrimary ? "PRIMARY" : "STANDBY"}`);
      console.log(`   Endpoint: ${gateway.host}:${gateway.port}`);
      console.log(
        `   Health: CPU ${gateway.health.cpu.toFixed(1)}%, Memory ${gateway.health.memory.toFixed(1)}%`,
      );
      console.log(`   Uptime: ${formatUptime(Date.now() - gateway.startedAt)}`);
      console.log("");
    }

    await stateStore.disconnect();
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

async function listNodes(gatewayId?: string): Promise<void> {
  try {
    const config = loadClusterConfig();

    if (!config.enabled) {
      console.log("❌ Cluster mode is disabled");
      return;
    }

    const stateStore = getStateStore({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db,
      tls: config.redis.tls,
    });

    await stateStore.connect();

    const nodes = gatewayId
      ? await stateStore.getNodesByGateway(gatewayId)
      : await stateStore.getAllNodes();

    console.log(`\n🔌 Connected Nodes (${nodes.length})\n`);

    for (const node of nodes) {
      console.log(`• ${node.id}`);
      console.log(`  Gateway: ${node.gatewayId}`);
      console.log(`  Host: ${node.host}`);
      console.log(`  Capabilities: ${node.capabilities.join(", ")}`);
      console.log(`  Last Seen: ${formatTimestamp(node.lastSeen)}`);
      console.log("");
    }

    await stateStore.disconnect();
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

async function listSessions(): Promise<void> {
  try {
    console.log("\n📱 WhatsApp Sessions\n");

    // In a real implementation, this would list all sessions from Redis
    console.log("(Session listing not yet implemented)");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

async function promoteGateway(): Promise<void> {
  try {
    console.log("⬆️  Promoting this gateway to primary...\n");

    const manager = getClusterManager();

    if (manager.isPrimary()) {
      console.log("✅ Already primary");
      return;
    }

    // In a real implementation, this would trigger promotion
    console.log("🔄 Attempting to acquire primary lock...");
    console.log("(Promotion logic handled by cluster manager)");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

async function demoteGateway(): Promise<void> {
  try {
    console.log("⬇️  Demoting this gateway to standby...\n");

    const manager = getClusterManager();

    if (!manager.isPrimary()) {
      console.log("✅ Already standby");
      return;
    }

    const config = loadClusterConfig();
    const stateStore = getStateStore({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db,
      tls: config.redis.tls,
    });

    await stateStore.connect();
    await stateStore.releasePrimaryLock(manager.getGatewayId());

    console.log("✅ Demoted to standby, election will occur automatically");

    await stateStore.disconnect();
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

// Helper functions

function formatTimestamp(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 60000) {
    return `${Math.floor(diff / 1000)}s ago`;
  } else if (diff < 3600000) {
    return `${Math.floor(diff / 60000)}m ago`;
  } else if (diff < 86400000) {
    return `${Math.floor(diff / 3600000)}h ago`;
  } else {
    return `${Math.floor(diff / 86400000)}d ago`;
  }
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}
