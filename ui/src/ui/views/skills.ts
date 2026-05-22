import { html, nothing } from "lit";
import type { SkillMessageMap } from "../controllers/skills.ts";
import type { SkillStatusEntry, SkillStatusReport } from "../types.ts";
import type { PopulationStats } from "./population.ts";
import { clampText } from "../format.ts";

type SkillGroup = {
  id: string;
  label: string;
  skills: SkillStatusEntry[];
};

const SKILL_SOURCE_GROUPS: Array<{ id: string; label: string; sources: string[] }> = [
  { id: "workspace", label: "Workspace Skills", sources: ["hoc-workspace"] },
  { id: "built-in", label: "Built-in Skills", sources: ["hoc-bundled"] },
  { id: "installed", label: "Installed Skills", sources: ["hoc-managed"] },
  { id: "extra", label: "Extra Skills", sources: ["hoc-extra"] },
];

function groupSkills(skills: SkillStatusEntry[]): SkillGroup[] {
  const groups = new Map<string, SkillGroup>();
  for (const def of SKILL_SOURCE_GROUPS) {
    groups.set(def.id, { id: def.id, label: def.label, skills: [] });
  }
  const builtInGroup = SKILL_SOURCE_GROUPS.find((group) => group.id === "built-in");
  const other: SkillGroup = { id: "other", label: "Other Skills", skills: [] };
  for (const skill of skills) {
    const match = skill.bundled
      ? builtInGroup
      : SKILL_SOURCE_GROUPS.find((group) => group.sources.includes(skill.source));
    if (match) {
      groups.get(match.id)?.skills.push(skill);
    } else {
      other.skills.push(skill);
    }
  }
  const ordered = SKILL_SOURCE_GROUPS.map((group) => groups.get(group.id)).filter(
    (group): group is SkillGroup => Boolean(group && group.skills.length > 0),
  );
  if (other.skills.length > 0) {
    ordered.push(other);
  }
  return ordered;
}

export type SkillsProps = {
  loading: boolean;
  report: SkillStatusReport | null;
  error: string | null;
  filter: string;
  edits: Record<string, string>;
  busyKey: string | null;
  messages: SkillMessageMap;
  /** Republic population stats — used to render citizen specializations */
  populationStats: PopulationStats | null;
  onFilterChange: (next: string) => void;
  onRefresh: () => void;
  onToggle: (skillKey: string, enabled: boolean) => void;
  onEdit: (skillKey: string, value: string) => void;
  onSaveKey: (skillKey: string) => void;
  onInstall: (skillKey: string, name: string, installId: string) => void;
};

export function renderSkills(props: SkillsProps) {
  const skills = props.report?.skills ?? [];
  const filter = props.filter.trim().toLowerCase();
  const filtered = filter
    ? skills.filter((skill) =>
        [skill.name, skill.description, skill.source].join(" ").toLowerCase().includes(filter),
      )
    : skills;
  const groups = groupSkills(filtered);

  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">Skills</div>
          <div class="card-sub">Bundled, managed, and workspace skills.</div>
        </div>
        <button type="button" class="btn" ?disabled=${props.loading} @click=${props.onRefresh}>
          ${props.loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      <div class="filters" style="margin-top: 14px;">
        <label class="field" style="flex: 1;">
          <span>Filter</span>
          <input
            .value=${props.filter}
            @input=${(e: Event) => props.onFilterChange((e.target as HTMLInputElement).value)}
            placeholder="Search skills"
          />
        </label>
        <div class="muted">${filtered.length} shown</div>
      </div>

      ${
        props.error
          ? html`<div class="callout danger" style="margin-top: 12px;">${props.error}</div>`
          : nothing
      }

      ${
        filtered.length === 0
          ? html`
              <div class="muted" style="margin-top: 16px">No skills found.</div>
            `
          : html`
            <div class="agent-skills-groups" style="margin-top: 16px;">
              ${groups.map((group) => {
                const collapsedByDefault = group.id === "workspace" || group.id === "built-in";
                return html`
                  <details class="agent-skills-group" ?open=${!collapsedByDefault}>
                    <summary class="agent-skills-header">
                      <span>${group.label}</span>
                      <span class="muted">${group.skills.length}</span>
                    </summary>
                    <div class="list skills-grid">
                      ${group.skills.map((skill) => renderSkill(skill, props))}
                    </div>
                  </details>
                `;
              })}
            </div>
          `
      }
    </section>
    ${renderRepublicSkills(props)}
  `;
}

function renderSkill(skill: SkillStatusEntry, props: SkillsProps) {
  const busy = props.busyKey === skill.skillKey;
  const apiKey = props.edits[skill.skillKey] ?? "";
  const message = props.messages[skill.skillKey] ?? null;
  const canInstall = skill.install.length > 0 && skill.missing.bins.length > 0;
  const showBundledBadge = Boolean(skill.bundled && skill.source !== "hoc-bundled");
  const missing = [
    ...skill.missing.bins.map((b) => `bin:${b}`),
    ...skill.missing.env.map((e) => `env:${e}`),
    ...skill.missing.config.map((c) => `config:${c}`),
    ...skill.missing.os.map((o) => `os:${o}`),
  ];
  const reasons: string[] = [];
  if (skill.disabled) {
    reasons.push("disabled");
  }
  if (skill.blockedByAllowlist) {
    reasons.push("blocked by allowlist");
  }
  return html`
    <div class="list-item">
      <div class="list-main">
        <div class="list-title">
          ${skill.emoji ? `${skill.emoji} ` : ""}${skill.name}
        </div>
        <div class="list-sub">${clampText(skill.description, 140)}</div>
        <div class="chip-row" style="margin-top: 6px;">
          <span class="chip">${skill.source}</span>
          ${
            showBundledBadge
              ? html`
                  <span class="chip">bundled</span>
                `
              : nothing
          }
          <span class="chip ${skill.eligible ? "chip-ok" : "chip-warn"}">
            ${skill.eligible ? "eligible" : "blocked"}
          </span>
          ${
            skill.disabled
              ? html`
                  <span class="chip chip-warn">disabled</span>
                `
              : nothing
          }
        </div>
        ${
          missing.length > 0
            ? html`
              <div class="muted" style="margin-top: 6px;">
                Missing: ${missing.join(", ")}
              </div>
            `
            : nothing
        }
        ${
          reasons.length > 0
            ? html`
              <div class="muted" style="margin-top: 6px;">
                Reason: ${reasons.join(", ")}
              </div>
            `
            : nothing
        }
      </div>
      <div class="list-meta">
        <div class="row" style="justify-content: flex-end; flex-wrap: wrap;">
          <button type="button"
            class="btn"
            ?disabled=${busy}
            @click=${() => props.onToggle(skill.skillKey, skill.disabled)}
          >
            ${skill.disabled ? "Enable" : "Disable"}
          </button>
          ${
            canInstall
              ? html`<button type="button"
                class="btn"
                ?disabled=${busy}
                @click=${() => props.onInstall(skill.skillKey, skill.name, skill.install[0].id)}
              >
                ${busy ? "Installing…" : skill.install[0].label}
              </button>`
              : nothing
          }
        </div>
        ${
          message
            ? html`<div
              class="muted"
              style="margin-top: 8px; color: ${
                message.kind === "error"
                  ? "var(--danger-color, #d14343)"
                  : "var(--success-color, #0a7f5a)"
              };"
            >
              ${message.message}
            </div>`
            : nothing
        }
        ${
          skill.primaryEnv
            ? html`
              <div class="field" style="margin-top: 10px;">
                <span>API key</span>
                <input
                  type="password"
                  .value=${apiKey}
                  @input=${(e: Event) =>
                    props.onEdit(skill.skillKey, (e.target as HTMLInputElement).value)}
                />
              </div>
              <button type="button"
                class="btn primary"
                style="margin-top: 8px;"
                ?disabled=${busy}
                @click=${() => props.onSaveKey(skill.skillKey)}
              >
                Save key
              </button>
            `
            : nothing
        }
      </div>
    </div>
  `;
}

// ─── Republic Citizen Skills Section ────────────────────────────

/** Mirrors SPECIALIZATIONS from src/republic/utils.ts */
const REPUBLIC_SPECIALIZATIONS = [
  "Scientist",
  "Researcher",
  "Developer",
  "Musician",
  "Writer",
  "Artist",
  "Analyst",
  "Architect",
  "Engineer",
  "Doctor",
  "Psychologist",
  "Farmer",
  "Manufacturer",
  "Planner",
  "Diplomat",
  "Strategist",
  "Mathematician",
  "Educator",
  "Journalist",
  "Merchant",
  "HardwareTechnician",
  "Filmmaker",
  "Composer",
  "WebDeveloper",
  "GameDeveloper",
  "DataScientist",
  "Designer",
  "DevOpsEngineer",
  "SecurityExpert",
  "ProductManager",
  "ContentCreator",
];

/** Mirrors SKILL_TREES from src/republic/utils.ts */
const REPUBLIC_SKILL_TREES: Record<string, string[]> = {
  Scientist: [
    "hypothesis testing",
    "data analysis",
    "peer review",
    "experiment design",
    "statistical modeling",
    "publication",
  ],
  Researcher: [
    "literature review",
    "field study",
    "survey design",
    "qualitative analysis",
    "grant writing",
    "meta-analysis",
  ],
  Developer: [
    "code review",
    "test-driven development",
    "debugging",
    "system design",
    "API design",
    "refactoring",
  ],
  Musician: [
    "composition",
    "arrangement",
    "mixing",
    "mastering",
    "music theory",
    "live performance",
  ],
  Writer: [
    "creative writing",
    "editing",
    "copywriting",
    "research writing",
    "storytelling",
    "technical writing",
  ],
  Artist: ["drawing", "painting", "sculpting", "digital art", "color theory", "illustration"],
  Analyst: [
    "data visualization",
    "trend analysis",
    "forecasting",
    "SQL",
    "statistical inference",
    "report writing",
  ],
  Architect: [
    "system architecture",
    "cloud design",
    "scalability patterns",
    "diagramming",
    "tech evaluation",
    "microservices",
  ],
  Engineer: [
    "circuit design",
    "control systems",
    "CAD modeling",
    "materials science",
    "thermodynamics",
    "robotics",
  ],
  Doctor: [
    "diagnosis",
    "treatment planning",
    "pharmacology",
    "patient care",
    "surgery",
    "emergency medicine",
  ],
  Psychologist: [
    "cognitive assessment",
    "behavioral therapy",
    "counseling",
    "neuropsychology",
    "group therapy",
    "research methods",
  ],
  Farmer: [
    "crop rotation",
    "soil analysis",
    "irrigation",
    "pest management",
    "harvest planning",
    "livestock care",
  ],
  Manufacturer: [
    "lean manufacturing",
    "quality control",
    "CNC operation",
    "supply chain",
    "safety compliance",
    "process optimization",
  ],
  Planner: [
    "project management",
    "scheduling",
    "resource allocation",
    "risk analysis",
    "stakeholder management",
    "agile methodology",
  ],
  Diplomat: [
    "negotiation",
    "mediation",
    "treaty drafting",
    "cultural awareness",
    "public speaking",
    "conflict resolution",
  ],
  Strategist: [
    "SWOT analysis",
    "game theory",
    "scenario planning",
    "competitive analysis",
    "policy design",
    "decision modeling",
  ],
  Mathematician: [
    "theorem proving",
    "topology",
    "number theory",
    "combinatorics",
    "linear algebra",
    "differential equations",
  ],
  Educator: [
    "curriculum design",
    "classroom management",
    "assessment design",
    "instructional design",
    "mentoring",
    "e-learning",
  ],
  Journalist: [
    "investigative research",
    "interviewing",
    "fact-checking",
    "photojournalism",
    "editorial writing",
    "broadcast",
  ],
  Merchant: [
    "pricing strategy",
    "inventory management",
    "customer relations",
    "marketing",
    "supply negotiation",
    "e-commerce",
  ],
  HardwareTechnician: [
    "PC assembly",
    "diagnostics",
    "soldering",
    "firmware flashing",
    "network cabling",
    "component testing",
  ],
  Filmmaker: [
    "scriptwriting",
    "cinematography",
    "video editing",
    "VFX compositing",
    "directing",
    "sound design",
    "color grading",
    "storyboarding",
  ],
  Composer: [
    "orchestration",
    "DAW production",
    "music theory",
    "mixing & mastering",
    "film scoring",
    "sound synthesis",
    "sampling",
    "live arrangement",
  ],
  WebDeveloper: [
    "HTML/CSS",
    "JavaScript/TypeScript",
    "React/Vue",
    "responsive design",
    "SSR/SSG",
    "accessibility",
    "REST/GraphQL",
    "progressive web apps",
  ],
  GameDeveloper: [
    "game physics",
    "shader programming",
    "procedural generation",
    "multiplayer networking",
    "AI pathfinding",
    "level design",
    "UE/Unity",
    "game balancing",
  ],
  DataScientist: [
    "ML modeling",
    "deep learning",
    "NLP",
    "feature engineering",
    "data wrangling",
    "A/B testing",
    "reinforcement learning",
    "MLOps",
  ],
  Designer: [
    "UI/UX design",
    "typography",
    "branding",
    "motion graphics",
    "wireframing",
    "design systems",
    "prototyping",
    "visual hierarchy",
  ],
  DevOpsEngineer: [
    "CI/CD pipelines",
    "Kubernetes",
    "infrastructure as code",
    "monitoring",
    "containerization",
    "GitOps",
    "cloud platforms",
    "SRE practices",
  ],
  SecurityExpert: [
    "penetration testing",
    "cryptography",
    "threat modeling",
    "forensics",
    "zero-trust architecture",
    "compliance",
    "vulnerability assessment",
    "incident response",
  ],
  ProductManager: [
    "roadmapping",
    "user research",
    "A/B testing",
    "go-to-market",
    "backlog prioritization",
    "stakeholder alignment",
    "metrics & KPIs",
    "competitive analysis",
  ],
  ContentCreator: [
    "video production",
    "streaming",
    "podcasting",
    "SEO writing",
    "social media",
    "audience analytics",
    "monetization",
    "brand partnerships",
  ],
};

/** Color mapping for specializations — matches population.ts SPEC_COLORS */
const SPEC_COLORS_MAP: Record<string, string> = {
  Scientist: "#818cf8",
  Researcher: "#a78bfa",
  Developer: "#34d399",
  Musician: "#f472b6",
  Writer: "#fbbf24",
  Artist: "#fb923c",
  Analyst: "#22d3ee",
  Architect: "#8b5cf6",
  Engineer: "#64748b",
  Doctor: "#ef4444",
  Psychologist: "#c084fc",
  Farmer: "#84cc16",
  Manufacturer: "#f59e0b",
  Planner: "#06b6d4",
  Diplomat: "#a855f7",
  Strategist: "#e11d48",
  Mathematician: "#6366f1",
  Educator: "#14b8a6",
  Journalist: "#f97316",
  Merchant: "#eab308",
  HardwareTechnician: "#94a3b8",
  Filmmaker: "#e879f9",
  Composer: "#d946ef",
  WebDeveloper: "#2dd4bf",
  GameDeveloper: "#a3e635",
  DataScientist: "#38bdf8",
  Designer: "#f472b6",
  DevOpsEngineer: "#475569",
  SecurityExpert: "#dc2626",
  ProductManager: "#7c3aed",
  ContentCreator: "#fb7185",
};

/** 7 new production tools from Phase 50 */
const PRODUCTION_TOOLS = [
  { name: "generate_music_track", icon: "🎵", desc: "Full song/instrumental → MP3" },
  { name: "generate_video", icon: "🎬", desc: "Text-to-video → MP4" },
  { name: "build_website", icon: "🌐", desc: "Scaffold & build websites" },
  { name: "deploy_website", icon: "🚀", desc: "Deploy to local/cloud" },
  { name: "compile_software", icon: "⚙️", desc: "Build/compile projects" },
  { name: "generate_3d_model", icon: "🧊", desc: "Create 3D models (OBJ/GLTF)" },
  { name: "create_game", icon: "🕹️", desc: "HTML5 game generation" },
];

function renderRepublicSkills(props: SkillsProps) {
  const specDist = props.populationStats?.specializationDistribution ?? {};
  const totalCitizens = props.populationStats?.total ?? 0;

  return html`
    <section class="card" style="margin-top: 24px;">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title" style="display: flex; align-items: center; gap: 8px;">
            🏛️ Republic Citizen Skills
          </div>
          <div class="card-sub">
            ${totalCitizens} citizens across ${REPUBLIC_SPECIALIZATIONS.length} specializations
            · ${PRODUCTION_TOOLS.length} production tools
          </div>
        </div>
      </div>

      <!-- Production tools grid -->
      <details class="agent-skills-group" open style="margin-top: 16px;">
        <summary class="agent-skills-header">
          <span>🔧 Production Tools</span>
          <span class="muted">${PRODUCTION_TOOLS.length}</span>
        </summary>
        <div class="list skills-grid">
          ${PRODUCTION_TOOLS.map(
            (tool) => html`
              <div class="list-item">
                <div class="list-main">
                  <div class="list-title">${tool.icon} ${tool.name}</div>
                  <div class="list-sub">${tool.desc}</div>
                </div>
                <div class="list-meta">
                  <span class="chip chip-ok">active</span>
                </div>
              </div>
            `,
          )}
        </div>
      </details>

      <!-- Specializations with skill trees -->
      <details class="agent-skills-group" open style="margin-top: 8px;">
        <summary class="agent-skills-header">
          <span>👥 Specializations & Skill Trees</span>
          <span class="muted">${REPUBLIC_SPECIALIZATIONS.length}</span>
        </summary>
        <div class="list skills-grid">
          ${REPUBLIC_SPECIALIZATIONS.map((spec) => {
            const count = specDist[spec] ?? 0;
            const skills = REPUBLIC_SKILL_TREES[spec] ?? [];
            const color = SPEC_COLORS_MAP[spec] ?? "var(--muted)";
            const pct = totalCitizens > 0 ? ((count / totalCitizens) * 100).toFixed(1) : "0.0";
            return html`
              <div class="list-item">
                <div class="list-main">
                  <div class="list-title">
                    <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: ${color}; margin-right: 6px;"></span>
                    ${spec}
                  </div>
                  <div class="list-sub" style="margin-top: 4px;">
                    ${skills.map(
                      (s) =>
                        html`<span class="chip" style="margin: 2px 4px 2px 0; font-size: 11px;">${s}</span>`,
                    )}
                  </div>
                </div>
                <div class="list-meta" style="text-align: right; min-width: 80px;">
                  <div style="font-weight: 600; color: ${color};">${count}</div>
                  <div class="muted" style="font-size: 11px;">${pct}%</div>
                </div>
              </div>
            `;
          })}
        </div>
      </details>
    </section>
  `;
}
