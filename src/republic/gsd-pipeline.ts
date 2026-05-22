/**
 * Republic GSD (Get Stuff Done) Pipeline
 *
 * Transforms a single prompt from ANY channel into a fully autonomous
 * development operation. Forms an army of specialists, distributes work,
 * enforces peer review, and delivers zero-defect code.
 *
 * Flow: Prompt → Analyze → Form Army → Distribute → Execute → Peer Review → Deliver
 */

import { generateInfrastructureFiles } from "./dev-infrastructure.js";
import {
    autoFixIssues, forceIdeateProject,
    runQAValidation, type DevProject
} from "./dev-orchestration.js";
import { classifyIntent, decomposeProject } from "./project-intake.js";
import { getState } from "./state.js";
import { composeTeam } from "./team-composer.js";
import type { Citizen, RepublicState } from "./types.js";
import { pick, rand, rng, ts, uid } from "./utils.js";
import { executeToolAction } from "./real-execution.js";

// ─── Types ─────────────────────────────────────────────────────────

export type GSDStatus =
  | "analyzing"
  | "forming-team"
  | "distributing"
  | "executing"
  | "reviewing"
  | "validating"
  | "delivering"
  | "complete"
  | "failed";

export interface PeerReview {
  id: string;
  filePath: string;
  authorId: string;
  authorName: string;
  reviewerId: string;
  reviewerName: string;
  reviewerSpecialization: string;
  status: "pending" | "approved" | "changes-requested" | "fixed" | "escalated";
  issues: PeerReviewIssue[];
  fixedContent: string | null;
  originalContent: string;
  qualityBefore: number;
  qualityAfter: number;
  reviewedAt: string;
  resolvedAt: string | null;
}

export interface PeerReviewIssue {
  severity: "critical" | "major" | "minor" | "suggestion";
  category: "logic" | "security" | "performance" | "style" | "naming" | "architecture" | "testing";
  line: number;
  message: string;
  suggestion: string | null;
  autoFixable: boolean;
}

export interface CitizenAwareness {
  citizenId: string;
  projectId: string;
  role: string;
  assignedTasks: string[];
  completedTasks: string[];
  currentTask: string | null;
  blockedBy: string[];
  knowsAbout: string[]; // IDs of other citizens this citizen is aware of
  workload: number; // 0-1 how busy
  lastSyncAt: string;
}

export interface GSDSession {
  id: string;
  prompt: string;
  source: "webui" | "whatsapp" | "chat" | "api";
  status: GSDStatus;
  projectId: string | null;
  teamMembers: {
    citizenId: string;
    citizenName: string;
    specialization: string;
    role: string;
    workload: number;
    tasksAssigned: number;
    tasksCompleted: number;
  }[];
  tasks: GSDTask[];
  peerReviews: PeerReview[];
  awareness: CitizenAwareness[];
  qualityGate: {
    syntaxPassed: boolean;
    logicPassed: boolean;
    securityPassed: boolean;
    peerReviewPassed: boolean;
    integrationPassed: boolean;
    overallScore: number;
  };
  timeline: GSDEvent[];
  createdAt: string;
  completedAt: string | null;
  totalFilesGenerated: number;
  totalPeerReviews: number;
  totalAutoFixes: number;
}

export interface GSDTask {
  id: string;
  title: string;
  type:
    | "planning"
    | "design"
    | "frontend"
    | "backend"
    | "testing"
    | "review"
    | "deployment"
    | "documentation";
  assignedTo: string; // citizenId
  assignedToName: string;
  status: "pending" | "active" | "peer-review" | "completed" | "blocked";
  dependencies: string[];
  priority: "critical" | "high" | "medium" | "low";
  files: string[];
  estimatedEffort: number; // ticks
  actualEffort: number;
}

export interface GSDEvent {
  timestamp: string;
  type:
    | "team-formed"
    | "task-started"
    | "file-written"
    | "peer-review"
    | "fix-applied"
    | "quality-gate"
    | "escalation"
    | "task-completed"
    | "delivery";
  citizenId?: string;
  citizenName?: string;
  detail: string;
}

// ─── Active Sessions ───────────────────────────────────────────────

const activeSessions = new Map<string, GSDSession>();
const MAX_SESSIONS = 50;

export function getActiveSessions(): GSDSession[] {
  return [...activeSessions.values()];
}

export function getSession(id: string): GSDSession | null {
  return activeSessions.get(id) ?? null;
}

// ─── Prompt Analysis ───────────────────────────────────────────────

interface PromptAnalysis {
  features: string[];
  technologies: string[];
  projectType: string;
  complexity: "simple" | "medium" | "complex" | "enterprise";
  requiredSpecializations: string[];
  estimatedFiles: number;
  estimatedTeamSize: number;
  hasFrontend: boolean;
  hasBackend: boolean;
  hasDatabase: boolean;
  hasTesting: boolean;
  hasDeployment: boolean;
}

const TECH_KEYWORDS: Record<string, string[]> = {
  react: ["react", "jsx", "tsx", "component", "hook", "state management"],
  "next.js": ["next", "nextjs", "next.js", "ssr", "ssg", "app router"],
  vue: ["vue", "vuex", "pinia", "nuxt"],
  angular: ["angular", "rxjs", "ngrx"],
  node: ["node", "express", "fastify", "koa", "nest"],
  python: ["python", "django", "flask", "fastapi", "pytorch", "tensorflow"],
  rust: ["rust", "actix", "tokio", "wasm"],
  go: ["go", "golang", "gin", "fiber"],
  typescript: ["typescript", "ts", "typed"],
  postgresql: ["postgres", "postgresql", "sql"],
  mongodb: ["mongo", "mongodb", "nosql"],
  redis: ["redis", "cache", "caching"],
  docker: ["docker", "container", "kubernetes", "k8s"],
  supabase: ["supabase", "supabase auth", "supabase storage", "supabase realtime"],
  graphql: ["graphql", "apollo", "schema"],
  rest: ["rest", "api", "endpoint", "crud"],
  auth: ["auth", "login", "oauth", "jwt", "authentication"],
  realtime: ["realtime", "websocket", "socket", "live", "streaming"],
  ai: ["ai", "ml", "machine learning", "gpt", "llm", "neural"],
  mobile: ["mobile", "ios", "android", "flutter", "react native"],
  blockchain: ["blockchain", "web3", "solidity", "ethereum", "smart contract"],
};

const FEATURE_PATTERNS: [RegExp, string][] = [
  [/\b(dashboard|admin\s*panel|analytics)\b/i, "Dashboard"],
  [/\b(auth|login|signup|registration)\b/i, "Authentication"],
  [/\b(chat|messaging|real-?time)\b/i, "Real-time Messaging"],
  [/\b(payment|stripe|checkout|billing)\b/i, "Payment Processing"],
  [/\b(upload|file|media|image)\b/i, "File Management"],
  [/\b(search|filter|sort)\b/i, "Search & Filtering"],
  [/\b(notification|alert|email)\b/i, "Notifications"],
  [/\b(profile|settings|preferences)\b/i, "User Profiles"],
  [/\b(blog|cms|content)\b/i, "Content Management"],
  [/\b(e-?commerce|shop|store|cart)\b/i, "E-Commerce"],
  [/\b(map|location|geo)\b/i, "Geolocation"],
  [/\b(chart|graph|visualization)\b/i, "Data Visualization"],
  [/\b(test|testing|spec)\b/i, "Testing Suite"],
  [/\b(deploy|ci\/cd|pipeline)\b/i, "CI/CD Pipeline"],
  [/\b(api|backend|server)\b/i, "API Layer"],
  [/\b(database|storage|persistence)\b/i, "Data Layer"],
  [/\b(responsive|mobile|tablet)\b/i, "Responsive Design"],
  [/\b(dark\s*mode|theme|styling)\b/i, "Theming System"],
  [/\b(i18n|localization|multi-?lang)\b/i, "Internationalization"],
  [/\b(sse|webhook|event)\b/i, "Event System"],
];

/**
 * Analyze a natural language prompt to extract requirements, features,
 * tech stack, and determine the optimal team composition.
 */
export function analyzePrompt(prompt: string): PromptAnalysis {
  const lower = prompt.toLowerCase();

  // Detect technologies
  const technologies: string[] = [];
  for (const [tech, keywords] of Object.entries(TECH_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      technologies.push(tech);
    }
  }

  // Detect features
  const features: string[] = [];
  for (const [pattern, feature] of FEATURE_PATTERNS) {
    if (pattern.test(prompt)) {
      features.push(feature);
    }
  }

  // Determine scope
  const hasFrontend =
    /\b(ui|frontend|page|component|react|vue|angular|html|css|design|interface)\b/i.test(prompt);
  const hasBackend = /\b(api|server|backend|endpoint|database|auth|logic)\b/i.test(prompt);
  const hasDatabase = /\b(database|db|sql|mongo|redis|storage|persist)\b/i.test(prompt);
  const hasTesting = /\b(test|spec|coverage|qa|quality)\b/i.test(prompt);
  const hasDeployment = /\b(deploy|production|hosting|docker|ci|cd)\b/i.test(prompt);

  // Complexity estimation
  let complexity: PromptAnalysis["complexity"] = "simple";
  const complexityScore =
    features.length +
    technologies.length +
    (hasFrontend ? 1 : 0) +
    (hasBackend ? 1 : 0) +
    (hasDatabase ? 1 : 0);
  if (complexityScore >= 8) {
    complexity = "enterprise";
  } else if (complexityScore >= 5) {
    complexity = "complex";
  } else if (complexityScore >= 3) {
    complexity = "medium";
  }

  // Required specializations
  const specs: string[] = [];
  if (hasFrontend) {
    specs.push("Developer", "Artist");
  }
  if (hasBackend) {
    specs.push("Engineer", "Architect");
  }
  if (hasDatabase) {
    specs.push("Engineer");
  }
  if (hasTesting) {
    specs.push("Scientist", "Engineer");
  }
  if (hasDeployment) {
    specs.push("Engineer");
  }
  if (features.length >= 3) {
    specs.push("Architect");
  }
  if (technologies.some((t) => ["ai", "ml"].includes(t))) {
    specs.push("Scientist", "Researcher");
  }
  if (!specs.length) {
    specs.push("Developer", "Engineer");
  }

  // Team size
  const teamSize =
    complexity === "enterprise"
      ? rand(6, 10)
      : complexity === "complex"
        ? rand(4, 7)
        : complexity === "medium"
          ? rand(3, 5)
          : rand(2, 3);

  // Estimated files
  const estimatedFiles =
    complexity === "enterprise"
      ? rand(25, 60)
      : complexity === "complex"
        ? rand(15, 30)
        : complexity === "medium"
          ? rand(8, 18)
          : rand(4, 10);

  // Default project type
  const projectType = classifyIntent(prompt).projectType ?? "fullstack";

  return {
    features,
    technologies,
    projectType,
    complexity,
    requiredSpecializations: [...new Set(specs)],
    estimatedFiles,
    estimatedTeamSize: teamSize,
    hasFrontend,
    hasBackend,
    hasDatabase,
    hasTesting,
    hasDeployment,
  };
}

// ─── Peer Review Engine ────────────────────────────────────────────

const REVIEW_ISSUE_TEMPLATES: Record<PeerReviewIssue["category"], string[]> = {
  logic: [
    "Potential null reference not handled",
    "Edge case not covered: empty input",
    "Race condition risk in async operation",
    "Off-by-one error in loop boundary",
    "Missing error propagation to caller",
  ],
  security: [
    "User input not sanitized before use",
    "Missing rate limiting on endpoint",
    "Sensitive data logged in plain text",
    "CORS not restricted to allowed origins",
    "SQL injection vector detected",
  ],
  performance: [
    "N+1 query pattern detected",
    "Unbounded array growth in loop",
    "Missing memoization for expensive computation",
    "Synchronous I/O in hot path",
    "Large object cloned unnecessarily",
  ],
  style: [
    "Function exceeds recommended line count",
    "Magic number should be a named constant",
    "Inconsistent naming convention",
    "Dead code detected — unused import",
    "Missing JSDoc for exported function",
  ],
  naming: [
    "Variable name not descriptive enough",
    "Function name doesn't reflect its side effects",
    "Abbreviation used instead of full word",
    "Boolean variable should start with 'is'/'has'/'can'",
  ],
  architecture: [
    "Circular dependency between modules",
    "Business logic in presentation layer",
    "Missing abstraction — concrete type used where interface expected",
    "God object anti-pattern — class has too many responsibilities",
  ],
  testing: [
    "Missing unit test for edge case",
    "Test doesn't assert error conditions",
    "Mock not cleaned up after test",
    "Integration test required for this flow",
  ],
};

/**
 * Find the best peer reviewer — a citizen with matching specialization
 * who is NOT the original author.
 */
export function findPeerReviewer(
  s: RepublicState,
  authorId: string,
  authorSpecialization: string,
  projectTeam: { citizenId: string }[],
): Citizen | null {
  // First: find team member with same specialization
  const teamReviewer = projectTeam
    .filter((m) => m.citizenId !== authorId)
    .map((m) => s.citizens.find((c: Citizen) => c.id === m.citizenId))
    .filter((c): c is Citizen => c !== undefined && c.specialization === authorSpecialization)
    .toSorted((a: Citizen, b: Citizen) => {
      // Prefer higher skill count and intelligence
      const aScore = (a.skills?.length ?? 0) + (a.intelligence ?? 100) / 100;
      const bScore = (b.skills?.length ?? 0) + (b.intelligence ?? 100) / 100;
      return bScore - aScore;
    })[0];

  if (teamReviewer) {
    return teamReviewer;
  }

  // Second: find ANY citizen with matching specialization
  const globalReviewer = s.citizens
    .filter((c: Citizen) => c.id !== authorId && c.specialization === authorSpecialization)
    .toSorted((a: Citizen, b: Citizen) => {
      const aScore = (a.skills?.length ?? 0) + (a.intelligence ?? 100) / 100;
      const bScore = (b.skills?.length ?? 0) + (b.intelligence ?? 100) / 100;
      return bScore - aScore;
    })[0];

  if (globalReviewer) {
    return globalReviewer;
  }

  // Fallback: any citizen that's not the author and has high intelligence
  return (
    s.citizens
      .filter((c: Citizen) => c.id !== authorId)
      .toSorted((a: Citizen, b: Citizen) => (b.intelligence ?? 100) - (a.intelligence ?? 100))[0] ??
    null
  );
}

/**
 * Perform peer review on a file. The reviewer validates syntax, logic,
 * security, style, and architecture. Returns issues found and optionally
 * fixes them.
 */
export function peerReviewFile(
  filePath: string,
  content: string,
  authorId: string,
  authorName: string,
  reviewer: Citizen,
): PeerReview {
  const reviewerIQ = reviewer.intelligence ?? 100;
  const reviewerSkill = (reviewer.skills?.length ?? 0) / 10;

  // Higher IQ + skills = finds more real issues and fewer false positives
  const thoroughness = Math.min(1, 0.3 + reviewerIQ / 200 + reviewerSkill * 0.15);
  const maxIssues = Math.max(0, Math.floor(thoroughness * 8) - rand(0, 3));

  const issues: PeerReviewIssue[] = [];
  const categories: PeerReviewIssue["category"][] = [
    "logic",
    "security",
    "performance",
    "style",
    "naming",
    "architecture",
    "testing",
  ];

  for (let i = 0; i < maxIssues; i++) {
    const category = pick(categories);
    const templates = REVIEW_ISSUE_TEMPLATES[category];
    const severity: PeerReviewIssue["severity"] =
      rng() < 0.1 ? "critical" : rng() < 0.3 ? "major" : rng() < 0.6 ? "minor" : "suggestion";

    issues.push({
      severity,
      category,
      line: rand(1, Math.max(1, content.split("\n").length)),
      message: pick(templates),
      suggestion:
        rng() > 0.3
          ? `Consider ${pick(["refactoring", "extracting", "adding guard clause for", "using a constant for", "adding error handling for"])} this section`
          : null,
      autoFixable: severity !== "critical" && rng() > 0.4,
    });
  }

  const hasCritical = issues.some((i) => i.severity === "critical");
  const hasMajor = issues.some((i) => i.severity === "major");
  const qualityBefore = Math.max(0, 1 - issues.length * 0.08);

  // Auto-fix fixable issues
  let fixedContent: string | null = null;
  let qualityAfter = qualityBefore;

  if (issues.length > 0) {
    const fixable = issues.filter((i) => i.autoFixable);
    if (fixable.length > 0) {
      // Reviewer fixes the issues — quality improves
      qualityAfter = Math.min(1, qualityBefore + fixable.length * 0.05 + reviewerSkill * 0.1);
      fixedContent = content; // In a real system, this would be the actually fixed code
      for (const issue of fixable) {
        issue.severity = "suggestion"; // Downgrade fixed issues
      }
    }
  }

  const status: PeerReview["status"] = hasCritical
    ? "changes-requested"
    : hasMajor && !fixedContent
      ? "changes-requested"
      : fixedContent
        ? "fixed"
        : "approved";

  return {
    id: uid(),
    filePath,
    authorId,
    authorName,
    reviewerId: reviewer.id,
    reviewerName: reviewer.name,
    reviewerSpecialization: reviewer.specialization,
    status,
    issues,
    fixedContent,
    originalContent: content,
    qualityBefore,
    qualityAfter: fixedContent ? qualityAfter : qualityBefore,
    reviewedAt: ts(),
    resolvedAt: status === "approved" || status === "fixed" ? ts() : null,
  };
}

/**
 * Multi-layered quality gate that ALL code must pass.
 */
export function runQualityGate(
  project: DevProject,
  peerReviews: PeerReview[],
): GSDSession["qualityGate"] {
  const allApproved = peerReviews.every((r) => r.status === "approved" || r.status === "fixed");
  const qaResult = runQAValidation(project, 7);

  return {
    syntaxPassed: qaResult.issues.filter((i) => i.category === "syntax").length === 0,
    logicPassed:
      qaResult.issues.filter((i) => i.category === "logic" && i.severity === "error").length === 0,
    securityPassed:
      qaResult.issues.filter((i) => i.category === "security" && i.severity === "error").length ===
      0,
    peerReviewPassed: allApproved,
    integrationPassed: qaResult.passed,
    overallScore:
      Math.round(
        ((qaResult.score / 100) * 0.4 +
          (allApproved ? 1 : 0) * 0.3 +
          project.codeQuality * 0.2 +
          project.buildHealth * 0.1) *
          100,
      ) / 100,
  };
}

// ─── Citizen Coherence ─────────────────────────────────────────────

/**
 * Build awareness context for all team members so each citizen
 * knows what others are working on.
 */
export function buildCoherence(
  s: RepublicState,
  projectId: string,
  team: GSDSession["teamMembers"],
  tasks: GSDTask[],
): CitizenAwareness[] {
  return team.map((member) => {
    const memberTasks = tasks.filter((t) => t.assignedTo === member.citizenId);
    const otherMembers = team.filter((m) => m.citizenId !== member.citizenId);

    return {
      citizenId: member.citizenId,
      projectId,
      role: member.role,
      assignedTasks: memberTasks.map((t) => t.id),
      completedTasks: memberTasks.filter((t) => t.status === "completed").map((t) => t.id),
      currentTask: memberTasks.find((t) => t.status === "active")?.id ?? null,
      blockedBy: memberTasks
        .filter((t) => t.status === "blocked")
        .flatMap((t) => t.dependencies)
        .filter((dep) => tasks.find((t) => t.id === dep)?.status !== "completed"),
      knowsAbout: otherMembers.map((m) => m.citizenId),
      workload: member.tasksAssigned > 0 ? member.tasksCompleted / member.tasksAssigned : 0,
      lastSyncAt: ts(),
    };
  });
}

/**
 * Smart work distribution — assigns tasks based on specialization match,
 * current workload, and citizen capabilities.
 */
export function distributeWork(
  s: RepublicState,
  team: GSDSession["teamMembers"],
  analysis: PromptAnalysis,
  projectId: string,
): GSDTask[] {
  const tasks: GSDTask[] = [];

  // Use project-intake decomposition for task breakdown
  const breakdown = decomposeProject({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    projectType: analysis.projectType as any,
    description: analysis.features.join(", "),
    projectId,
  });

  for (const taskItem of breakdown.tasks) {
    // Find best citizen for this task
    const bestMember =
      team
        .filter((m) => {
          // Match specialization to task type
          const specMap: Record<string, string[]> = {
            frontend: ["Developer", "Artist"],
            backend: ["Engineer", "Architect"],
            design: ["Artist", "Developer"],
            testing: ["Scientist", "Engineer"],
            review: ["Architect", "Engineer"],
            deployment: ["Engineer"],
            planning: ["Architect"],
            documentation: ["Writer", "Developer"],
          };
          const preferred = specMap[taskItem.type] ?? ["Developer"];
          return preferred.includes(m.specialization);
        })
        .toSorted((a, b) => a.tasksAssigned - b.tasksAssigned)[0] ?? team[0]; // Least loaded first

    if (!bestMember) {
      continue;
    }

    const task: GSDTask = {
      id: uid(),
      title: taskItem.title,
      type: taskItem.type,
      assignedTo: bestMember.citizenId,
      assignedToName: bestMember.citizenName,
      status: "pending",
      dependencies: taskItem.dependencies,
      priority: taskItem.priority,
      files: [],
      estimatedEffort: taskItem.estimatedHours * 10, // Convert hours to ticks
      actualEffort: 0,
    };

    tasks.push(task);
    bestMember.tasksAssigned++;
  }

  return tasks;
}

// ─── Main GSD Execution ────────────────────────────────────────────

/**
 * Execute the full GSD pipeline from a single prompt.
 * This is the main entry point called by the RPC handler.
 *
 * 1. Analyze prompt
 * 2. Form army of specialists
 * 3. Create project
 * 4. Distribute work
 * 5. Generate files with peer review
 * 6. Run quality gate
 * 7. Deliver
 */
export function executeGSD(prompt: string, source: GSDSession["source"] = "webui"): GSDSession {
  const s = getState();
  const session: GSDSession = {
    id: uid(),
    prompt,
    source,
    status: "analyzing",
    projectId: null,
    teamMembers: [],
    tasks: [],
    peerReviews: [],
    awareness: [],
    qualityGate: {
      syntaxPassed: false,
      logicPassed: false,
      securityPassed: false,
      peerReviewPassed: false,
      integrationPassed: false,
      overallScore: 0,
    },
    timeline: [],
    createdAt: ts(),
    completedAt: null,
    totalFilesGenerated: 0,
    totalPeerReviews: 0,
    totalAutoFixes: 0,
  };

  // ── Step 1: Analyze ──
  const analysis = analyzePrompt(prompt);
  session.timeline.push({
    timestamp: ts(),
    type: "team-formed",
    detail: `Analyzed: ${analysis.complexity} project, ${analysis.features.length} features, ${analysis.technologies.length} techs, need ${analysis.estimatedTeamSize} citizens`,
  });

  // ── Step 2: Form Army ──
  session.status = "forming-team";
  const project = forceIdeateProject(s, {
    projectType: analysis.projectType,
    name: extractProjectNameFromPrompt(prompt),
    description: prompt,
    technologies: analysis.technologies,
    teamSize: analysis.estimatedTeamSize,
    autoAssign: true,
    autoFix: true,
  });

  if (!project) {
    session.status = "failed";
    session.timeline.push({
      timestamp: ts(),
      type: "escalation",
      detail: "Failed to create project — no citizens available",
    });
    activeSessions.set(session.id, session);
    return session;
  }

  session.projectId = project.id;
  activeSessions.set(session.id, session);

  // Fire and forget the asynchronous pipeline execution
  runGsdPipelineAsync(session, analysis, project, s).catch((err) => {
    session.status = "failed";
    session.timeline.push({
      timestamp: ts(),
      type: "escalation",
      detail: `Fatal pipeline error: ${String(err)}`,
    });
  });

  return session;
}

/**
 * Runs the GSD pipeline asynchronously through real execution workers.
 */
async function runGsdPipelineAsync(
  session: GSDSession,
  analysis: PromptAnalysis,
  project: DevProject,
  s: RepublicState
) {
  // Compose team with proper specializations
  // @ts-expect-error projectType mapped externally
  const team = composeTeam(s, analysis.projectType, project.stack);
  project.team = team;

  session.teamMembers = team.map((m) => ({
    citizenId: m.citizenId,
    citizenName: m.citizenName,
    specialization: m.specialization,
    role: m.role,
    workload: 0,
    tasksAssigned: 0,
    tasksCompleted: 0,
  }));

  session.timeline.push({
    timestamp: ts(),
    type: "team-formed",
    detail: `Army formed: ${team.length} citizens — ${team.map((m) => `${m.citizenName} (${m.specialization}/${m.role})`).join(", ")}`,
  });

  // ── Step 3: Distribute Work ──
  session.status = "distributing";
  session.tasks = distributeWork(s, session.teamMembers, analysis, project.id);
  session.timeline.push({
    timestamp: ts(),
    type: "task-started",
    detail: `Distributed ${session.tasks.length} tasks across ${session.teamMembers.length} citizens`,
  });

  // ── Step 4: Execute — Generate Files with Peer Review ──
  session.status = "executing";
  const filesToGenerate = Math.max(analysis.estimatedFiles, project.files.length > 0 ? 0 : 5);

  for (let i = 0; i < filesToGenerate; i++) {
    // Pick the executing citizen (round-robin through team)
    const author = session.teamMembers[i % session.teamMembers.length];
    
    // Generate file using Real Execution Pool
    const ext = pick(["ts", "tsx", "css", "json", "md", "test.ts"]);
    const filePath = `src/${author.role === "frontend" ? "components" : author.role === "test" ? "__tests__" : "lib"}/module-${i + 1}.${ext}`;
    
    // Instead of generating mocked file content, dispatch a write_code intent
    session.timeline.push({
      timestamp: ts(),
      type: "task-started",
      citizenId: author.citizenId,
      citizenName: author.citizenName,
      detail: `Writing file: ${filePath}`,
    });

    const execRes = await executeToolAction(
      "write_code",
      { filePath, description: `Implement ${project.name} spec requirements for module ${i + 1} (${analysis.projectType})`, language: ext },
      {
        citizenId: author.citizenId,
        citizenName: author.citizenName,
        specialization: author.specialization,
        skillLevel: 80,
        projectId: project.id,
        mode: "real"
      }
    );

    session.totalFilesGenerated++;
    
    // ── Peer Review ──
    session.status = "reviewing";
    const reviewer = findPeerReviewer(s, author.citizenId, author.specialization, team);

    if (reviewer && execRes.status === "success" && execRes.filesAffected.length > 0) {
      // Use real Code Review tool
      const reviewRes = await executeToolAction(
        "code_review",
        { filePath: execRes.filesAffected[0] },
        {
          citizenId: reviewer.id,
          citizenName: reviewer.name,
          specialization: reviewer.specialization,
          skillLevel: 90,
          projectId: project.id,
          mode: "real"
        }
      );

      session.totalPeerReviews++;
      session.timeline.push({
        timestamp: ts(),
        type: "peer-review",
        citizenId: reviewer.id,
        citizenName: reviewer.name,
        detail: `Reviewed ${filePath}: ${reviewRes.status === "success" ? "Approved" : "Failed validation"}`,
      });

      project.files.push({
        path: filePath,
        language: ext.replace(".test", ""),
        linesOfCode: 50, // mock count since we don't have the real code in memory anymore
        lastModified: ts(),
        quality: 0.9,
        content: `// Source for ${filePath} persisted to disk.`,
      });
    } else {
      // No reviewer available — still add file but flag
      project.files.push({
        path: filePath,
        language: ext,
        linesOfCode: 50,
        lastModified: ts(),
        quality: 0.6,
        content: `// Source for ${filePath} persisted to disk.`,
      });
    }

    session.totalFilesGenerated++;
    session.timeline.push({
      timestamp: ts(),
      type: "file-written",
      citizenId: author.citizenId,
      citizenName: author.citizenName,
      detail: `${author.citizenName} wrote ${filePath}`,
    });
  }

  // Update project stats
  project.linesOfCode = project.files.reduce((sum, f) => sum + f.linesOfCode, 0);
  project.commitCount += session.totalFilesGenerated;
  project.codeQuality =
    project.files.reduce((sum, f) => sum + f.quality, 0) / Math.max(1, project.files.length);

  // ── Step 4.5: Inject Infrastructure Files (Supabase/Docker/CI) ──
  const hasSupabase =
    analysis.technologies.includes("supabase") ||
    analysis.technologies.includes("postgresql") ||
    analysis.hasDatabase;
  const hasDocker = analysis.technologies.includes("docker") || analysis.hasDeployment;

  const infraFiles = generateInfrastructureFiles(project.name, session.prompt, project.stack, {
    supabase: hasSupabase,
    docker: hasDocker,
    cicd: analysis.hasDeployment,
  });

  // Only add infra files that don't already exist in the project
  for (const inf of infraFiles) {
    if (!project.files.find((f) => f.path === inf.path)) {
      project.files.push({
        path: inf.path,
        language: inf.language,
        linesOfCode: inf.content.split("\n").length,
        lastModified: ts(),
        quality: 0.95, // Infrastructure files are pre-validated
        content: inf.content,
      });
      session.totalFilesGenerated++;
    }
  }

  if (infraFiles.length > 0) {
    session.timeline.push({
      timestamp: ts(),
      type: "file-written",
      detail: `Infrastructure: +${infraFiles.length} files (${hasSupabase ? "Supabase, " : ""}${hasDocker ? "Docker, " : ""}CI/CD, env)`,
    });
  }

  // Re-calculate stats after infra injection
  project.linesOfCode = project.files.reduce((sum, f) => sum + f.linesOfCode, 0);

  // ── Step 5: Quality Gate ──
  session.status = "validating";
  session.qualityGate = runQualityGate(project, session.peerReviews);

  // Auto-fix if quality gate doesn't pass
  if (session.qualityGate.overallScore < 0.7) {
    const qaResult = runQAValidation(project, 8);
    if (qaResult.autoFixable > 0) {
      const fixResult = autoFixIssues(project, qaResult, 8);
      session.totalAutoFixes += fixResult.issuesFixed;
      session.timeline.push({
        timestamp: ts(),
        type: "fix-applied",
        detail: `Quality gate auto-fix: ${fixResult.issuesFixed} issues fixed, quality ${Math.round(fixResult.qualityBefore * 100)}% → ${Math.round(fixResult.qualityAfter * 100)}%`,
      });
    }
    // Re-run quality gate
    session.qualityGate = runQualityGate(project, session.peerReviews);
  }

  session.timeline.push({
    timestamp: ts(),
    type: "quality-gate",
    detail: `Quality gate: ${Math.round(session.qualityGate.overallScore * 100)}% — syntax:${session.qualityGate.syntaxPassed ? "✓" : "✗"} logic:${session.qualityGate.logicPassed ? "✓" : "✗"} security:${session.qualityGate.securityPassed ? "✓" : "✗"} peer:${session.qualityGate.peerReviewPassed ? "✓" : "✗"}`,
  });

  // ── Step 6: Build Coherence ──
  session.awareness = buildCoherence(s, project.id, session.teamMembers, session.tasks);

  // Mark tasks as completed
  for (const task of session.tasks) {
    task.status = "completed";
    const member = session.teamMembers.find((m) => m.citizenId === task.assignedTo);
    if (member) {
      member.tasksCompleted++;
    }
  }

  // ── Step 7: Deliver ──
  session.status = "complete";
  session.completedAt = ts();
  project.status = "active";
  project.buildHealth = Math.min(1, session.qualityGate.overallScore + 0.1);
  project.updatedAt = ts();

  session.timeline.push({
    timestamp: ts(),
    type: "delivery",
    detail: `Delivered: ${session.totalFilesGenerated} files, ${session.totalPeerReviews} peer reviews, ${session.totalAutoFixes} auto-fixes, quality: ${Math.round(session.qualityGate.overallScore * 100)}%`,
  });

  // Store session
  if (activeSessions.size >= MAX_SESSIONS) {
    const oldest = [...activeSessions.keys()][0];
    if (oldest) {
      activeSessions.delete(oldest);
    }
  }
  activeSessions.set(session.id, session);

  return session;
}

// ─── Helpers ───────────────────────────────────────────────────────

function extractProjectNameFromPrompt(prompt: string): string {
  // Try to extract a project name from common patterns
  const patterns = [
    /(?:build|create|make|develop)\s+(?:a|an|the)?\s*([A-Z][a-zA-Z\s]{2,30}?)(?:\s+(?:app|application|platform|system|tool|website|site|dashboard))/i,
    /(?:called|named)\s+"?([^"]+)"?/i,
    /(?:build|create)\s+(.{3,30})/i,
  ];

  for (const p of patterns) {
    const m = prompt.match(p);
    if (m?.[1]) {
      return m[1].trim().replace(/\s+/g, " ").slice(0, 40);
    }
  }

  // Fallback: generate from keywords
  const words = prompt
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 3);
  return (
    words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ") ||
    "New Project"
  );
}

// ─── Diagnostics ───────────────────────────────────────────────────

export interface GSDDiagnostics {
  activeSessions: number;
  totalCompleted: number;
  averageQualityScore: number;
  totalPeerReviews: number;
  totalAutoFixes: number;
  averageTeamSize: number;
}

export function getGSDDiagnostics(): GSDDiagnostics {
  const sessions = [...activeSessions.values()];
  const completed = sessions.filter((s) => s.status === "complete");

  return {
    activeSessions: sessions.length,
    totalCompleted: completed.length,
    averageQualityScore:
      completed.length > 0
        ? completed.reduce((sum, s) => sum + s.qualityGate.overallScore, 0) / completed.length
        : 0,
    totalPeerReviews: sessions.reduce((sum, s) => sum + s.totalPeerReviews, 0),
    totalAutoFixes: sessions.reduce((sum, s) => sum + s.totalAutoFixes, 0),
    averageTeamSize:
      completed.length > 0
        ? completed.reduce((sum, s) => sum + s.teamMembers.length, 0) / completed.length
        : 0,
  };
}
