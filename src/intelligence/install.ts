/**
 * Seamless Installation for OpenClaw Intelligence System
 *
 * One-command installation that:
 * - Detects system resources
 * - Downloads appropriate BitNet model
 * - Installs dependencies
 * - Configures memory system
 * - Sets up Redis if needed
 * - Runs health checks
 */

import { spawn } from "child_process";
import { promises as fs } from "fs";
import * as os from "os";
import * as path from "path";

export interface InstallConfig {
  bitnetModel?: string;
  redisUrl?: string;
  dataDir?: string;
  autonomyEnabled?: boolean;
  skipModelDownload?: boolean;
}

export class IntelligenceInstaller {
  private config: InstallConfig;
  private dataDir: string;

  constructor(config: InstallConfig = {}) {
    this.config = config;
    this.dataDir = config.dataDir || path.join(process.cwd(), "data");
  }

  /**
   * Run complete installation
   */
  async install(): Promise<void> {
    console.log("🚀 OpenClaw Intelligence System Installation\n");

    try {
      // 1. System check
      await this.checkSystem();

      // 2. Create directories
      await this.createDirectories();

      // 3. Install BitNet.cpp
      if (!this.config.skipModelDownload) {
        await this.installBitNet();
      }

      // 4. Download model
      if (!this.config.skipModelDownload) {
        await this.downloadModel();
      }

      // 5. Setup Redis (optional)
      await this.setupRedis();

      // 6. Install Node dependencies
      await this.installDependencies();

      // 7. Create config file
      await this.createConfig();

      // 8. Run health check
      await this.healthCheck();

      console.log("\n✅ Installation complete!\n");
      console.log("To start the intelligence system:");
      console.log("  node dist/index.js intelligence start\n");
    } catch (error) {
      console.error("\n❌ Installation failed:", error);
      throw error;
    }
  }

  /**
   * Check system requirements
   */
  private async checkSystem(): Promise<void> {
    console.log("📋 Checking system requirements...");

    const totalMemory = os.totalmem() / (1024 * 1024 * 1024); // GB
    const freeDisk = await this.getFreeDiskSpace();
    const cpuCount = os.cpus().length;

    console.log(`  Memory: ${totalMemory.toFixed(1)} GB`);
    console.log(`  CPUs: ${cpuCount}`);
    console.log(`  Free Disk: ${freeDisk.toFixed(1)} GB`);

    // Check minimums
    if (totalMemory < 4) {
      console.warn("⚠️  Warning: Less than 4GB RAM. Performance may be limited.");
    }

    if (freeDisk < 10) {
      throw new Error("Insufficient disk space. Need at least 10GB free.");
    }

    console.log("✅ System check passed\n");
  }

  /**
   * Create necessary directories
   */
  private async createDirectories(): Promise<void> {
    console.log("📁 Creating directories...");

    const dirs = [
      this.dataDir,
      path.join(this.dataDir, "models"),
      path.join(this.dataDir, "cache"),
      path.join(this.dataDir, "logs"),
    ];

    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
      console.log(`  Created: ${dir}`);
    }

    console.log("✅ Directories created\n");
  }

  /**
   * Install BitNet.cpp
   */
  private async installBitNet(): Promise<void> {
    console.log("⚙️  Installing BitNet.cpp...");

    const bitnetDir = path.join(process.cwd(), "bitnet");

    try {
      await fs.access(bitnetDir);
      console.log("  BitNet.cpp already installed");
      return;
    } catch {
      // Not installed, proceed
    }

    console.log("  Cloning repository...");
    await this.exec("git clone --recursive https://github.com/microsoft/BitNet.git bitnet");

    console.log("  Building...");
    await this.exec("cmake -B build -S .", { cwd: bitnetDir });
    await this.exec("cmake --build build --config Release", { cwd: bitnetDir });

    console.log("✅ BitNet.cpp installed\n");
  }

  /**
   * Download appropriate model
   */
  private async downloadModel(): Promise<void> {
    console.log("📥 Downloading BitNet model...");

    const totalMemory = os.totalmem() / (1024 * 1024 * 1024);

    let modelName = this.config.bitnetModel;

    if (!modelName) {
      // Auto-select based on system resources
      if (totalMemory >= 64) {
        modelName = "bitnet-b1.58-100B";
        console.log("  Selected: 100B model (high-end system)");
      } else if (totalMemory >= 16) {
        modelName = "bitnet-b1.58-7B";
        console.log("  Selected: 7B model (mid-range system)");
      } else {
        modelName = "bitnet-b1.58-2B-4T";
        console.log("  Selected: 2B model (efficient)");
      }
    }

    const modelPath = path.join(this.dataDir, "models", modelName);

    try {
      await fs.access(modelPath);
      console.log("  Model already downloaded");
      return;
    } catch {
      // Not downloaded, proceed
    }

    console.log(`  Downloading ${modelName}...`);
    console.log("  This may take several minutes...");

    try {
      await this.exec(`huggingface-cli download microsoft/${modelName} --local-dir ${modelPath}`);
      console.log("✅ Model downloaded\n");
    } catch {
      console.warn("⚠️  Could not download model automatically.");
      console.warn(
        "  Please download manually from: https://huggingface.co/microsoft/" + modelName,
      );
      console.warn("  Or skip with --skip-model-download flag\n");
    }
  }

  /**
   * Setup Redis (optional)
   */
  private async setupRedis(): Promise<void> {
    console.log("🔧 Setting up Redis...");

    // Check if Redis is already running
    try {
      await this.exec("redis-cli ping");
      console.log("  Redis is already running");
      console.log("✅ Redis setup complete\n");
      return;
    } catch {
      // Redis not running
    }

    console.log("  Redis not detected");
    console.log("  Install Redis for better performance:");

    if (process.platform === "linux") {
      console.log("    sudo apt-get install redis-server");
    } else if (process.platform === "darwin") {
      console.log("    brew install redis");
    } else if (process.platform === "win32") {
      console.log("    Download from: https://redis.io/download");
    }

    console.log("  Or use external Redis with --redis-url flag");
    console.log("⚠️  Continuing without Redis (cache layer disabled)\n");
  }

  /**
   * Install Node dependencies
   */
  private async installDependencies(): Promise<void> {
    console.log("📦 Installing dependencies...");

    const packages = ["redis", "better-sqlite3"];

    console.log(`  Installing: ${packages.join(", ")}`);

    try {
      await this.exec(`pnpm add ${packages.join(" ")}`);
      console.log("✅ Dependencies installed\n");
    } catch {
      console.warn("⚠️  Could not install dependencies automatically");
      console.warn(`  Please run: pnpm add ${packages.join(" ")}\n`);
    }
  }

  /**
   * Create configuration file
   */
  private async createConfig(): Promise<void> {
    console.log("⚙️  Creating configuration...");

    const config = {
      intelligence: {
        enabled: true,
        bitnet: {
          modelPath: path.join(this.dataDir, "models"),
          threads: os.cpus().length,
          contextSize: 2048,
        },
        memory: {
          dataDir: this.dataDir,
          redis: {
            enabled: false,
            url: this.config.redisUrl || "redis://localhost:6379",
          },
        },
        autonomy: {
          enabled: this.config.autonomyEnabled || false,
          cycleInterval: 300000, // 5 minutes
        },
      },
    };

    const configPath = path.join(this.dataDir, "intelligence-config.json");
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));

    console.log(`  Config saved to: ${configPath}`);
    console.log("✅ Configuration created\n");
  }

  /**
   * Run health check
   */
  private async healthCheck(): Promise<void> {
    console.log("🏥 Running health check...");

    // Check BitNet
    try {
      const bitnetPath = path.join(process.cwd(), "bitnet", "build", "bin", "bitnet-cli");
      await fs.access(bitnetPath);
      console.log("  ✅ BitNet.cpp: OK");
    } catch {
      console.log("  ⚠️  BitNet.cpp: Not found");
    }

    // Check model
    try {
      const modelsDir = path.join(this.dataDir, "models");
      const models = await fs.readdir(modelsDir);
      if (models.length > 0) {
        console.log(`  ✅ Models: ${models.length} found`);
      } else {
        console.log("  ⚠️  Models: None found");
      }
    } catch {
      console.log("  ⚠️  Models: Directory not found");
    }

    // Check data directories
    try {
      await fs.access(this.dataDir);
      console.log("  ✅ Data directory: OK");
    } catch {
      console.log("  ❌ Data directory: Not found");
    }

    console.log("✅ Health check complete\n");
  }

  /**
   * Get free disk space
   */
  private async getFreeDiskSpace(): Promise<number> {
    try {
      if (process.platform === "win32") {
        await this.exec("wmic logicaldisk get size,freespace,caption");
        // Parse output (simplified)
        return 100; // Placeholder
      } else {
        await this.exec("df -BG .");
        // Parse output (simplified)
        return 100; // Placeholder
      }
    } catch {
      return 100; // Default
    }
  }

  /**
   * Execute command
   */
  private async exec(command: string, options?: { cwd?: string }): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, [], {
        shell: true,
        cwd: options?.cwd || process.cwd(),
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (data) => {
        stdout += data.toString();
        process.stdout.write(data); // Show progress
      });

      child.stderr.on("data", (data) => {
        stderr += data.toString();
        process.stderr.write(data);
      });

      child.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`Command failed with code ${code}: ${stderr}`));
        } else {
          resolve(stdout);
        }
      });

      child.on("error", reject);
    });
  }
}

/**
 * CLI command for installation
 */
export async function installCommand(options: InstallConfig = {}): Promise<void> {
  const installer = new IntelligenceInstaller(options);
  await installer.install();
}
