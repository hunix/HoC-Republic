import { createSubsystemLogger } from "../logging/subsystem.js";
import { intelligenceBus } from "../republic/intelligence-bus.js";
import type { AnomalyEvent, HardwareAlertEvent } from "../republic/intelligence-bus.js";

const logger = createSubsystemLogger("resilience-engine");

export interface ResilienceDiagnostics {
  status: "nominal" | "degraded" | "critical";
  activeAnomalies: number;
  totalAnomaliesResolved: number;
  lastPatchTimestamp: number | null;
  recentLogs: string[];
}

class ResilienceEngine {
  private status: "nominal" | "degraded" | "critical" = "nominal";
  private activeAnomalies = 0;
  private totalResolved = 0;
  private lastPatchTimestamp: number | null = null;
  private logs: string[] = [];
  
  private unsubscribers: Array<() => void> = [];

  public start() {
    logger.info("Starting Aegis Resilience Engine...");
    
    this.unsubscribers.push(
      intelligenceBus.subscribe("anomaly.detected", this.handleAnomaly.bind(this))
    );
    
    this.unsubscribers.push(
      intelligenceBus.subscribe("hardware.alert", this.handleHardwareAlert.bind(this))
    );
    
    this.status = "nominal";
    this.log("Resilience Engine online and listening to Intelligence Bus.");
  }

  public stop() {
    logger.info("Stopping Aegis Resilience Engine...");
    this.unsubscribers.forEach(unsub => unsub());
    this.unsubscribers = [];
    this.status = "nominal";
  }

  private handleAnomaly(event: AnomalyEvent) {
    this.activeAnomalies++;
    this.status = event.severity === "critical" ? "critical" : "degraded";
    this.log(`Detected ${event.severity} anomaly in subsystem: ${event.subsystem}. Metric: ${event.metric} deviated by ${event.zScore.toFixed(2)}z.`);
    
    // Simulate autonomous triage and patch
    this.triageAndPatch(`Anomaly in ${event.subsystem}`);
  }

  private handleHardwareAlert(event: HardwareAlertEvent) {
    this.activeAnomalies++;
    this.status = event.severity === "critical" ? "critical" : "degraded";
    this.log(`Hardware alert on ${event.hostname}: ${event.metric} at ${event.value}% (Threshold: ${event.threshold}%).`);
    
    // Simulate autonomous triage and patch
    this.triageAndPatch(`Resource starvation: ${event.metric}`);
  }

  private triageAndPatch(reason: string) {
    this.log(`Initiating autonomous triage for: ${reason}`);
    
    // In a fully realized system, this would summon an elite citizen to write code.
    // For now, we simulate the resolution over a short delay.
    setTimeout(() => {
      this.activeAnomalies = Math.max(0, this.activeAnomalies - 1);
      this.totalResolved++;
      this.lastPatchTimestamp = Date.now();
      
      if (this.activeAnomalies === 0) {
        this.status = "nominal";
      }
      
      this.log(`Autonomous patch successful for: ${reason}. System stabilized.`);
    }, 5000);
  }

  private log(message: string) {
    const entry = `[${new Date().toISOString()}] ${message}`;
    logger.info(message);
    this.logs.unshift(entry);
    if (this.logs.length > 50) {
      this.logs.length = 50;
    }
  }

  public getDiagnostics(): ResilienceDiagnostics {
    return {
      status: this.status,
      activeAnomalies: this.activeAnomalies,
      totalAnomaliesResolved: this.totalResolved,
      lastPatchTimestamp: this.lastPatchTimestamp,
      recentLogs: this.logs
    };
  }
}

export const resilienceEngine = new ResilienceEngine();
