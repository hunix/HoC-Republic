import { MemorySystem } from "./memory-system.js";
import { ActionStep, Decision } from "./quantum-intelligence.js";



export interface Correction {
    originalPlanId: string;
    toolCall: string;
    error: string;
    correction: string;
    confidence: number;
}

export class ReflectionAgent {
    constructor(
        private memory: MemorySystem
    ) {}

    /**
     * Analyzes the result of a tool execution against the expectations in the decision.
     */
    public async reflect(
        decision: Decision, 
        // oxlint-disable-next-line @typescript-eslint/no-explicit-any
        toolData: any
    ): Promise<Correction | null> {
        // 1. Find the relevant step in the plan
        const relevantStep = decision.hypothesis.plan?.steps.find((s: ActionStep) => s.action === toolData.tool);
        if (!relevantStep) {
            // Tool execution not explicitly in plan, or plan is missing.
            // We can still reflect on generic success/failure.
            if (toolData.error) {
                return this.generateCorrection(decision, toolData, "Tool execution failed unexpectedly.");
            }
            return null;
        }

        // 2. Compare Result vs Expectation
        const expectation = relevantStep.expectedOutcome;
        const actual = toolData.error ? `Error: ${JSON.stringify(toolData.error)}` : `Result: ${JSON.stringify(toolData.result).slice(0, 500)}`;

        const prompt = `
        <system_2_reflection>
        The agent executed a tool as part of a plan.
        
        Plan Context: ${decision.hypothesis.interpretation}
        Tool: ${toolData.tool}
        Input: ${JSON.stringify(toolData.input).slice(0, 200)}
        
        Expected Outcome: ${expectation}
        Actual Outcome: ${actual}
        
        Did the tool execution meet the expectation?
        If NO, analyze why and suggest a correction for future attempts.
        If YES, output "SUCCESS".
        
        Output format:
        SUCCESS
        OR
        CORRECTION: [Brief explanation of failure and fix]
        </system_2_reflection>
        `;

        // BitNet removed — no inference available, skip reflection
        void prompt;
        return null;
    }

    // oxlint-disable-next-line @typescript-eslint/no-explicit-any
    private async generateCorrection(decision: Decision, toolData: any, context: string): Promise<Correction> {
         const correction: Correction = {
            originalPlanId: decision.id,
            toolCall: toolData.tool,
            error: JSON.stringify(toolData.error),
            correction: `Generic Failure: ${context}`,
            confidence: 0.5
        };
        await this.memory.storeReflection(correction);
        return correction;
    }
}
