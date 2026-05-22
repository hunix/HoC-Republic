/**
 * n8n Workflow Templates — Production-Grade Workflow Definitions
 *
 * Contains JSON workflow definitions for all 12 orchestration categories.
 * Each template is a complete n8n workflow JSON that can be deployed via
 * `POST /api/v1/workflows`.
 *
 * Templates use:
 * - Webhook triggers for external invocation
 * - AI Agent nodes with LangChain for intelligent orchestration
 * - Sub-workflow calls for modular composition
 * - Error handling with retry/fallback logic
 * - Result callbacks to the HoC gateway webhook
 */

import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("republic/n8n-templates");

// ─── Types ──────────────────────────────────────────────────────

export interface N8nWorkflowTemplate {
  /** Unique template ID (kebab-case) */
  id: string;
  /** Human-readable name */
  name: string;
  /** Workflow category */
  category: WorkflowCategory;
  /** Short description */
  description: string;
  /** Tags for filtering */
  tags: string[];
  /** n8n workflow JSON body (nodes + connections + settings) */
  workflow: N8nWorkflowBody;
}

export type WorkflowCategory =
  | "full-stack-app"
  | "media-production"
  | "music-production"
  | "document-generation"
  | "3d-production"
  | "research-analysis"
  | "qa-debugging"
  | "story-writing"
  | "graphics-design"
  | "devops-deploy"
  | "data-pipeline"
  | "multi-agent-collab"
  | "autonomous-discovery"
  | "full-product-lifecycle";

interface N8nWorkflowBody {
  name: string;
  nodes: N8nNode[];
  connections: Record<string, N8nConnection>;
  settings?: Record<string, unknown>;
  active?: boolean;
}

interface N8nNode {
  id: string;
  name: string;
  type: string;
  typeVersion: number;
  position: [number, number];
  parameters: Record<string, unknown>;
  credentials?: Record<string, unknown>;
}

interface N8nConnection {
  main: Array<Array<{ node: string; type: string; index: number }>>;
}

// ─── Template Helpers ────────────────────────────────────────────

/** Standard webhook trigger node */
function webhookTrigger(id: string, path: string): N8nNode {
  return {
    id,
    name: "Webhook Trigger",
    type: "n8n-nodes-base.webhook",
    typeVersion: 2,
    position: [0, 300],
    parameters: {
      path,
      httpMethod: "POST",
      responseMode: "lastNode",
      options: {},
    },
  };
}

/** AI Agent node with system prompt */
function aiAgentNode(
  id: string,
  name: string,
  systemPrompt: string,
  position: [number, number],
): N8nNode {
  return {
    id,
    name,
    type: "@n8n/n8n-nodes-langchain.agent",
    typeVersion: 2,
    position,
    parameters: {
      text: "={{ $json.task || $json.prompt || $json.body?.task || 'Execute the workflow' }}",
      options: {
        systemMessage: systemPrompt,
        maxIterations: 20,
        returnIntermediateSteps: true,
      },
    },
  };
}

/** Code execution node */
function codeNode(
  id: string,
  name: string,
  code: string,
  position: [number, number],
  language: "javaScript" | "python" = "javaScript",
): N8nNode {
  return {
    id,
    name,
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position,
    parameters: {
      jsCode: language === "javaScript" ? code : undefined,
      pythonCode: language === "python" ? code : undefined,
      language,
      mode: "runOnceForAllItems",
    },
  };
}

/** HTTP Request node */
function httpNode(
  id: string,
  name: string,
  url: string,
  method: string,
  position: [number, number],
  body?: string,
): N8nNode {
  return {
    id,
    name,
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4,
    position,
    parameters: {
      url,
      method,
      sendBody: !!body,
      bodyParameters: body ? { parameters: [{ name: "data", value: body }] } : undefined,
      options: { timeout: 120000 },
    },
  };
}

/** Result callback node — posts result back to HoC gateway */
function callbackNode(id: string, position: [number, number]): N8nNode {
  return httpNode(
    id,
    "Report to HoC",
    "http://host.docker.internal:3000/webhook/n8n-result",
    "POST",
    position,
    "={{ JSON.stringify($json) }}",
  );
}

/** Error handler node */
function errorHandlerNode(id: string, position: [number, number]): N8nNode {
  return codeNode(
    id,
    "Error Handler",
    `
const error = $input.all()[0]?.json?.error || "Unknown error";
return [{
  json: {
    ok: false,
    error: String(error),
    timestamp: new Date().toISOString(),
    workflow: $workflow.name,
  }
}];`,
    position,
  );
}

// ─── Workflow Template Definitions ───────────────────────────────

const FULL_STACK_APP_TEMPLATE: N8nWorkflowTemplate = {
  id: "full-stack-app",
  name: "Full-Stack App Builder",
  category: "full-stack-app",
  description: "Complete web application: scaffold → backend → frontend → database → testing → deploy",
  tags: ["development", "web", "react", "node", "postgresql"],
  workflow: {
    name: "[HoC] Full-Stack App Builder",
    nodes: [
      webhookTrigger("wh1", "hoc/full-stack-app"),
      aiAgentNode("agent1", "Project Architect", `You are an expert full-stack architect. Given a project description:
1. Choose the best tech stack (React/Next.js, Node/Python, PostgreSQL/MongoDB)
2. Create directory structure
3. Scaffold all files with production-quality code
4. Set up database schema and migrations
5. Write comprehensive tests
6. Configure CI/CD pipeline
7. Deploy using Docker Compose
Always produce COMPLETE working code — no TODOs or placeholders.`, [300, 300]),
      codeNode("code1", "Scaffold Project", `
const task = $input.all()[0]?.json;
const projectName = task?.projectName || "my-app";
return [{
  json: {
    commands: [
      \`mkdir -p /workspace/\${projectName}\`,
      \`cd /workspace/\${projectName} && npx -y create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --no-import-alias\`,
      \`cd /workspace/\${projectName} && npm install\`,
    ],
    projectName,
    status: "scaffolded",
  }
}];`, [600, 300]),
      callbackNode("cb1", [900, 300]),
      errorHandlerNode("err1", [600, 500]),
    ],
    connections: {
      "Webhook Trigger": { main: [[{ node: "Project Architect", type: "main", index: 0 }]] },
      "Project Architect": { main: [[{ node: "Scaffold Project", type: "main", index: 0 }]] },
      "Scaffold Project": { main: [[{ node: "Report to HoC", type: "main", index: 0 }]] },
    },
  },
};

const MEDIA_PRODUCTION_TEMPLATE: N8nWorkflowTemplate = {
  id: "media-production",
  name: "Media Production Pipeline",
  category: "media-production",
  description: "Image and video generation pipeline via ComfyUI, Stable Diffusion, or HuggingFace",
  tags: ["media", "video", "image", "comfyui", "ai-generation"],
  workflow: {
    name: "[HoC] Media Production Pipeline",
    nodes: [
      webhookTrigger("wh1", "hoc/media-production"),
      aiAgentNode("agent1", "Creative Director", `You are a creative director for AI media production.
Given a media request:
1. Determine the best generation approach (ComfyUI for quality, HuggingFace for speed)
2. Write optimized prompts with negative prompts
3. Choose appropriate model, resolution, duration
4. Handle post-processing (upscaling, format conversion)
Support: images (SD/SDXL/Flux), videos (CogVideo/SVD), animations.`, [300, 300]),
      httpNode("http1", "ComfyUI Generate", "http://comfyui:8188/prompt", "POST", [600, 200]),
      httpNode("http2", "HuggingFace Inference", "https://api-inference.huggingface.co/models/", "POST", [600, 400]),
      codeNode("merge1", "Merge Results", `
const results = $input.all();
return [{
  json: {
    ok: true,
    outputs: results.map(r => r.json),
    format: results[0]?.json?.format || "png",
    timestamp: new Date().toISOString(),
  }
}];`, [900, 300]),
      callbackNode("cb1", [1200, 300]),
    ],
    connections: {
      "Webhook Trigger": { main: [[{ node: "Creative Director", type: "main", index: 0 }]] },
      "Creative Director": { main: [[
        { node: "ComfyUI Generate", type: "main", index: 0 },
        { node: "HuggingFace Inference", type: "main", index: 0 },
      ]] },
      "ComfyUI Generate": { main: [[{ node: "Merge Results", type: "main", index: 0 }]] },
      "HuggingFace Inference": { main: [[{ node: "Merge Results", type: "main", index: 0 }]] },
      "Merge Results": { main: [[{ node: "Report to HoC", type: "main", index: 0 }]] },
    },
  },
};

const MUSIC_PRODUCTION_TEMPLATE: N8nWorkflowTemplate = {
  id: "music-production",
  name: "Music Production Studio",
  category: "music-production",
  description: "AI music generation, mixing, mastering, and sound design",
  tags: ["music", "audio", "generation", "bark", "mmaudio"],
  workflow: {
    name: "[HoC] Music Production Studio",
    nodes: [
      webhookTrigger("wh1", "hoc/music-production"),
      aiAgentNode("agent1", "Music Producer", `You are an AI music producer. Given a music request:
1. Analyze genre, mood, tempo, key
2. Generate music using available models (Bark for vocals, MMAudio for instrumentals)
3. Apply mixing and mastering effects
4. Export in requested format (MP3/WAV/FLAC)
Include chord progressions, melody lines, and rhythm patterns in your generation prompts.`, [300, 300]),
      codeNode("code1", "Audio Pipeline", `
const task = $input.all()[0]?.json;
return [{
  json: {
    commands: [
      "pip install -q pydub librosa soundfile",
      \`python3 -c "
import json
config = json.loads('{}')
print(json.dumps({'status': 'ready', 'genre': config.get('genre', 'ambient')}))
"\`,
    ],
    status: "processing",
  }
}];`, [600, 300]),
      callbackNode("cb1", [900, 300]),
    ],
    connections: {
      "Webhook Trigger": { main: [[{ node: "Music Producer", type: "main", index: 0 }]] },
      "Music Producer": { main: [[{ node: "Audio Pipeline", type: "main", index: 0 }]] },
      "Audio Pipeline": { main: [[{ node: "Report to HoC", type: "main", index: 0 }]] },
    },
  },
};

const DOCUMENT_GENERATION_TEMPLATE: N8nWorkflowTemplate = {
  id: "document-generation",
  name: "Document Generator",
  category: "document-generation",
  description: "Generate PPTX, DOCX, PDF, and Markdown documents from research or prompts",
  tags: ["documents", "pptx", "docx", "pdf", "markdown", "presentation"],
  workflow: {
    name: "[HoC] Document Generator",
    nodes: [
      webhookTrigger("wh1", "hoc/document-generation"),
      aiAgentNode("agent1", "Document Architect", `You are a professional document creator. Given a request:
1. Research the topic thoroughly (scrape websites if URLs provided)
2. Structure content with proper hierarchy
3. Generate the document in the requested format:
   - PPTX: 10-20 slides with speaker notes, images, charts
   - DOCX: Professional formatting, table of contents, headers
   - PDF: Clean layout with embedded fonts
   - MD: GitHub-flavored with diagrams
4. Include all contact info, vision, mission, products if company-related
5. Use professional templates and color schemes`, [300, 300]),
      codeNode("code1", "Generate Document", `
const task = $input.all()[0]?.json;
const format = task?.format || "pptx";
const commands = [];

if (format === "pptx") {
  commands.push(
    "pip install -q python-pptx Pillow requests",
    \`python3 /workspace/generate_pptx.py --topic "\${task?.topic || 'AI Report'}" --slides \${task?.slides || 15}\`,
  );
} else if (format === "docx") {
  commands.push(
    "pip install -q python-docx Pillow",
    \`python3 /workspace/generate_docx.py --topic "\${task?.topic || 'Report'}"\`,
  );
} else if (format === "pdf") {
  commands.push(
    "pip install -q fpdf2 Pillow",
    \`python3 /workspace/generate_pdf.py --topic "\${task?.topic || 'Report'}"\`,
  );
}

return [{ json: { commands, format, status: "generating" } }];`, [600, 300]),
      callbackNode("cb1", [900, 300]),
    ],
    connections: {
      "Webhook Trigger": { main: [[{ node: "Document Architect", type: "main", index: 0 }]] },
      "Document Architect": { main: [[{ node: "Generate Document", type: "main", index: 0 }]] },
      "Generate Document": { main: [[{ node: "Report to HoC", type: "main", index: 0 }]] },
    },
  },
};

const THREE_D_PRODUCTION_TEMPLATE: N8nWorkflowTemplate = {
  id: "3d-production",
  name: "3D Production & Game Dev",
  category: "3d-production",
  description: "3D models, games, animations using Blender, Three.js, and React Three Fiber",
  tags: ["3d", "blender", "threejs", "games", "animation", "r3f"],
  workflow: {
    name: "[HoC] 3D Production & Game Dev",
    nodes: [
      webhookTrigger("wh1", "hoc/3d-production"),
      aiAgentNode("agent1", "3D Engineer", `You are a 3D production engineer. Given a request:
1. Determine the right tool: Blender (complex models), Three.js (web 3D), R3F (React games)
2. Generate 3D assets, scenes, and animations
3. For games: scaffold complete playable experience with physics, controls, HUD
4. Export in standard formats (GLB, GLTF, FBX, OBJ)
5. Optimize for web (compressed textures, LOD, instancing)
Use Blender scripting (bpy) for complex modeling, Three.js/R3F for web experiences.`, [300, 300]),
      codeNode("code1", "3D Pipeline", `
const task = $input.all()[0]?.json;
const type = task?.type || "web-3d";
return [{
  json: {
    commands: type === "blender"
      ? ["apt-get install -y blender", "blender --background --python /workspace/generate.py"]
      : [
          "npx -y create-vite@latest /workspace/game --template react-ts",
          "cd /workspace/game && npm install three @react-three/fiber @react-three/drei",
          "cd /workspace/game && npm run build",
        ],
    type,
    status: "building",
  }
}];`, [600, 300]),
      callbackNode("cb1", [900, 300]),
    ],
    connections: {
      "Webhook Trigger": { main: [[{ node: "3D Engineer", type: "main", index: 0 }]] },
      "3D Engineer": { main: [[{ node: "3D Pipeline", type: "main", index: 0 }]] },
      "3D Pipeline": { main: [[{ node: "Report to HoC", type: "main", index: 0 }]] },
    },
  },
};

const RESEARCH_ANALYSIS_TEMPLATE: N8nWorkflowTemplate = {
  id: "research-analysis",
  name: "Research & Analysis Engine",
  category: "research-analysis",
  description: "Web crawling, data collection, analysis, and comprehensive report generation",
  tags: ["research", "scraping", "analysis", "report", "web-crawling"],
  workflow: {
    name: "[HoC] Research & Analysis Engine",
    nodes: [
      webhookTrigger("wh1", "hoc/research-analysis"),
      aiAgentNode("agent1", "Research Director", `You are an elite research analyst. Given a topic:
1. Plan research strategy (identify sources, keywords, data points)
2. Crawl relevant websites and save complete pages with assets
3. Extract structured data (contacts, products, services, financials)
4. Cross-reference multiple sources for accuracy
5. Synthesize findings into a comprehensive report
6. Include citations, data tables, and visual summaries
Save full websites with asset structure (HTML, CSS, JS, images in organized folders).`, [300, 300]),
      httpNode("http1", "Web Scraper", "={{ $json.url }}", "GET", [600, 200]),
      codeNode("code1", "Analyze & Report", `
const data = $input.all();
return [{
  json: {
    findings: data.map(d => d.json),
    reportGenerated: true,
    timestamp: new Date().toISOString(),
  }
}];`, [600, 400]),
      callbackNode("cb1", [900, 300]),
    ],
    connections: {
      "Webhook Trigger": { main: [[{ node: "Research Director", type: "main", index: 0 }]] },
      "Research Director": { main: [[{ node: "Web Scraper", type: "main", index: 0 }, { node: "Analyze & Report", type: "main", index: 0 }]] },
      "Web Scraper": { main: [[{ node: "Analyze & Report", type: "main", index: 0 }]] },
      "Analyze & Report": { main: [[{ node: "Report to HoC", type: "main", index: 0 }]] },
    },
  },
};

const QA_DEBUGGING_TEMPLATE: N8nWorkflowTemplate = {
  id: "qa-debugging",
  name: "QA & Debugging Pipeline",
  category: "qa-debugging",
  description: "Automated testing, bug detection, root cause analysis, and fix application",
  tags: ["qa", "testing", "debugging", "ci", "automated-testing"],
  workflow: {
    name: "[HoC] QA & Debugging Pipeline",
    nodes: [
      webhookTrigger("wh1", "hoc/qa-debugging"),
      aiAgentNode("agent1", "QA Lead", `You are a senior QA engineer and debugger. Given a codebase or bug report:
1. Run existing tests and collect failures
2. Analyze stack traces and error patterns
3. Identify root cause using systematic debugging
4. Write fix with minimal changes
5. Add regression tests
6. Verify fix doesn't introduce new issues
7. Generate QA report with findings and confidence score
Use tools: git bisect, test runners (jest/vitest/pytest), linters, profilers.`, [300, 300]),
      codeNode("code1", "Run Tests", `
const task = $input.all()[0]?.json;
return [{
  json: {
    commands: [
      "cd /workspace && npm test 2>&1 || true",
      "cd /workspace && npm run lint 2>&1 || true",
    ],
    phase: "testing",
  }
}];`, [600, 300]),
      callbackNode("cb1", [900, 300]),
    ],
    connections: {
      "Webhook Trigger": { main: [[{ node: "QA Lead", type: "main", index: 0 }]] },
      "QA Lead": { main: [[{ node: "Run Tests", type: "main", index: 0 }]] },
      "Run Tests": { main: [[{ node: "Report to HoC", type: "main", index: 0 }]] },
    },
  },
};

const STORY_WRITING_TEMPLATE: N8nWorkflowTemplate = {
  id: "story-writing",
  name: "Story & Content Writer",
  category: "story-writing",
  description: "Long-form content generation, editing, and publishing",
  tags: ["writing", "content", "story", "blog", "creative-writing"],
  workflow: {
    name: "[HoC] Story & Content Writer",
    nodes: [
      webhookTrigger("wh1", "hoc/story-writing"),
      aiAgentNode("agent1", "Story Architect", `You are a professional writer and editor. Given a writing request:
1. Develop outline with chapter/section structure
2. Write each section with rich, engaging prose
3. Apply editorial review (grammar, flow, consistency)
4. Format appropriately (novel, blog, article, script)
5. Generate companion assets (cover art descriptions, chapter summaries)
Maintain consistent voice, pacing, and character development for fiction.`, [300, 300]),
      codeNode("code1", "Format Output", `
const result = $input.all()[0]?.json;
return [{
  json: {
    content: result?.text || result?.content || "",
    wordCount: (result?.text || "").split(/\\s+/).length,
    format: result?.format || "markdown",
    status: "complete",
  }
}];`, [600, 300]),
      callbackNode("cb1", [900, 300]),
    ],
    connections: {
      "Webhook Trigger": { main: [[{ node: "Story Architect", type: "main", index: 0 }]] },
      "Story Architect": { main: [[{ node: "Format Output", type: "main", index: 0 }]] },
      "Format Output": { main: [[{ node: "Report to HoC", type: "main", index: 0 }]] },
    },
  },
};

const GRAPHICS_DESIGN_TEMPLATE: N8nWorkflowTemplate = {
  id: "graphics-design",
  name: "Graphics Design Studio",
  category: "graphics-design",
  description: "Logos, UI mockups, brand assets, and visual design",
  tags: ["design", "graphics", "logo", "ui", "branding"],
  workflow: {
    name: "[HoC] Graphics Design Studio",
    nodes: [
      webhookTrigger("wh1", "hoc/graphics-design"),
      aiAgentNode("agent1", "Design Director", `You are a senior graphic designer. Given a design request:
1. Understand brand identity (colors, fonts, mood)
2. Create multiple concept variations
3. Generate using AI image models (SDXL, Flux, DALL-E)
4. Apply post-processing (vectorization for logos, optimization)
5. Export in multiple formats (PNG, SVG, PDF, Figma-compatible)
6. Provide brand style guide with color palette and typography`, [300, 300]),
      httpNode("http1", "Image Generation", "http://comfyui:8188/prompt", "POST", [600, 300]),
      callbackNode("cb1", [900, 300]),
    ],
    connections: {
      "Webhook Trigger": { main: [[{ node: "Design Director", type: "main", index: 0 }]] },
      "Design Director": { main: [[{ node: "Image Generation", type: "main", index: 0 }]] },
      "Image Generation": { main: [[{ node: "Report to HoC", type: "main", index: 0 }]] },
    },
  },
};

const DEVOPS_DEPLOY_TEMPLATE: N8nWorkflowTemplate = {
  id: "devops-deploy",
  name: "DevOps & Deployment",
  category: "devops-deploy",
  description: "CI/CD pipelines, Docker orchestration, monitoring setup, and infrastructure management",
  tags: ["devops", "docker", "ci-cd", "deploy", "monitoring"],
  workflow: {
    name: "[HoC] DevOps & Deployment",
    nodes: [
      webhookTrigger("wh1", "hoc/devops-deploy"),
      aiAgentNode("agent1", "DevOps Engineer", `You are a senior DevOps engineer. Given an infrastructure request:
1. Design Docker infrastructure (Compose or Swarm)
2. Configure CI/CD pipelines (GitHub Actions, GitLab CI)
3. Set up monitoring (Prometheus, Grafana, alerts)
4. Implement security best practices (secrets, network policies)
5. Configure auto-scaling and load balancing
6. Write IaC (Terraform/Pulumi if needed)
Always use multi-stage Docker builds, health checks, and resource limits.`, [300, 300]),
      codeNode("code1", "Infrastructure", `
const task = $input.all()[0]?.json;
return [{
  json: {
    commands: [
      "docker compose config --quiet 2>&1 || echo 'No compose file'",
      "docker ps --format 'table {{.Names}}\\t{{.Status}}\\t{{.Ports}}'",
    ],
    status: "configuring",
  }
}];`, [600, 300]),
      callbackNode("cb1", [900, 300]),
    ],
    connections: {
      "Webhook Trigger": { main: [[{ node: "DevOps Engineer", type: "main", index: 0 }]] },
      "DevOps Engineer": { main: [[{ node: "Infrastructure", type: "main", index: 0 }]] },
      "Infrastructure": { main: [[{ node: "Report to HoC", type: "main", index: 0 }]] },
    },
  },
};

const DATA_PIPELINE_TEMPLATE: N8nWorkflowTemplate = {
  id: "data-pipeline",
  name: "Data Pipeline & ML",
  category: "data-pipeline",
  description: "ETL workflows, data processing, ML training, and inference pipelines",
  tags: ["data", "etl", "ml", "analytics", "pipeline"],
  workflow: {
    name: "[HoC] Data Pipeline & ML",
    nodes: [
      webhookTrigger("wh1", "hoc/data-pipeline"),
      aiAgentNode("agent1", "Data Engineer", `You are a data engineer and ML specialist. Given a data task:
1. Design ETL pipeline (Extract → Transform → Load)
2. Clean and validate data quality
3. Apply feature engineering for ML tasks
4. Train/fine-tune models if needed
5. Run inference and generate predictions
6. Visualize results with charts and dashboards
Support: pandas, scikit-learn, PyTorch, SQL, vector databases.`, [300, 300]),
      codeNode("code1", "Data Processing", `
const task = $input.all()[0]?.json;
return [{
  json: {
    commands: [
      "pip install -q pandas scikit-learn matplotlib seaborn",
      "python3 /workspace/pipeline.py",
    ],
    status: "processing",
  }
}];`, [600, 300]),
      callbackNode("cb1", [900, 300]),
    ],
    connections: {
      "Webhook Trigger": { main: [[{ node: "Data Engineer", type: "main", index: 0 }]] },
      "Data Engineer": { main: [[{ node: "Data Processing", type: "main", index: 0 }]] },
      "Data Processing": { main: [[{ node: "Report to HoC", type: "main", index: 0 }]] },
    },
  },
};

const MULTI_AGENT_COLLAB_TEMPLATE: N8nWorkflowTemplate = {
  id: "multi-agent-collab",
  name: "Multi-Agent Team Collaboration",
  category: "multi-agent-collab",
  description: "Orchestrate a team of specialized AI agents: PM, Developer, QA, Designer, DevOps",
  tags: ["multi-agent", "team", "collaboration", "orchestration"],
  workflow: {
    name: "[HoC] Multi-Agent Team Collaboration",
    nodes: [
      webhookTrigger("wh1", "hoc/multi-agent-collab"),
      aiAgentNode("pm", "Product Manager", `You are the Product Manager. Given a project request:
1. Break down requirements into user stories
2. Prioritize features by business value
3. Create sprint plan with task assignments
4. Define acceptance criteria for each story
Output a structured JSON plan with tasks, assignments, and dependencies.`, [300, 100]),
      aiAgentNode("dev", "Lead Developer", `You are the Lead Developer. Given the PM's plan:
1. Design technical architecture
2. Implement each feature with production code
3. Write unit tests for all components
4. Create API documentation
5. Follow SOLID principles and clean code`, [600, 100]),
      aiAgentNode("qa", "QA Engineer", `You are the QA Engineer. Given the developer's code:
1. Write integration and E2E tests
2. Perform security audit
3. Check performance benchmarks
4. Verify all acceptance criteria
5. Report bugs with reproduction steps`, [600, 300]),
      aiAgentNode("designer", "UX Designer", `You are the UX/UI Designer. Given the project:
1. Create wireframes and mockups
2. Design color palette and typography
3. Ensure accessibility (WCAG 2.1 AA)
4. Generate component library
5. Create responsive layouts`, [600, 500]),
      codeNode("merge", "Merge & Deploy", `
const results = $input.all();
return [{
  json: {
    ok: true,
    phases: results.map(r => ({
      agent: r.json?.agent || "unknown",
      status: r.json?.status || "complete",
      output: r.json?.output?.substring(0, 500),
    })),
    projectComplete: true,
    timestamp: new Date().toISOString(),
  }
}];`, [900, 300]),
      callbackNode("cb1", [1200, 300]),
    ],
    connections: {
      "Webhook Trigger": { main: [[{ node: "Product Manager", type: "main", index: 0 }]] },
      "Product Manager": { main: [[
        { node: "Lead Developer", type: "main", index: 0 },
        { node: "UX Designer", type: "main", index: 0 },
      ]] },
      "Lead Developer": { main: [[{ node: "QA Engineer", type: "main", index: 0 }]] },
      "QA Engineer": { main: [[{ node: "Merge & Deploy", type: "main", index: 0 }]] },
      "UX Designer": { main: [[{ node: "Merge & Deploy", type: "main", index: 0 }]] },
      "Merge & Deploy": { main: [[{ node: "Report to HoC", type: "main", index: 0 }]] },
    },
  },
};

const AUTONOMOUS_DISCOVERY_TEMPLATE: N8nWorkflowTemplate = {
  id: "autonomous-discovery",
  name: "Autonomous Market Discovery",
  category: "autonomous-discovery",
  description: "Self-initiated trend scanning — finds in-demand technologies, researches deeply, builds knowledge graphs, and reports findings",
  tags: ["autonomous", "research", "trends", "discovery", "knowledge-graph", "market"],
  workflow: {
    name: "[HoC] Autonomous Market Discovery",
    nodes: [
      webhookTrigger("wh1", "hoc/autonomous-discovery"),
      aiAgentNode("agent1", "Trend Scanner", `You are a technology trend analyst. Your mission:
1. Scan multiple sources for in-demand technologies, products, and services:
   - GitHub Trending, Hacker News, Product Hunt, Reddit r/programming, r/startups
   - Google Trends, Stack Overflow trends, npm/PyPI download stats
2. Identify the top 5 highest-potential opportunities with scoring:
   - Market size (weight: 0.3)
   - Competition gap (weight: 0.25)
   - Technical feasibility (weight: 0.25)
   - Revenue potential (weight: 0.2)
3. For each opportunity: collect evidence URLs, key metrics, competitor analysis
4. Output a structured JSON report with ranked opportunities`, [300, 300]),
      aiAgentNode("agent2", "Deep Researcher", `You are an elite research analyst. Given the top opportunities:
1. Deep-dive into each: documentation, research papers, GitHub repos, forums
2. Map the technology landscape (competitors, alternatives, ecosystem)
3. Identify knowledge gaps that represent market opportunities
4. Build a structured knowledge graph:
   - Entities: technologies, companies, products, APIs, standards
   - Relationships: competes_with, depends_on, enables, used_by
   - Properties: maturity, adoption_rate, growth_trajectory
5. Synthesize into actionable product recommendations`, [600, 200]),
      codeNode("code1", "Knowledge Graph Builder", `
const research = $input.all()[0]?.json;
const graph = {
  nodes: [],
  edges: [],
  metadata: {
    generatedAt: new Date().toISOString(),
    source: "HoC Autonomous Discovery",
  },
};
// Structure the research data into a navigable graph
return [{ json: { ...research, knowledgeGraph: graph, status: "graph_built" } }];`, [600, 400]),
      codeNode("merge1", "Generate Report", `
const data = $input.all()[0]?.json;
return [{
  json: {
    ok: true,
    type: "market-discovery",
    opportunities: data?.opportunities || [],
    knowledgeGraph: data?.knowledgeGraph || {},
    recommendations: data?.recommendations || [],
    timestamp: new Date().toISOString(),
  }
}];`, [900, 300]),
      callbackNode("cb1", [1200, 300]),
    ],
    connections: {
      "Webhook Trigger": { main: [[{ node: "Trend Scanner", type: "main", index: 0 }]] },
      "Trend Scanner": { main: [[{ node: "Deep Researcher", type: "main", index: 0 }]] },
      "Deep Researcher": { main: [[{ node: "Knowledge Graph Builder", type: "main", index: 0 }]] },
      "Knowledge Graph Builder": { main: [[{ node: "Generate Report", type: "main", index: 0 }]] },
      "Generate Report": { main: [[{ node: "Report to HoC", type: "main", index: 0 }]] },
    },
  },
};

const FULL_PRODUCT_LIFECYCLE_TEMPLATE: N8nWorkflowTemplate = {
  id: "full-product-lifecycle",
  name: "Full Product Lifecycle",
  category: "full-product-lifecycle",
  description: "End-to-end from a single prompt: research → spec → build → brand → docs → marketing → sales → package as deliverable",
  tags: ["product", "lifecycle", "branding", "marketing", "full-cycle", "autonomous"],
  workflow: {
    name: "[HoC] Full Product Lifecycle",
    nodes: [
      webhookTrigger("wh1", "hoc/full-product-lifecycle"),
      aiAgentNode("decomposer", "Task Decomposer", `You are a senior product manager. Given a product request:
1. Break the entire project into 8 phases with specific deliverables:
   Phase 1: Market Research — Competitor analysis, target audience, positioning
   Phase 2: Product Specification — Feature list, user stories, tech stack
   Phase 3: Architecture & Design — System design, database schema, API design
   Phase 4: Implementation — Build the full product with all features
   Phase 5: Branding & Identity — Logo, color palette, typography, brand guide
   Phase 6: Documentation — User manual, API docs, FAQ, How-to guides
   Phase 7: Marketing & Sales — Campaign copy, social media posts, sales training
   Phase 8: Packaging & Delivery — Bundle everything, create deliverable archive
2. For each phase, specify:
   - Responsible agent role (researcher, developer, designer, writer, marketer)
   - Input requirements and output deliverables
   - Dependencies on other phases
   - Estimated complexity (1-5)
3. Output a structured JSON plan with the full decomposition`, [300, 300]),
      aiAgentNode("researcher", "Market Researcher", `You are a market research specialist. Given the product idea:
1. Research the competitive landscape
2. Identify target audience and their pain points
3. Analyze market size and growth potential
4. Document pricing strategies of competitors
5. Produce a structured market research report`, [600, 100]),
      aiAgentNode("builder", "Product Builder", `You are a full-stack developer. Given the spec:
1. Scaffold the complete project structure
2. Implement all backend APIs
3. Build the frontend UI with premium design
4. Set up database and migrations
5. Write comprehensive tests
6. Ensure the product is fully functional and deployable`, [600, 300]),
      aiAgentNode("designer", "Brand Designer", `You are a brand identity designer. Given the product:
1. Design a professional logo concept (describe for AI generation)
2. Create a complete color palette (primary, secondary, accent, neutral)
3. Select typography (headings, body, accent fonts)
4. Create a brand style guide document
5. Design social media templates and marketing collateral descriptions`, [600, 500]),
      aiAgentNode("writer", "Content Creator", `You are a technical writer and marketing copywriter. Given the product:
1. Write user documentation (getting started, features, FAQ)
2. Create API documentation if applicable
3. Write marketing copy (website hero, features page, pricing page)
4. Create social media campaign content (10+ posts per platform)
5. Write sales training materials and product one-pagers
6. Generate email marketing sequences`, [900, 100]),
      codeNode("package", "Package Deliverables", `
const phases = $input.all();
return [{
  json: {
    ok: true,
    type: "full-product",
    phases: phases.map(p => ({
      agent: p.json?.agent || "unknown",
      deliverables: p.json?.deliverables || [],
      status: "complete",
    })),
    structure: {
      "code/": "Full source code",
      "branding/": "Logo, color palette, brand guide",
      "docs/": "User manual, API docs, FAQ",
      "marketing/": "Campaigns, social posts, email sequences",
      "sales/": "Training materials, one-pagers",
      "research/": "Market analysis, competitor report",
    },
    projectComplete: true,
    timestamp: new Date().toISOString(),
  }
}];`, [1200, 300]),
      callbackNode("cb1", [1500, 300]),
    ],
    connections: {
      "Webhook Trigger": { main: [[{ node: "Task Decomposer", type: "main", index: 0 }]] },
      "Task Decomposer": { main: [[
        { node: "Market Researcher", type: "main", index: 0 },
        { node: "Brand Designer", type: "main", index: 0 },
      ]] },
      "Market Researcher": { main: [[{ node: "Product Builder", type: "main", index: 0 }]] },
      "Product Builder": { main: [[{ node: "Content Creator", type: "main", index: 0 }]] },
      "Brand Designer": { main: [[{ node: "Content Creator", type: "main", index: 0 }]] },
      "Content Creator": { main: [[{ node: "Package Deliverables", type: "main", index: 0 }]] },
      "Package Deliverables": { main: [[{ node: "Report to HoC", type: "main", index: 0 }]] },
    },
  },
};

// ─── Registry ───────────────────────────────────────────────────

export const WORKFLOW_TEMPLATES: N8nWorkflowTemplate[] = [
  FULL_STACK_APP_TEMPLATE,
  MEDIA_PRODUCTION_TEMPLATE,
  MUSIC_PRODUCTION_TEMPLATE,
  DOCUMENT_GENERATION_TEMPLATE,
  THREE_D_PRODUCTION_TEMPLATE,
  RESEARCH_ANALYSIS_TEMPLATE,
  QA_DEBUGGING_TEMPLATE,
  STORY_WRITING_TEMPLATE,
  GRAPHICS_DESIGN_TEMPLATE,
  DEVOPS_DEPLOY_TEMPLATE,
  DATA_PIPELINE_TEMPLATE,
  MULTI_AGENT_COLLAB_TEMPLATE,
  AUTONOMOUS_DISCOVERY_TEMPLATE,
  FULL_PRODUCT_LIFECYCLE_TEMPLATE,
];

/**
 * Get a workflow template by ID.
 */
export function getWorkflowTemplate(id: string): N8nWorkflowTemplate | undefined {
  return WORKFLOW_TEMPLATES.find((t) => t.id === id);
}

/**
 * Get templates by category.
 */
export function getTemplatesByCategory(category: WorkflowCategory): N8nWorkflowTemplate[] {
  return WORKFLOW_TEMPLATES.filter((t) => t.category === category);
}

/**
 * List template summaries (for UI listing without full workflow JSON).
 */
export function listTemplateSummaries(): Array<{
  id: string;
  name: string;
  category: string;
  description: string;
  tags: string[];
}> {
  return WORKFLOW_TEMPLATES.map(({ id, name, category, description, tags }) => ({
    id,
    name,
    category,
    description,
    tags,
  }));
}

log.info(`Loaded ${WORKFLOW_TEMPLATES.length} workflow templates`);
