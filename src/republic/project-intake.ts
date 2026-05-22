/**
 * Republic Platform — Project Intake Gateway
 *
 * Intercepts user messages from WhatsApp/WebUI, classifies intent,
 * and converts project requests into SwarmObjectives for the workforce.
 *
 * Pipeline: User Message → Intent Classifier → Project Creator →
 *           PM Assignment → Task Decomposition → Swarm Execution
 */

import { createBlankProject, createPipeline } from "./dev-orchestration.js";
import { createObjective } from "./grid.js";
import { getState } from "./state.js";
import type { Citizen, Specialization } from "./types.js";
import { ts, uid } from "./utils.js";
import { createWorkspace } from "./workspace-manager.js";
import { generateProjectScaffold } from "./app-generation-engine.js";
import type { AppTemplate } from "./app-generation-rules.js";

// ─── Types ──────────────────────────────────────────────────────

export type ProjectType =
  | "website"
  | "web_app"
  | "mobile_app"
  | "api"
  | "design"
  | "documentation"
  | "data_analysis"
  | "automation"
  | "presentation"
  | "song"
  | "audio"
  | "video"
  | "research"
  | "document"
  | "game"
  | "general";

export type IntakeSource = "whatsapp" | "webui" | "api" | "internal";

export type IntakeStatus =
  | "received"
  | "classifying"
  | "creating"
  | "assigned"
  | "rejected"
  | "failed";

export interface IntakeRequest {
  id: string;
  source: IntakeSource;
  userId: string;
  message: string;
  timestamp: string;
  status: IntakeStatus;
  /** Classified project type (null until classified) */
  projectType: ProjectType | null;
  /** Confidence of classification 0.0-1.0 */
  confidence: number;
  /** Created project workspace (null until created) */
  projectId: string | null;
  /** Assigned PM citizen (null until assigned) */
  pmCitizenId: string | null;
  /** Error message if failed */
  error?: string;
}

export interface TaskBreakdown {
  id: string;
  projectId: string;
  tasks: TaskItem[];
  totalEstimatedHours: number;
  specialistsNeeded: Specialization[];
  createdAt: string;
}

export interface TaskItem {
  id: string;
  title: string;
  description: string;
  type:
    | "planning"
    | "design"
    | "frontend"
    | "backend"
    | "testing"
    | "deployment"
    | "documentation"
    | "review";
  priority: "critical" | "high" | "medium" | "low";
  requiredSpecialization: Specialization;
  estimatedHours: number;
  dependencies: string[];
  assignedCitizenId: string | null;
  status: "pending" | "active" | "completed" | "blocked";
}

// ─── Intent Classification ──────────────────────────────────────

/** Patterns that suggest a project request */
const PROJECT_PATTERNS = [
  /\b(build|create|make|develop|design|implement)\s+(me\s+)?a\b/i,
  /\b(i need|i want|can you make|please create)\b/i,
  /\b(website|web\s*app|landing\s*page|dashboard|api|app)\b/i,
  /\b(logo|branding|design system|mockup|wireframe)\b/i,
  /\b(write|generate|produce)\s+(documentation|docs|code|tests)\b/i,
  /\b(automate|script|bot|workflow)\b/i,
  /\b(analyze|report|visualize)\s+(data|metrics|analytics)\b/i,
  /\b(presentation|powerpoint|pptx|slide\s*deck|keynote)\b/i,
  /\b(song|melody|music|compose|beat|lyrics|audio\s*file)\b/i,
  /\b(video|clip|animation|motion\s*graphic)\b/i,
  /\b(research|deep\s*dive|investigate|study|thesis|paper)\b/i,
  /\b(document|report|whitepaper|proposal|essay|letter)\b/i,
  /\b(game|3d\s*game|pool|billiard|webgl|arcade|platformer|puzzle\s*game|physics\s*game)\b/i,
];

/** Patterns that suggest NOT a project (general chat) */
const NON_PROJECT_PATTERNS = [
  /^(hi|hello|hey|thanks|ok|yes|no|sure)\b/i,
  /\b(how are you|what's up|good morning)\b/i,
  /\b(status|progress|update)\s+(on|of|for)\b/i,
  /^[?!.]+$/,
];

/**
 * Classify whether a message is a project request.
 * Uses pattern matching first, then would call a cheap LLM for ambiguous cases.
 *
 * @returns Project type and confidence, or null if not a project request
 */
export function classifyIntent(message: string): {
  isProject: boolean;
  projectType: ProjectType;
  confidence: number;
  reason: string;
} {
  const trimmed = message.trim();

  // Quick rejection for very short messages
  if (trimmed.length < 10) {
    return {
      isProject: false,
      projectType: "general",
      confidence: 0.9,
      reason: "Message too short",
    };
  }

  // Check non-project patterns first
  for (const pattern of NON_PROJECT_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        isProject: false,
        projectType: "general",
        confidence: 0.8,
        reason: "Matches non-project pattern",
      };
    }
  }

  // Check project patterns
  let matchCount = 0;
  for (const pattern of PROJECT_PATTERNS) {
    if (pattern.test(trimmed)) {
      matchCount++;
    }
  }

  if (matchCount === 0) {
    return {
      isProject: false,
      projectType: "general",
      confidence: 0.6,
      reason: "No project patterns matched",
    };
  }

  // Determine project type from message content
  const projectType = detectProjectType(trimmed);
  const confidence = Math.min(0.95, 0.5 + matchCount * 0.15);

  return {
    isProject: true,
    projectType,
    confidence,
    reason: `Matched ${matchCount} project pattern(s)`,
  };
}

function detectProjectType(message: string): ProjectType {
  const lower = message.toLowerCase();
  if (/\b(website|landing\s*page|portfolio|blog)\b/.test(lower)) {
    return "website";
  }
  if (/\b(web\s*app|dashboard|saas|platform)\b/.test(lower)) {
    return "web_app";
  }
  if (/\b(mobile|ios|android|react\s*native|flutter)\b/.test(lower)) {
    return "mobile_app";
  }
  if (/\b(api|endpoint|rest|graphql|backend)\b/.test(lower)) {
    return "api";
  }
  if (/\b(presentation|powerpoint|pptx|slide\s*deck|keynote)\b/.test(lower)) {
    return "presentation";
  }
  if (/\b(song|melody|compose|lyrics|beat|music\s*track)\b/.test(lower)) {
    return "song";
  }
  if (/\b(audio|sound(?:track|\s*effect)|podcast|voice\s*over|narration)\b/.test(lower)) {
    return "audio";
  }
  if (/\b(video|clip|animation|motion\s*graphic|trailer|cinematic)\b/.test(lower)) {
    return "video";
  }
  if (/\b(research|deep\s*dive|investigate|study|thesis|paper|academic)\b/.test(lower)) {
    return "research";
  }
  if (/\b(document|whitepaper|proposal|essay|letter|report(?!.*dashboard))\b/.test(lower)) {
    return "document";
  }
  if (/\b(logo|design|mockup|wireframe|ui|ux|branding)\b/.test(lower)) {
    return "design";
  }
  if (/\b(doc|documentation|readme|guide|manual|tutorial)\b/.test(lower)) {
    return "documentation";
  }
  if (/\b(data|analys|chart|graph|metric)\b/.test(lower)) {
    return "data_analysis";
  }
  if (/\b(automat|script|bot|cron|workflow|pipeline)\b/.test(lower)) {
    return "automation";
  }
  if (/\b(game|3d\s*game|pool|billiard|webgl|arcade|platformer|puzzle|physics\s*game|simulation\s*game)\b/.test(lower)) {
    return "game";
  }
  return "general";
}

// ─── Stack Mapping ──────────────────────────────────────────────

import type { ProjectStack } from "./dev-orchestration.js";

/** Map a detected project type to a sensible default tech stack */
function mapProjectTypeToStack(projectType: ProjectType): ProjectStack {
  switch (projectType) {
    case "website":
      return {
        languages: ["typescript", "css", "html"],
        frameworks: ["nextjs", "tailwind"],
        databases: [],
        infrastructure: ["vercel"],
      };
    case "web_app":
      return {
        languages: ["typescript", "css"],
        frameworks: ["nextjs", "tailwind"],
        databases: ["postgres"],
        infrastructure: ["vercel", "docker"],
      };
    case "mobile_app":
      return {
        languages: ["typescript"],
        frameworks: ["react_native"],
        databases: ["firebase"],
        infrastructure: [],
      };
    case "api":
      return {
        languages: ["typescript"],
        frameworks: ["express"],
        databases: ["postgres"],
        infrastructure: ["docker"],
      };
    case "presentation":
      return { languages: ["typescript"], frameworks: [], databases: [], infrastructure: [] };
    case "song":
    case "audio":
      return {
        languages: [],
        frameworks: [],
        databases: [],
        infrastructure: ["suno", "audiocraft"],
      };
    case "video":
      return { languages: [], frameworks: [], databases: [], infrastructure: ["runway", "pika"] };
    case "research":
      return { languages: ["markdown"], frameworks: [], databases: [], infrastructure: [] };
    case "document":
      return { languages: ["markdown"], frameworks: [], databases: [], infrastructure: [] };
    case "design":
      return { languages: ["css", "html"], frameworks: [], databases: [], infrastructure: [] };
    case "documentation":
      return { languages: ["markdown"], frameworks: [], databases: [], infrastructure: [] };
    case "data_analysis":
      return {
        languages: ["python"],
        frameworks: ["pytorch"],
        databases: ["postgres"],
        infrastructure: [],
      };
    case "automation":
      return {
        languages: ["typescript"],
        frameworks: [],
        databases: [],
        infrastructure: ["docker"],
      };
    case "game":
      return {
        languages: ["typescript", "html", "css"],
        frameworks: ["threejs"],
        databases: [],
        infrastructure: ["cannon-es", "webgl"],
      };
    default:
      return { languages: ["typescript"], frameworks: [], databases: [], infrastructure: [] };
  }
}

/**
 * Map a detected project type to the best app generation template.
 * Non-code project types (presentation, song, video, etc.) return null.
 */
function mapProjectTypeToTemplate(projectType: ProjectType): AppTemplate | null {
  switch (projectType) {
    case "web_app":
      return "react-supabase";
    case "website":
      return "react-spa";
    case "api":
    case "automation":
      return "api-service";
    case "game":
    case "design":
      return "react-spa";
    case "mobile_app":
      return "react-supabase";
    // Non-scaffoldable types
    case "presentation":
    case "song":
    case "audio":
    case "video":
    case "research":
    case "document":
    case "documentation":
    case "data_analysis":
    case "general":
      return null;
  }
}

// ─── Project Intake Pipeline ────────────────────────────────────

const intakeHistory: IntakeRequest[] = [];
const MAX_INTAKE_HISTORY = 100;

/**
 * Process an incoming message through the intake pipeline.
 * This is the main entry point called by message handlers.
 */
export async function processIntakeMessage(params: {
  source: IntakeSource;
  userId: string;
  message: string;
  /** Available citizens for PM assignment */
  availableCitizens: Citizen[];
}): Promise<IntakeRequest> {
  const request: IntakeRequest = {
    id: `intake-${uid()}`,
    source: params.source,
    userId: params.userId,
    message: params.message,
    timestamp: ts(),
    status: "received",
    projectType: null,
    confidence: 0,
    projectId: null,
    pmCitizenId: null,
  };

  intakeHistory.push(request);
  if (intakeHistory.length > MAX_INTAKE_HISTORY) {
    intakeHistory.splice(0, intakeHistory.length - MAX_INTAKE_HISTORY);
  }

  // Step 1: Classify intent
  request.status = "classifying";
  const classification = classifyIntent(params.message);

  if (!classification.isProject) {
    request.status = "rejected";
    request.confidence = classification.confidence;
    request.error = `Not a project request: ${classification.reason}`;
    return request;
  }

  request.projectType = classification.projectType;
  request.confidence = classification.confidence;

  // Step 2: Create workspace
  request.status = "creating";
  try {
    const projectName = extractProjectName(params.message, classification.projectType);
    const workspace = await createWorkspace({
      name: projectName,
      description: params.message,
      initGit: true,
    });
    request.projectId = workspace.id;

    // Step 2.5: Auto-scaffold FSD project structure if applicable
    const template = mapProjectTypeToTemplate(classification.projectType);
    if (template) {
      try {
        await generateProjectScaffold(workspace.id, {
          template,
          projectName,
          description: params.message,
        }, "system");
      } catch (scaffoldErr) {
        // Non-fatal — project continues without scaffold
        console.warn(
          `[ProjectIntake] Scaffold failed for ${workspace.id}: ${scaffoldErr instanceof Error ? scaffoldErr.message : String(scaffoldErr)}`,
        );
      }
    }

    // Create a DevProject in the global state so it appears on the Dev Projects page
    const stack = mapProjectTypeToStack(classification.projectType);
    const devProject = createBlankProject(
      projectName,
      params.message,
      params.userId,
      "User",
      stack,
    );
    devProject.id = workspace.id; // Keep workspace ID and project ID in sync
    getState().devProjects.push(devProject);
  } catch (err: unknown) {
    request.status = "failed";
    request.error = `Workspace creation failed: ${err instanceof Error ? err.message : String(err)}`;
    return request;
  }

  // Step 3: Assign PM citizen
  const pm = selectProjectManager(params.availableCitizens);
  if (pm) {
    request.pmCitizenId = pm.id;
    request.status = "assigned";
  } else {
    request.status = "assigned"; // Can still proceed without PM
    request.error = "No suitable PM citizen available — using default assignment";
  }

  // Step 4: Decompose the project into actionable tasks
  const s = getState();
  if (request.projectId && request.projectType) {
    const breakdown = decomposeProject({
      projectType: request.projectType,
      description: params.message,
      projectId: request.projectId,
    });

    // Step 5: Create a workflow pipeline for the project
    const pipeline = createPipeline(request.projectId, true);

    // Step 6: Create a SwarmObjective so the workforce picks it up
    createObjective(
      s,
      request.projectType,
      `Project: ${extractProjectName(params.message, request.projectType)} — ${params.message.slice(0, 120)}`,
    );

    // Step 7: Update DevProject ownership if a PM was assigned
    const devProject = s.devProjects.find((p) => p.id === request.projectId);
    if (devProject && pm) {
      devProject.ownerId = pm.id;
      devProject.ownerName = pm.name;
    }

    // Step 8: Record events
    s.events.push({
      citizenId: pm?.id ?? "system",
      citizenName: pm?.name ?? "System",
      type: "ProjectCreated",
      description: `Project "${extractProjectName(params.message, request.projectType)}" created via ${params.source} intake (${breakdown.tasks.length} tasks, pipeline: ${pipeline.id})`,
      timestamp: ts(),
    });

    // Step 9: Enqueue first task in the sandbox pool so citizens begin executing immediately.
    // The citizen (or system) will pick up subsequent tasks as each completes.
    const firstTask = breakdown.tasks[0];
    if (firstTask && request.projectId) {
      const citizenId = pm?.id ?? "system";
      const citizenName = pm?.name ?? "Intake System";
      const projectName = extractProjectName(params.message, request.projectType);
      // Fire-and-forget — never block the intake pipeline
      import("./agent-sandbox.js")
        .then(({ submitSandboxTask }) =>
          submitSandboxTask({
            citizenId,
            citizenName,
            type: "exec",
            priority: 60,
            payload: {
              command: `echo 'Starting ${projectName}: ${firstTask.title}' && mkdir -p /workspace/${request.projectId} && echo '# ${firstTask.title}' > /workspace/${request.projectId}/task.md && echo 'Project: ${projectName}' >> /workspace/${request.projectId}/task.md && echo 'Status: in_progress' >> /workspace/${request.projectId}/task.md`,
              cwd: "/workspace",
              timeout: 30,
              projectId: request.projectId,
              taskTitle: firstTask.title,
              taskType: firstTask.type,
            },
          }),
        )
        .catch((err: unknown) => {
          // Sandbox may not be running — this is a best-effort enhancement only
          const msg = err instanceof Error ? err.message : String(err);
          if (!msg.includes("not running") && !msg.includes("queue is full")) {
            console.warn(`[ProjectIntake] Sandbox task submission failed: ${msg}`);
          }
        });
    }
  }

  return request;
}

// ─── Task Decomposition ─────────────────────────────────────────

/**
 * Decompose a project into actionable tasks.
 * Uses deterministic heuristic first, with LLM upgrade path.
 */
export function decomposeProject(params: {
  projectType: ProjectType;
  description: string;
  projectId: string;
}): TaskBreakdown {
  const templates = PROJECT_TASK_TEMPLATES[params.projectType] ?? PROJECT_TASK_TEMPLATES.general;

  const tasks: TaskItem[] = templates.map((tmpl, index) => ({
    id: `task-${uid()}`,
    title: tmpl.title,
    description: `${tmpl.title} for: ${params.description}`,
    type: tmpl.type,
    priority: tmpl.priority,
    requiredSpecialization: tmpl.specialization,
    estimatedHours: tmpl.hours,
    dependencies: index > 0 ? [templates[index - 1].title] : [],
    assignedCitizenId: null,
    status: "pending",
  }));

  const specializations = [...new Set(tasks.map((t) => t.requiredSpecialization))];

  return {
    id: `breakdown-${uid()}`,
    projectId: params.projectId,
    tasks,
    totalEstimatedHours: tasks.reduce((sum, t) => sum + t.estimatedHours, 0),
    specialistsNeeded: specializations,
    createdAt: ts(),
  };
}

// ─── Task Templates ─────────────────────────────────────────────

interface TaskTemplate {
  title: string;
  type: TaskItem["type"];
  priority: TaskItem["priority"];
  specialization: Specialization;
  hours: number;
}

const PROJECT_TASK_TEMPLATES: Record<ProjectType, TaskTemplate[]> = {
  website: [
    {
      title: "Requirements Analysis",
      type: "planning",
      priority: "critical",
      specialization: "Architect",
      hours: 2,
    },
    { title: "UI/UX Design", type: "design", priority: "high", specialization: "Artist", hours: 4 },
    {
      title: "HTML/CSS Structure",
      type: "frontend",
      priority: "high",
      specialization: "Developer",
      hours: 3,
    },
    {
      title: "Interactive Components",
      type: "frontend",
      priority: "medium",
      specialization: "Developer",
      hours: 4,
    },
    {
      title: "Content Writing",
      type: "documentation",
      priority: "medium",
      specialization: "Writer",
      hours: 2,
    },
    { title: "Testing", type: "testing", priority: "high", specialization: "Analyst", hours: 2 },
    {
      title: "Deployment",
      type: "deployment",
      priority: "critical",
      specialization: "Engineer",
      hours: 1,
    },
  ],
  web_app: [
    {
      title: "Architecture Design",
      type: "planning",
      priority: "critical",
      specialization: "Architect",
      hours: 4,
    },
    {
      title: "Database Schema",
      type: "backend",
      priority: "critical",
      specialization: "Engineer",
      hours: 3,
    },
    {
      title: "API Development",
      type: "backend",
      priority: "high",
      specialization: "Developer",
      hours: 6,
    },
    {
      title: "Frontend UI",
      type: "frontend",
      priority: "high",
      specialization: "Developer",
      hours: 8,
    },
    {
      title: "Authentication",
      type: "backend",
      priority: "critical",
      specialization: "Engineer",
      hours: 3,
    },
    { title: "Unit Tests", type: "testing", priority: "high", specialization: "Analyst", hours: 4 },
    {
      title: "Integration Tests",
      type: "testing",
      priority: "medium",
      specialization: "Analyst",
      hours: 3,
    },
    {
      title: "Documentation",
      type: "documentation",
      priority: "medium",
      specialization: "Writer",
      hours: 2,
    },
    {
      title: "Deployment & CI/CD",
      type: "deployment",
      priority: "high",
      specialization: "Engineer",
      hours: 3,
    },
  ],
  mobile_app: [
    {
      title: "Architecture Design",
      type: "planning",
      priority: "critical",
      specialization: "Architect",
      hours: 4,
    },
    { title: "UI/UX Design", type: "design", priority: "high", specialization: "Artist", hours: 6 },
    {
      title: "Core Screens",
      type: "frontend",
      priority: "critical",
      specialization: "Developer",
      hours: 10,
    },
    {
      title: "Backend API",
      type: "backend",
      priority: "high",
      specialization: "Developer",
      hours: 6,
    },
    {
      title: "State Management",
      type: "frontend",
      priority: "high",
      specialization: "Developer",
      hours: 4,
    },
    { title: "Testing", type: "testing", priority: "high", specialization: "Analyst", hours: 4 },
    {
      title: "App Store Prep",
      type: "deployment",
      priority: "medium",
      specialization: "Planner",
      hours: 2,
    },
  ],
  api: [
    {
      title: "API Design",
      type: "planning",
      priority: "critical",
      specialization: "Architect",
      hours: 3,
    },
    {
      title: "Schema Design",
      type: "backend",
      priority: "critical",
      specialization: "Engineer",
      hours: 2,
    },
    {
      title: "Endpoint Implementation",
      type: "backend",
      priority: "high",
      specialization: "Developer",
      hours: 6,
    },
    {
      title: "Authentication & Security",
      type: "backend",
      priority: "critical",
      specialization: "Engineer",
      hours: 3,
    },
    {
      title: "API Documentation",
      type: "documentation",
      priority: "high",
      specialization: "Writer",
      hours: 2,
    },
    { title: "Testing", type: "testing", priority: "high", specialization: "Analyst", hours: 3 },
  ],
  design: [
    {
      title: "Brand Research",
      type: "planning",
      priority: "high",
      specialization: "Researcher",
      hours: 2,
    },
    {
      title: "Concept Development",
      type: "design",
      priority: "critical",
      specialization: "Artist",
      hours: 4,
    },
    {
      title: "Visual Design",
      type: "design",
      priority: "high",
      specialization: "Artist",
      hours: 6,
    },
    {
      title: "Design Review",
      type: "review",
      priority: "high",
      specialization: "Analyst",
      hours: 1,
    },
    {
      title: "Asset Export",
      type: "deployment",
      priority: "medium",
      specialization: "Artist",
      hours: 1,
    },
  ],
  documentation: [
    {
      title: "Content Planning",
      type: "planning",
      priority: "high",
      specialization: "Planner",
      hours: 2,
    },
    {
      title: "Research",
      type: "planning",
      priority: "high",
      specialization: "Researcher",
      hours: 3,
    },
    {
      title: "Writing",
      type: "documentation",
      priority: "critical",
      specialization: "Writer",
      hours: 6,
    },
    {
      title: "Review & Edit",
      type: "review",
      priority: "high",
      specialization: "Writer",
      hours: 2,
    },
  ],
  data_analysis: [
    {
      title: "Requirements Gathering",
      type: "planning",
      priority: "high",
      specialization: "Analyst",
      hours: 2,
    },
    {
      title: "Data Collection",
      type: "backend",
      priority: "critical",
      specialization: "Researcher",
      hours: 3,
    },
    {
      title: "Analysis",
      type: "backend",
      priority: "critical",
      specialization: "Analyst",
      hours: 4,
    },
    {
      title: "Visualization",
      type: "frontend",
      priority: "high",
      specialization: "Developer",
      hours: 3,
    },
    {
      title: "Report Writing",
      type: "documentation",
      priority: "high",
      specialization: "Writer",
      hours: 2,
    },
  ],
  automation: [
    {
      title: "Workflow Analysis",
      type: "planning",
      priority: "critical",
      specialization: "Analyst",
      hours: 2,
    },
    {
      title: "Script Development",
      type: "backend",
      priority: "high",
      specialization: "Developer",
      hours: 4,
    },
    { title: "Testing", type: "testing", priority: "high", specialization: "Analyst", hours: 2 },
    {
      title: "Documentation",
      type: "documentation",
      priority: "medium",
      specialization: "Writer",
      hours: 1,
    },
    {
      title: "Deployment",
      type: "deployment",
      priority: "high",
      specialization: "Engineer",
      hours: 1,
    },
  ],
  presentation: [
    {
      title: "Content Research & Outline",
      type: "planning",
      priority: "critical",
      specialization: "Researcher",
      hours: 2,
    },
    {
      title: "Slide Design & Branding",
      type: "design",
      priority: "high",
      specialization: "Artist",
      hours: 3,
    },
    {
      title: "Content Writing",
      type: "documentation",
      priority: "critical",
      specialization: "Writer",
      hours: 4,
    },
    {
      title: "Generate Presentation File",
      type: "deployment",
      priority: "high",
      specialization: "Developer",
      hours: 2,
    },
    {
      title: "Review & Polish",
      type: "review",
      priority: "high",
      specialization: "Analyst",
      hours: 1,
    },
  ],
  song: [
    {
      title: "Concept & Theme",
      type: "planning",
      priority: "critical",
      specialization: "Artist",
      hours: 1,
    },
    {
      title: "Lyrics Writing",
      type: "documentation",
      priority: "critical",
      specialization: "Writer",
      hours: 3,
    },
    {
      title: "Music Generation",
      type: "backend",
      priority: "critical",
      specialization: "Artist",
      hours: 2,
    },
    {
      title: "Audio Mixing",
      type: "review",
      priority: "high",
      specialization: "Engineer",
      hours: 2,
    },
    {
      title: "Final Export",
      type: "deployment",
      priority: "high",
      specialization: "Engineer",
      hours: 1,
    },
  ],
  audio: [
    {
      title: "Audio Brief",
      type: "planning",
      priority: "critical",
      specialization: "Planner",
      hours: 1,
    },
    {
      title: "Audio Generation",
      type: "backend",
      priority: "critical",
      specialization: "Artist",
      hours: 2,
    },
    {
      title: "Post-Processing",
      type: "review",
      priority: "high",
      specialization: "Engineer",
      hours: 2,
    },
    {
      title: "Final Export",
      type: "deployment",
      priority: "high",
      specialization: "Engineer",
      hours: 1,
    },
  ],
  video: [
    {
      title: "Storyboard & Script",
      type: "planning",
      priority: "critical",
      specialization: "Writer",
      hours: 3,
    },
    {
      title: "Visual Asset Generation",
      type: "design",
      priority: "high",
      specialization: "Artist",
      hours: 4,
    },
    {
      title: "Video Generation",
      type: "backend",
      priority: "critical",
      specialization: "Artist",
      hours: 3,
    },
    {
      title: "Audio/Music Track",
      type: "backend",
      priority: "medium",
      specialization: "Artist",
      hours: 2,
    },
    {
      title: "Editing & Post-Production",
      type: "review",
      priority: "high",
      specialization: "Engineer",
      hours: 3,
    },
    {
      title: "Final Render",
      type: "deployment",
      priority: "high",
      specialization: "Engineer",
      hours: 1,
    },
  ],
  research: [
    {
      title: "Define Research Scope",
      type: "planning",
      priority: "critical",
      specialization: "Researcher",
      hours: 2,
    },
    {
      title: "Literature Review",
      type: "planning",
      priority: "high",
      specialization: "Researcher",
      hours: 6,
    },
    {
      title: "Data Collection & Analysis",
      type: "backend",
      priority: "critical",
      specialization: "Analyst",
      hours: 6,
    },
    {
      title: "Findings & Synthesis",
      type: "documentation",
      priority: "critical",
      specialization: "Writer",
      hours: 4,
    },
    {
      title: "Report Writing",
      type: "documentation",
      priority: "high",
      specialization: "Writer",
      hours: 4,
    },
    {
      title: "Peer Review",
      type: "review",
      priority: "high",
      specialization: "Researcher",
      hours: 2,
    },
  ],
  document: [
    {
      title: "Document Planning",
      type: "planning",
      priority: "critical",
      specialization: "Planner",
      hours: 1,
    },
    {
      title: "Research & Gathering",
      type: "planning",
      priority: "high",
      specialization: "Researcher",
      hours: 3,
    },
    {
      title: "Writing",
      type: "documentation",
      priority: "critical",
      specialization: "Writer",
      hours: 5,
    },
    {
      title: "Formatting & Layout",
      type: "design",
      priority: "medium",
      specialization: "Artist",
      hours: 2,
    },
    {
      title: "Review & Edit",
      type: "review",
      priority: "high",
      specialization: "Writer",
      hours: 2,
    },
    {
      title: "Generate Document File",
      type: "deployment",
      priority: "high",
      specialization: "Developer",
      hours: 1,
    },
  ],
  game: [
    {
      title: "Game Architecture & Design",
      type: "planning",
      priority: "critical",
      specialization: "Architect",
      hours: 4,
    },
    {
      title: "3D Scene & Environment",
      type: "frontend",
      priority: "critical",
      specialization: "Artist",
      hours: 6,
    },
    {
      title: "Physics Engine Integration",
      type: "backend",
      priority: "critical",
      specialization: "Engineer",
      hours: 5,
    },
    {
      title: "Gameplay Mechanics & Logic",
      type: "frontend",
      priority: "high",
      specialization: "Developer",
      hours: 8,
    },
    {
      title: "UI/HUD & Controls",
      type: "frontend",
      priority: "high",
      specialization: "Developer",
      hours: 4,
    },
    {
      title: "Asset Creation & Optimization",
      type: "design",
      priority: "medium",
      specialization: "Artist",
      hours: 4,
    },
    {
      title: "Playtesting & QA",
      type: "testing",
      priority: "high",
      specialization: "Analyst",
      hours: 4,
    },
    {
      title: "Deployment & Preview",
      type: "deployment",
      priority: "high",
      specialization: "Engineer",
      hours: 2,
    },
  ],
  general: [
    {
      title: "Requirements Analysis",
      type: "planning",
      priority: "critical",
      specialization: "Planner",
      hours: 2,
    },
    {
      title: "Implementation",
      type: "backend",
      priority: "high",
      specialization: "Developer",
      hours: 6,
    },
    { title: "Testing", type: "testing", priority: "high", specialization: "Analyst", hours: 2 },
    {
      title: "Documentation",
      type: "documentation",
      priority: "medium",
      specialization: "Writer",
      hours: 1,
    },
  ],
};

// ─── Helpers ────────────────────────────────────────────────────

function extractProjectName(message: string, type: ProjectType): string {
  // Try to extract a meaningful name from the message
  const patterns = [
    /(?:build|create|make|design|develop)\s+(?:me\s+)?(?:a\s+)?(.+?)(?:\s+with|\s+that|\s+for|$)/i,
    /(?:i need|i want)\s+(?:a\s+)?(.+?)(?:\s+with|\s+that|\s+for|$)/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) {
      return match[1].trim().slice(0, 50);
    }
  }

  return `${type}-project-${uid()}`;
}

function selectProjectManager(citizens: Citizen[]): Citizen | null {
  if (citizens.length === 0) {
    return null;
  }

  // Prefer citizens with management-oriented specializations
  const pmSpecializations = new Set<Specialization>([
    "Planner",
    "Strategist",
    "Architect",
    "Analyst",
  ]);

  // Sort by: PM-specialization match > skill count > credits
  const ranked = [...citizens].toSorted((a, b) => {
    const aIsPM = pmSpecializations.has(a.specialization) ? 1 : 0;
    const bIsPM = pmSpecializations.has(b.specialization) ? 1 : 0;
    if (aIsPM !== bIsPM) {
      return bIsPM - aIsPM;
    }
    if (a.skillCount !== b.skillCount) {
      return b.skillCount - a.skillCount;
    }
    return b.credits - a.credits;
  });

  return ranked[0];
}

// ─── Diagnostics ────────────────────────────────────────────────

export interface IntakeDiagnostics {
  totalRequests: number;
  byStatus: Record<IntakeStatus, number>;
  bySource: Record<IntakeSource, number>;
  byProjectType: Record<ProjectType, number>;
  averageConfidence: number;
  rejectionRate: number;
}

export function getIntakeDiagnostics(): IntakeDiagnostics {
  const byStatus: Record<IntakeStatus, number> = {
    received: 0,
    classifying: 0,
    creating: 0,
    assigned: 0,
    rejected: 0,
    failed: 0,
  };
  const bySource: Record<IntakeSource, number> = {
    whatsapp: 0,
    webui: 0,
    api: 0,
    internal: 0,
  };
  const byProjectType: Record<ProjectType, number> = {
    website: 0,
    web_app: 0,
    mobile_app: 0,
    api: 0,
    design: 0,
    documentation: 0,
    data_analysis: 0,
    automation: 0,
    presentation: 0,
    song: 0,
    audio: 0,
    video: 0,
    research: 0,
    document: 0,
    game: 0,
    general: 0,
  };
  let totalConfidence = 0;

  for (const req of intakeHistory) {
    byStatus[req.status] = (byStatus[req.status] ?? 0) + 1;
    bySource[req.source] = (bySource[req.source] ?? 0) + 1;
    if (req.projectType) {
      byProjectType[req.projectType] = (byProjectType[req.projectType] ?? 0) + 1;
    }
    totalConfidence += req.confidence;
  }

  const total = intakeHistory.length || 1;
  return {
    totalRequests: intakeHistory.length,
    byStatus,
    bySource,
    byProjectType,
    averageConfidence: totalConfidence / total,
    rejectionRate: ((byStatus.rejected ?? 0) / total) * 100,
  };
}

export function getIntakeHistory(limit = 20): IntakeRequest[] {
  return intakeHistory.slice(-limit);
}
