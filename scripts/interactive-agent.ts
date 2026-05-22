
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { QuantumIntelligence } from "../src/intelligence/quantum-intelligence.js";
import { MemorySystem } from "../src/intelligence/memory-system.js";
import { BitNetEngine } from "../src/intelligence/bitnet-engine.js";
import { CapabilityGraph } from "../src/infra/capability-graph.js";
import { fileSystemTools, fileSystemHandlers } from "../src/agents/skills/file-system.js";
import { commandTools, commandHandlers } from "../src/agents/skills/command-execution.js";

async function main() {
  console.clear();
  console.log("==================================================");
  console.log("   SYSTEM OPERATOR AGENT - QUANTUM ENABLED (v2)   ");
  console.log("==================================================\n");

  // 1. Initialize Components
  console.log("[Init] Loading Memory System...");
  const memory = new MemorySystem();
  await memory.initialize();

  console.log("[Init] Loading BitNet Engine...");
  const engine = new BitNetEngine({}); 
  // await engine.initialize(); // Assuming mock or local model is ready

  console.log("[Init] Building Capability Graph...");
  const capabilities = new CapabilityGraph();

  // 2. Register Native Skills
  const allTools = [...fileSystemTools, ...commandTools];
  const allHandlers = { ...fileSystemHandlers, ...commandHandlers };

  for (const tool of allTools) {
    capabilities.addNode({
      id: `tool:system:${tool.name}`,
      type: "tool",
      name: tool.name,
      source: "system-operator",
      description: tool.description,
      metadata: { parameters: tool.parameters }
    });
    console.log(`  + Registered Tool: ${tool.name}`);
  }

  // 3. Initialize Intelligence
  console.log("[Init] Spawning Quantum Intelligence...");
  const agent = new QuantumIntelligence(engine, memory, capabilities);

  // 4. REPL Loop
  const rl = readline.createInterface({ input, output });

  console.log("\n[Ready] Type a command or question. (Type 'exit' to quit)\n");

  while (true) {
    const userInput = await rl.question("\nUser> ");
    if (userInput.toLowerCase() === "exit") {break;}
    if (!userInput.trim()) {continue;}

    try {
      // THINK
      console.log("\n[Agent] Thinking...");
      const decision = await agent.think(userInput);

      // ACT
      console.log(`\n[Agent] Confidence: ${decision.confidence.toFixed(2)}`);
      console.log(`[Agent] Intent: ${decision.hypothesis.interpretation}`);

      if (decision.action.steps.length > 0) {
        console.log("\n[Agent] Executing Plan:");
        for (const step of decision.action.steps) {
          if (step.action === "use_tool") {
            const toolName = step.parameters.toolName || step.parameters.name; // Handle potential schema variations
            const _toolId = step.parameters.toolId;
            
            // Allow matching by ID (if provided) or Name
            const handlerName = toolName; 
            const handler = (allHandlers as unknown)[handlerName];

            if (handler) {
              process.stdout.write(`  > Running tool '${String(toolName)}'... `);
              const result = await handler(step.parameters);
              console.log("Done.");
              console.log(`    Result: ${String(result).substring(0, 100)}${String(result).length > 100 ? "..." : ""}`);
              
              // Optional: Feed result back to memory for "Short Term" context?
              // For now, we just log it.
              await memory.shortTerm.add({
                  content: `Tool '${String(toolName)}' executed. Result: ${result}`,
                  type: "observation",
                  metadata: { toolName, parameters: step.parameters }
              });

            } else {
              console.log(`  ! Error: Tool '${String(toolName)}' not found in local handlers.`);
            }
          } else {
            console.log(`  > Unknown Action: ${step.action}`);
          }
        }
      } else {
        console.log("\n[Agent] No physical actions required.");
        console.log(`[Agent] Response: ${decision.hypothesis.interpretation}`); // Usually the "thought" is acceptable as a response if no action
      }
      
      // Save interaction to permanent memory (Lesson) if confidence was low?
      // Or just standard memory loop (already handled by agent.think).

    } catch (error) {
      console.error("\n[Error]", error);
    }
  }

  rl.close();
  await memory.shutdown();
}

main().catch(console.error);
