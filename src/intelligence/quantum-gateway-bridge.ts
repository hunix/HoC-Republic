import { CapabilityGraph } from "../infra/capability-graph.js";
import { MemorySystem } from "./memory-system.js";
import { Decision, QuantumIntelligence } from "./quantum-intelligence.js";
import { ReflectionAgent } from "./reflection-agent.js";



/**
 * Quantum Gateway Bridge
 * 
 * Connecting the reactive Gateway to the deliberative Quantum Intelligence engine.
 */
export class QuantumGatewayBridge {
    private quantum: QuantumIntelligence;
    private reflection: ReflectionAgent;

    constructor(
        private memory: MemorySystem,
        private capabilities: CapabilityGraph
    ) {
        this.quantum = new QuantumIntelligence(memory, capabilities);
        this.reflection = new ReflectionAgent(memory);
    }

    /**
     * Process a complex user request through System 2 thinking.
     */
    public async processRequest(userQuery: string, userId: string, sessionKey?: string): Promise<Decision> {
        console.log(`[QuantumBridge] processing request for ${userId}: "${userQuery}"`);
        
        // 1. Quantum Think
        // This triggers Superposition (Hypotheses) -> Entanglement (Memory) -> Tunneling (Tools) -> Collapse (Decision)
        const decision = await this.quantum.think(userQuery);

        // 2. Log logic
        console.log(`[QuantumBridge] Decision confidence: ${decision.confidence}`);
        if (decision.hypothesis.plan) {
            console.log(`[QuantumBridge] Plan: ${JSON.stringify(decision.hypothesis.plan)}`);
        }

        // 3. Store decision for reflection (if session available)
        if (sessionKey) {
            await this.memory.flash.write(`decision:${sessionKey}`, decision); // Store for 5 mins
        }

        return decision;
    }

    public async reflectOnToolResult(sessionKey: string, toolData: unknown): Promise<void> {
        try {
            // Retrieve active decision
            const decisions = await this.memory.flash.read(`decision:${sessionKey}`) as Decision[];
            if (!decisions || decisions.length === 0) {return;}
            const decision = decisions[0];

            // Reflect
            await this.reflection.reflect(decision, toolData);
        } catch (err) {
            console.warn(`[QuantumBridge] Reflection failed: ${String(err)}`);
        }
    }
}
