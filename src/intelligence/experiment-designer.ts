import { ErrorCategory, handleError } from "../infra/error-handler.js";
import { MemorySystem } from "./memory-system.js";
import { ActionPlan, ActionStep, Hypothesis } from "./quantum-intelligence.js";



export class ExperimentDesigner {
    constructor(
        private memory: MemorySystem
    ) {}

    /**
     * Designs an experiment to verify or falsify a given hypothesis.
     */
    public async designExperiment(hypothesis: Hypothesis): Promise<ActionPlan | null> {
        if (!hypothesis.interpretation) {
            return null;
        }

        try {
            const prompt = `
            <system_2_experiment>
            I have a hypothesis that needs verification.
            
            Hypothesis: "${hypothesis.interpretation}"
            Reasoning: "${hypothesis.reasoning}"
            
            Design a small, executable experiment using available tools to verify this.
            The experiment should aim to prove or disprove the hypothesis.
            
            Available tools: "list_dir", "read_file", "search_web", "run_command".
            
            Output a JSON plan with steps.
            Example:
            {
              "steps": [
                { "action": "run_command", "parameters": { "command": "echo test" }, "expectedOutcome": "Output 'test'" }
              ],
              "estimatedTime": 100,
              "requiredResources": []
            }
            </system_2_experiment>
            `;

            // BitNet removed — no inference available, skip experiment design
            void prompt;
            return null;

        } catch (error) {
           handleError(error, {
                category: ErrorCategory.SYSTEM,
                context: { operation: "experiment_design", hypothesis: hypothesis.id }
            });
            return null;
        }
    }

    private parsePlan(text: string): ActionPlan | null {
        try {
            // Attempt to find JSON block
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {return null;}
            
            const json = JSON.parse(jsonMatch[0]);
            
            // Validate structure
            if (!json.steps || !Array.isArray(json.steps)) {return null;}

            return {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                steps: json.steps.map((s: any) => ({
                    action: s.action,
                    parameters: s.parameters,
                    expectedOutcome: s.expectedOutcome || "Verification",
                    // Use ActionStep type logic if needed, but for now map loosely
                })) as ActionStep[],
                estimatedTime: json.estimatedTime || 100,
                requiredResources: json.requiredResources || []
            };
        // eslint-disable-next-line no-unused-vars
        } catch (_e) {
            return null;
        }
    }
}
