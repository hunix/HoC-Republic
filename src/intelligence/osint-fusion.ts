import { createSubsystemLogger } from "../logging/subsystem.js";
import { intelligenceBus } from "../republic/intelligence-bus.js";
import { ts } from "../republic/utils.js";
import { getCIIScores, detectConvergences } from "../republic/world-intelligence.js";

const logger = createSubsystemLogger("osint-fusion");

export interface ArgusThreatBrief {
  id: string;
  level: "low" | "elevated" | "high" | "critical";
  category: "cyber" | "economic" | "geopolitical" | "technological" | "unknown";
  summary: string;
  confidence: number;
  sources: string[];
  recommendedAction: string;
  timestamp: string;
}

// Ensure the bus knows about us
declare module "../republic/intelligence-bus.js" {
  interface IntelligenceBusEventMap {
    "project.argus.threat_detected": {
      threats: ArgusThreatBrief[];
      globalCii: number;
    };
  }
}

export interface OsintFusionResult {
  activeThreats: ArgusThreatBrief[];
  globalSentiment: number; // 0 (chaos) to 1 (stability)
  lastScanTimestamp: string;
}

/**
 * PROJECT ARGUS (Global OSINT Data Fusion & Predictive Intelligence)
 * 
 * NSA/CIA-inspired intelligence gathering.
 * Argus acts as an overarching radar, scanning external real-world news feeds,
 * financial market trends, and technological papers through the WorldIntelligence system.
 * 
 * It fuses these disparate feeds to detect "convergences" (e.g. "tech + finance crash")
 * and generates actionable ArgusThreatBriefs for the Republic's government to act upon.
 */
class OsintFusionEngine {
  private activeThreats: ArgusThreatBrief[] = [];
  private scanInterval: NodeJS.Timeout | null = null;
  private lastScanTimestamp: string = ts();
  private isActive: boolean = false;
  private lastGlobalCii: number = 50;

  constructor() {
    logger.info("Project Argus initialized: OSINT fusion engine online.");
  }

  /**
   * Start the continuous OSINT scanning loop.
   */
  public startScanning() {
    if (this.scanInterval) {
      return;
    }
    this.isActive = true;

    // Run a deep scan every 30 minutes in real-time
    this.scanInterval = setInterval(() => {
      this.runDeepScan().catch((err) => {
        logger.error(`Argus deep scan failed: ${err}`);
      });
    }, 30 * 60 * 1000);

    // Initial scan
    this.runDeepScan();
  }

  public stopScanning() {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
      this.isActive = false;
      logger.info("Project Argus offline.");
    }
  }

  /**
   * Execute a full sweep of all connected OSINT data streams
   * (News, Markets, Tech) to synthesize predictive intelligence.
   */
  public async runDeepScan(): Promise<void> {
    logger.info("Initiating Argus Deep Scan protocol...");
    
    try {
      // 1. Ingest raw streams
      const cii = getCIIScores();
      const convergences = detectConvergences();
      
      const newThreats: ArgusThreatBrief[] = [];

      // 2. Synthesize Threat Intelligence
      // Analyze the raw convergences from WorldIntelligence and elevate them into actionable Threat Briefs.
      for (const conv of convergences) {
        // We synthesize based on convergence weight 
        if (conv.maxSeverity === "high" || conv.maxSeverity === "critical") {
          // Critical threat detected
          newThreats.push({
            id: `argus-threat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            level: conv.maxSeverity === "critical" ? "critical" : "high",
            category: "geopolitical", // Extrapolate from convergence type in a real impl
            summary: `High-confidence multi-domain convergence detected: ${conv.description}. Requires immediate strategic review.`,
            confidence: conv.maxSeverity === "critical" ? 0.95 : 0.85,
            sources: ["WorldIntelligence", "News Vector Store"],
            recommendedAction: "Alert Executive Node. Prepare counter-measures or hedge treasury assets.",
            timestamp: ts()
          });
        }
      }

      // 3. Update internal state
      this.activeThreats = [...newThreats, ...this.activeThreats].slice(0, 20); // Keep last 20 active threats
      this.lastScanTimestamp = ts();
      if (cii[0]) {
        this.lastGlobalCii = cii[0].ciiScore;
      }

      // 4. Publish to Intelligence Bus for autonomous agents (Government, Spies) to intercept
      if (newThreats.length > 0) {
        logger.warn(`Project Argus: ${newThreats.length} new high-level threats detected.`);
        intelligenceBus.publish("project.argus.threat_detected", {
          threats: newThreats,
          globalCii: this.lastGlobalCii,
        });
      }
      
    } catch (error) {
       logger.error(`Error during Argus synthesis: ${error}`);
    }
  }

  public getDiagnostics(): OsintFusionResult {
    // Estimate global sentiment based on threat levels
    // 100% stable minus 10% per 'critical' and 5% per 'high' threat.
    let volatility = 0;
    for (const threat of this.activeThreats) {
      if (threat.level === "critical") {
        volatility += 0.1;
      } else if (threat.level === "high") {
        volatility += 0.05;
      } else if (threat.level === "elevated") {
        volatility += 0.02;     
      }
    }
    
    return {
      activeThreats: this.activeThreats,
      globalSentiment: Math.max(0, (this.lastGlobalCii / 100) - volatility), // Use the stored CII score adjusted by volatility
      lastScanTimestamp: this.lastScanTimestamp
    };
  }
}

export const argusEngine = new OsintFusionEngine();
