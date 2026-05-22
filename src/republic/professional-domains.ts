/**
 * Republic Platform — Professional Domain Registry
 *
 * Dynamic taxonomy of knowledge domains, degree templates,
 * and professional toolkit integrations. Citizens can discover,
 * study, and certify in ANY profession — from radiology to
 * international law — through this registry.
 *
 * Key concepts:
 * - DomainNode: hierarchical taxonomy (Medicine → Radiology → Neuroradiology)
 * - DegreeTemplate: certification requirements per level
 * - ProfessionalToolkit: maps domains to AI capabilities
 * - Dynamic discovery: citizens can propose new domains
 */

import type {
    CertificationLevel,
    DegreeTemplate,
    DomainNode,
    ProfessionalToolkit,
    RepublicState
} from "./types.js";
import { getEnabledTools } from "./tool-executor.js";
import { ts, uid } from "./utils.js";

// ─── Constants ──────────────────────────────────────────────────

const MAX_DOMAINS = 500;
const MAX_TOOLKITS = 200;

import { SEED_DOMAINS } from "./domains/seed-data.js";
import { CERTIFICATION_ORDER, DEGREE_TEMPLATES } from "./domains/templates.js";
import { seedToolkits, toolkitStore } from "./domains/toolkits.js";
export { DEGREE_TEMPLATES, CERTIFICATION_ORDER };


// ─── Domain Registry ────────────────────────────────────────────

/**
 * Ensure the domain registry is initialized with seed domains.
 * Called lazily when any domain operation is performed.
 */
export function ensureDomainRegistry(s: RepublicState): void {
  if (s.domainRegistry && s.domainRegistry.length > 0) {
    return;
  }

  seedToolkits();
  s.domainRegistry = [];

  // Build parent-child relationships from seed data
  const pathMap = new Map<string, DomainNode>();

  for (const seed of SEED_DOMAINS) {
    const node: DomainNode = {
      id: `dom-${uid()}`,
      path: seed.path,
      name: seed.name,
      description: seed.description,
      coreSkills: seed.coreSkills,
      toolkitIds: toolkitStore
        .filter((tk) => tk.domainPath === seed.path || seed.path.startsWith(tk.domainPath))
        .map((tk) => tk.id),
      minPracticeLevel: seed.minPracticeLevel,
      childIds: [],
      origin: "seed",
      createdAt: ts(),
    };
    pathMap.set(seed.path, node);
    s.domainRegistry.push(node);
  }

  // Wire parent-child relationships
  for (const node of s.domainRegistry) {
    const parts = node.path.split(".");
    if (parts.length > 1) {
      const parentPath = parts.slice(0, -1).join(".");
      const parent = pathMap.get(parentPath);
      if (parent) {
        node.parentId = parent.id;
        parent.childIds.push(node.id);
      }
    }
  }
}

/** 
 * Phase 11: Dynamically synthesize ProfessionalDomains for newly registered tools.
 * This bonds tools (including dynamically loaded plugins) into the curriculum taxonomy,
 * allowing citizens to officially study, certify, and practice them.
 */
export function syncToolDomains(s: RepublicState): void {
  ensureDomainRegistry(s);
  
  const tools = getEnabledTools();
  for (const tool of tools) {
     // Check if we already have a domain for this specific tool to avoid spam
     const domainPath = `applied.tools.${tool.id}`;
     const exists = (s.domainRegistry ?? []).some(d => d.path === domainPath);
     if (exists) { continue; }

     // Auto-register a new domain for this tool
     try {
       // Ensure parent 'applied.tools' exists
       if (!(s.domainRegistry ?? []).some(d => d.path === "applied.tools")) {
           registerDomain(
               s, 
               "applied.tools", 
               "Applied Tooling", 
               "Practical application and mastery of specific software tools and plugins.", 
               ["software usage", "tool proficiency"],
               "certificate",
               "discovered"
           );
       }

       // Register the tool itself as a domain
       registerDomain(
         s,
         domainPath,
         `Mastery of ${tool.name}`,
         `Official certification track for operating the ${tool.name} tool. ${tool.description}`,
         [tool.name, tool.id, "tool proficiency"],
         "certificate", // Everyone can start learning it
         "discovered"
       );
     } catch {
       // Ignore duplicate path errors safely during concurrent registration
     }
  }
}

// ─── Domain CRUD ────────────────────────────────────────────────

/** Get all domains in the registry */
export function getDomains(s: RepublicState): DomainNode[] {
  ensureDomainRegistry(s);
  return s.domainRegistry ?? [];
}

/** Get a domain by ID */
export function getDomainById(s: RepublicState, domainId: string): DomainNode | undefined {
  ensureDomainRegistry(s);
  return (s.domainRegistry ?? []).find((d) => d.id === domainId);
}

/** Get a domain by its dot-separated path */
export function getDomainByPath(s: RepublicState, path: string): DomainNode | undefined {
  ensureDomainRegistry(s);
  return (s.domainRegistry ?? []).find((d) => d.path === path);
}

/** Get all child domains of a given domain */
export function getChildDomains(s: RepublicState, domainId: string): DomainNode[] {
  ensureDomainRegistry(s);
  const parent = getDomainById(s, domainId);
  if (!parent) {
    return [];
  }
  return (s.domainRegistry ?? []).filter((d) => parent.childIds.includes(d.id));
}

/** Get all root-level domains (no parent) */
export function getRootDomains(s: RepublicState): DomainNode[] {
  ensureDomainRegistry(s);
  return (s.domainRegistry ?? []).filter((d) => !d.parentId);
}

/** Search domains by keyword in name, description, or skills */
export function searchDomains(s: RepublicState, query: string): DomainNode[] {
  ensureDomainRegistry(s);
  const q = query.toLowerCase();
  return (s.domainRegistry ?? []).filter(
    (d) =>
      d.name.toLowerCase().includes(q) ||
      d.description.toLowerCase().includes(q) ||
      d.path.toLowerCase().includes(q) ||
      d.coreSkills.some((sk) => sk.toLowerCase().includes(q)),
  );
}

/**
 * Register a new domain (citizen-proposed or auto-discovered).
 * Automatically wires parent-child relationships.
 */
export function registerDomain(
  s: RepublicState,
  path: string,
  name: string,
  description: string,
  coreSkills: string[],
  minPracticeLevel: CertificationLevel = "certificate",
  origin: DomainNode["origin"] = "proposed",
): DomainNode {
  ensureDomainRegistry(s);

  if ((s.domainRegistry ?? []).length >= MAX_DOMAINS) {
    throw new Error(`Domain registry full (max ${MAX_DOMAINS})`);
  }

  // Check for duplicate path
  if ((s.domainRegistry ?? []).some((d) => d.path === path)) {
    throw new Error(`Domain path "${path}" already registered`);
  }

  const node: DomainNode = {
    id: `dom-${uid()}`,
    path,
    name,
    description,
    coreSkills,
    toolkitIds: toolkitStore
      .filter((tk) => tk.domainPath === path || path.startsWith(tk.domainPath))
      .map((tk) => tk.id),
    minPracticeLevel,
    childIds: [],
    origin,
    createdAt: ts(),
  };

  // Wire to parent
  const parts = path.split(".");
  if (parts.length > 1) {
    const parentPath = parts.slice(0, -1).join(".");
    const parent = (s.domainRegistry ?? []).find((d) => d.path === parentPath);
    if (parent) {
      node.parentId = parent.id;
      parent.childIds.push(node.id);
    }
  }

  s.domainRegistry!.push(node);
  return node;
}

/** Remove a domain and optionally its children */
export function removeDomain(s: RepublicState, domainId: string, recursive = false): boolean {
  ensureDomainRegistry(s);
  const domain = getDomainById(s, domainId);
  if (!domain) {
    return false;
  }

  if (recursive) {
    // Remove all children first
    for (const childId of domain.childIds) {
      removeDomain(s, childId, true);
    }
  } else if (domain.childIds.length > 0) {
    return false; // Can't remove a parent without recursive flag
  }

  // Remove from parent's childIds
  if (domain.parentId) {
    const parent = getDomainById(s, domain.parentId);
    if (parent) {
      parent.childIds = parent.childIds.filter((id) => id !== domainId);
    }
  }

  s.domainRegistry = (s.domainRegistry ?? []).filter((d) => d.id !== domainId);
  return true;
}

// ─── Toolkit Management ─────────────────────────────────────────

/** Get all registered toolkits */
export function getToolkits(): ProfessionalToolkit[] {
  seedToolkits();
  return toolkitStore;
}

/** Get toolkits for a specific domain path */
export function getToolkitsForDomain(domainPath: string): ProfessionalToolkit[] {
  seedToolkits();
  return toolkitStore.filter(
    (tk) => tk.domainPath === domainPath || domainPath.startsWith(tk.domainPath),
  );
}

/** Register a new professional toolkit */
export function registerToolkit(
  domainPath: string,
  name: string,
  description: string,
  backendType: ProfessionalToolkit["backendType"],
  capabilities: string[],
): ProfessionalToolkit {
  seedToolkits();
  if (toolkitStore.length >= MAX_TOOLKITS) {
    throw new Error(`Toolkit registry full (max ${MAX_TOOLKITS})`);
  }
  const toolkit: ProfessionalToolkit = {
    id: `tk-${uid()}`,
    domainPath,
    name,
    description,
    backendType,
    capabilities,
    available: true,
  };
  toolkitStore.push(toolkit);
  return toolkit;
}

/** Get a toolkit by ID */
export function getToolkitById(toolkitId: string): ProfessionalToolkit | undefined {
  seedToolkits();
  return toolkitStore.find((tk) => tk.id === toolkitId);
}

// ─── Degree & Certification Helpers ─────────────────────────────

/** Get the degree template for a given certification level */
export function getDegreeTemplate(level: CertificationLevel): DegreeTemplate {
  return DEGREE_TEMPLATES[level];
}

/** Compare two certification levels. Returns negative if a < b, 0 if equal, positive if a > b */
export function compareCertificationLevels(a: CertificationLevel, b: CertificationLevel): number {
  return CERTIFICATION_ORDER.indexOf(a) - CERTIFICATION_ORDER.indexOf(b);
}

/** Get the next certification level above the current one */
export function getNextLevel(current: CertificationLevel | "none"): CertificationLevel | null {
  if (current === "none") {
    return "certificate";
  }
  const idx = CERTIFICATION_ORDER.indexOf(current);
  if (idx < 0 || idx >= CERTIFICATION_ORDER.length - 1) {
    return null;
  }
  return CERTIFICATION_ORDER[idx + 1];
}

/** Check if an XP amount qualifies for a given certification level */
export function qualifiesForLevel(xp: number, level: CertificationLevel): boolean {
  return xp >= DEGREE_TEMPLATES[level].xpThreshold;
}

// ─── Domain Ancestry ────────────────────────────────────────────

/** Get the full ancestry path of a domain (from root to leaf) */
export function getDomainAncestry(s: RepublicState, domainId: string): DomainNode[] {
  ensureDomainRegistry(s);
  const ancestry: DomainNode[] = [];
  let current = getDomainById(s, domainId);
  while (current) {
    ancestry.unshift(current);
    current = current.parentId ? getDomainById(s, current.parentId) : undefined;
  }
  return ancestry;
}

/** Get all domains in a subtree (domain + all descendants) */
export function getDomainSubtree(s: RepublicState, domainId: string): DomainNode[] {
  ensureDomainRegistry(s);
  const result: DomainNode[] = [];
  const queue = [domainId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const node = getDomainById(s, id);
    if (node) {
      result.push(node);
      queue.push(...node.childIds);
    }
  }
  return result;
}

// ─── Diagnostics ────────────────────────────────────────────────

/** Get professional domain system diagnostics */
export function getDomainDiagnostics(s: RepublicState): {
  totalDomains: number;
  rootDomains: number;
  seedDomains: number;
  discoveredDomains: number;
  proposedDomains: number;
  totalToolkits: number;
  domainsWithToolkits: number;
  maxDepth: number;
} {
  ensureDomainRegistry(s);
  const domains = s.domainRegistry ?? [];

  let maxDepth = 0;
  for (const d of domains) {
    const depth = d.path.split(".").length;
    if (depth > maxDepth) {
      maxDepth = depth;
    }
  }

  return {
    totalDomains: domains.length,
    rootDomains: domains.filter((d) => !d.parentId).length,
    seedDomains: domains.filter((d) => d.origin === "seed").length,
    discoveredDomains: domains.filter((d) => d.origin === "discovered").length,
    proposedDomains: domains.filter((d) => d.origin === "proposed").length,
    totalToolkits: toolkitStore.length,
    domainsWithToolkits: domains.filter((d) => d.toolkitIds.length > 0).length,
    maxDepth,
  };
}
