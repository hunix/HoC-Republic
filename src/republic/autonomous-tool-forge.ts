import * as fs from "node:fs/promises";
import * as path from "node:path";
import { registerForgedTool } from "./real-execution.js";
import { type ToolDefinition } from "./tool-executor.js";

const DYNAMIC_TOOLS_DIR = path.join(process.cwd(), "src/republic/dynamic-tools");

/**
 * Ensures the dynamic tools directory exists.
 */
async function ensureDir() {
  try {
    await fs.mkdir(DYNAMIC_TOOLS_DIR, { recursive: true });
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    if (err.code !== "EEXIST") {throw err;}
  }
}

/**
 * Request schema for forging a new tool.
 */
export interface ForgeToolCommand {
  toolId: string;
  name: string;
  description: string;
  category: "internal" | "filesystem" | "network" | "financial" | "computation" | "communication";
  tier: 0 | 1 | 2 | 3;
  parameters: Array<{ name: string; type: string; required: boolean; description: string }>;
  code: string;
}

/**
 * Compiles and dynamically registers a new tool sent by an autonomous agent.
 */
export async function forgeExecutableTool(command: ForgeToolCommand): Promise<string> {
  await ensureDir();

  const safeId = command.toolId.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
  if (!safeId) {
    throw new Error("Invalid toolId provided to forge.");
  }

  const filePath = path.join(DYNAMIC_TOOLS_DIR, `${safeId}.ts`);
  
  // Create a robust execution template around the provided logic
  const fileContent = `
/**
 * DYNAMICALLY FORGED TOOL: ${command.name}
 * ID: ${safeId}
 * Description: ${command.description}
 */

import type { ExecutionResult, ExecutionContext, ToolExecutor } from "../real-execution.js";

export const executeForgedTool: ToolExecutor = async (context, params): Promise<ExecutionResult> => {
  try {
    // ---- Auto-Generated Execution Boundary ----
${command.code
  .split("\n")
  .map((line) => `    ${line}`)
  .join("\n")}
    // -----------------------------------------
    return {
      success: true,
      data: { message: "Execution completed successfully", output: result ?? "done" }
    };
  } catch (err) {
    return {
      success: false,
      error: String(err)
    };
  }
};
`;

  // Write the file to disk
  await fs.writeFile(filePath, fileContent, "utf-8");

  // Compile it to JS (optional step, but useful if TS-node is not caching dynamically)
  // For runtime safety, we assume tsx or a dynamic loader is running the process.
  
  // Create the definition mapping
  const toolDef: ToolDefinition = {
    id: safeId,
    name: command.name,
    description: command.description,
    tier: command.tier,
    category: command.category,
    parameters: command.parameters,
    enabled: true, // Auto-enable when forged
    timeoutMs: 10000,
    estimatedCost: { computeMs: 100 }
  };

  // Link it into the global runtime without restarting
  await registerForgedTool(toolDef, filePath);

  return `Successfully forged tool '${safeId}' at ${filePath}. It is now live in the global ToolRegistry and ready for invocation by any OpenClaw Agent.`;
}
