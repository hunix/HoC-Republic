import type { GatewayRequestHandlers, GatewayRequestOptions } from "./server-methods/types.js";
import { getPluginGatewayMethod } from "../republic/hoc-plugin-manager.js";
import { gatewayBreaker, withTimeout } from "./fault-isolation.js";
import { ErrorCodes, errorShape } from "./protocol/index.js";
import { agentHandlers } from "./server-methods/agent.js";
import { agentHubHandlers } from "./server-methods/agenthub.js";
import { agentsHandlers } from "./server-methods/agents.js";
import { blackeyeHandlers } from "./server-methods/blackeye.js";
import { browserHandlers } from "./server-methods/browser.js";
import { channelsHandlers } from "./server-methods/channels.js";
import { chatHandlers } from "./server-methods/chat.js";
import { clusterHandlers } from "./server-methods/cluster.js";
import { companionHandlers } from "./server-methods/companion-handlers.js";
import { configHandlers } from "./server-methods/config.js";
import { connectHandlers } from "./server-methods/connect.js";
import { cronHandlers } from "./server-methods/cron.js";
import { deviceHandlers } from "./server-methods/devices.js";
import { execApprovalsHandlers } from "./server-methods/exec-approvals.js";
import { registryLookupScope } from "./server-methods/handler-registry.js";
import { healthHandlers } from "./server-methods/health.js";
import { logsHandlers } from "./server-methods/logs.js";
import { memoryHandlers } from "./server-methods/memory.js";
import { modelsHandlers } from "./server-methods/models.js";
import { nodeHandlers } from "./server-methods/nodes.js";
import { paperclipHandlers } from "./server-methods/paperclip.js";
import { pentagiHandlers } from "./server-methods/pentagi.js";
import { racHandlers } from "./server-methods/rac.js";
import { republicHandlers, loadAllRepublicHandlers } from "./server-methods/republic.js";
import { scanHandlers } from "./server-methods/scan.js";
import { sendHandlers } from "./server-methods/send.js";
import { sessionsHandlers } from "./server-methods/sessions.js";
import { skillsHandlers } from "./server-methods/skills.js";
import { systemHandlers } from "./server-methods/system.js";
import { talkHandlers } from "./server-methods/talk.js";
import { testProviderHandlers } from "./server-methods/test-provider.js";
import { ttsHandlers } from "./server-methods/tts.js";
import { updateHandlers } from "./server-methods/update.js";
import { usageHandlers } from "./server-methods/usage.js";
import { voicewakeHandlers } from "./server-methods/voicewake.js";
import { webHandlers } from "./server-methods/web.js";
import { windowsControlHandlers } from "./server-methods/windows-control.js";
import { wizardHandlers } from "./server-methods/wizard.js";

// ─── Lazy-Loaded Heavyweight Handlers ────────────────────────────
// These are not imported eagerly because they pull in large dependency
// trees (Supabase Edge functions, HPICS 407-tool bridge, federation
// peer discovery, deep-research LLM pipelines). They are loaded on
// first RPC call or during post-boot health checks.
//
// Deep Research, Federation, HPICS (x3), Advanced Intel
// Combined weight: ~500 KB handler code + ~2 MB transitive deps.
type LazyHandlerDef = {
  exportName: string;
  loader: () => Promise<Record<string, unknown>>;
};
const LAZY_TOP_HANDLERS: LazyHandlerDef[] = [
  {
    exportName: "deepResearchHandlers",
    loader: () => import("./server-methods/republic/deep-research.js"),
  },
  {
    exportName: "federationHandlers",
    loader: () => import("./server-methods/republic/federation.js"),
  },
  { exportName: "hpicsHandlers", loader: () => import("./server-methods/hpics.js") },
  {
    exportName: "hpicsContactHandlers",
    loader: () => import("./server-methods/hpics-contacts.js"),
  },
  {
    exportName: "advancedIntelHandlers",
    loader: () => import("./server-methods/advanced-intel.js"),
  },
  { exportName: "hpicsV380Handlers", loader: () => import("./server-methods/hpics-v380.js") },
];
const _lazyTopHandlerCache: GatewayRequestHandlers = {};

/**
 * Eagerly loads all lazy top-level handlers.
 * Called during post-boot health checks and whitelist drift detection.
 *
 * Thread-safe: concurrent callers coalesce onto a single load cycle.
 */
let _lazyTopPromise: Promise<void> | null = null;
export function loadLazyTopHandlers(): Promise<void> {
  if (_lazyTopPromise) {
    return _lazyTopPromise;
  }

  _lazyTopPromise = (async () => {
    const loads = LAZY_TOP_HANDLERS.map(async (def) => {
      try {
        const mod = await def.loader();
        const handlers = mod[def.exportName] as GatewayRequestHandlers | undefined;
        if (handlers && typeof handlers === "object") {
          Object.assign(_lazyTopHandlerCache, handlers);
        }
      } catch (err) {
        console.warn(`[gateway:lazy] Failed to load "${def.exportName}":`, String(err));
      }
    });
    await Promise.all(loads);
  })();

  return _lazyTopPromise;
}

const ADMIN_SCOPE = "operator.admin";
const READ_SCOPE = "operator.read";
const WRITE_SCOPE = "operator.write";
const APPROVALS_SCOPE = "operator.approvals";
const PAIRING_SCOPE = "operator.pairing";

const APPROVAL_METHODS = new Set(["exec.approval.request", "exec.approval.resolve"]);
const NODE_ROLE_METHODS = new Set([
  "node.invoke.result",
  "node.event",
  "skills.bins",
  // ── Read-only methods needed by companion nodes (ESP32, M5Stick etc.) ────
  "health",
  "health.agent",
  "health.run",
  "health.capabilities",
  "ping",
  "sessions.list",
  "sessions.create",
  "republic.overview",
  "republic.citizens.list",
  "republic.citizens.stats",
  // ── Write methods used by M5Stick firmware ────
  "chat.send",
  "chat.abort",
  "voice.transcribe",
]);
const PAIRING_METHODS = new Set([
  "node.pair.request",
  "node.pair.list",
  "node.pair.approve",
  "node.pair.reject",
  "node.pair.verify",
  "device.pair.list",
  "device.pair.approve",
  "device.pair.reject",
  "device.token.rotate",
  "device.token.revoke",
  "node.rename",
]);
const ADMIN_METHOD_PREFIXES = ["exec.approvals.", "republic.infra.", "republic.node.docker."];
const READ_METHODS = new Set([
  // ── March 2026 Drift ──
  "system.engine.status",
  "republic.lmlink.status",
  "republic.lmlink.nodes.list",
  "republic.lmlink.models.list",
  "republic.lmlink.routing.status",
  "republic.finetune.status",
  "republic.finetune.jobs",
  "republic.finetune.models",
  "republic.crucix.status",
  "republic.nemoclaw.status",
  "republic.nemoclaw.policies.list",
  "republic.nemoclaw.policies.get",
  "republic.nemoclaw.models",
  "republic.hr.overview",
  "republic.hr.jd.list",
  "republic.hr.jd.get",
  "republic.hr.competency.list",
  "republic.hr.assessment.history",
  "republic.hr.okr.list",
  "republic.hr.okr.get",
  "republic.hr.payroll.status",
  "republic.hr.payroll.history",
  "republic.hr.org.diagnostics",
  "republic.sandbox.status",
  "republic.sandbox.queue",
  "republic.sandbox.task.status",
  "republic.sandbox.read-file",
  "republic.foundry.status",
  "republic.cognee.status",
  "republic.cognee.diagnostics",
  "republic.composio.status",
  "republic.healing.status",
  "republic.healing.history",
  "republic.sandbox.types",
  "republic.sandbox.replays.list",
  "republic.sandbox.replays.get",
  "republic.sandbox.tunnels.list",
  "republic.n8n.status",
  "republic.n8n.workflows.list",
  "republic.n8n.workflows.get",
  "republic.n8n.executions.list",
  "republic.n8n.executions.get",
  "republic.n8n.templates.list",
  "republic.brandings.list",
  "republic.brandings.get",
  "republic.cyber.kali.status",
  "republic.cyber.kali.scan.status",
  "republic.node.docker.status",
  "republic.node.docker.containers.list",
  "republic.node.docker.containers.logs",
  "republic.node.docker.presets.list",
  "republic.node.docker.images.list",
  "republic.node.docker.redis.status",
  "republic.infra.status",
  "republic.infra.logs",
  "republic.infra.registry",
  "health",
  "logs.tail",
  "channels.status",
  "status",
  "skills.bins",
  "usage.status",
  "usage.cost",
  "tts.status",
  "tts.providers",
  "models.list",
  "agents.list",
  "agent.identity.get",
  "skills.status",
  "voicewake.get",
  "sessions.list",
  "sessions.preview",
  "cron.list",
  "cron.status",
  "cron.runs",
  "system-presence",
  "last-heartbeat",
  "node.list",
  "node.describe",
  "chat.history",
  "republic.overview",
  "republic.population.list",
  "republic.government.status",
  "republic.economy.treasury",
  "republic.simulation.status",
  "republic.tech.atlantis.status",
  "republic.tech.ml.status",
  "republic.tech.quantum.status",
  "republic.grid.status",
  "republic.mode.get",
  "republic.intake.diagnostics",
  "republic.store.status",
  "republic.education.status",
  "republic.education.citizen",
  "republic.memory.citizen",
  "republic.memory.citizen.episodic",
  "republic.memory.citizen.semantic",
  "republic.memory.citizen.relationships",
  "republic.memory.collective",
  "republic.db.projects",
  "republic.db.tasks",
  "republic.db.decisions",
  "republic.db.skills",
  "republic.db.diagnostics",
  "republic.dev.projects",
  "republic.dev.project.status",
  "republic.execution.history",
  "republic.execution.status",
  "republic.genome.pool",
  "republic.genome.network",
  "republic.genome.dna",
  "republic.genome.lineage",
  "republic.genome.landscape",
  "republic.genome.citizen",
  "cluster.status",
  "cluster.resilience.status",
  "node.workloads.list",
  "system.hardware",
  "system.hf.models",
  "system.processes",
  "llm.ollama.list",
  "republic.lmstudio.health",
  "republic.compute.local.status",
  "republic.docker.available",
  "republic.docker.containers.list",
  "republic.docker.status",
  "republic.docker.images.list",
  "republic.docker.networks.list",
  "republic.docker.presets.list",
  "republic.mediastudio.history",
  "republic.mediastudio.capabilities",
  "companion.status",
  // Windows control (read-only queries)
  "windows.capabilities",
  "windows.health.check",
  "windows.screen.list",
  "windows.screen.info",
  "windows.screen.capture",
  "windows.process.list",
  "windows.process.info",
  "windows.audio.devices",
  "windows.audio.volume.get",
  "windows.system.info",
  "windows.system.wmi.query",
  "windows.system.service.list",
  "windows.system.users.list",
  "windows.system.users.current",
  "windows.system.registry.read",
  "windows.system.env.get",
  "windows.hardware.gpu.info",
  "windows.hardware.disk.info",
  "windows.hardware.network.info",
  "windows.hardware.memory.info",
  "windows.hardware.battery.info",
  "windows.hardware.display.brightness",
  "windows.file.read",
  "windows.file.list",
  "windows.file.search",
  "windows.clipboard.get",
  "windows.window.list",
  "windows.display.resolution.get",
  "windows.display.list",
  "windows.network.adapters",
  "windows.network.ip",
  "windows.network.wifi.list",
  "windows.apps.installed",
  "windows.device.list",
  "windows.ui.find",
  "windows.ui.read",
  "windows.ui.list",
  "windows.ui.tree",
  "windows.vision.analyze",
  "windows.vision.describe",
  "windows.vision.find_element",
  "windows.vision.ocr",
  // Phase 13-18: AI Hub
  "republic.graph.query",
  "republic.graph.find.related",
  "republic.graph.context",
  "republic.graph.diagnostics",
  "republic.mcp.tools",
  "republic.mcp.resources",
  "republic.mcp.prompts",
  "republic.mcp.diagnostics",
  "republic.acp.agents",
  "republic.acp.diagnostics",
  "republic.rag.grade",
  "republic.rag.trend",
  "republic.rag.diagnostics",
  "republic.ingest.search",
  "republic.ingest.diagnostics",
  "republic.voice.transcript",
  "republic.voice.sessions",
  "republic.voice.diagnostics",
  "republic.distill.diagnostics",
  "republic.health.aihub",
  // Phase 19-24: Autonomy
  "republic.git.branch.list",
  "republic.git.status",
  "republic.git.log",
  "republic.git.diagnostics",
  "republic.code.diagnostics",
  "republic.cicd.history",
  "republic.cicd.diagnostics",
  "republic.diag.diagnostics",
  "republic.quantum.pairs",
  "republic.quantum.diagnostics",
  "republic.mitosis.instance",
  "republic.mitosis.instances",
  "republic.mitosis.lineage",
  "republic.mitosis.diagnostics",
  "republic.health.autonomy",
  // Phase 25: Universal Model Intelligence Engine
  "republic.model.list",
  "republic.model.get",
  "republic.model.diagnostics",
  // Phase 26: PersonaPlex Voice Persona Engine
  "republic.persona.list",
  "republic.persona.status",
  "republic.persona.diagnostics",
  // Phase 27: Gateway Lifecycle
  "republic.lifecycle.boot_metrics",
  "republic.lifecycle.handlers",
  "republic.lifecycle.circuit_breakers",
  "republic.lifecycle.resources",
  "republic.lifecycle.diagnostics",
  // Phase 28: Vector DB
  "republic.vectordb.cluster.list",
  "republic.vectordb.collection.list",
  "republic.vectordb.query",
  "republic.vectordb.diagnostics",
  // Phase 29: Avatar
  "republic.avatar.session.list",
  "republic.avatar.state",
  "republic.avatar.diagnostics",
  // Phase 30: System Pulse + n8n
  "republic.pulse.latest",
  "republic.pulse.history",
  "republic.pulse.alerts",
  "republic.pulse.diagnostics",
  "republic.n8n.executions",
  "republic.n8n.stats",
  // Phase 32: Supabase CLI Management (read-only)
  "republic.supabase.status",
  "republic.supabase.diagnostics",
  "republic.supabase.migrations.list",
  "republic.supabase.functions.list",
  "republic.supabase.inspect",
  "republic.supabase.logs",
  // Plugin Manager
  "republic.plugins.list",
  "republic.plugins.get",
  "republic.plugins.diagnostics",
  "republic.plugins.activate",
  "republic.plugins.deactivate",
  "republic.plugins.scan",
  // World Intelligence v1
  "republic.worldintel.dashboard",
  "republic.worldintel.brief",
  "republic.worldintel.news",
  "republic.worldintel.cii",
  "republic.worldintel.signals",
  "republic.worldintel.convergences",
  "republic.worldintel.classify",
  "republic.worldintel.freshness",
  "republic.worldintel.countries",
  "republic.worldintel.control",
  // World Intelligence v2
  "republic.worldintel.war-risk",
  "republic.worldintel.arsenal",
  "republic.worldintel.war-signals",
  "republic.worldintel.velocities",
  "republic.worldintel.cii-history",
  "republic.worldintel.osint",
  "republic.worldintel.alerts",
  "republic.worldintel.alerts.test",
  "republic.worldintel.intel-report",
  // Marketplace (read)
  "republic.marketplace.list",
  "republic.marketplace.listings",
  "republic.marketplace.diagnostics",
  "republic.marketplace.reputation",
  // Productions
  "republic.productions.list",
  "republic.productions.stats",
  "republic.productions.files",
  "republic.productions.read-file",
  // Cognitive Frontier
  "republic.cognitive.status",
  // Docker
  "republic.docker.status",
  // Local Compute
  "republic.compute.local.status",
  // Dev Projects (read-only queries)
  "republic.dev.project.download",
  "republic.dev.project.file",
  "republic.dev.project.status",
  // Lovable (read)
  "lovable.queue-status",
  // Media Studio
  "republic.mediastudio.capabilities",
  "republic.mediastudio.history",
  // LM Studio
  "republic.lmstudio.health",
  "republic.lmstudio.logs",
  // GSD Pipeline (read-only queries)
  "gsd.list",
  "gsd.get",
  // Research Studio
  "republic.research.status",
  "republic.research.result",
  "republic.research.list",
  // New stubs from missing-rpcs.ts (Phase N: gap coverage)
  "republic.backup.list",
  "republic.diplomacy.status",
  "republic.diplomacy.treaties",
  "republic.diplomacy.conflicts",
  "republic.trust.network",
  "republic.trust.stats",
  "republic.temporal.status",
  "republic.temporal.events",
  "republic.quantum.state",
  "republic.quantum.sync.jobs",
  "republic.tools.list",
  "republic.tools.queue",
  "republic.process.list",
  "republic.legacy.stats",
  "republic.legacy.events",
  "republic.legacy.achievements",
  "republic.legacy.timeline",
  "republic.db.stats",
  "republic.db.collections",
  "republic.db.record.list",
  "republic.citizen.identity.list",
  "republic.emotion.stats",
  "republic.emotion.states",
  "republic.emotion.volatile",
  "republic.social.stats",
  "republic.social.bonds",
  "republic.social.communities",
  "republic.social.events.recent",
  "republic.a2a.agents",
  "republic.a2a.messages.recent",
  "republic.a2a.tasks",
  "republic.a2a.discover",
  "republic.workflow.list",
  "republic.workspace.list",
  "republic.n8n.workflows",
  "republic.model.registry.list",
  "republic.waragent.status",
  "republic.cicd.pipelines",
  "models.manager.list",
  "republic.citizens.list",
  "republic.world.events",
  "republic.revenue.list",
  // Phase N+1: Additional read stubs from final audit
  "republic.simulation.scenarios",
  "republic.tech.atlantis.memories",
  "republic.tech.ml.list",
  "republic.tech.quantum.circuits",
  "republic.tech.quantum.state",
  "republic.n8n.executions",
  "republic.n8n.stats",
  "republic.backup.restore.jobs",
  "republic.cicd.run.get",
  "republic.cicd.runs.recent",
  "republic.citizen.avatar.svg",
  "republic.citizen.identity",
  "republic.memory.citizen.episodic",
  "republic.memory.citizen.semantic",
  "republic.trust.events.recent",
  "republic.trust.leaderboard",
  "republic.db.query",
  "republic.db.skills",
  "republic.diplomacy.diagnostics",
  "republic.diplomacy.events",
  "republic.compute.local.status",
  "republic.lmstudio.health",
  "republic.mediastudio.history",
  // models-manager.ts — extraHandlers (Phase 2 registry does NOT cover these)
  "models.manager.catalog",
  "models.manager.progress",
  "models.manager.disk",
  "models.manager.ollama.list",
  "models.manager.prerequisites",
  "models.manager.lmstudio.list",
  "models.manager.resolve",
  "models.manager.plugin.requirements",
  "models.manager.plugin.status",
  // channels extras used by UI
  "channels.connect",
  "channels.disconnect",
  "channels.whatsapp.status",
  // RAW handlers - missing auth (Phase final audit)
  // config.ts - raw handler
  "config.get",
  "config.env.get",
  "config.test-provider",
  // republic barrel — methods declared in raw GatewayRequestHandlers blocks
  "republic.agents",
  "republic.dreams.list",
  "republic.intelligence.events",
  "republic.metacognition.status",
  "republic.narrative.list",
  "republic.neural-network.status",
  "republic.reasoning.list",
  "republic.resilience.health",
  "republic.revenue.dashboard",
  "republic.revenue.earnings",
  "republic.skills.list",
  "republic.technology.status",
  "republic.temporal.clock",
  "republic.temporal.history",
  "republic.trust.profile",
  "republic.research.docs",
  "republic.research.monitor.list",
  "republic.process.active",
  "republic.process.get",
  "republic.plugin-queue.list",
  "republic.plugin-queue.status",
  // republic.vision.* — all read
  "republic.vision.analyzeUI",
  "republic.vision.compare",
  "republic.vision.describe",
  "republic.vision.diagnostics",
  "republic.vision.ocr",
  "republic.vision.readChart",
  // republic.workspace read methods
  "republic.workspace.exec",
  "republic.workspace.file.list",
  "republic.workspace.file.read",
  // waragent reads
  "waragent.simulation.get",
  // manus read
  "manus.tasks.list",
  // chat read
  "chat.inject",
  // cluster federation reads
  "cluster.federation.status",
  // config reads
  "config.schema",
  // exec-approvals reads
  "exec.approvals.get",
  "exec.approvals.node.get",
  // sessions.usage reads
  "sessions.usage",
  "sessions.usage.timeseries",
  "sessions.usage.logs",
  // wizard reads
  "wizard.status",
  // web reads
  "web.login.start",
  "web.login.wait",
  // deep-research.ts RAW handler reads
  "republic.research.status",
  "republic.research.result",
  "republic.research.list",
  // components/DashboardLayout
  "republic.population.list",
  // Single citizen lookup by ID (avoids limit:10000 fetch)
  "republic.citizen.get",
  // sessions.list (component use)
  "sessions.list",
  // Phase 5: Federation read endpoints
  "republic.federation.status",
  // Phase 6: Citizen agent loop status
  "republic.agents.loops.status",
  // ── Republic auto-classified read methods ────────────────────────────────
  "poll",
  "republic.tech.ml.genome.status",
  "republic.citizen.identity.get",
  "republic.dev.project.build",
  "republic.dev.gsd",
  "republic.dev.gsd.sessions",
  "republic.dev.project.routes",
  "republic.preview.status",
  "republic.preview.sessions",
  "republic.preview.diagnostics",
  "republic.browser.search",
  "republic.browser.fillForm",
  "republic.browser.diagnostics",
  "republic.research.topic",
  "republic.research.compare",
  "republic.research.diagnostics",
  "republic.creative.variations",
  "republic.creative.gallery",
  "republic.creative.getImage",
  "republic.creative.diagnostics",
  "republic.docs.history",
  "republic.docs.getDocument",
  "republic.docs.diagnostics",
  "republic.config.get",
  "republic.config.diagnostics",
  "republic.productions.diagnostics",
  "republic.finance.balance",
  "republic.finance.diagnostics",
  "republic.treasury.report",
  "republic.treasury.forecast",
  "republic.treasury.roi",
  "republic.treasury.auditTrail",
  "republic.treasury.diagnostics",
  "republic.social.conversation",
  "republic.social.throwParty",
  "republic.social.compatibility",
  "republic.social.diagnostics",
  "republic.infra.screenQueue.status",
  "republic.infra.n8n.diagnostics",
  "republic.infra.vision.check",
  "republic.infra.vision.diagnostics",
  "republic.infra.premiumAI.ask",
  "republic.infra.premiumAI.diagnostics",
  "republic.revenue.config.get",
  "republic.revenue.activities",
  "republic.revenue.harvesters",
  "republic.revenue.gigs",
  "republic.revenue.content",
  "republic.revenue.affiliates",
  "republic.revenue.subscriptions",
  "republic.revenue.diagnostics",
  "republic.learning.evaluateProgress",
  "republic.learning.getGoals",
  "republic.learning.learnSkill",
  "republic.learning.getSkillTree",
  "republic.learning.getCitizenSkills",
  "republic.learning.reinforce",
  "republic.learning.decay",
  "republic.learning.reflect",
  "republic.learning.shareKnowledge",
  "republic.learning.getCurriculum",
  "republic.learning.getCitizenLevel",
  "republic.learning.diagnostics",
  "republic.comms.getEmailHistory",
  "republic.comms.listWebhooks",
  "republic.comms.queueNotification",
  "republic.comms.getNotifications",
  "republic.comms.markNotificationRead",
  "republic.comms.getDeliveryQueue",
  "republic.comms.diagnostics",
  "republic.iot.getDevices",
  "republic.iot.readSensor",
  "republic.iot.getSensorHistory",
  "republic.iot.getActuatorLog",
  "republic.iot.evaluateAutomations",
  "republic.iot.listAutomationRules",
  "republic.iot.getEdgeComputeResults",
  "republic.iot.diagnostics",
  "republic.process.injectNote",
  "republic.process.citizenProcesses",
  "republic.process.diagnostics",
  "republic.conversation.close",
  "republic.conversation.get",
  "republic.conversation.history",
  "republic.conversation.citizenConversations",
  "republic.conversation.active",
  "republic.conversation.diagnostics",
  "republic.workflow.decompose",
  "republic.workflow.assignCitizens",
  "republic.workflow.directive",
  "republic.workflow.get",
  "republic.workflow.status",
  "republic.workflow.diagnostics",
  "republic.hardware.resource.snapshot",
  "republic.hardware.resource.canFit",
  "republic.hardware.resource.listFeatures",
  "republic.hardware.resource.survey",
  "republic.executive.directive.list",
  "republic.executive.veto",
  "republic.executive.cabinet.list",
  "republic.executive.law.list",
  "republic.executive.court.challenge",
  "republic.executive.court.adjudicate",
  "republic.executive.court.pending",
  "republic.executive.diagnostics",
  "republic.agency.goals.advance",
  "republic.agency.goals.list",
  "republic.agency.jobs.list",
  "republic.agency.diagnostics",
  "republic.ai.route",
  "republic.ai.infer",
  "republic.ai.ensemble",
  "republic.ai.cascade",
  "republic.ai.consciousness.get",
  "republic.ai.models.list",
  "republic.ai.models.availability",
  "republic.ai.diagnostics",
  "republic.infra.proposal.review",
  "republic.infra.proposal.list",
  "republic.infra.schema.list",
  "republic.infra.tuning.list",
  "republic.infra.chaos.list",
  "republic.infra.health",
  "republic.infra.diagnostics",
  "republic.studio.variations",
  "republic.studio.gallery",
  "republic.studio.gallery.citizen",
  "republic.studio.image",
  "republic.studio.diagnostics",
  "republic.docs.pdf",
  "republic.docs.invoice",
  "republic.docs.presentation",
  "republic.docs.spreadsheet",
  "republic.docs.markdown",
  "republic.docs.html",
  "republic.docs.list",
  "republic.delegation.team.get",
  "republic.delegation.review.history",
  "republic.delegation.diagnostics",
  "republic.workspace.get",
  "republic.workspace.status",
  "republic.workspace.artifacts",
  "republic.council.catalog",
  "republic.council.state",
  "republic.council.provider.unavailable",
  "republic.council.diagnostics",
  "republic.compute.route",
  "republic.compute.providers",
  "republic.compute.provider.availability",
  "republic.compute.tiers",
  "republic.compute.free",
  "republic.progress.events",
  "republic.progress.summary",
  "republic.progress.count",
  "republic.project.chat.history",
  "republic.project.team.get",
  "republic.project.preview.list",
  "republic.citizen.voice",
  "republic.infra.runtime.status",
  "republic.infra.eligibility",
  "republic.infra.requirements",
  "republic.infra.health.check",
  "republic.infra.controlplane.diagnostics",
  "republic.culture.citizen",
  "republic.culture.traits",
  "republic.culture.tradition.found",
  "republic.culture.traditions",
  "republic.culture.events",
  "republic.culture.diagnostics",
  "republic.temporal.diagnostics",
  "republic.judicial.law.enact",
  "republic.judicial.law.repeal",
  "republic.judicial.laws",
  "republic.judicial.violation.report",
  "republic.judicial.violations",
  "republic.judicial.case.file",
  "republic.judicial.case.argument",
  "republic.judicial.case.verdict",
  "republic.judicial.cases",
  "republic.judicial.precedents",
  "republic.judicial.diagnostics",
  "republic.foreign.entity.trust",
  "republic.foreign.entity.status",
  "republic.foreign.entities",
  "republic.foreign.alliances",
  "republic.foreign.trade.negotiate",
  "republic.foreign.trades",
  "republic.foreign.intel.file",
  "republic.foreign.intel",
  "republic.foreign.diagnostics",
  "republic.media.articles",
  "republic.media.outlets",
  "republic.media.sentiment",
  "republic.media.diagnostics",
  "republic.models.registry",
  "republic.models.search",
  "republic.models.download.progress",
  "republic.models.load.ollama",
  "republic.models.load.lmstudio",
  "republic.models.diagnostics",
  "republic.compute.usage",
  "republic.compute.usage.all",
  "republic.compute.diagnostics",
  "republic.system.pulse",
  "republic.persistence.snapshot.list",
  "republic.persistence.diagnostics",
  "republic.persistence.store.stats",
  "republic.trust.delegation",
  "republic.trust.check",
  "republic.trust.diagnostics",
  "republic.emergence.coalitions",
  "republic.emergence.cascades",
  "republic.emergence.norms",
  "republic.emergence.cooperation",
  "republic.emergence.influencers",
  "republic.emergence.diagnostics",
  "republic.protocol.messages",
  "republic.protocol.conversations",
  "republic.protocol.conversations.active",
  "republic.protocol.diagnostics",
  "republic.spatial.position",
  "republic.spatial.nearby",
  "republic.spatial.location",
  "republic.spatial.diagnostics",
  "republic.policy.active",
  "republic.policy.history",
  "republic.policy.diagnostics",
  "republic.observability.diagnostics",
  "republic.constitution.articles",
  "republic.constitution.diagnostics",
  "republic.economy.agency.listings",
  "republic.economy.agency.treasury",
  "republic.economy.agency.diagnostics",
  "republic.tools.diagnostics",
  "republic.health.society",
  "republic.defense.threat.assess",
  "republic.defense.quarantine",
  "republic.defense.quarantine.check",
  "republic.defense.rateLimit.check",
  "republic.defense.scan",
  "republic.defense.diagnostics",
  "republic.resilience.circuitBreakers",
  "republic.resilience.selfHealing",
  "republic.metrics.national",
  "republic.domain.list",
  "republic.domain.roots",
  "republic.domain.search",
  "republic.domain.toolkits",
  "republic.domain.diagnostics",
  "republic.practice.cases",
  "republic.practice.case",
  "republic.practice.citizen",
  "republic.practice.escalated",
  "republic.practice.metrics",
  "republic.practice.diagnostics",
  "republic.devops.languages",
  "republic.devops.databases",
  "republic.devops.language",
  "republic.devops.database",
  "republic.devops.framework",
  "republic.reflection.diagnostics",
  "republic.diagnostics",
  // ClawHub skill registry (read)
  "republic.clawhub.list",
  "republic.clawhub.search",
  "republic.clawhub.detail",
  "republic.clawhub.stats",
  "republic.clawhub.installed",
  "republic.metacognition.citizen",
  "republic.intel.screenshot",
  "republic.intel.forecasts",
  "republic.intel.policy-briefs",
  "republic.intel.news-search",
  "republic.plugin-queue.get",
  "lovable.list-jobs",
  "republic.intelligence.metacognition",
  "republic.intelligence.predictions",
  "republic.intelligence.anomalies",
  "republic.intelligence.aggregates",
  "waragent.simulation.list",
  "republic.pulse.status",
  "republic.research.job.get",
  "republic.research.findings",
  "republic.research.projects",
  "republic.avatar.face.state",
  "republic.metrics",
  "republic.scheduler.stats",
  "republic.constitution.list",
  "republic.constitution.audit",
  "republic.cognition.metacognition.stats",
  "republic.cognition.counterfactual.stats",
  "republic.cognition.causal.summary",
  "republic.economy.gini",
  "republic.binance.order.status",
  "republic.binance.orders",
  "republic.binance.diagnostics",
  "republic.revenue.treasury",
  "republic.revenue.wallets",
  "republic.revenue.wallet.get",
  "republic.revenue.sale.history",
  "republic.store.products.list",
  "republic.store.product.get",
  "republic.store.generation.queue",
  "republic.store.generation.list",
  "republic.store.stats",
  "republic.defi.config",
  "republic.defi.wallet.balance",
  "republic.defi.swap.quote",
  "republic.defi.report",
  "republic.defi.swap.history",
  "republic.defi.yield.positions",
  "republic.worker.pool.status",
  "republic.worker.metrics",
  "republic.federation.diagnostics",
  "republic.federation.relations.list",
  "republic.federation.relation.get",
  "republic.federation.trade.history",
  "republic.federation.border.incident.report",
  "republic.federation.border.incidents",
  "republic.federation.council.motions",
  "republic.federation.local.instance",
  // ─── Forex (read-only) ─────────────────────────────────────────────────────
  "republic.forex.rates",
  "republic.forex.analyze",
  "republic.forex.strategies",
  "republic.forex.positions",
  "republic.forex.trades",
  "republic.forex.status",
  "republic.forex.knowledge",
  "republic.forex.diagnostics",
  // ─── Docker reads not yet classified ──────────────────────────────────────
  "republic.docker.budget",
  // ─── Meta-Learning reads ────────────────────────────────────────────────────
  "republic.meta.convergence.status",
  "republic.meta.convergence.history",
  "republic.meta.curiosity.diagnostics",
  "republic.meta.replay.diagnostics",
  "republic.meta.rsi.diagnostics",
  "republic.meta.rsi.proposals",
  "republic.meta.population.diagnostics",
  "republic.meta.population.rankings",
  "republic.meta.citizen.hyperparams",
  "republic.meta.distillation.diagnostics",
  "republic.meta.truths.list",
  "republic.meta.curriculum.diagnostics",
  "republic.meta.curriculum.zpd",
  // ─── WorldIntel (read) ────────────────────────────────────────────────────
  "republic.worldintel.argus",
  // ─── Models read ────────────────────────────────────────────────────────────
  "models.manager.prerequisites",
  // ─── Claude Code CLI ────────────────────────────────────────────────────────
  "republic.claude.status",
  // ─── Productions pipeline (read) ────────────────────────────────────────────
  "republic.productions.pipeline-status",
  "republic.productions.jobs",
  // ─── Civilization (read) ─────────────────────────────────────────────────────
  "republic.civilization.status",
  "republic.civilization.dialectic.list",
  "republic.civilization.guilds.list",
  "republic.civilization.tribes.list",
  "republic.civilization.prophecies",
  "republic.civilization.festivals",
  "republic.civilization.ecology.status",
  "republic.civilization.memes.trending",
  "republic.civilization.museum.exhibits",
  "republic.civilization.press.articles",
  "republic.civilization.weather",
  "republic.civilization.creative-tools",
  "republic.civilization.commons",
  "republic.civilization.central-bank",
  "republic.civilization.mutual-aid",
  "republic.civilization.mythology",
  "republic.civilization.rites",
  "republic.civilization.oral-traditions",
  "republic.civilization.social-contracts",
  "republic.civilization.asabiyyah",
  // ─── ComfyUI (read) ─────────────────────────────────────────────────────────
  "republic.comfyui.status",
  "republic.comfyui.models.list",
  "republic.comfyui.gpu.status",
  // ─── War Theater (read) ─────────────────────────────────────────────────────
  "republic.wartheater.bases",
  "republic.wartheater.bases.stats",
  "republic.wartheater.carriers",
  "republic.wartheater.strikes",
  "republic.wartheater.theaters",
  "republic.wartheater.countries",
  "republic.wartheater.legend",
  "republic.wartheater.overview",
  "republic.wartheater.arsenal",
  // ─── Drift-detected unscoped methods (March 2026 audit) ───────────────────
  "system.version",
  "node.config.get",
  "republic.supabase.containers",
  "republic.supabase.cleanup",
  "republic.supabase.cloud-status",
  "republic.cpe.status",
  "republic.cpe.citizen-budget",
  "republic.cpe.job-eta",
  "republic.cpe.queue",
  "republic.cpe.history",
  "republic.game.archetypes",
  "republic.game.list",
  "republic.game.read-file",
  "republic.store.list",
  "republic.store.get",
  "republic.store.generation-queue",
  "republic.store.purchase-history",
  "republic.trends.list",
  "republic.trends.get",
  "republic.trends.stats",
  "republic.marketing.get",
  "republic.marketing.list",
  "republic.publish.status",
  "republic.publish.list",
  "republic.publish.stats",
  "republic.company.get",
  "republic.company.list",
  "republic.company.stats",
  "republic.backoffice.analytics",
  "republic.backoffice.changelog",
  "republic.backoffice.events",
  "republic.backoffice.stats",
  "republic.devstudio.runtime.check",
  "republic.devstudio.runtime.missing",
  "republic.devstudio.runtime.summary",
  "republic.devstudio.libraries.domains",
  "republic.devstudio.libraries.list",
  "republic.devstudio.libraries.search",
  "republic.devstudio.libraries.all",
  "republic.devstudio.libraries.stats",
  "republic.devstudio.libraries.install-commands",
  "republic.devstudio.deploy.status",
  "republic.devstudio.deploy.list",
  "republic.devstudio.deploy.stats",
  "republic.devstudio.briefing",
  "republic.medical.specializations.list",
  "republic.medical.specializations.get",
  "republic.medical.history",
  "republic.medical.stats",
  "republic.science.specializations.list",
  "republic.science.specializations.get",
  "republic.science.meta-learn.history",
  "republic.science.stats",
  "republic.cyber.specialists.list",
  "republic.cyber.specialists.get",
  "republic.cyber.history",
  "republic.cyber.stats",
  "republic.cyber.defense.status",
  "republic.cyber.defense.threats",
  "republic.cyber.defense.report",
  "republic.cyber.defense.counter-plans",
  "republic.cyber.defense.labs",
  "republic.cyber.defense.honeypot.list",
  "republic.cyber.defense.scans",
  "republic.cyber.defense.playbooks",
  "republic.cyber.defense.playbook.history",
  "republic.cyber.defense.wargame.history",
  "republic.cyber.defense.sigint",
  "republic.cyber.defense.curriculum",
  "republic.cyber.defense.curriculum.course",
  "republic.cluster.nodes",
  "republic.cluster.containers",
  "republic.cluster.tls.status",
  "republic.cluster.gpu.pool",
  "republic.cluster.gpu.check",
  "republic.cluster.gpu.models",
  "republic.cluster.migrate.status",
  "republic.re.specialists",
  "republic.re.specialist",
  "republic.re.status",
  "republic.re.curriculum",
  "republic.re.course",
  "republic.re.projects",
  "republic.re.project",
  "republic.re.mastery",
  "republic.workforce.status",
  "republic.workforce.assignments",
  "republic.workforce.mastery",
  "republic.workforce.discovery",
  "republic.workforce.diagnostics",
  "republic.production.status",
  "republic.production.movie",
  "republic.production.movies",
  "republic.production.storyboard",
  "republic.production.gpu-fleet",
  "republic.production.render-queue",
  "republic.production.recommend-model",
  "republic.skills.citizen",
  // ── HPICS: Personal Intelligence (read)
  "hpics.health",
  "hpics.tools.list",
  "hpics.categories.list",
  "hpics.config.status",
  // ── HPICS: Contact Intelligence (read)
  "hpics.contacts.list",
  "hpics.contacts.get",
  "hpics.contacts.assets.list",
  // ── Advanced Intel: read-only status
  "hpics.ci.opsec.monitor",
  "hpics.ci.detect.ci_monitor",
  // ── Drift-detected unscoped read methods (March 2026 audit) ────────────────
  "republic.hpics.roles.list",
  "republic.hpics.roles.get",
  "republic.hpics.roles.stats",
  "republic.revenue.api.summary",
  "republic.revenue.api.ledger",
  "republic.revenue.tasks.list",
  "republic.revenue.tasks.get",
  "republic.revenue.marketplace.stats",
  "republic.revenue.marketplace.list",
  "republic.revenue.gigs.stats",
  "republic.revenue.gigs.list",
  "republic.revenue.alpaca.stats",
  "republic.revenue.simulation.results",
  "republic.revenue.streams.status",
  "hpics.reasoning.modes",
  "hpics.workflows.list",
  "hpics.workflow.list",
  "hpics.workflow.status",
]);
const WRITE_METHODS = new Set([
  // ── March 2026 Drift ──
  "system.engine.resources",
  "system.engine.processes",
  "system.engine.errors",
  "system.engine.evaluate",
  "republic.citizen.delete",
  "republic.workspace.templates",
  "republic.workspace.scaffold",
  "republic.workspace.feature.add",
  "republic.reflection.insights",
  "republic.compute.ollama.load",
  "republic.compute.ollama.unload",
  "republic.compute.ollama.delete",
  "republic.compute.ollama.generate",
  "republic.worldintel.nie-log",
  "republic.worldintel.sources",
  "republic.worldintel.conflicts",
  "republic.worldintel.carrier-trail",
  "republic.worldintel.lite-snapshots",
  "republic.worldintel.poll-schedule",
  "republic.plugins.check-requirements",
  "republic.plugins.configure",
  "republic.intelligence.hallucination-summary",
  "republic.intelligence.hallucination-events",
  "republic.intelligence.toon-stats",
  "republic.lmlink.nodes.add",
  "republic.lmlink.nodes.remove",
  "republic.lmlink.nodes.probe",
  "republic.lmlink.models.load",
  "republic.lmlink.models.unload",
  "republic.lmlink.link.enable",
  "republic.lmlink.link.disable",
  "republic.lmlink.link.login",
  "republic.lmlink.routing.set",
  "republic.finetune.start",
  "republic.finetune.export",
  "republic.crucix.start",
  "republic.crucix.stop",
  "republic.crucix.data",
  "republic.nemoclaw.policies.update",
  "republic.nemoclaw.policies.create",
  "republic.nemoclaw.policies.delete",
  "republic.nemoclaw.policies.check",
  "republic.nemoclaw.inference.test",
  "republic.hr.departments",
  "republic.hr.competency.assess",
  "republic.hr.competency.assessForJob",
  "republic.hr.competency.gap",
  "republic.hr.competency.qualify",
  "republic.hr.okr.create",
  "republic.hr.okr.updateKR",
  "republic.hr.okr.generate",
  "republic.hr.okr.citizen",
  "republic.hr.payroll.run",
  "republic.hr.payroll.citizen",
  "republic.hr.labor.compliance",
  "republic.hr.labor.violations",
  "republic.hr.labor.check",
  "republic.hr.labor.grievance.file",
  "republic.hr.labor.grievance.resolve",
  "republic.hr.labor.grievances",
  "republic.hr.labor.policy",
  "republic.hr.labor.policy.update",
  "republic.hr.labor.violation.resolve",
  "republic.hr.org.structure",
  "republic.hr.org.positions",
  "republic.hr.org.assign",
  "republic.hr.org.unassign",
  "republic.hr.org.autoAssign",
  "republic.sandbox.task.submit",
  "republic.sandbox.task.cancel",
  "republic.sandbox.start",
  "republic.sandbox.stop",
  "republic.sandbox.destroy",
  "republic.sandbox.build",
  "republic.sandbox.exec",
  "republic.sandbox.write-file",
  "republic.sandbox.list-files",
  "republic.sandbox.browser",
  "republic.foundry.workflows",
  "republic.foundry.patterns",
  "republic.foundry.skills",
  "republic.foundry.learnings",
  "republic.foundry.crystallize",
  "republic.foundry.prune",
  "republic.foundry.config",
  "republic.foundry.brain.search",
  "republic.foundry.overseer",
  "republic.cognee.query",
  "republic.cognee.recall",
  "republic.cognee.extract",
  "republic.cognee.related",
  "republic.cognee.scopes",
  "republic.cognee.prune",
  "republic.cognee.config",
  "republic.cognee.citizen.facts",
  "republic.composio.tools",
  "republic.composio.call",
  "republic.composio.apps",
  "republic.composio.config",
  "republic.composio.reconnect",
  "republic.healing.config",
  "republic.healing.test",
  "republic.healing.metrics",
  "republic.healing.learnings",
  "republic.healing.alerts",
  "republic.healing.manual-recover",
  "republic.sandbox.tunnels.start",
  "republic.sandbox.tunnels.stop",
  "republic.n8n.workflows.create",
  "republic.n8n.workflows.update",
  "republic.n8n.workflows.delete",
  "republic.n8n.workflows.toggle",
  "republic.n8n.workflows.trigger",
  "republic.n8n.executions.stop",
  "republic.n8n.templates.deploy",
  "republic.n8n.route",
  "republic.n8n.iframe-url",
  "republic.brandings.create",
  "republic.brandings.crawl",
  "republic.brandings.update",
  "republic.brandings.delete",
  "republic.cyber.kali.start",
  "republic.cyber.kali.stop",
  "republic.cyber.kali.scan",
  "republic.cyber.kali.scan.cancel",
  "republic.cyber.kali.scans",
  "republic.cyber.kali.report",
  "republic.cyber.kali.exec",
  "republic.cyber.kali.tool.portscan",
  "republic.cyber.kali.tool.webscan",
  "republic.cyber.kali.tool.sqli",
  "republic.cyber.kali.tool.vulnscan",
  "republic.cyber.kali.tool.sslaudit",
  "republic.cyber.kali.tool.bruteforce",
  "republic.cyber.kali.tool.compliance",
  "republic.cyber.kali.tool.clone",
  "republic.cyber.kali.tool.crawl",
  "republic.cyber.kali.exploitdb.sync",
  "republic.cyber.kali.exploitdb.search",
  "republic.cyber.kali.planner.fingerprint",
  "republic.cyber.kali.planner.plan",
  "republic.cyber.kali.planner.execute",
  "republic.cyber.kali.planner.patterns",
  "republic.cyber.kali.auth.login",
  "republic.cyber.kali.auth.pending",
  "republic.cyber.kali.auth.provide",
  "republic.cyber.kali.rag.tools",
  "republic.cyber.kali.tasks.active",
  "republic.cyber.kali.tasks.extend",
  "republic.cyber.kali.tasks.cancel",
  "republic.cyber.kali.semantic.search",
  "republic.cyber.kali.semantic.analyze",
  "republic.cyber.kali.semantic.ingest",
  "republic.cyber.kali.network.devices",
  "republic.cyber.kali.network.discover",
  "republic.node.docker.containers.start",
  "republic.node.docker.containers.stop",
  "republic.node.docker.containers.remove",
  "republic.node.docker.presets.launch",
  "republic.node.docker.images.pull",
  "republic.node.docker.images.remove",
  "republic.node.docker.redis.ensure",
  "republic.node.docker.all",
  "republic.infra.ensure",
  "republic.infra.ensure.redis",
  "republic.infra.ensure.postgres",
  "republic.infra.ensure.mongodb",
  "republic.infra.ensure.chromadb",
  "republic.infra.ensure.minio",
  "republic.infra.ensure.n8n",
  "republic.infra.ensure.jupyter",
  "republic.infra.ensure.deep-research",
  "republic.infra.ensure.comfyui",
  "republic.infra.ensure.playwright",
  "republic.infra.ensure.kali",
  "republic.infra.ensure.desktop",
  "republic.infra.ensure.supabase",
  "republic.infra.ensure.all",
  "republic.infra.exec",
  "republic.infra.stop",
  "republic.infra.restart",
  // ─── HPICS: Personal Intelligence (write — tool execution + pipelines) ──────────
  "hpics.tool.run",
  "hpics.analysis.run",
  // ── Drift-detected unscoped write methods (March 2026 audit) ───────────────
  "republic.revenue.api.keys.create",
  "republic.revenue.api.keys.validate",
  "republic.revenue.api.subscribe",
  "republic.revenue.marketplace.scan",
  "republic.revenue.gigs.scan",
  "republic.revenue.alpaca.configure",
  "republic.revenue.simulation.run",
  "hpics.rag.run",
  "hpics.reasoning.graph",
  "hpics.verification.run",
  "hpics.workflow.run",
  "hpics.workflow.verified-dossier",
  "hpics.workflow.deep-research",
  "hpics.workflow.adversarial",
  "hpics.vulnerability.scan",
  "hpics.vulnerability.redteam",
  "hpics.vulnerability.device",
  "hpics.vulnerability.opsec",
  "hpics.workflow.vulnerability-defense",
  "hpics.workflow.verified_dossier",
  "hpics.workflow.deep_research",
  "hpics.workflow.adversarial_assessment",
  "hpics.defense.sweep",
  "hpics.defense.full_cycle",
  "hpics.contact.resolve",
  "hpics.intelligence.run",
  "hpics.prediction.run",
  "hpics.warfare.run",
  "hpics.biometric.run",
  "hpics.network.run",
  "hpics.enrichment.run",
  "hpics.agis.run",
  "hpics.fusion.run",
  "hpics.voice.run",
  "hpics.document.run",
  "hpics.media.run",
  "hpics.utility.run",
  "hpics.hardware.run",
  "hpics.security.run",
  // HPICS pipeline bridges (HoC ↔ HPICS cross-system)
  "hpics.pipeline.voice.analyze",
  "hpics.pipeline.deepfake.analyze",
  "hpics.pipeline.biometric.face",
  "hpics.pipeline.digital.twin",
  "hpics.pipeline.media.intelligence",
  "hpics.pipeline.osint.full",
  "hpics.pipeline.agis.full",
  // HPICS contacts (write — analysis, enrichment, dossier)
  "hpics.contacts.enrich",
  "hpics.contacts.dossier",
  "hpics.contacts.analyze.voice",
  "hpics.contacts.analyze.face",
  "hpics.contacts.aggregate",
  "hpics.contacts.network",
  "hpics.contacts.predict",
  // ── Advanced Intelligence Collection ──
  // HUMINT
  "hpics.intel.humint.mice",
  "hpics.intel.humint.psych",
  "hpics.intel.humint.betrayal",
  "hpics.intel.humint.baseline",
  "hpics.intel.humint.elicitation",
  "hpics.intel.humint.pattern_of_life",
  // OSINT
  "hpics.intel.osint.full",
  "hpics.intel.osint.comprehensive",
  "hpics.intel.osint.monitor",
  // FININT
  "hpics.intel.finint.scan",
  "hpics.intel.finint.economic",
  // SIGINT/Hardware
  "hpics.intel.sigint.rf",
  "hpics.intel.sigint.sdr",
  "hpics.intel.sigint.aerial",
  "hpics.intel.sigint.mobile",
  "hpics.intel.sigint.hardware_fusion",
  // GEOINT
  "hpics.intel.geoint.fusion",
  "hpics.intel.geoint.correlate",
  "hpics.intel.geoint.supremacy",
  // IMINT
  "hpics.intel.imint.face_multiview",
  "hpics.intel.imint.gait",
  "hpics.intel.imint.pupillometry",
  "hpics.intel.imint.body_language",
  "hpics.intel.imint.gaze",
  "hpics.intel.imint.subvocalization",
  "hpics.intel.imint.mosaic_match",
  "hpics.intel.imint.bio_behavioral",
  // CYBINT
  "hpics.intel.cybint.shadow_networks",
  "hpics.intel.cybint.exploitation_map",
  "hpics.intel.cybint.power_nodes",
  "hpics.intel.cybint.link_predict",
  "hpics.intel.cybint.entity_resolve",
  // Fusion
  "hpics.intel.fusion.dempster_shafer",
  "hpics.intel.fusion.cross_modal",
  "hpics.intel.fusion.cross_modal_deception",
  "hpics.intel.fusion.temporal",
  "hpics.intel.fusion.unified",
  "hpics.intel.fusion.mosaic",
  // Full-Spectrum
  "hpics.intel.full_spectrum",
  // ── Counter-Intelligence ──
  // CI Assessment
  "hpics.ci.assess.threat",
  "hpics.ci.assess.trust",
  "hpics.ci.assess.adversary",
  "hpics.ci.assess.threat_landscape",
  "hpics.ci.assess.insider",
  // OPSEC
  "hpics.ci.opsec.analyze",
  "hpics.ci.opsec.response",
  // CI Detection
  "hpics.ci.detect.reflexive_control",
  "hpics.ci.detect.deception",
  "hpics.ci.detect.cross_modal_deception",
  "hpics.ci.detect.multi_party",
  "hpics.ci.detect.cognitive_iw",
  "hpics.ci.detect.economic_warfare",
  "hpics.ci.detect.verify",
  // Active Counter-Measures
  "hpics.ci.counter.active_defense",
  "hpics.ci.counter.red_team",
  "hpics.ci.counter.adversary_sim",
  "hpics.ci.counter.narrative",
  "hpics.ci.counter.reputation",
  "hpics.ci.counter.draco",
  // TSCM
  "hpics.ci.tscm.assess",
  "hpics.ci.tscm.sweep",
  "hpics.ci.tscm.thermal",
  // Information Warfare
  "hpics.ci.warfare.cognitive",
  "hpics.ci.warfare.plan",
  "hpics.ci.warfare.narrative",
  "hpics.ci.warfare.semantic",
  "hpics.ci.warfare.memetic",
  "hpics.ci.warfare.mass_formation",
  "hpics.ci.warfare.influence",
  "hpics.ci.warfare.synthetic_consensus",
  // Predictive CI
  "hpics.ci.predict.intent",
  "hpics.ci.predict.intercept",
  "hpics.ci.predict.precognitive",
  "hpics.ci.predict.opportunity",
  "hpics.ci.predict.cascade",
  // ─── Claude Code CLI ───────────────────────────────────────────────────────
  "republic.claude.review",
  "republic.claude.task",
  "send",
  "agent",
  "agent.wait",
  "wake",
  // ─── Productions pipeline (write) ───────────────────────────────────────────
  "republic.productions.generate",
  // ─── ComfyUI (write) ────────────────────────────────────────────────────────
  "republic.comfyui.launch",
  "republic.comfyui.models.download",
  // ─── War Theater (write) ────────────────────────────────────────────────────
  "republic.wartheater.strikes.record",
  "republic.wartheater.simulate",
  // Channels
  "channels.logout",
  // Cron
  "cron.add",
  "cron.update",
  "cron.remove",
  "cron.run",
  // Skills
  "skills.install",
  "skills.update",
  // Research Studio
  "republic.research.start",
  "talk.mode",
  "tts.enable",
  "tts.disable",
  "tts.convert",
  "tts.setProvider",
  "voicewake.set",
  "node.invoke",
  "node.workloads.pause",
  "node.workloads.resume",
  "chat.send",
  "chat.abort",
  // ─── Forex (state-mutating) ─────────────────────────────────────────────────
  "republic.forex.strategy.toggle",
  "republic.forex.backtest",
  "republic.forex.enable",
  "republic.forex.placeOrder",
  "republic.forex.closePosition",
  // ─── Docker (state-mutating, not yet classified) ──────────────────────────
  "republic.docker.reconcile",
  "browser.request",
  "republic.government.election.hold",
  "republic.government.bill.propose",
  "republic.government.bill.vote",
  "republic.economy.harvester.toggle",
  "republic.economy.tax.adjust",
  "republic.economy.resource.purchase",
  "republic.simulation.start",
  "republic.simulation.stop",
  "republic.simulation.pause",
  "republic.simulation.tickrate",
  "republic.simulation.agent.create",
  "republic.tech.ml.train",
  "republic.tech.ml.retrain-all",
  "republic.tech.quantum.universe.create",
  "republic.tech.quantum.universe.branch",
  "republic.tech.quantum.universe.collapse",
  "republic.tech.quantum.entangle",
  "republic.tech.atlantis.crystal.store",
  "republic.tech.atlantis.crystal.upgrade",
  "republic.grid.swarm.objective.add",
  "republic.grid.swarm.objective.remove",
  "republic.grid.leader.elect",
  "republic.grid.sync",
  "republic.mode.set",
  "republic.intake.submit",
  "republic.store.snapshot",
  // Marketplace (write)
  "republic.marketplace.listService",
  "republic.marketplace.delistService",
  "republic.marketplace.updateListing",
  "republic.marketplace.createOrder",
  "republic.marketplace.acceptOrder",
  "republic.marketplace.deliverOrder",
  "republic.marketplace.completeOrder",
  "republic.marketplace.cancelOrder",
  "republic.marketplace.rateOrder",
  "republic.marketplace.toggle",
  "models.switch",
  "models.active",
  "companion.ping",
  "companion.configure",
  "cluster.docker.start",
  "cluster.docker.stop",
  "cluster.docker.remove",
  "cluster.docker.deploy",
  "cluster.n8n.workflow.toggle",
  "cluster.n8n.workflow.trigger",
  // Phase 13-18: AI Hub
  "republic.graph.add.entity",
  "republic.graph.add.edge",
  "republic.graph.merge",
  "republic.mcp.call",
  "republic.mcp.start",
  "republic.acp.register",
  "republic.acp.send",
  "republic.rag.search",
  "republic.rag.evaluate",
  "republic.ingest.document",
  "republic.ingest.url",
  "republic.ingest.ocr",
  "republic.voice.session.start",
  "republic.voice.session.end",
  "republic.voice.session.pause",
  "republic.voice.session.resume",
  "republic.voice.listen",
  "republic.voice.speak",
  "republic.distill.capture",
  "republic.distill.distill",
  "republic.distill.synthetic.generate",
  "republic.distill.training.create",
  "republic.distill.training.export",
  "republic.distill.evaluate",
  // Phase 19-24: Autonomy
  "republic.git.clone",
  "republic.git.fork",
  "republic.git.branch.create",
  "republic.git.commit",
  "republic.git.push",
  "republic.git.diff",
  "republic.git.clone-self",
  "republic.code.analyze",
  "republic.code.diagnose",
  "republic.code.fix",
  "republic.code.review",
  "republic.code.council",
  "republic.code.plan",
  "republic.cicd.pipeline",
  "republic.cicd.build",
  "republic.cicd.test",
  "republic.cicd.deploy",
  "republic.cicd.canary",
  "republic.cicd.rollback",
  "republic.cicd.approve",
  "republic.cicd.monitor",
  "republic.diag.scan",
  "republic.diag.diagnose",
  "republic.diag.prescribe",
  "republic.diag.heal",
  "republic.diag.autoheal",
  "republic.quantum.entangle",
  "republic.quantum.decohere",
  "republic.quantum.propagate",
  "republic.quantum.collapse",
  "republic.quantum.teleport",
  "republic.quantum.swarm.create",
  "republic.quantum.swarm.broadcast",
  "republic.mitosis.initiate",
  "republic.mitosis.full",
  "republic.mitosis.dna.capture",
  "republic.mitosis.promote",
  "republic.mitosis.decommission",
  // Phase 25: Universal Model Intelligence Engine
  "republic.model.register",
  "republic.model.deregister",
  "republic.model.infer",
  "republic.model.recursive",
  "republic.model.pipeline.create",
  "republic.model.pipeline.execute",
  // Phase 26: PersonaPlex Voice Persona Engine
  "republic.persona.connect",
  "republic.persona.disconnect",
  "republic.persona.create",
  "republic.persona.delete",
  "republic.persona.activate",
  "republic.persona.chat",
  // Phase 27: Gateway Lifecycle
  "republic.lifecycle.handler_load",
  // Phase 28: Vector DB
  "republic.vectordb.cluster.create",
  "republic.vectordb.cluster.stop",
  "republic.vectordb.cluster.delete",
  "republic.vectordb.collection.create",
  "republic.vectordb.collection.drop",
  "republic.vectordb.insert",
  // Phase 29: Avatar
  "republic.avatar.session.create",
  "republic.avatar.session.end",
  "republic.avatar.listen",
  "republic.avatar.start_listening",
  "republic.avatar.personality",
  // Phase 30: System Pulse + n8n
  "republic.pulse.take",
  "republic.pulse.start",
  "republic.pulse.stop",
  "republic.pulse.resolve_alert",
  "republic.n8n.create_workflow",
  "republic.n8n.delete_workflow",
  // Phase 32: Supabase CLI Management (state-mutating)
  "republic.supabase.start",
  "republic.supabase.stop",
  "republic.supabase.db.push",
  "republic.supabase.db.reset",
  "republic.supabase.db.diff",
  "republic.supabase.migrations.repair",
  "republic.supabase.functions.deploy",
  "republic.supabase.functions.serve",
  "republic.supabase.link",
  // Windows control (state-mutating operations)
  "windows.input.mouse.move",
  "windows.input.mouse.click",
  "windows.input.mouse.scroll",
  "windows.input.keyboard.type",
  "windows.input.keyboard.press",
  "windows.input.keyboard.combo",
  "windows.ui.click",
  "windows.process.start",
  "windows.process.kill",
  "windows.process.focus",
  "windows.process.priority",
  "windows.audio.record.start",
  "windows.audio.record.stop",
  "windows.audio.play",
  "windows.audio.volume.set",
  "windows.audio.mute",
  "windows.audio.unmute",
  "windows.system.service.control",
  "windows.system.shutdown",
  "windows.system.restart",
  "windows.system.sleep",
  "windows.system.hibernate",
  "windows.system.lock",
  "windows.system.logoff",
  "windows.system.notification.show",
  "windows.system.registry.write",
  "windows.system.env.set",
  "windows.system.firewall.rule",
  "windows.system.task.schedule",
  "windows.powershell.execute",
  "windows.powershell.remoting",
  "windows.file.write",
  "windows.clipboard.set",
  "windows.window.focus",
  "windows.window.resize",
  "windows.window.minimize",
  "windows.window.close",
  "windows.window.maximize",
  "windows.window.move",
  "windows.window.snap",
  "windows.window.opacity",
  "windows.window.topmost",
  "windows.window.title.set",
  "windows.display.resolution.set",
  "windows.network.wifi.connect",
  "windows.network.wifi.disconnect",
  "windows.network.dns.flush",
  "windows.apps.uninstall",
  "windows.device.enable",
  "windows.device.disable",
  // Local Compute (state-mutating)
  "republic.compute.local.download",
  "republic.compute.local.start",
  "republic.compute.local.stop",
  "republic.compute.local.remove",
  // Dev Projects (state-mutating)
  "republic.dev.project.clear",
  // Productions (state-mutating)
  "republic.productions.write-file",
  "republic.productions.delete",
  // OpenManus (write)
  "openmanus.train",
  "openmanus.evaluate",
  "openmanus.cancel",
  // Lovable (write)
  "lovable.clone",
  "lovable.cancel",
  // Media Studio
  "republic.mediastudio.generate",
  // Plugin Interaction (invoke tools / call gateway methods)
  "republic.plugins.invoke-tool",
  "republic.plugins.call-gateway",
  // Docker (state-mutating)
  "republic.docker.containers.start",
  "republic.docker.containers.stop",
  "republic.docker.containers.restart",
  "republic.docker.containers.remove",
  "republic.docker.containers.logs",
  "republic.docker.images.pull",
  "republic.docker.images.remove",
  "republic.docker.presets.launch",
  // New stubs from missing-rpcs.ts (Phase N: gap coverage)
  "republic.backup.create",
  "republic.backup.restore",
  "republic.backup.delete",
  "republic.diplomacy.treaty.propose",
  "republic.diplomacy.conflict.register",
  "republic.diplomacy.conflict.resolve",
  "republic.process.create",
  "republic.process.start",
  "republic.process.cancel",
  "republic.tools.forge",
  "republic.tools.activate",
  "republic.tools.test",
  "republic.tools.delete",
  "republic.trust.adjust",
  "republic.trust.endorse",
  "republic.trust.ban",
  "republic.temporal.pause",
  "republic.temporal.resume",
  "republic.temporal.speed",
  "republic.temporal.event.schedule",
  "republic.temporal.era.transition",
  "republic.workflow.create",
  "republic.workflow.start",
  "republic.workflow.pause",
  "republic.workflow.cancel",
  "republic.workspace.create",
  "republic.workspace.assign",
  "republic.workspace.file.write",
  "republic.workspace.file.delete",
  "republic.workspace.git.commit",
  "republic.social.bond.create",
  "republic.social.tick",
  "republic.quantum.sync",
  "republic.quantum.coherence.force",
  "republic.db.collection.drop",
  "republic.db.record.delete",
  "republic.model.registry.register",
  "republic.model.registry.load",
  "republic.model.registry.unload",
  "republic.model.registry.set_default",
  "republic.model.registry.delete",
  "waragent.simulation.manualAction",
  "republic.citizen.command.send",
  "republic.simulation.reset",
  "republic.simulation.scenario.load",
  "republic.simulation.world.generate",
  "channels.settings.update",
  "channels.whatsapp.configure",
  "config.env.set",
  "republic.cicd.pipeline.create",
  "republic.cicd.trigger",
  "republic.research.submit",
  "republic.tech.atlantis.consolidate",
  "republic.tech.atlantis.sync",
  "republic.tech.quantum.run",
  "republic.tech.ml.evaluate",
  "models.manager.download",
  "models.manager.delete",
  "models.manager.ollama.pull",
  "models.manager.ollama.delete",
  "republic.mediastudio.delete",
  "lovable.generate",
  "manus.task",
  "manus.retry",
  "channels.send",
  "channels.whatsapp.generateQR",
  "chat",
  "republic.revenue.harvester",
  "republic.revenue.mode",
  // models-manager.ts write methods — extraHandlers
  "models.manager.cancel",
  "models.manager.download",
  "models.manager.delete",
  "models.manager.pause",
  "models.manager.resume",
  "models.manager.install",
  "models.manager.ollama.pull",
  "models.manager.ollama.delete",
  "models.manager.config",
  "models.manager.ensure",
  "models.manager.restore",
  // cluster federation writes
  "cluster.federation.setPeers",
  "cluster.federation.removePeer",
  // config writes
  "config.patch",
  "config.apply",
  // exec-approvals writes
  "exec.approvals.set",
  "exec.approvals.node.set",
  // system writes
  "set-heartbeats",
  "system-event",
  // update writes
  "update.run",
  // wizard writes
  "wizard.start",
  "wizard.next",
  "wizard.cancel",
  // waragent writes
  "waragent.simulation.start",
  "waragent.simulation.step",
  "waragent.simulation.manualAction",
  // republic plugin-queue writes
  "republic.plugin-queue.approve",
  "republic.plugin-queue.cancel",
  "republic.plugin-queue.reject",
  "republic.plugin-queue.submit",
  // Phase 5: Federation write endpoints
  "republic.federation.init",
  "republic.federation.peer.register",
  "republic.federation.peer.health",
  // Phase 6: Citizen agent loop management
  "republic.agents.loops.start",
  "republic.agents.loops.stop",
  "republic.agents.loop.start",
  "republic.agents.loop.stop",
  // ── Republic auto-classified write methods ───────────────────────────────
  "config.set",
  "republic.simulation.scenario.create",
  "republic.tech.ml.genome.breed",
  "republic.citizen.command.broadcast",
  "republic.dev.project.ideate",
  "republic.dev.project.writeFile",
  "republic.dev.project.deleteFile",
  "republic.dev.project.run",
  "republic.dev.project.deploy",
  "republic.dev.project.prompt",
  "republic.dev.project.bundle",
  "republic.preview.start",
  "republic.preview.stop",
  "republic.execution.run",
  "republic.browser.navigate",
  "republic.browser.download",
  "republic.research.monitor.start",
  "republic.creative.generateImage",
  "republic.creative.editImage",
  "republic.creative.upscale",
  "republic.creative.composite",
  "republic.docs.generatePDF",
  "republic.docs.generateInvoice",
  "republic.docs.generatePresentation",
  "republic.docs.generateSpreadsheet",
  "republic.docs.generateMarkdown",
  "republic.docs.generateHTML",
  "republic.config.update",
  "republic.finance.createInvoice",
  "republic.finance.capturePayment",
  "republic.finance.sendPayout",
  "republic.finance.sendEth",
  "republic.finance.sendBtc",
  "republic.treasury.recordRevenue",
  "republic.treasury.allocateBudget",
  "republic.treasury.recordSpending",
  "republic.social.addRelationship",
  "republic.social.startDating",
  "republic.social.marry",
  "republic.social.divorce",
  "republic.social.sendMessage",
  "republic.social.setMood",
  "republic.infra.n8n.provision",
  "republic.infra.n8n.scrape",
  "republic.infra.vision.analyze",
  "republic.revenue.config.set",
  "republic.learning.setGoal",
  "republic.learning.completeMilestone",
  "republic.learning.completeGoal",
  "republic.learning.abandonGoal",
  "republic.learning.generateCurriculum",
  "republic.comms.sendEmail",
  "republic.comms.sendBulkEmail",
  "republic.comms.registerWebhook",
  "republic.comms.fireWebhook",
  "republic.comms.removeWebhook",
  "republic.comms.scheduleDelivery",
  "republic.comms.executeDelivery",
  "republic.comms.cancelDelivery",
  "republic.iot.registerDevice",
  "republic.iot.removeDevice",
  "republic.iot.updateDeviceStatus",
  "republic.iot.recordSensorData",
  "republic.iot.sendActuatorCommand",
  "republic.iot.createAutomation",
  "republic.iot.deleteAutomation",
  "republic.iot.bridgeEdgeCompute",
  "republic.process.pause",
  "republic.process.resume",
  "republic.process.completeStep",
  "republic.process.failStep",
  "republic.process.updateProgress",
  "republic.process.reassignStep",
  "republic.process.setPriority",
  "republic.process.addOutput",
  "republic.conversation.start",
  "republic.conversation.send",
  "republic.conversation.respond",
  "republic.workflow.resume",
  "republic.hardware.resource.request",
  "republic.hardware.resource.release",
  "republic.hardware.resource.registerFeature",
  "republic.executive.directive.issue",
  "republic.executive.emergency.declare",
  "republic.executive.cabinet.appoint",
  "republic.executive.cabinet.dismiss",
  "republic.executive.budget.allocate",
  "republic.executive.law.register",
  "republic.agency.goals.generate",
  "republic.agency.jobs.create",
  "republic.agency.jobs.apply",
  "republic.agency.service.request",
  "republic.agency.service.accept",
  "republic.agency.service.complete",
  "republic.agency.service.match",
  "republic.ai.consciousness.update",
  "republic.infra.proposal.submit",
  "republic.infra.proposal.vote",
  "republic.infra.proposal.deploy",
  "republic.infra.schema.propose",
  "republic.infra.schema.apply",
  "republic.infra.schema.revert",
  "republic.infra.tuning.adjust",
  "republic.infra.tuning.auto",
  "republic.infra.chaos.start",
  "republic.studio.generate",
  "republic.studio.edit",
  "republic.studio.upscale",
  "republic.studio.composite",
  "republic.delegation.team.form",
  "republic.delegation.tasks.delegate",
  "republic.delegation.review.submit",
  "republic.workspace.preview.set",
  "republic.council.decide",
  "republic.council.provider.register",
  "republic.compute.provider.register",
  "republic.project.chat.send",
  "republic.project.build.start",
  "republic.project.preview.start",
  "republic.diplomacy.event.publish",
  "republic.diplomacy.treaty.sign",
  "republic.diplomacy.treaty.suspend",
  "republic.diplomacy.treaty.terminate",
  "republic.infra.probe",
  "republic.infra.runtimes",
  "republic.infra.runtime.start",
  "republic.infra.runtime.stop",
  "republic.infra.runtime.restart",
  "republic.infra.monitor.start",
  "republic.infra.monitor.stop",
  "republic.culture.trait.create",
  "republic.culture.event.trigger",
  "republic.temporal.history.record",
  "republic.foreign.entity.register",
  "republic.foreign.alliance.form",
  "republic.media.article.publish",
  "republic.media.outlet.create",
  "republic.media.broadcast.issue",
  "republic.media.broadcasts",
  "republic.models.installed",
  "republic.models.download",
  "republic.models.provision",
  "republic.models.select",
  "republic.compute.request",
  "republic.compute.record",
  "republic.compute.queue.process",
  "republic.persistence.flush",
  "republic.persistence.snapshot.create",
  "republic.defense.release",
  "republic.devops.pipeline.create",
  "republic.avatar.speak",
  "gsd.execute",
  "republic.research.job.cancel",
  "republic.resilience.incident.resolve",
  "republic.constitution.setEnabled",
  "republic.binance.configure",
  "republic.binance.order.create",
  "republic.binance.webhook.verify",
  "republic.binance.webhook.process",
  "republic.revenue.withdrawal.request",
  "republic.revenue.withdrawals",
  "republic.revenue.redistribution.apply",
  "republic.store.product.create",
  "republic.store.product.purchase",
  "republic.defi.configure",
  "republic.defi.swap.request",
  "republic.worker.pool.init",
  "republic.worker.pool.shutdown",
  "republic.worker.tick.run",
  "republic.federation.relation.propose",
  "republic.federation.relation.ratify",
  "republic.federation.relation.suspend",
  "republic.federation.relation.terminate",
  "republic.federation.war.declare",
  "republic.federation.peace.propose",
  "republic.federation.trade.execute",
  "republic.federation.border.incident.resolve",
  "republic.federation.council.motion.propose",
  "republic.federation.council.motion.vote",
  "republic.federation.tick",
  // ─── Drift-detected unscoped write methods (March 2026 audit) ──────────────
  "node.config.push",
  "republic.cpe.cancel-job",
  "republic.cpe.submit",
  "republic.cpe.pipelines",
  "republic.game.scaffold",
  "republic.game.delete",
  "republic.store.create",
  "republic.store.queue-generation",
  "republic.store.complete-generation",
  "republic.store.fail-generation",
  "republic.store.purchase",
  "republic.trends.scan",
  "republic.trends.assign",
  "republic.trends.inject",
  "republic.trends.strategy",
  "republic.marketing.generate",
  "republic.marketing.update-media",
  "republic.publish.to-platform",
  "republic.publish.all",
  "republic.company.form",
  "republic.company.update-revenue",
  "republic.backoffice.bump-version",
  "republic.backoffice.record-refund",
  "republic.backoffice.review-response",
  "republic.devstudio.runtime.tool",
  "republic.devstudio.deploy.vercel",
  "republic.devstudio.deploy.railway",
  "republic.devstudio.deploy.netlify",
  "republic.devstudio.deploy.fly",
  "republic.devstudio.deploy.cloudflare",
  "republic.devstudio.deploy.auto",
  "republic.medical.analyze",
  "republic.medical.ask",
  "republic.science.ask",
  "republic.science.meta-learn",
  "republic.cyber.assess",
  "republic.cyber.ask",
  "republic.cyber.defense.respond",
  "republic.cyber.defense.contain",
  "republic.cyber.defense.resolve",
  "republic.cyber.defense.counter-plan",
  "republic.cyber.defense.counter-authorize",
  "republic.cyber.defense.counter-abort",
  "republic.cyber.defense.lab.launch",
  "republic.cyber.defense.lab.destroy",
  "republic.cyber.defense.lab.exec",
  "republic.cyber.defense.honeypot.deploy",
  "republic.cyber.defense.honeypot.deactivate",
  "republic.cyber.defense.scan",
  "republic.cyber.defense.playbook.execute",
  "republic.cyber.defense.wargame.launch",
  "republic.cluster.docker.exec",
  "republic.cluster.docker.launch",
  "republic.cluster.docker.remove",
  "republic.cluster.tls.generate",
  "republic.cluster.gpu.federate",
  "republic.cluster.gpu.unload",
  "republic.cluster.migrate",
  "republic.cluster.migrate.rollback",
  "republic.re.project.start",
  "republic.re.finding.add",
  "republic.re.phase.advance",
  "republic.re.mastery.record",
  "republic.production.create-movie",
  "republic.production.assign-crew",
  "republic.production.add-scene",
  "republic.production.render-scene",
  "republic.production.advance",
  // ClawHub skill registry (write)
  "republic.clawhub.install",
  "republic.clawhub.uninstall",
]);

function authorizeGatewayMethod(method: string, client: GatewayRequestOptions["client"]) {
  if (!client?.connect) {
    return null;
  }
  const role = client.connect.role ?? "operator";
  const scopes = client.connect.scopes ?? [];

  if (NODE_ROLE_METHODS.has(method)) {
    // These methods are used by both companion nodes (ESP32, M5Stick)
    // AND by operator UIs (hoc-ui). Allow both roles — the per-scope
    // check below handles fine-grained authorization for operators.
    if (role === "node" || role === "operator") {
      // Nodes pass through; operators continue to scope checks below
      if (role === "node") {
        return null;
      }
    } else {
      return errorShape(ErrorCodes.INVALID_REQUEST, `unauthorized role: ${role}`);
    }
  }
  if (role === "node" && !NODE_ROLE_METHODS.has(method)) {
    return errorShape(ErrorCodes.INVALID_REQUEST, `unauthorized role: ${role}`);
  }
  if (role !== "operator") {
    return errorShape(ErrorCodes.INVALID_REQUEST, `unauthorized role: ${role}`);
  }

  // Admin scope allows everything
  if (scopes.includes(ADMIN_SCOPE)) {
    return null;
  }

  if (APPROVAL_METHODS.has(method) && !scopes.includes(APPROVALS_SCOPE)) {
    return errorShape(ErrorCodes.INVALID_REQUEST, "missing scope: operator.approvals");
  }
  if (PAIRING_METHODS.has(method) && !scopes.includes(PAIRING_SCOPE)) {
    return errorShape(ErrorCodes.INVALID_REQUEST, "missing scope: operator.pairing");
  }

  // ── Descriptor-based scope check (Phase 2) ──────────────────────────────
  // Handlers registered via defineHandlers() declare their scope alongside
  // their implementation — no manual set maintenance needed.
  const declaredScope = registryLookupScope(method);
  if (declaredScope !== undefined) {
    switch (declaredScope) {
      case "public":
        return null;
      case "read":
        if (scopes.includes(READ_SCOPE) || scopes.includes(WRITE_SCOPE)) {
          return null;
        }
        return errorShape(ErrorCodes.INVALID_REQUEST, "missing scope: operator.read");
      case "write":
        if (scopes.includes(WRITE_SCOPE)) {
          return null;
        }
        return errorShape(ErrorCodes.INVALID_REQUEST, "missing scope: operator.write");
      case "admin":
        return errorShape(ErrorCodes.INVALID_REQUEST, "missing scope: operator.admin");
    }
  }

  // ── Legacy flat-set fallback (pre-descriptor handlers) ──────────────────
  if (READ_METHODS.has(method) && !(scopes.includes(READ_SCOPE) || scopes.includes(WRITE_SCOPE))) {
    return errorShape(ErrorCodes.INVALID_REQUEST, "missing scope: operator.read");
  }
  if (WRITE_METHODS.has(method) && !scopes.includes(WRITE_SCOPE)) {
    return errorShape(ErrorCodes.INVALID_REQUEST, "missing scope: operator.write");
  }
  if (APPROVAL_METHODS.has(method)) {
    return null;
  }
  if (PAIRING_METHODS.has(method)) {
    return null;
  }
  if (READ_METHODS.has(method)) {
    return null;
  }
  if (WRITE_METHODS.has(method)) {
    return null;
  }

  // HoC plugin gateway methods — require write scope
  if (method.startsWith("plugin.")) {
    if (scopes.includes(WRITE_SCOPE)) {
      return null;
    }
    return errorShape(ErrorCodes.INVALID_REQUEST, "missing scope: operator.write");
  }
  if (ADMIN_METHOD_PREFIXES.some((prefix) => method.startsWith(prefix))) {
    return errorShape(ErrorCodes.INVALID_REQUEST, "missing scope: operator.admin");
  }
  if (
    method.startsWith("config.") ||
    method.startsWith("wizard.") ||
    method.startsWith("update.") ||
    method === "channels.logout" ||
    method === "skills.install" ||
    method === "skills.update" ||
    method === "cron.add" ||
    method === "cron.update" ||
    method === "cron.remove" ||
    method === "cron.run" ||
    method === "sessions.patch" ||
    method === "sessions.reset" ||
    method === "sessions.delete" ||
    method === "sessions.compact"
  ) {
    return errorShape(ErrorCodes.INVALID_REQUEST, "missing scope: operator.admin");
  }
  return errorShape(ErrorCodes.INVALID_REQUEST, "missing scope: operator.admin");
}

export const coreGatewayHandlers: GatewayRequestHandlers = new Proxy(
  {
    ...connectHandlers,
    ...logsHandlers,
    ...voicewakeHandlers,
    ...healthHandlers,
    ...channelsHandlers,
    ...chatHandlers,
    ...cronHandlers,
    ...deviceHandlers,
    ...execApprovalsHandlers,
    ...webHandlers,
    ...modelsHandlers,
    ...configHandlers,
    ...testProviderHandlers,
    ...wizardHandlers,
    ...talkHandlers,
    ...ttsHandlers,
    ...skillsHandlers,
    ...sessionsHandlers,
    ...paperclipHandlers,
    ...pentagiHandlers,
    ...agentHubHandlers,
    ...racHandlers,
    ...blackeyeHandlers,
    ...scanHandlers,
    ...systemHandlers,
    ...updateHandlers,
    ...nodeHandlers,
    ...sendHandlers,
    ...usageHandlers,
    ...agentHandlers,
    ...agentsHandlers,
    ...browserHandlers,
    ...republicHandlers,
    ...clusterHandlers,
    ...companionHandlers,
    ...windowsControlHandlers,
    ...memoryHandlers,
  } as GatewayRequestHandlers,
  {
    get(target, prop: string | symbol) {
      if (typeof prop === "symbol") {
        return undefined;
      }

      // 1. Check eagerly-loaded handlers first
      if (prop in target) {
        return (target as Record<string, unknown>)[prop];
      }

      // 2. Check lazy top-level handler cache
      if (prop in _lazyTopHandlerCache) {
        return _lazyTopHandlerCache[prop];
      }

      // 3. Return a lazy-loading wrapper for unknown methods
      return async (ctx: import("./server-methods/types.js").GatewayRequestHandlerOptions) => {
        // Load both republic and top-level lazy handlers
        await Promise.all([loadAllRepublicHandlers(), loadLazyTopHandlers()]);

        // Check all caches after load
        const handler = (target as Record<string, unknown>)[prop] ?? _lazyTopHandlerCache[prop];

        if (typeof handler === "function") {
          return (handler as (ctx: unknown) => unknown)(ctx);
        }

        // Fall through — handleGatewayRequest will treat as unknown method
        return undefined;
      };
    },

    has(target, prop: string | symbol) {
      if (typeof prop === "symbol") {
        return false;
      }
      return prop in target || prop in _lazyTopHandlerCache || true;
    },

    ownKeys(target) {
      // Merge keys from target + lazy cache for Object.keys() enumeration
      return [...new Set([...Reflect.ownKeys(target), ...Object.keys(_lazyTopHandlerCache)])];
    },

    getOwnPropertyDescriptor(target, prop) {
      if (prop in target) {
        return Object.getOwnPropertyDescriptor(target, prop);
      }
      if (typeof prop === "string" && prop in _lazyTopHandlerCache) {
        return { configurable: true, enumerable: true, value: _lazyTopHandlerCache[prop] };
      }
      return undefined;
    },
  },
);

// ─── Phase 2: Whitelist Drift Detection ──────────────────────────────────────
//
// All handler methods must appear in at least one scope set or declare their
// scope via defineHandlers(). This function detects any methods that have
// silently drifted out of all sets — they would be treated as public reads,
// a potential security gap.
//
// Call this at gateway startup (boot.ts) for a one-time audit log.

/** Public methods requiring no token */
const PUBLIC_METHODS = new Set([
  "connect",
  "health",
  "health.agent",
  "health.run",
  "health.capabilities",
]);

/**
 * Scan all registered handler methods and log any that are not covered by any
 * scope set. This is a startup audit — does not block requests.
 *
 * @returns Array of un-classified method names (for test assertions if needed)
 */
export function checkHandlerWhitelistDrift(): string[] {
  const allMethods = Object.keys(coreGatewayHandlers);
  const unclassified: string[] = [];

  for (const method of allMethods) {
    const inDescriptor = registryLookupScope(method) !== undefined;
    const inRead = READ_METHODS.has(method);
    const inWrite = WRITE_METHODS.has(method);
    const inPublic = PUBLIC_METHODS.has(method);
    const inApproval = APPROVAL_METHODS.has(method);
    const inPairing = PAIRING_METHODS.has(method);
    const isPlugin = method.startsWith("plugin.");

    const inNodeRole = NODE_ROLE_METHODS.has(method);
    if (
      !inDescriptor &&
      !inRead &&
      !inWrite &&
      !inPublic &&
      !inApproval &&
      !inPairing &&
      !inNodeRole &&
      !isPlugin
    ) {
      unclassified.push(method);
    }
  }

  if (unclassified.length > 0) {
    console.warn(
      `[gateway:drift] ⚠️ ${unclassified.length} handler method(s) not in any scope set — ` +
        `defaulting to public-read until classified:\n  ` +
        unclassified.join("\n  "),
    );
  } else {
    console.info(
      `[gateway:drift] ✅ All ${allMethods.length} handler methods are scope-classified`,
    );
  }

  return unclassified;
}

// ─── Rate Limiter (Token Bucket) ────────────────────────────────
//
// Replaces the previous fixed-window counter which was susceptible to
// 2× burst attacks at window boundaries. A token bucket refills
// continuously so effective throughput never exceeds `limit` req/minute
// regardless of when within the minute the requests arrive.

interface TokenBucket {
  tokens: number;
  lastRefill: number; // ms timestamp
}

/**
 * Token-bucket rate limiter per (clientId, category).
 *
 * Categories and their per-minute budgets:
 *   read  — 2000 req/min  (lightweight queries)
 *   write —  500 req/min  (state mutations)
 *   admin —  100 req/min  (sensitive ops)
 *
 * Each category gets its own bucket so a flood of reads
 * does not consume the write budget and vice-versa.
 */
class RateLimiter {
  private buckets = new Map<string, TokenBucket>();
  private readonly windowMs: number;
  private readonly limits: { read: number; write: number; admin: number };

  constructor(
    windowMs = 60_000,
    limits: { read: number; write: number; admin: number } = { read: 2000, write: 500, admin: 100 },
  ) {
    this.windowMs = windowMs;
    this.limits = limits;
  }

  /**
   * Check if a request should be allowed.
   * Returns `{ allowed, remaining, retryAfterMs }`.
   */
  check(
    clientId: string,
    method: string,
  ): { allowed: boolean; remaining: number; retryAfterMs?: number } {
    const now = Date.now();
    const category = this.getCategory(method);
    const limit = this.limits[category as keyof typeof this.limits] ?? this.limits.read;
    const refillRatePerMs = limit / this.windowMs;
    const key = `${clientId}:${category}`;

    // Retrieve or create bucket, then refill proportionally to elapsed time
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: limit, lastRefill: now };
      this.buckets.set(key, bucket);
    } else {
      const elapsed = now - bucket.lastRefill;
      bucket.tokens = Math.min(limit, bucket.tokens + elapsed * refillRatePerMs);
      bucket.lastRefill = now;
    }

    if (bucket.tokens < 1) {
      // Time until one token is available
      const retryAfterMs = Math.ceil((1 - bucket.tokens) / refillRatePerMs);
      return { allowed: false, remaining: 0, retryAfterMs };
    }

    bucket.tokens -= 1;
    return { allowed: true, remaining: Math.floor(bucket.tokens) };
  }

  private getCategory(method: string): string {
    if (PAIRING_METHODS.has(method) || ADMIN_METHOD_PREFIXES.some((p) => method.startsWith(p))) {
      return "admin";
    }
    if (WRITE_METHODS.has(method)) {
      return "write";
    }
    return "read";
  }

  /** Prune buckets that have been fully refilled and idle for 2× window */
  prune(): number {
    const now = Date.now();
    let pruned = 0;
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.lastRefill >= this.windowMs * 2) {
        this.buckets.delete(key);
        pruned++;
      }
    }
    return pruned;
  }
}

/** Global rate limiter instance */
const rateLimiter = new RateLimiter();

// Periodically prune stale rate limit entries
setInterval(() => rateLimiter.prune(), 120_000).unref();

export async function handleGatewayRequest(
  opts: GatewayRequestOptions & { extraHandlers?: GatewayRequestHandlers },
): Promise<void> {
  const { req, respond, client, isWebchatConnect, context } = opts;

  // Rate limiting check
  const clientId = client?.connId ?? "anonymous";
  const rateCheck = rateLimiter.check(clientId, req.method);
  if (!rateCheck.allowed) {
    respond(
      false,
      undefined,
      errorShape(
        ErrorCodes.INVALID_REQUEST,
        `rate limited — retry after ${Math.ceil((rateCheck.retryAfterMs ?? 0) / 1000)}s`,
      ),
    );
    return;
  }

  const authError = authorizeGatewayMethod(req.method, client);
  if (authError) {
    respond(false, undefined, authError);
    return;
  }
  let handler = opts.extraHandlers?.[req.method] ?? coreGatewayHandlers[req.method];

  // Fallback: route to HoC plugin gateway methods (plugin.{id}.{method})
  if (!handler && req.method.startsWith("plugin.")) {
    const pluginHandler = getPluginGatewayMethod(req.method) as
      | ((params: unknown) => unknown)
      | undefined;
    if (typeof pluginHandler === "function") {
      handler = async ({ params, respond: res }) => {
        try {
          const result = await Promise.resolve(pluginHandler(params));
          res(true, result, undefined);
        } catch (err) {
          res(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
        }
      };
    }
  }

  if (!handler) {
    respond(
      false,
      undefined,
      errorShape(ErrorCodes.INVALID_REQUEST, `unknown method: ${req.method}`),
    );
    return;
  }

  // Phase 3 — Fault Isolation: check circuit breaker before calling handler
  if (gatewayBreaker.isOpen(req.method)) {
    respond(
      false,
      undefined,
      errorShape(
        ErrorCodes.INVALID_REQUEST,
        `circuit open for method: ${req.method} — retry later`,
      ),
    );
    return;
  }

  // Wrap in fault-isolation boundary (10s timeout + isolated catch)
  // Some methods are known to be slow — give them a longer timeout
  const VERY_SLOW_METHODS = new Set([
    "models.manager.install", // pip install PyTorch+CUDA = 10+ minutes
    "models.manager.download", // model downloads can take 10+ minutes
    "models.manager.ollama.pull", // Ollama model pulls can take 10+ minutes
    "republic.compute.local.download", // BitNet / HF model downloads
    // Docker image pulls can be 15GB+ (ComfyUI, CUDA images) — need 10+ min
    "republic.docker.presets.launch",
    "republic.docker.images.pull",
    "republic.node.docker.presets.launch",
    "republic.node.docker.images.pull",
  ]);
  const SLOW_METHODS = new Set([
    "models.manager.prerequisites",
    "models.manager.catalog", // builds catalog + nvidia-smi query
    "models.manager.disk", // scans 6+ directories recursively
    "config.env.get", // can be slow on first read / large env
    "config.env.set", // file I/O
    "republic.plugins.activate",
    "republic.plugins.deactivate",
    "republic.docker.containers.list", // Docker listing can be slow with many containers
    "republic.docker.available", // Docker availability check
    // Docker infrastructure ensure — may pull images + wait for readiness (30s+)
    "republic.infra.ensure",
    "republic.infra.ensure.comfyui",
    "republic.infra.ensure.redis",
    "republic.infra.ensure.postgres",
    "republic.infra.ensure.desktop",
    "republic.infra.ensure.all",
    // ComfyUI management RPCs
    "republic.comfyui.launch",
    "republic.comfyui.models.download",
    // HPICS AGIS pipeline — can take 20s+
    "hpics.tool.run",
    "hpics.agis.run",
    "hpics.intelligence.run",
    // HPICS multi-stage pipelines — may chain 3 calls (~90s)
    "hpics.pipeline.osint.full",
    "hpics.pipeline.agis.full",
    "hpics.pipeline.digital.twin",
    "hpics.pipeline.media.intelligence",
  ]);
  const timeoutMs = VERY_SLOW_METHODS.has(req.method)
    ? 900_000
    : SLOW_METHODS.has(req.method)
      ? 120_000
      : 30_000;
  const isolatedHandlers = withTimeout({ [req.method]: handler } as GatewayRequestHandlers, {
    timeoutMs,
    onError: (method, _err) => {
      gatewayBreaker.recordFailure(method);
    },
  });
  const isolatedHandler = isolatedHandlers[req.method];

  await isolatedHandler({
    req,
    params: (req.params ?? {}) as Record<string, unknown>,
    client,
    isWebchatConnect,
    respond: (ok, data, err) => {
      if (ok) {
        gatewayBreaker.recordSuccess(req.method);
      }
      respond(ok, data, err);
    },
    context,
  });
}
