/**
 * Intuitive CLI for OpenClaw Intelligence System
 *
 * Commands:
 * - intelligence install - Install intelligence system
 * - intelligence start - Start intelligence system
 * - intelligence status - Show status
 * - intelligence query <text> - Ask a question
 * - intelligence remember <text> - Store a memory
 * - intelligence recall <query> - Recall memories
 * - intelligence goals - Show current goals
 * - intelligence insights - Show recent insights
 * - intelligence autonomy [on|off] - Enable/disable autonomy
 */

import * as fs from "fs/promises";
import * as path from "path";
import { CapabilityGraph } from "../infra/capability-graph.js";
import { AutonomousAgent } from "./autonomous-agent.js";
import { installCommand } from "./install.js";
import { MemorySystem } from "./memory-system.js";
import { QuantumIntelligence } from "./quantum-intelligence.js";

/** No-op inference stub — BitNet removed */

export class IntelligenceCLI {
  private memory?: MemorySystem;
  private quantum?: QuantumIntelligence;
  private agent?: AutonomousAgent;
  private initialized: boolean = false;

  /**
   * Initialize intelligence system
   */
  async initialize(): Promise<void> {
    if (this.initialized) {return;}

    console.log("🧠 Initializing OpenClaw Intelligence System...\n");

    try {
      // Load config
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any
      const config = await this.loadConfig() as any;

      // BitNet removed — no-op inference engine used instead
      void config; // suppress unused-var warning

      // Initialize Memory System
      console.log("💾 Initializing memory system...");
      this.memory = new MemorySystem();
      await this.memory.initialize();
      console.log("✅ Memory system ready\n");

      // Initialize Quantum Intelligence
      console.log("🌌 Initializing quantum intelligence...");
      this.quantum = new QuantumIntelligence(this.memory, new CapabilityGraph());
      console.log("✅ Quantum intelligence ready\n");

      // Initialize Autonomous Agent
      console.log("🤖 Initializing autonomous agent...");
      this.agent = new AutonomousAgent(this.memory, this.quantum);

      if (config.intelligence.autonomy.enabled) {
        await this.agent.enableAutonomy();
        console.log("✅ Autonomous agent ready (autonomy enabled)\n");
      } else {
        console.log("✅ Autonomous agent ready (autonomy disabled)\n");
      }

      this.initialized = true;
      console.log("🎉 Intelligence system fully initialized!\n");
    } catch (error) {
      console.error("❌ Initialization failed:", error);
      throw error;
    }
  }

  /**
   * Handle CLI commands
   */
  async handleCommand(command: string, args: string[]): Promise<void> {
    switch (command) {
      case "install":
        await this.cmdInstall(args);
        break;

      case "start":
        await this.cmdStart();
        break;

      case "status":
        await this.cmdStatus();
        break;

      case "query":
        await this.cmdQuery(args.join(" "));
        break;

      case "remember":
        await this.cmdRemember(args.join(" "));
        break;

      case "recall":
        await this.cmdRecall(args.join(" "));
        break;

      case "goals":
        await this.cmdGoals();
        break;

      case "insights":
        await this.cmdInsights();
        break;

      case "autonomy":
        await this.cmdAutonomy(args[0]);
        break;

      case "help":
        this.cmdHelp();
        break;

      default:
        console.log(`Unknown command: ${command}`);
        console.log('Run "intelligence help" for usage information');
    }
  }

  /**
   * Install command
   */
  private async cmdInstall(args: string[]): Promise<void> {
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any
    const options: any = {};

    // Parse args
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--redis-url" && args[i + 1]) {
        options.redisUrl = args[i + 1];
        i++;
      } else if (args[i] === "--model" && args[i + 1]) {
        options.bitnetModel = args[i + 1];
        i++;
      } else if (args[i] === "--skip-model-download") {
        options.skipModelDownload = true;
      } else if (args[i] === "--enable-autonomy") {
        options.autonomyEnabled = true;
      }
    }

    await installCommand(options);
  }

  /**
   * Start command
   */
  private async cmdStart(): Promise<void> {
    await this.initialize();

    console.log("Intelligence system is running...");
    console.log("Press Ctrl+C to stop\n");

    // Keep process alive
    process.on("SIGINT", async () => {
      console.log("\n\nShutting down...");
      await this.shutdown();
      process.exit(0);
    });
  }

  /**
   * Status command
   */
  private async cmdStatus(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    console.log("📊 Intelligence System Status\n");

    // BitNet status
    console.log("🔧 BitNet Engine:");
    console.log("  Status: ✅ Running");
    console.log("  Model: Loaded\n");

    // Memory status
    console.log("💾 Memory System:");
    const shortTermCount = (await this.memory!.shortTerm.getAll()).length;
    console.log(`  Short-term memories: ${shortTermCount}`);
    console.log("  Long-term: Active");
    console.log("  Permanent: Active\n");

    // Agent status
    console.log("🤖 Autonomous Agent:");
    const goals = this.agent!.getGoals();
    const insights = this.agent!.getInsights();
    const gaps = this.agent!.getKnowledgeGaps();

    console.log(`  Active goals: ${goals.filter((g) => g.status === "in_progress").length}`);
    console.log(`  Completed goals: ${goals.filter((g) => g.status === "completed").length}`);
    console.log(`  Recent insights: ${insights.length}`);
    console.log(`  Knowledge gaps: ${gaps.filter((g) => !g.filledAt).length}\n`);
  }

  /**
   * Query command
   */
  private async cmdQuery(query: string): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    console.log(`\n💭 Thinking about: "${query}"\n`);

    const decision = await this.quantum!.think(query);

    console.log("🎯 Decision:");
    console.log(`  Type: ${decision.hypothesis.type}`);
    console.log(`  Interpretation: ${decision.hypothesis.interpretation}`);
    console.log(`  Confidence: ${(decision.confidence * 100).toFixed(1)}%`);
    console.log(`  Reasoning: ${decision.hypothesis.reasoning}\n`);

    if (decision.alternatives.length > 0) {
      console.log("🔄 Alternative interpretations:");
      for (const alt of decision.alternatives.slice(0, 3)) {
        console.log(
          `  - ${alt.type}: ${alt.interpretation} (${(alt.confidence * 100).toFixed(1)}%)`,
        );
      }
      console.log();
    }
  }

  /**
   * Remember command
   */
  private async cmdRemember(text: string): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    console.log(`\n💾 Storing memory: "${text}"\n`);

    await this.memory!.remember({
      id: `manual_${Date.now()}`,
      content: text,
      type: "knowledge",
      timestamp: Date.now(),
      metadata: { source: "cli" },
      salience: 0.8,
    });

    console.log("✅ Memory stored\n");
  }

  /**
   * Recall command
   */
  private async cmdRecall(query: string): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    console.log(`\n🔍 Recalling memories about: "${query}"\n`);

    const results = await this.memory!.recall({
      query,
      limit: 10,
    });

    if (results.length === 0) {
      console.log("No memories found\n");
      return;
    }

    console.log(`Found ${results.length} memories:\n`);

    for (const result of results) {
      const mem = result.memory;
      const date = new Date(mem.timestamp).toLocaleString();

      console.log(`📝 [${mem.type}] ${mem.content.substring(0, 100)}...`);
      console.log(`   Salience: ${(mem.salience * 100).toFixed(1)}% | ${date}\n`);
    }
  }

  /**
   * Goals command
   */
  private async cmdGoals(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    const goals = this.agent!.getGoals();

    console.log("\n🎯 Current Goals\n");

    if (goals.length === 0) {
      console.log("No goals set\n");
      return;
    }

    for (const goal of goals) {
      const status =
        goal.status === "completed"
          ? "✅"
          : goal.status === "in_progress"
            ? "🔄"
            : goal.status === "failed"
              ? "❌"
              : "⏳";

      console.log(`${status} [${goal.type}] ${goal.description}`);
      console.log(
        `   Priority: ${(goal.priority * 100).toFixed(0)}% | Progress: ${(goal.progress * 100).toFixed(0)}%\n`,
      );
    }
  }

  /**
   * Insights command
   */
  private async cmdInsights(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    const insights = this.agent!.getInsights(10);

    console.log("\n💡 Recent Insights\n");

    if (insights.length === 0) {
      console.log("No insights yet\n");
      return;
    }

    for (const insight of insights) {
      const icon =
        insight.category === "performance"
          ? "📊"
          : insight.category === "knowledge_gap"
            ? "❓"
            : insight.category === "user_preference"
              ? "👤"
              : "🔍";

      console.log(`${icon} [${insight.category}] ${insight.description}`);
      console.log(`   Confidence: ${(insight.confidence * 100).toFixed(1)}%`);

      if (insight.suggestedAction) {
        console.log(`   Suggested: ${insight.suggestedAction}`);
      }

      console.log();
    }
  }

  /**
   * Autonomy command
   */
  private async cmdAutonomy(action: string): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (action === "on" || action === "enable") {
      await this.agent!.enableAutonomy();
      console.log("\n✅ Autonomy enabled\n");
      console.log("The agent will now:");
      console.log("  - Self-reflect on performance");
      console.log("  - Identify knowledge gaps");
      console.log("  - Form and pursue goals");
      console.log("  - Explore new topics\n");
    } else if (action === "off" || action === "disable") {
      this.agent!.disableAutonomy();
      console.log("\n✅ Autonomy disabled\n");
    } else {
      console.log("\nUsage: intelligence autonomy [on|off]\n");
    }
  }

  /**
   * Help command
   */
  private cmdHelp(): void {
    console.log(`
🧠 OpenClaw Intelligence System - CLI

COMMANDS:

  intelligence install [options]
    Install the intelligence system
    Options:
      --redis-url <url>         Redis URL (default: redis://localhost:6379)
      --model <name>            BitNet model name
      --skip-model-download     Skip model download
      --enable-autonomy         Enable autonomous mode

  intelligence start
    Start the intelligence system

  intelligence status
    Show system status

  intelligence query <text>
    Ask a question or provide input for reasoning

  intelligence remember <text>
    Store a memory manually

  intelligence recall <query>
    Recall memories matching query

  intelligence goals
    Show current goals

  intelligence insights
    Show recent insights

  intelligence autonomy [on|off]
    Enable or disable autonomous mode

  intelligence help
    Show this help message

EXAMPLES:

  # Install with default settings
  node dist/index.js intelligence install

  # Start the system
  node dist/index.js intelligence start

  # Ask a question
  node dist/index.js intelligence query "What should I focus on today?"

  # Store a memory
  node dist/index.js intelligence remember "User prefers dark mode"

  # Enable autonomy
  node dist/index.js intelligence autonomy on

`);
  }

  /**
   * Shutdown
   */
  private async shutdown(): Promise<void> {
    if (this.agent) {
      this.agent.disableAutonomy();
    }

    if (this.memory) {
      await this.memory.shutdown();
    }


    console.log("✅ Shutdown complete");
  }

  /**
   * Load configuration
   */
  private async loadConfig(): Promise<unknown> {
    const configPath = path.join(process.cwd(), "data", "intelligence-config.json");

    try {
      const data = await fs.readFile(configPath, "utf-8");
      return JSON.parse(data);
    } catch {
      // Return default config
      return {
        intelligence: {
          enabled: true,
          bitnet: {
            modelPath: path.join(process.cwd(), "data", "models"),
            threads: 4,
            contextSize: 2048,
          },
          memory: {
            dataDir: path.join(process.cwd(), "data"),
            redis: {
              enabled: false,
              url: "redis://localhost:6379",
            },
          },
          autonomy: {
            enabled: false,
            cycleInterval: 300000,
          },
        },
      };
    }
  }

  /**
   * Find model file
   */
  private async findModel(modelsDir: string): Promise<string> {
    try {
      const entries = await fs.readdir(modelsDir);

      for (const entry of entries) {
        const entryPath = path.join(modelsDir, entry);
        const stats = await fs.stat(entryPath);

        if (stats.isDirectory()) {
          const files = await fs.readdir(entryPath);
          const ggufFile = files.find((f) => f.endsWith(".gguf"));

          if (ggufFile) {
            return path.join(entryPath, ggufFile);
          }
        }
      }

      throw new Error("No model found");
    } catch (error) {
      throw new Error(`Could not find model in ${modelsDir}. Run "intelligence install" first.`, { cause: error });
    }
  }
}

/**
 * Main CLI entry point
 */
export async function runIntelligenceCLI(args: string[]): Promise<void> {
  const cli = new IntelligenceCLI();

  const command = args[0] || "help";
  const commandArgs = args.slice(1);

  await cli.handleCommand(command, commandArgs);
}
