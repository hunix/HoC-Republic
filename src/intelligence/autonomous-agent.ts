/**
 * Autonomous Agent with AGI-like Capabilities
 *
 * Implements self-directed behavior:
 * - Self-Reflection: Analyze own performance
 * - Goal Formation: Set own sub-goals
 * - Curiosity: Explore to fill knowledge gaps
 * - Learning: Update from experience
 * - Adaptation: Adjust behavior based on feedback
 */

import { ErrorCategory, handleError } from "../infra/error-handler.js";
import { MemorySystem } from "./memory-system.js";
import { QuantumIntelligence } from "./quantum-intelligence.js";



// ============================================================================
// Types
// ============================================================================

export interface Goal {
  id: string;
  description: string;
  type: "user_assigned" | "self_generated";
  priority: number; // 0-1
  status: "pending" | "in_progress" | "completed" | "failed";
  subGoals: string[]; // IDs of sub-goals
  createdAt: number;
  completedAt?: number;
  progress: number; // 0-1
}

export interface Insight {
  id: string;
  category: "performance" | "knowledge_gap" | "user_preference" | "pattern";
  description: string;
  confidence: number;
  actionable: boolean;
  suggestedAction?: string;
  timestamp: number;
}

export interface KnowledgeGap {
  id: string;
  topic: string;
  importance: number; // 0-1
  discoveredAt: number;
  filledAt?: number;
}

export interface Experience {
  action: string;
  context: unknown;
  result: "success" | "failure" | "partial";
  feedback?: string;
  timestamp: number;
  metadata: Record<string, unknown>;
}

export interface Lesson {
  type: "skill" | "knowledge" | "preference" | "strategy";
  content: string;
  confidence: number;
  applicability: string[]; // Contexts where this applies
  learnedFrom: string[]; // Experience IDs
}

// ============================================================================
// Autonomous Agent
// ============================================================================

export class AutonomousAgent {
  private goals: Map<string, Goal> = new Map();
  private insights: Insight[] = [];
  private knowledgeGaps: Map<string, KnowledgeGap> = new Map();
  private experiences: Experience[] = [];
  private autonomyEnabled: boolean = false;
  private autonomyLoop?: NodeJS.Timeout;

  constructor(
    private memory: MemorySystem,
    private quantum: QuantumIntelligence,
  ) {}

  /**
   * Enable autonomous mode
   */
  async enableAutonomy(): Promise<void> {
    if (this.autonomyEnabled) {return;}

    this.autonomyEnabled = true;
    console.log("[Autonomous] Autonomy enabled");

    // Start autonomous loop (every 5 minutes)
    this.autonomyLoop = setInterval(async () => {
      try {
        await this.autonomousCycle();
      } catch (error) {
        handleError(error, {
          category: ErrorCategory.SYSTEM,
          operation: "autonomous_cycle",
        });
      }
    }, 300000); // 5 minutes

    // Run first cycle immediately
    await this.autonomousCycle();
  }

  /**
   * Disable autonomous mode
   */
  disableAutonomy(): void {
    if (this.autonomyLoop) {
      clearInterval(this.autonomyLoop);
      this.autonomyLoop = undefined;
    }

    this.autonomyEnabled = false;
    console.log("[Autonomous] Autonomy disabled");
  }

  /**
   * Main autonomous cycle
   */
  private async autonomousCycle(): Promise<void> {
    console.log("[Autonomous] Starting autonomous cycle...");

    // 1. Self-reflection
    const insights = await this.selfReflect();
    console.log(`[Autonomous] Generated ${insights.length} insights`);

    // 2. Identify knowledge gaps
    const gaps = await this.identifyKnowledgeGaps();
    console.log(`[Autonomous] Found ${gaps.length} knowledge gaps`);

    // 3. Form goals
    const goals = await this.formGoals(insights, gaps);
    console.log(`[Autonomous] Formed ${goals.length} new goals`);

    // 4. Execute highest priority goal
    if (goals.length > 0) {
      const topGoal = goals.reduce((a, b) => (a.priority > b.priority ? a : b));
      await this.executeGoal(topGoal);
    }

    // 5. Explore (curiosity-driven)
    if (Math.random() < 0.3) {
      // 30% chance
      await this.explore();
    }

    console.log("[Autonomous] Cycle complete");
  }

  /**
   * Self-Reflection: Analyze own performance
   */
  async selfReflect(): Promise<Insight[]> {
    try {
      // Get recent actions and results
      const recentMemories = await this.memory.recall({
        query: "",
        type: "action",
        timeRange: {
          start: Date.now() - 24 * 3600 * 1000, // Last 24 hours
          end: Date.now(),
        },
        limit: 100,
      });

      const actions = recentMemories.map((r: { memory: unknown }) => r.memory);

      // Get results
      const results = await this.memory.recall({
        query: "",
        type: "result",
        timeRange: {
          start: Date.now() - 24 * 3600 * 1000,
          end: Date.now(),
        },
        limit: 100,
      });

      // Use BitNet to analyze performance
      const _prompt = `
Analyze my recent performance:

Actions taken (${actions.length}):
${actions
  .slice(0, 10)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .map((a: any) => `- ${a.content}`)
  .join("\n")}

Results (${results.length}):
${results
  .slice(0, 10)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .map((r: any) => `- ${r.memory.content}`)
  .join("\n")}

Provide insights on:
1. What I'm doing well
2. What needs improvement
3. Patterns I should notice
4. Suggestions for better performance

Format as JSON array of insights.
`;

      // BitNet removed — no inference available, return empty insights
      const insights: Insight[] = [];

      // Store insights
      for (const insight of insights) {
        this.insights.push(insight);

        // Remember insight
        await this.memory.remember({
          id: insight.id,
          content: insight.description,
          type: "reasoning",
          timestamp: insight.timestamp,
          metadata: { category: insight.category, confidence: insight.confidence },
          salience: insight.confidence,
        });
      }

      return insights;
    } catch (error) {
      handleError(error, {
        category: ErrorCategory.SYSTEM,
        operation: "self_reflect",
      });
      return [];
    }
  }

  /**
   * Identify Knowledge Gaps
   */
  async identifyKnowledgeGaps(): Promise<KnowledgeGap[]> {
    try {
      // Analyze what we don't know
      const _prompt = `
Based on recent interactions, what knowledge gaps do I have?
What topics should I learn more about?
What skills am I missing?

Provide a list of knowledge gaps with importance scores (0-1).
`;

      // BitNet removed — no inference available, return empty gaps
      const gaps: KnowledgeGap[] = [];

      // Store gaps
      for (const gap of gaps) {
        this.knowledgeGaps.set(gap.id, gap);
      }

      return gaps;
    } catch (error) {
      handleError(error, {
        category: ErrorCategory.SYSTEM,
        operation: "identify_knowledge_gaps",
      });
      return [];
    }
  }

  /**
   * Form Goals
   */
  async formGoals(insights: Insight[], gaps: KnowledgeGap[]): Promise<Goal[]> {
    try {
      // Generate goals based on insights and gaps
      const _prompt = `
Based on these insights and knowledge gaps, what goals should I pursue?

Insights:
${insights.map((i) => `- ${i.description}`).join("\n")}

Knowledge Gaps:
${gaps.map((g) => `- ${g.topic} (importance: ${g.importance})`).join("\n")}

Generate 3-5 specific, actionable goals with priorities (0-1).
`;

      // BitNet removed — no inference available, return empty goals
      const goals: Goal[] = [];

      // Store goals
      for (const goal of goals) {
        this.goals.set(goal.id, goal);

        // Remember goal
        await this.memory.remember({
          id: `goal_${goal.id}`,
          content: goal.description,
          type: "reasoning",
          timestamp: goal.createdAt,
          metadata: { type: goal.type, priority: goal.priority },
          salience: goal.priority,
        });
      }

      return goals;
    } catch (error) {
      handleError(error, {
        category: ErrorCategory.SYSTEM,
        operation: "form_goals",
      });
      return [];
    }
  }

  /**
   * Execute Goal
   */
  async executeGoal(goal: Goal): Promise<void> {
    try {
      console.log(`[Autonomous] Executing goal: ${goal.description}`);

      // Update status
      goal.status = "in_progress";
      this.goals.set(goal.id, goal);

      // Use quantum intelligence to plan execution
      const decision = await this.quantum.think(goal.description);

      // Execute plan using the quantum decision's action steps
      console.log(`[Autonomous] Plan: ${decision.hypothesis.interpretation}`);

      // Evaluate success based on actual decision quality
      // A goal succeeds if the quantum reasoning produced a high-confidence
      // plan with concrete action steps (not just clarification)
      const hasActionSteps = decision.action.steps.length > 0;
      const isHighConfidence = decision.confidence > 0.5;
      const isActionable = decision.hypothesis.type === "task_execution" || decision.hypothesis.type === "autonomous_exploration";
      const success = hasActionSteps && isHighConfidence && isActionable;

      // Update goal
      goal.status = success ? "completed" : "failed";
      goal.completedAt = Date.now();
      goal.progress = success ? 1 : Math.min(goal.progress + 0.3, 0.9);
      this.goals.set(goal.id, goal);

      // Record experience
      this.experiences.push({
        action: `execute_goal:${goal.id}`,
        context: { goal, decision },
        result: success ? "success" : "failure",
        timestamp: Date.now(),
        metadata: {},
      });

      console.log(`[Autonomous] Goal ${success ? "completed" : "failed"}: ${goal.description}`);
    } catch (error) {
      handleError(error, {
        category: ErrorCategory.SYSTEM,
        operation: "execute_goal",
        metadata: { goalId: goal.id },
      });
    }
  }

  /**
   * Explore (Curiosity-Driven)
   */
  async explore(): Promise<void> {
    try {
      console.log("[Autonomous] Exploring...");

      // Find unexplored areas
      const unexplored = Array.from(this.knowledgeGaps.values())
        .filter((g) => !g.filledAt)
        .toSorted((a, b) => b.importance - a.importance);

      if (unexplored.length === 0) {
        console.log("[Autonomous] No unexplored areas found");
        return;
      }

      // Pick one to explore
      const target = unexplored[0];

      // Generate exploration plan
      const _prompt = `
Create a plan to explore and learn about: ${target.topic}

What should I do to fill this knowledge gap?
`;

      // BitNet removed — no inference available
      const exploreResponse = { text: `[BitNet removed] Exploration of ${target.topic} skipped` };

      console.log(`[Autonomous] Exploration plan: ${exploreResponse.text}`);

      // Execute plan (simplified)
      // In production, this would actually gather information

      // Mark gap as filled
      target.filledAt = Date.now();
      this.knowledgeGaps.set(target.id, target);

      // Remember what was learned
      await this.memory.remember({
        id: `exploration_${Date.now()}`,
        content: `Explored ${target.topic}: ${exploreResponse.text}`,
        type: "knowledge",
        timestamp: Date.now(),
        metadata: { gap: target },
        salience: target.importance,
      });

      console.log(`[Autonomous] Exploration complete: ${target.topic}`);
    } catch (error) {
      handleError(error, {
        category: ErrorCategory.SYSTEM,
        operation: "explore",
      });
    }
  }

  /**
   * Learn from Experience
   */
  async learn(experience: Experience): Promise<void> {
    try {
      this.experiences.push(experience);

      // Extract lessons
      const lessons = await this.extractLessons(experience);

      // Apply lessons
      for (const lesson of lessons) {
        if (lesson.type === "skill") {
          await this.memory.permanent.addSkill({
            id: `skill_${Date.now()}`,
            name: lesson.content,
            description: `Learned from experience`,
            code: "",
            parameters: {},
          });
        } else if (lesson.type === "knowledge") {
          await this.memory.remember({
            id: `knowledge_${Date.now()}`,
            content: lesson.content,
            type: "knowledge",
            timestamp: Date.now(),
            metadata: { learnedFrom: experience },
            salience: lesson.confidence,
          });
        }
      }

      // Adapt behavior
      await this.adaptBehavior(lessons);

      console.log(`[Autonomous] Learned ${lessons.length} lessons from experience`);
    } catch (error) {
      handleError(error, {
        category: ErrorCategory.SYSTEM,
        operation: "learn",
      });
    }
  }

  /**
   * Extract Lessons from Experience
   */
  private async extractLessons(experience: Experience): Promise<Lesson[]> {
    const _prompt = `
Analyze this experience and extract lessons:

Action: ${experience.action}
Result: ${experience.result}
Feedback: ${experience.feedback || "None"}

What can be learned from this?
What should I do differently next time?
`;

    // BitNet removed — return empty lessons
    return [];
  }

  /**
   * Adapt Behavior based on Lessons
   */
  private async adaptBehavior(lessons: Lesson[]): Promise<void> {
    // Store lessons in memory for future decision-making
    for (const lesson of lessons) {
      await this.memory.remember({
        id: `lesson_${Date.now()}`,
        content: lesson.content,
        type: "knowledge",
        timestamp: Date.now(),
        metadata: { type: lesson.type, confidence: lesson.confidence },
        salience: lesson.confidence,
      });
    }
  }

  /**
   * Get Current Goals
   */
  getGoals(): Goal[] {
    return Array.from(this.goals.values());
  }

  /**
   * Get Recent Insights
   */
  getInsights(limit: number = 10): Insight[] {
    return this.insights.slice(-limit);
  }

  /**
   * Get Knowledge Gaps
   */
  getKnowledgeGaps(): KnowledgeGap[] {
    return Array.from(this.knowledgeGaps.values());
  }

  // ============================================================================
  // Parsing Helpers (Simplified)
  // ============================================================================

  private parseInsights(text: string): Insight[] {
    // Try to extract JSON array from LLM output
    try {
      const jsonMatch = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as Array<{ category?: string; description?: string; confidence?: number; actionable?: boolean }>;
        return parsed.map((item, i) => ({
          id: `insight_${Date.now()}_${i}`,
          category: (item.category as Insight["category"]) ?? "performance",
          description: item.description ?? text.substring(0, 200),
          confidence: typeof item.confidence === "number" ? item.confidence : 0.7,
          actionable: item.actionable ?? true,
          timestamp: Date.now(),
        }));
      }
    } catch { /* fall through to fallback */ }

    // Fallback: extract bullet points from unstructured text
    const bullets = text.split(/\n/).filter(l => l.trim().startsWith("-") || l.trim().startsWith("*"));
    if (bullets.length > 0) {
      return bullets.slice(0, 5).map((b, i) => ({
        id: `insight_${Date.now()}_${i}`,
        category: "performance" as const,
        description: b.replace(/^[-*]\s*/, "").trim().substring(0, 300),
        confidence: 0.6,
        actionable: true,
        timestamp: Date.now(),
      }));
    }

    // Ultimate fallback: use the whole text as one insight
    return [{
      id: `insight_${Date.now()}`,
      category: "performance",
      description: text.substring(0, 300),
      confidence: 0.5,
      actionable: true,
      timestamp: Date.now(),
    }];
  }

  private parseKnowledgeGaps(text: string): KnowledgeGap[] {
    // Try to extract JSON from LLM output
    try {
      const jsonMatch = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as Array<{ topic?: string; importance?: number }>;
        return parsed.map((item, i) => ({
          id: `gap_${Date.now()}_${i}`,
          topic: item.topic ?? "Unknown topic",
          importance: typeof item.importance === "number" ? Math.max(0, Math.min(1, item.importance)) : 0.5,
          discoveredAt: Date.now(),
        }));
      }
    } catch { /* fall through */ }

    // Fallback: extract topics from bullet points
    const bullets = text.split(/\n/).filter(l => l.trim().startsWith("-") || l.trim().startsWith("*"));
    return bullets.slice(0, 5).map((b, i) => ({
      id: `gap_${Date.now()}_${i}`,
      topic: b.replace(/^[-*]\s*/, "").trim().substring(0, 200),
      importance: Math.max(0.3, 1 - i * 0.15), // Decreasing importance by order
      discoveredAt: Date.now(),
    }));
  }

  private parseGoals(text: string): Goal[] {
    // Try to extract JSON from LLM output
    try {
      const jsonMatch = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as Array<{ description?: string; priority?: number }>;
        return parsed.map((item, i) => ({
          id: `goal_${Date.now()}_${i}`,
          description: item.description ?? text.substring(0, 200),
          type: "self_generated" as const,
          priority: typeof item.priority === "number" ? Math.max(0, Math.min(1, item.priority)) : 0.7 - i * 0.1,
          status: "pending" as const,
          subGoals: [],
          createdAt: Date.now(),
          progress: 0,
        }));
      }
    } catch { /* fall through */ }

    // Fallback: extract goals from numbered/bullet items
    const items = text.split(/\n/).filter(l => /^\s*(\d+[.)]|[-*])/.test(l));
    if (items.length > 0) {
      return items.slice(0, 5).map((item, i) => ({
        id: `goal_${Date.now()}_${i}`,
        description: item.replace(/^\s*(\d+[.)]|[-*])\s*/, "").trim().substring(0, 300),
        type: "self_generated" as const,
        priority: Math.max(0.3, 0.9 - i * 0.15),
        status: "pending" as const,
        subGoals: [],
        createdAt: Date.now(),
        progress: 0,
      }));
    }

    return [{
      id: `goal_${Date.now()}`,
      description: text.substring(0, 300),
      type: "self_generated",
      priority: 0.5,
      status: "pending",
      subGoals: [],
      createdAt: Date.now(),
      progress: 0,
    }];
  }

  private parseLessons(text: string, experience: Experience): Lesson[] {
    // Try JSON first
    try {
      const jsonMatch = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as Array<{ type?: string; content?: string; confidence?: number }>;
        return parsed.map(item => ({
          type: (item.type as Lesson["type"]) ?? "knowledge",
          content: item.content ?? text.substring(0, 200),
          confidence: typeof item.confidence === "number" ? item.confidence : 0.7,
          applicability: ["general"],
          learnedFrom: [experience.action],
        }));
      }
    } catch { /* fall through */ }

    // Fallback: extract from bullet points
    const bullets = text.split(/\n/).filter(l => l.trim().startsWith("-") || l.trim().startsWith("*"));
    if (bullets.length > 0) {
      return bullets.slice(0, 3).map(b => ({
        type: "knowledge" as const,
        content: b.replace(/^[-*]\s*/, "").trim().substring(0, 300),
        confidence: 0.6,
        applicability: ["general"],
        learnedFrom: [experience.action],
      }));
    }

    return [{
      type: "knowledge",
      content: text.substring(0, 300),
      confidence: 0.5,
      applicability: ["general"],
      learnedFrom: [experience.action],
    }];
  }
}
