
import type { SkillEntry } from "../agents/skills/types.js";
import type { PluginRegistry } from "../plugins/registry.js";

export type CapabilityType = "tool" | "hook" | "skill" | "channel" | "gateway_method";

export interface CapabilityNode {
  id: string; // unique id (e.g. plugin:discord:send_message)
  type: CapabilityType;
  name: string;
  source: string; // plugin id or skill file
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface CapabilityEdge {
  from: string; // node id
  to: string;   // node id
  relation: "provides" | "consumes" | "listens_to" | "emits";
}

export class CapabilityGraph {
  nodes: Map<string, CapabilityNode> = new Map();
  edges: CapabilityEdge[] = [];

  

  public ingestPlugins(registry: PluginRegistry) {
    for (const plugin of registry.plugins) {
       // Plugin is a source
       const pluginNodeId = `plugin:${plugin.id}`;
       
       // 1. Tools
       // The registry.tools array has the actual tool definitions? 
       // Registry.tools is PluginToolRegistration[] which has 'names'
       const pluginTools = registry.tools.filter(t => t.pluginId === plugin.id);
       for (const tool of pluginTools) {
           for (const name of tool.names) {
               const nodeId = `tool:${plugin.id}:${name}`;
               this.addNode({
                   id: nodeId,
                   type: "tool",
                   name: name,
                   source: plugin.id,
                   description: `Tool provided by ${plugin.id}`
               });
               this.addEdge({ from: pluginNodeId, to: nodeId, relation: "provides" });
           }
       }

       // 2. Hooks
       const pluginHooks = registry.hooks.filter(h => h.pluginId === plugin.id);
       for (const hook of pluginHooks) {
           // A hook listener
           const nodeId = `hook:${plugin.id}:${hook.entry.hook.name}`;
            this.addNode({
                id: nodeId,
                type: "hook",
                name: hook.entry.hook.name,
                source: plugin.id,
                description: hook.entry.hook.description
            });
            this.addEdge({ from: pluginNodeId, to: nodeId, relation: "provides" });

            // Events listened to
            for (const event of hook.events) {
                // Event node (virtual)
                const eventId = `event:${event}`;
                if (!this.nodes.has(eventId)) {
                     // We create event nodes lazily
                     // But strictly speaking, we don't know who emits them yet
                }
                // The hook listens to the event
                this.addEdge({ from: nodeId, to: eventId, relation: "listens_to" });
            }
       }
       
       // 3. Gateway Methods
       for (const method of plugin.gatewayMethods) {
           const nodeId = `method:${plugin.id}:${method}`;
           this.addNode({
               id: nodeId,
               type: "gateway_method",
               name: method,
               source: plugin.id
           });
           this.addEdge({ from: pluginNodeId, to: nodeId, relation: "provides" });
       }
    }
  }

  public ingestSkills(entries: SkillEntry[]) {
      for (const entry of entries) {
          const skillName = entry.skill.name;
          const nodeId = `skill:${skillName}`;
          this.addNode({
              id: nodeId,
              type: "skill",
              name: skillName,
              source: entry.skill.filePath,
              description: entry.skill.description,
              metadata: {
                  primaryEnv: entry.metadata?.primaryEnv,
                  requires: entry.metadata?.requires
              }
          });
      }
  }

  /**
   * Register standalone gateway methods (e.g. Windows Companion commands)
   * as capability nodes so QuantumIntelligence can discover them.
   */
  public ingestGatewayMethods(methods: string[], descriptions?: Record<string, string>) {
      for (const method of methods) {
          const nodeId = `method:gateway:${method}`;
          const desc = descriptions?.[method]
              ?? method.replace(/\./g, " ").replace(/^windows /, "Windows: ");
          this.addNode({
              id: nodeId,
              type: "gateway_method",
              name: method,
              source: "gateway",
              description: desc,
          });
      }
  }

  public addNode(node: CapabilityNode) {
      this.nodes.set(node.id, node);
  }

  public addEdge(edge: CapabilityEdge) {
      this.edges.push(edge);
  }

  /**
   * Find capabilities matching a query. Uses scored multi-word matching:
   * each node scores +1 per matching query word. Only the top results
   * (sorted by score) are returned to avoid flooding with generic matches.
   */
  public findCapabilities(query: string): CapabilityNode[] {
      const stopWords = new Set([
          "a", "an", "the", "all", "on", "in", "to", "and", "or", "my",
          "is", "of", "for", "at", "it", "do", "can", "you", "me", "this",
          "that", "with", "from", "be", "have", "has", "was", "were",
      ]);
      const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
      if (words.length === 0) {return [];}

      const scored: { node: CapabilityNode; score: number }[] = [];

      for (const node of this.nodes.values()) {
          // Strip namespace prefixes (e.g. "windows.") from names so they
          // don't inflate scores — every companion tool has "windows." in its name.
          const strippedName = node.name.replace(/^windows\./, "");
          const haystack = `${strippedName} ${node.description ?? ""}`.toLowerCase();
          let score = 0;
          for (const w of words) {
              if (haystack.includes(w)) {score++;}
          }
          if (score >= 2) { // Require at least 2 query words to match
              scored.push({ node, score });
          }
      }

      // Sort by score descending, return top 10
      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, 10).map(s => s.node);
  }

  public dump(): object {
      return {
          nodes: Array.from(this.nodes.values()),
          edges: this.edges
      };
  }
}
