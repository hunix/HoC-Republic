/**
 * Quantum-Inspired Intelligence Architecture
 *
 * Implements quantum mechanics concepts for sophisticated AI decision-making:
 * - Superposition: Multiple hypotheses exist simultaneously
 * - Entanglement: Memories are correlated through relationships
 * - Interference: Patterns reinforce or cancel each other
 * - Tunneling: Intuitive leaps across distant concepts
 */

import { CapabilityGraph, CapabilityNode } from "../infra/capability-graph.js";
import { ErrorCategory, handleError } from "../infra/error-handler.js";
import { Entity, Memory, MemorySystem } from "./memory-system.js";


// ============================================================================
// Types
// ============================================================================

export interface Hypothesis {
  id: string;
  type:
    | "task_execution"
    | "information_request"
    | "clarification_needed"
    | "autonomous_exploration"
    | "scientific_hypothesis";
  interpretation: string;
  confidence: number; // 0-1
  plan?: ActionPlan;
  reasoning: string;
}

export interface ActionPlan {
  steps: ActionStep[];
  estimatedTime: number;
  requiredResources: string[];
}

export interface ActionStep {
  action: string;
  parameters: Record<string, unknown>;
  expectedOutcome: string;
}

export interface Decision {
  id: string;
  hypothesis: Hypothesis;
  action: ActionPlan;
  confidence: number;
  alternatives: Hypothesis[];
}



export interface EntangledMemories {
  primary: Memory[];
  related: Memory[];
  lessons: unknown[];
  strength: number; // 0-1, how strongly they're connected
}

export interface Analogy {
  source: unknown;
  target: unknown;
  similarity: number;
  type: "semantic" | "structural";
  mapping: Record<string, string>;
}

// ============================================================================
// Quantum Superposition: Multiple Hypotheses
// ============================================================================

import { CuriosityEngine } from "./curiosity-engine.js";

// ...

export class QuantumSuperposition {
  private curiosity: CuriosityEngine;

  constructor(
    private memory: MemorySystem,
  ) {
    this.curiosity = new CuriosityEngine(memory);
  }

  /**
   * Generate multiple hypotheses in superposition
   */
  /**
   * Generate multiple hypotheses in superposition
   */
  async generate(context: string, lessons: unknown[] = []): Promise<Hypothesis[]> {
    try {
      const hypotheses: Hypothesis[] = [];

      // Generate different interpretations in parallel
      const interpretations = await Promise.all([
        this.interpretAs("task_execution", context, lessons),
        this.interpretAs("information_request", context, lessons),
        this.interpretAs("clarification_needed", context, lessons),
        this.interpretAs("autonomous_exploration", context, lessons),
        this.curiosity.generateExplorations(context), // Curiosity doesn't use lessons yet, but could
      ]);

      for (const interp of interpretations) {
        if (Array.isArray(interp)) {
            // Handle array of hypotheses (from curiosity)
            hypotheses.push(...interp);
        } else if (interp) {
          hypotheses.push(interp);
        }
      }

      // Calculate probabilities (normalize to sum to 1)
      const totalConfidence = hypotheses.reduce((sum, h) => sum + h.confidence, 0);
      hypotheses.forEach((h) => {
        h.confidence = h.confidence / totalConfidence;
      });

      return hypotheses;
    } catch (error) {
      handleError(error, {
        category: ErrorCategory.SYSTEM,
        context: { operation: "quantum_superposition_generate" },
      });
      return [];
    }
  }

  /**
   * Collapse superposition to single decision
   */
  async collapse(hypotheses: Hypothesis[]): Promise<Decision> {
    try {
      if (hypotheses.length === 0) {
        // Fallback decision when no hypotheses could be generated
        const fallback: Hypothesis = {
          id: `hyp_fallback_${Date.now()}`,
          type: "clarification_needed",
          interpretation: "I could not form a clear plan. Could you rephrase?",
          confidence: 0.1,
          reasoning: "No hypotheses generated (LLM unavailable or all interpretations failed)",
        };
        return {
          id: `dec_${Date.now()}_fallback`,
          hypothesis: fallback,
          action: { steps: [], estimatedTime: 0, requiredResources: [] },
          confidence: 0.1,
          alternatives: [],
        };
      }

      // Sort by confidence
      const sorted = [...hypotheses].toSorted((a, b) => b.confidence - a.confidence);

      // Best hypothesis
      const best = sorted[0];

      // Record decision for learning
      await this.recordDecision(best, sorted.slice(1));

      return {
        id: `dec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        hypothesis: best,
        action: best.plan || { steps: [], estimatedTime: 0, requiredResources: [] },
        confidence: best.confidence,
        alternatives: sorted.slice(1),
      };
    } catch (error) {
      handleError(error, {
        category: ErrorCategory.SYSTEM,
        context: { operation: "quantum_collapse" },
      });
      throw error;
    }
  }

  /**
   * Interpret context as specific type
   */
  private async interpretAs(type: Hypothesis["type"], context: string, lessons: unknown[] = []): Promise<Hypothesis | null> {
    // BitNet removed — no local inference available
    const prompt = this.buildInterpretationPrompt(type, context, lessons);
    void prompt;
    return null;
  }

  private buildInterpretationPrompt(type: Hypothesis["type"], context: string, lessons: unknown[] = []): string {
    const typePrompts = {
      task_execution: "Interpret this as a task to execute. What actions should be taken?",
      information_request:
        "Interpret this as a request for information. What information is needed?",
      clarification_needed: "Interpret this as needing clarification. What is unclear?",
      autonomous_exploration:
        "Interpret this as an opportunity to explore and learn. What could be discovered?",
      scientific_hypothesis:
        "Interpret this as a scientific hypothesis. What experiment could prove or disprove it?",
    };

    let lessonsText = "";
    if (lessons.length > 0) {
        lessonsText = "\n\nPAST LESSONS (AVOID THESE MISTAKES):\n" + 
            // oxlint-disable-next-line @typescript-eslint/no-explicit-any
            lessons.map((l: any) => `- When trying to ${l.tool_call || 'action'}, error occurred: "${l.error}". FIX: ${l.correction}`).join("\n");
    }

    return `Context: ${context}${lessonsText}\n\n${typePrompts[type]}\n\nProvide interpretation, confidence (0-1), and reasoning.`;
  }

  private parseInterpretation(text: string, _type?: string): { text: string; confidence: number; plan?: ActionPlan; reasoning: string } {
    // Try to extract confidence
    const confidenceMatch = text.match(/Confidence:\s*([0-9.]+)/i);
    let confidence = 0.5; // Neutral default when LLM doesn't include confidence
    
    if (confidenceMatch) {
        const parsed = parseFloat(confidenceMatch[1]);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
            confidence = parsed;
        }
    }

    return {
      text,
      confidence,
      plan: undefined,
      reasoning: text,
    };
  }

  private async recordDecision(chosen: Hypothesis, alternatives: Hypothesis[]): Promise<void> {
    await this.memory.remember({
      id: `decision_${Date.now()}`,
      content: `Chose ${chosen.type}: ${chosen.interpretation}`,
      type: "reasoning",
      timestamp: Date.now(),
      metadata: {
        chosen,
        alternatives,
        reinforcementCount: 0,
      },
      salience: chosen.confidence,
    });
  }
}

// ============================================================================
// Quantum Entanglement: Context Correlation
// ============================================================================

export class QuantumEntanglement {
  constructor(private memory: MemorySystem) {}

  /**
   * Retrieve entangled memories
   */
  async retrieve(query: string): Promise<EntangledMemories> {
    try {
      // Primary retrieval from short-term memory
      const primaryResults = await this.memory.recall({
        query,
        limit: 5,
      });

      const primary = primaryResults.map((r) => r.memory);

      // Find entangled memories through knowledge graph
      const related: Memory[] = [];

      for (const mem of primary) {
        // Extract entities from memory
        const entities = await this.extractEntities(mem);

        // Traverse graph to find related entities
        for (const entity of entities) {
          const connectedEntities = await this.memory.longTerm.traverse(entity.id, 2);

          // Convert entities back to memories (simplified)
          for (const e of connectedEntities) {
            related.push({
              id: e.id,
              content: `${e.type}: ${e.name}`,
              type: "knowledge",
              timestamp: e.created,
              metadata: e.properties,
              salience: e.salience,
            });
          }
        }
      }

      // Analyze potential interferences/lessons from Permanent Memory
      const lessons = await this.memory.permanent.searchLessons(query);

      // Activate related memories (increase salience)
      await this.activate(related);

      // Calculate entanglement strength
      const strength = this.calculateEntanglementStrength(primary, related);

      return {
        primary,
        related,
        lessons,
        strength,
      };
    } catch (error) {
      handleError(error, {
        category: ErrorCategory.SYSTEM,
        context: { operation: "quantum_entanglement_retrieve" },
      });
      return { primary: [], related: [], lessons: [], strength: 0 };
    }
  }

  /**
   * Activate memories (increase salience)
   */
  private async activate(memories: Memory[]): Promise<void> {
    for (const memory of memories) {
      // Increase salience slightly
      const newSalience = Math.min(1, memory.salience + 0.1);

      await this.memory.shortTerm.update(memory.id, {
        salience: newSalience,
      });
    }
  }

  /**
   * Calculate how strongly memories are entangled
   */
  private calculateEntanglementStrength(primary: Memory[], related: Memory[]): number {
    if (primary.length === 0 || related.length === 0) {return 0;}

    // Simple metric: ratio of related to primary, weighted by salience
    const avgPrimarySalience = primary.reduce((sum, m) => sum + m.salience, 0) / primary.length;
    const avgRelatedSalience = related.reduce((sum, m) => sum + m.salience, 0) / related.length;

    return (avgPrimarySalience + avgRelatedSalience) / 2;
  }

  private async extractEntities(memory: Memory): Promise<Entity[]> {
    // Simplified - in production, use NLP
    const words = memory.content.split(/\s+/);
    const entities: Entity[] = [];

    for (const word of words) {
      if (word.length > 3 && /^[A-Z]/.test(word)) {
        entities.push({
          id: `entity_${word.toLowerCase()}`,
          type: "UNKNOWN",
          name: word,
          properties: {},
          salience: memory.salience,
          created: Date.now(),
          lastAccessed: Date.now(),
        });
      }
    }

    return entities;
  }
}

// ============================================================================
// Quantum Interference: Pattern Reinforcement
// ============================================================================

export class QuantumInterference {
  constructor(
    private memory: MemorySystem,
  ) {}

  /**
   * Consolidate new memory with interference check
   */
  async consolidate(newMemory: Memory): Promise<void> {
    try {
      // Find similar existing memories
      const similar = await this.findSimilar(newMemory);

      if (similar.length === 0) {
        // No interference - store as new memory
        await this.memory.shortTerm.store(newMemory);
        return;
      }

      // Analyze interference type
      const interference = await this.analyzeInterference(newMemory, similar);

      if (interference.type === "constructive") {
        // Reinforce existing memory
        await this.reinforce(similar[0].memory, newMemory);
      } else if (interference.type === "destructive") {
        // Conflict detected - resolve
        await this.resolveConflict(similar[0].memory, newMemory);
      } else {
        // Neutral - store both
        await this.memory.shortTerm.store(newMemory);
      }
    } catch (error) {
      handleError(error, {
        category: ErrorCategory.SYSTEM,
        context: { operation: "quantum_interference_consolidate" },
      });
    }
  }

  /**
   * Find similar memories
   */
  private async findSimilar(
    memory: Memory,
  ): Promise<Array<{ memory: Memory; similarity: number }>> {
    const results = await this.memory.recall({
      query: memory.content,
      type: memory.type,
      limit: 5,
    });

    return results
      .map((r) => ({
        memory: r.memory,
        similarity: r.score,
      }))
      .filter((r) => r.similarity > 0.7); // High similarity threshold
  }

  /**
   * Analyze interference type
   */
  private async analyzeInterference(
    newMemory: Memory,
    similar: Array<{ memory: Memory; similarity: number }>,
  ): Promise<{ type: "constructive" | "destructive" | "neutral" }> {
    // Use BitNet to determine if memories support or contradict each other
    const _prompt = `
Memory 1: ${similar[0].memory.content}
Memory 2: ${newMemory.content}

Do these memories:
A) Support each other (constructive)
B) Contradict each other (destructive)
C) Are unrelated (neutral)

Answer with just A, B, or C.
`;

    // BitNet removed — return neutral interference
    return { type: "neutral" };
  }

  /**
   * Reinforce existing memory (constructive interference)
   */
  private async reinforce(existing: Memory, _newMemory?: Memory): Promise<void> {
    // Increase salience
    const newSalience = Math.min(1, existing.salience + 0.2);

    // Increment reinforcement count
    const reinforcementCount = ((existing.metadata).reinforcementCount as number || 0) + 1;

    await this.memory.shortTerm.update(existing.id, {
      salience: newSalience,
      metadata: {
        ...existing.metadata,
        reinforcementCount,
        lastReinforced: Date.now(),
      },
    });

    // If strong enough, promote to long-term memory
    if (newSalience > 0.8 && reinforcementCount > 3) {
      console.log(`[Interference] Promoting memory ${existing.id} to long-term`);
      // Consolidation will handle this in next cycle
    }
  }

  /**
   * Resolve conflict (destructive interference)
   */
  private async resolveConflict(existing: Memory, newMemory: Memory): Promise<void> {
    // Use BitNet to reason about conflict
    const prompt = `
Two conflicting memories:
1. ${existing.content}
2. ${newMemory.content}

Resolve this conflict by determining which is more accurate or how they can be reconciled.
`;

    // BitNet removed — keep existing memory unchanged
    void prompt; // prompt built above but no inference available
  }
}

// ============================================================================
// Quantum Tunneling: Intuitive Leaps
// ============================================================================

export class QuantumTunneling {
  constructor(
    private memory: MemorySystem,
    private capabilityGraph?: CapabilityGraph,
  ) {}

  /**
   * Find tools that can achieve the intent (Tunneling through the Capability Graph)
   */
  async findToolShortcuts(intent: string): Promise<CapabilityNode[]> {
    if (!this.capabilityGraph) {
      return [];
    }
    // Simple keyword matching for now, as implemented in CapabilityGraph
    return this.capabilityGraph.findCapabilities(intent);
  }

  /**
   * Find analogies across distant concepts
   */
  async findAnalogy(problem: string): Promise<Analogy[]> {
    try {
      // Search across ALL memory tiers
      const analogies: Analogy[] = [];

      // Semantic analogies (from short-term)
      const semanticResults = await this.memory.recall({
        query: problem,
        limit: 10,
      });

      for (const result of semanticResults) {
        analogies.push({
          source: problem,
          target: result.memory.content,
          similarity: result.score,
          type: "semantic",
          mapping: {},
        });
      }

      // Structural analogies (from long-term graph)
      const structural = await this.findStructuralSimilarity(problem);
      analogies.push(...structural);

      // Sort by similarity
      analogies.sort((a, b) => b.similarity - a.similarity);

      return analogies.slice(0, 5); // Top 5
    } catch (error) {
      handleError(error, {
        category: ErrorCategory.SYSTEM,
        context: { operation: "quantum_tunneling_find_analogy" },
      });
      return [];
    }
  }

  /**
   * Find structurally similar situations
   */
  private async findStructuralSimilarity(problem: string): Promise<Analogy[]> {
    // Extract structure from problem
    const structure = await this.extractStructure(problem);

    // Find similar structures in knowledge graph
    // (Simplified - in production, use graph pattern matching)
    const entities = await this.memory.longTerm.findEntity((e) => e.salience > 0.5);

    const analogies: Analogy[] = [];

    for (const entity of entities) {
      const similarity = this.calculateStructuralSimilarity(structure, entity);

      if (similarity > 0.6) {
        analogies.push({
          source: problem,
          target: entity,
          similarity,
          type: "structural",
          mapping: {},
        });
      }
    }

    return analogies;
  }

  private async extractStructure(text: string): Promise<unknown> {
    // Simplified - extract key concepts and relationships
    return {
      concepts: text.split(/\s+/).filter((w) => w.length > 3),
      relationships: [],
    };
  }

  private calculateStructuralSimilarity(structure?: unknown, entity?: unknown): number {
    // Word-overlap similarity between structure concepts and entity name/properties
    if (!structure || !entity) { return 0; }
    const structWords = new Set(
      ((structure as { concepts?: string[] }).concepts ?? []).map(w => w.toLowerCase()),
    );
    if (structWords.size === 0) { return 0; }

    const entityObj = entity as { name?: string; type?: string; properties?: Record<string, unknown> };
    const entityWords = new Set(
      [entityObj.name ?? "", entityObj.type ?? "", ...Object.keys(entityObj.properties ?? {})]
        .join(" ")
        .toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 2),
    );

    let overlap = 0;
    for (const w of structWords) {
      if (entityWords.has(w)) { overlap++; }
    }
    return structWords.size > 0 ? overlap / structWords.size : 0;
  }
}

// ============================================================================
// Unified Quantum Intelligence
// ============================================================================

import { ExperimentDesigner } from "./experiment-designer.js";

export class QuantumIntelligence {
  public superposition: QuantumSuperposition;
  public entanglement: QuantumEntanglement;
  public interference: QuantumInterference;
  public tunneling: QuantumTunneling;
  private experimenter: ExperimentDesigner;

  constructor(
    private memory: MemorySystem,
    private capabilities: CapabilityGraph,
  ) {
    this.superposition = new QuantumSuperposition(memory);
    this.entanglement = new QuantumEntanglement(memory);
    this.interference = new QuantumInterference(memory);
    this.tunneling = new QuantumTunneling(memory, capabilities);
    this.experimenter = new ExperimentDesigner(memory);
  }

  /**
   * Think: Full quantum reasoning cycle
   */
  async think(input: string): Promise<Decision> {
    try {
      console.log("[Quantum] Starting reasoning cycle...");

      // 1. Entanglement: Retrieve relevant context (and lessons)
      // Moving this BEFORE superposition so we can use lessons in hypothesis generation
      const context = await this.entanglement.retrieve(input);
      console.log(
        `[Quantum] Retrieved ${context.primary.length} primary + ${context.related.length} related memories + ${context.lessons.length} lessons`,
      );

      // 2. Superposition: Generate multiple hypotheses (injecting lessons)
      let hypotheses = await this.superposition.generate(input, context.lessons);
      console.log(`[Quantum] Generated ${hypotheses.length} hypotheses`);

      // 3. Tunneling: Find analogies AND Tools
      const analogies = await this.tunneling.findAnalogy(input);
      const tools = await this.tunneling.findToolShortcuts(input);
      console.log(`[Quantum] Found ${analogies.length} analogies and ${tools.length} relevant tools`);

      // 3b. Fallback: If no hypotheses but tools found, synthesize a task_execution hypothesis
      if (hypotheses.length === 0 && tools.length > 0) {
        console.log(`[Quantum] No LLM hypotheses. Falling back to rule-based tool matching.`);
        hypotheses = [{
          id: `hyp_toolmatch_${Date.now()}`,
          type: "task_execution",
          interpretation: `Execute tool: ${tools[0].name} (${tools[0].description || 'matched from capability graph'})`,
          confidence: 0.7,
          reasoning: `Matched tool '${tools[0].name}' from CapabilityGraph for input: "${input}"`,
          plan: {
            steps: tools.map(t => ({
              action: "use_tool",
              parameters: { toolName: t.name, toolId: t.id },
              expectedOutcome: t.description || "Execute tool"
            })),
            estimatedTime: 5,
            requiredResources: []
          }
        }];
      } else if (hypotheses.length === 0) {
        console.log(`[Quantum] No hypotheses and no tools matched. Will return fallback.`);
      }

      // 4. Collapse: Make decision
      const decision = await this.superposition.collapse(hypotheses);

      // 5. Experiment Design: Refine plan for exploration/science
      if (decision.hypothesis.type === 'autonomous_exploration' || decision.hypothesis.type === 'scientific_hypothesis') {
          const refinedPlan = await this.experimenter.designExperiment(decision.hypothesis);
          if (refinedPlan) {
              decision.action = refinedPlan;
              // Boost confidence slightly as we have a concrete plan
              decision.confidence = Math.min(decision.confidence + 0.1, 1.0);
          }
      }
      
      // Enhance plan with found tools if applicable
      if (tools.length > 0 && decision.action.steps.length === 0) {
          decision.action.steps.push({
              action: "use_tool",
              parameters: { toolName: tools[0].name, toolId: tools[0].id },
              expectedOutcome: "Execute relevant tool"
          });
      }

      console.log(
        `[Quantum] Collapsed to: ${decision.hypothesis.type} (confidence: ${decision.confidence.toFixed(2)})`,
      );

      // 6. Remember this reasoning step
      await this.memory.remember({
        id: `reasoning_${Date.now()}`,
        content: `Input: ${input}\nDecision: ${decision.hypothesis.interpretation}`,
        type: "reasoning",
        timestamp: Date.now(),
        metadata: {
          hypotheses,
          decision,
          context: {
              // oxlint-disable-next-line @typescript-eslint/no-explicit-any
              primaryIds: context.primary.map((m: any) => m.id),
              // oxlint-disable-next-line @typescript-eslint/no-explicit-any
              lessonIds: context.lessons.map((l: any) => l.id)
          } 
        },
        salience: decision.confidence,
      });

      return decision;
    } catch (error) {
      handleError(error, {
        category: ErrorCategory.SYSTEM,
        context: { operation: "quantum_think" },
      });
      throw error;
    }
  }

  /**
   * Learn from experience
   */
  async learn(experience: Memory): Promise<void> {
    // Use interference to consolidate
    await this.interference.consolidate(experience);
  }
}
