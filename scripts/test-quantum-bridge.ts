
import { QuantumGatewayBridge } from "../src/intelligence/quantum-gateway-bridge";
import { BitNetEngine, BitNetModelManager } from "../src/intelligence/bitnet-engine";
import { MemorySystem } from "../src/intelligence/memory-system";
import { CapabilityGraph } from "../src/infra/capability-graph";
import _path from "node:path";

async function run() {
    console.log("Initializing Quantum Bridge Verification...");

    const memory = new MemorySystem();
    const capabilities = new CapabilityGraph();
    
    // Mock some capabilities
    capabilities.addNode({
        id: "tool:mock:analyze",
        type: "tool",
        name: "analyze_system",
        source: "mock-plugin",
        description: "Analyzes system state and performance"
    });

    // Mock Cache Layer to avoid Redis dependency in test
    memory.cache.initialize = async () => { console.log("[Mock] Cache initialized"); };
    
    // Initialize Memory System
    await memory.initialize();

    const _bitnetManager = new BitNetModelManager();
    // We assume model is present or we use a mock/stub if strictly unit testing, 
    // but here we want to test the flow.
    // usage: tsx scripts/test-quantum-bridge.ts
    
    // If no model, we might fail, but let's try.
    const engine = new BitNetEngine({
        modelPath: "dummy", // The engine might fail to load if we don't have a real model
        // So we might need to mock the engine for this test if we don't want to download 2GB
    });
    
    // MOCK the engine's generate method to avoid needing a real model
    engine.generate = async (opts) => {
        return {
            text: `[MOCKED OUTPUT] Interpreting: ${opts.prompt.substring(0, 50)}...`,
            tokensGenerated: 10,
            tokensPerSecond: 10,
            timeMs: 100
        };
    };
    
    // MOCK initialize
    engine.initialize = async () => { console.log("BitNet Mock Initialized"); };
    
    await engine.initialize();

    const bridge = new QuantumGatewayBridge(memory, engine, capabilities);

    console.log("Processing Request...");
    const decision = await bridge.processRequest("Analyze the system performance and optimize it", "test-user");

    console.log("\n=== Decision Result ===");
    console.log(`Type: ${decision.hypothesis.type}`);
    console.log(`Confidence: ${decision.confidence}`);
    console.log(`Interpretation: ${decision.hypothesis.interpretation}`);
    
    if (decision.action.steps.length > 0) {
        console.log("Plan:");
        decision.action.steps.forEach(step => {
            console.log(`- ${step.action}: ${step.expectedOutcome}`);
        });
    } else {
        console.log("No steps in plan.");
    }

    await memory.shutdown();
}

run().catch(console.error);
