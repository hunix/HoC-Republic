/**
 * AdvancedIntelligencePage — Multi-Discipline Intelligence & Counter-Intelligence
 *
 * 12-discipline intelligence workstation grounded in real-world tradecraft:
 *
 *   HUMINT   CIA MICE framework, FM 2-22.3 elicitation, FBI behavioral profiling
 *   OSINT    IC OSINT Strategy 2024-2026 (CIA/ODNI)
 *   SIGINT   NSA SDR/RF, hardware sensor fusion
 *   GEOINT   NGA pattern-of-life, location correlation
 *   IMINT    Gait, pupillometry, subvocalization, mosaic biometric
 *   CYBINT   MITRE ATT&CK TTPs, shadow networks, exploitation mapping
 *   FUSION   Dempster-Shafer, cross-modal deception, temporal fusion
 *   CI       NCIX threat assessment, FBI BAP insider threat
 *   OPSEC    NSA 5-step OPSEC process
 *   CI DET   Reflexive control (Russian doctrine), RAND ML deception detection
 *   IW       FM 3-53 MISO, NATO cognitive warfare doctrine
 *   TSCM     NSA/CISA technical surveillance countermeasures
 *
 * Route: /intel/advanced
 */

import { useState, useMemo } from "react";
import {
  Brain, Shield, Eye, Network, Radio, Globe, Layers,
  Search, Satellite, ScanEye, Wifi, Activity, Zap, Target,
  AlertTriangle, Lock, Radar, Cpu, Play, Loader2,
  X, ChevronDown, ChevronUp, Database, Swords, ShieldAlert,
  Crosshair, FlaskConical, Microscope,
} from "lucide-react";
import {
  Alert, Badge, Button, Card, EmptyState, PageHeader, StatCard, Tabs,
} from "@/components/ui";
import { rpc } from "@/lib/rpc";

// ─── Types ────────────────────────────────────────────────────────────────────

interface IntelResult {
  id: string;
  ts: number;
  discipline: string;
  operation: string;
  rpcMethod: string;
  contactId?: string;
  ok: boolean;
  data?: unknown;
  error?: string;
  durationMs: number;
}

// ─── Discipline definitions (tab-driven architecture) ─────────────────────────

interface Operation {
  key: string;
  label: string;
  rpc: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  requiresContact?: boolean;
  requiresParams?: { key: string; placeholder: string }[];
  timeout?: "slow" | "very-slow";
}

interface Discipline {
  id: string;
  label: string;
  abbr: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  desc: string;
  tradecraft: string;
  ops: Operation[];
}

const DISCIPLINES: Discipline[] = [
  {
    id: "humint",
    label: "HUMINT",
    abbr: "Human Intelligence",
    icon: Brain,
    color: "text-accent",
    desc: "Human Intelligence collection — behavioral targeting, elicitation vulnerability, MICE recruitment analysis",
    tradecraft: "CIA MICE framework · FM 2-22.3 · FBI BAP behavioral indicators",
    ops: [
      { key: "mice", label: "MICE Recruitment Analysis", rpc: "hpics.intel.humint.mice", desc: "Money, Ideology, Coercion, Ego — recruitment vulnerability", icon: Target, requiresContact: true },
      { key: "psych", label: "Deep Psych Profile", rpc: "hpics.intel.humint.psych", desc: "Dark tetrad, attachment theory, existential leverage, behavioral analysis", icon: Brain, requiresContact: true, timeout: "slow" },
      { key: "betrayal", label: "Betrayal Likelihood", rpc: "hpics.intel.humint.betrayal", desc: "Insider risk scoring — predict disloyalty before it manifests", icon: AlertTriangle, requiresContact: true },
      { key: "baseline", label: "Behavioral Baseline Monitor", rpc: "hpics.intel.humint.baseline", desc: "Establish behavioral norm and detect deviations from it", icon: Activity, requiresContact: true },
      { key: "elicitation", label: "Elicitation Vulnerability", rpc: "hpics.intel.humint.elicitation", desc: "Communication patterns, coercion resistance, manipulation exposure", icon: Eye, requiresContact: true, timeout: "slow" },
      { key: "pol", label: "Pattern of Life", rpc: "hpics.intel.humint.pattern_of_life", desc: "Daily routines, schedule predictability, habit analysis", icon: Activity, requiresContact: true, timeout: "slow" },
    ],
  },
  {
    id: "osint",
    label: "OSINT",
    abbr: "Open Source Intelligence",
    icon: Search,
    color: "text-info",
    desc: "Open Source Intelligence — IC OSINT Strategy 2024-2026 compliant collection pipeline",
    tradecraft: "IC OSINT Strategy 2024-2026 (CIA/ODNI) · SOCMINT · FININT",
    ops: [
      { key: "full", label: "Full OSINT Pipeline", rpc: "hpics.intel.osint.full", desc: "OSINT scan + digital footprint + social scrape + news correlate", icon: Search, requiresContact: true, timeout: "very-slow" },
      { key: "comprehensive", label: "Comprehensive Contact Scan", rpc: "hpics.intel.osint.comprehensive", desc: "HPICS native full-context analysis — all data sources fused", icon: Database, requiresContact: true, timeout: "very-slow" },
      { key: "monitor", label: "Web Mention Monitor", rpc: "hpics.intel.osint.monitor", desc: "Track online presence, new appearances, dark web mentions", icon: Radar, requiresContact: true },
      { key: "finint_scan", label: "Financial Intelligence Scan", rpc: "hpics.intel.finint.scan", desc: "Wealth signals, transaction patterns, AML indicators, FININT", icon: Activity, requiresContact: true, timeout: "slow" },
      { key: "finint_eco", label: "Economic Intelligence", rpc: "hpics.intel.finint.economic", desc: "Market position, business leverage, economic coercion indicators", icon: Layers, requiresContact: true, timeout: "slow" },
    ],
  },
  {
    id: "sigint",
    label: "SIGINT",
    abbr: "Signals Intelligence",
    icon: Radio,
    color: "text-warning",
    desc: "Signals Intelligence — RF analysis, SDR, hardware sensor collection (NSA doctrine)",
    tradecraft: "NSA SIGINT Collection Guidelines · SDR intelligence · ELINT",
    ops: [
      { key: "rf", label: "RF Signal Intelligence", rpc: "hpics.intel.sigint.rf", desc: "Intercept, classify, analyze radio frequency signals", icon: Radio },
      { key: "sdr", label: "SDR Intelligence Analysis", rpc: "hpics.intel.sigint.sdr", desc: "Software Defined Radio — wideband spectrum intelligence", icon: Wifi },
      { key: "aerial", label: "Aerial Intelligence", rpc: "hpics.intel.sigint.aerial", desc: "Drone/aerial collection platform analysis", icon: Satellite },
      { key: "mobile", label: "Mobile Sensor Intelligence", rpc: "hpics.intel.sigint.mobile", desc: "Phone sensor patterns — accelerometer, microphone, location", icon: Cpu },
      { key: "hw_fusion", label: "Hardware Intelligence Fusion", rpc: "hpics.intel.sigint.hardware_fusion", desc: "Fuse data from all hardware collection sources", icon: Layers, timeout: "slow" },
    ],
  },
  {
    id: "geoint",
    label: "GEOINT",
    abbr: "Geospatial Intelligence",
    icon: Globe,
    color: "text-success",
    desc: "Geospatial Intelligence — location fusion, pattern-of-life, geospatial supremacy analysis",
    tradecraft: "NGA GEOINT framework · Location correlation · Proximity analysis",
    ops: [
      { key: "fusion", label: "Geospatial Comm Fusion", rpc: "hpics.intel.geoint.fusion", desc: "Location + communication pattern correlation — who called whom, where", icon: Globe, timeout: "slow" },
      { key: "correlate", label: "Location-Contact Correlation", rpc: "hpics.intel.geoint.correlate", desc: "Proximity analysis — who was near whom, when, frequency", icon: Network },
      { key: "supremacy", label: "Geospatial Supremacy", rpc: "hpics.intel.geoint.supremacy", desc: "Strategic location dominance mapping, geographic intelligence picture", icon: Satellite, timeout: "very-slow" },
    ],
  },
  {
    id: "imint",
    label: "IMINT",
    abbr: "Imagery Intelligence",
    icon: ScanEye,
    color: "text-purple-500",
    desc: "Imagery Intelligence — advanced biometric analysis, behavioral signals from visual data",
    tradecraft: "CIA IMINT collection · Gait analysis (DoD 2023) · Pupillometry research",
    ops: [
      { key: "face_multi", label: "Multi-View Face Extraction", rpc: "hpics.intel.imint.face_multiview", desc: "3D facial model construction from multiple angles", icon: ScanEye },
      { key: "gait", label: "Gait Pattern Analysis", rpc: "hpics.intel.imint.gait", desc: "Identify individuals by unique walking pattern signature", icon: Activity },
      { key: "pupillometry", label: "Pupillometry Analysis", rpc: "hpics.intel.imint.pupillometry", desc: "Cognitive load, arousal, stress, deception indicators via pupil dilation", icon: Eye },
      { key: "body_lang", label: "Body Language Analysis", rpc: "hpics.intel.imint.body_language", desc: "Full-body nonverbal communication — posture, gesture, proxemics", icon: Brain },
      { key: "gaze", label: "Gaze Pattern Analysis", rpc: "hpics.intel.imint.gaze", desc: "Visual attention mapping — fixation, avoidance, deception cues", icon: Eye },
      { key: "subvocal", label: "Subvocalization Detection", rpc: "hpics.intel.imint.subvocalization", desc: "Silent inner speech detection from micro lip/throat movements", icon: Microscope },
      { key: "mosaic", label: "Mosaic Biometric Match", rpc: "hpics.intel.imint.mosaic_match", desc: "Combine multiple biometric vectors for identity confirmation", icon: Layers },
      { key: "bio_behavioral", label: "Bio-Behavioral Fusion", rpc: "hpics.intel.imint.bio_behavioral", desc: "Fuse physical biometrics + behavioral patterns into unified identity model", icon: FlaskConical, timeout: "slow" },
    ],
  },
  {
    id: "cybint",
    label: "CYBINT",
    abbr: "Cyber Intelligence",
    icon: Cpu,
    color: "text-danger",
    desc: "Cyber & Adversary Intelligence — MITRE ATT&CK TTPs, shadow network detection, exploitation mapping",
    tradecraft: "MITRE ATT&CK · NSA cybersecurity advisories · Red-team doctrine (Mandiant/CrowdStrike)",
    ops: [
      { key: "shadow", label: "Shadow Network Detection", rpc: "hpics.intel.cybint.shadow_networks", desc: "Reveal hidden organizational structures, covert cells, dark connections", icon: Network },
      { key: "exploit", label: "Exploitation Map", rpc: "hpics.intel.cybint.exploitation_map", desc: "MITRE ATT&CK — highest-value attack paths through network", icon: Crosshair },
      { key: "power", label: "Power Node Analysis", rpc: "hpics.intel.cybint.power_nodes", desc: "Centrality, brokers, chokepoints — who controls the network", icon: Zap },
      { key: "link", label: "Link Prediction", rpc: "hpics.intel.cybint.link_predict", desc: "Predict future relationship formations in the social/influence network", icon: Network },
      { key: "entity", label: "Entity Resolution", rpc: "hpics.intel.cybint.entity_resolve", desc: "De-duplicate identities across sources — same person, multiple personas", icon: Database },
    ],
  },
  {
    id: "fusion",
    label: "FUSION",
    abbr: "All-Source Fusion",
    icon: Layers,
    color: "text-info",
    desc: "All-source intelligence fusion — Dempster-Shafer evidence theory, cross-modal analysis",
    tradecraft: "Dempster-Shafer evidence theory · Cross-modal fusion · Temporal transformer models",
    ops: [
      { key: "ds", label: "Dempster-Shafer Fusion", rpc: "hpics.intel.fusion.dempster_shafer", desc: "Probabilistic evidence fusion — combine uncertain intelligence from multiple sources", icon: Layers, timeout: "slow" },
      { key: "cross_modal", label: "Cross-Modal Real-Time Fusion", rpc: "hpics.intel.fusion.cross_modal", desc: "Simultaneous audio + video + behavioral analysis", icon: Activity, timeout: "very-slow" },
      { key: "cross_deception", label: "Cross-Modal Deception Engine", rpc: "hpics.intel.fusion.cross_modal_deception", desc: "Detect inconsistencies across modalities — voice says one thing, face another", icon: Eye, timeout: "very-slow" },
      { key: "temporal", label: "Temporal Fusion Transformer", rpc: "hpics.intel.fusion.temporal", desc: "Intelligence trend analysis over time — trajectory, drift, escalation", icon: Activity, timeout: "slow" },
      { key: "unified", label: "Unified Data Fusion", rpc: "hpics.intel.fusion.unified", desc: "Fuse all available intelligence sources into single intelligence picture", icon: Database, timeout: "very-slow" },
      { key: "mosaic", label: "Mosaic Intelligence", rpc: "hpics.intel.fusion.mosaic", desc: "Aggregate all intelligence into comprehensive target mosaic", icon: Layers, requiresContact: true, timeout: "very-slow" },
      { key: "full_spectrum", label: "⚡ Full-Spectrum Intelligence", rpc: "hpics.intel.full_spectrum", desc: "Complete 7-stage intelligence cycle: OSINT → HUMINT → Network → CI → Predict → Mosaic → Dossier", icon: Zap, requiresContact: true, timeout: "very-slow" },
    ],
  },
  {
    id: "ci_assess",
    label: "CI Assessment",
    abbr: "Counter-Intelligence Assessment",
    icon: Shield,
    color: "text-warning",
    desc: "Counter-Intelligence threat assessment — NCIX guidelines, FBI BAP insider threat",
    tradecraft: "FBI NCIX · CDSE insider threat matrix · ODNI CI threat landscape",
    ops: [
      { key: "threat", label: "Threat Assessment", rpc: "hpics.ci.assess.threat", desc: "Classify threat level, type, intent, capability against your interests", icon: AlertTriangle },
      { key: "trust", label: "Trust Assessment", rpc: "hpics.ci.assess.trust", desc: "Multi-factor trust scoring — behavioral, historical, network, biometric", icon: Shield },
      { key: "adversary", label: "Adversary Profile", rpc: "hpics.ci.assess.adversary", desc: "Full adversary TTPs — capabilities, intent, history, support network", icon: Crosshair, timeout: "slow" },
      { key: "landscape", label: "Threat Landscape", rpc: "hpics.ci.assess.threat_landscape", desc: "Environmental threat scan — all active threats in your operational context", icon: Radar, timeout: "slow" },
      { key: "insider", label: "Insider Threat Matrix", rpc: "hpics.ci.assess.insider", desc: "CDSE-based insider threat indicators — risk, motive, opportunity, access", icon: AlertTriangle },
    ],
  },
  {
    id: "opsec",
    label: "OPSEC",
    abbr: "Operations Security",
    icon: Lock,
    color: "text-success",
    desc: "Operations Security — NSA 5-step OPSEC process, vulnerability analysis, countermeasures",
    tradecraft: "NSA OPSEC 5-step process · NISP · Continuous monitoring",
    ops: [
      { key: "analyze", label: "OPSEC Vulnerability Analysis", rpc: "hpics.ci.opsec.analyze", desc: "5-step: critical info → threat analysis → vulnerability → risk → countermeasures", icon: Lock },
      { key: "monitor", label: "Security Monitor", rpc: "hpics.ci.opsec.monitor", desc: "Continuous anomaly detection in communications and behavior patterns", icon: Activity },
      { key: "response", label: "Proportional Response", rpc: "hpics.ci.opsec.response", desc: "Calibrate OPSEC countermeasure intensity to threat level", icon: ShieldAlert },
    ],
  },
  {
    id: "ci_detect",
    label: "CI Detection",
    abbr: "Counter-Intelligence Detection",
    icon: Radar,
    color: "text-danger",
    desc: "CI detection — reflexive control, deception, cognitive IW, economic warfare",
    tradecraft: "Barton Whaley cyber deception · RAND ML deception research · Russian reflexive control theory",
    ops: [
      { key: "ci_mon", label: "CI Monitor", rpc: "hpics.ci.detect.ci_monitor", desc: "Continuous counter-intelligence surveillance — detect active collection operations", icon: Radar },
      { key: "reflexive", label: "Reflexive Control Detection", rpc: "hpics.ci.detect.reflexive_control", desc: "Russian military doctrine — detect when adversary forces you into predetermined decisions", icon: Brain },
      { key: "deception", label: "Enhanced Deception Detection", rpc: "hpics.ci.detect.deception", desc: "RAND ML-based multi-signal lie detection across voice, text, and behavior", icon: Eye },
      { key: "cross_deception", label: "Cross-Modal Deception v2", rpc: "hpics.ci.detect.cross_modal_deception", desc: "Detect deception across simultaneous channels (voice + face + body)", icon: ScanEye, timeout: "slow" },
      { key: "multi_party", label: "Multi-Party Deception", rpc: "hpics.ci.detect.multi_party", desc: "Detect coordinated deception in groups or multi-person interactions", icon: Network },
      { key: "cognitive_iw", label: "Cognitive IW Detection", rpc: "hpics.ci.detect.cognitive_iw", desc: "Identify cognitive information warfare operations targeting you", icon: Brain },
      { key: "eco_warfare", label: "Economic Warfare Detection", rpc: "hpics.ci.detect.economic_warfare", desc: "Economic coercion, sanctions evasion, financial attack detection", icon: Zap },
      { key: "verify", label: "Warfare Verification Chamber", rpc: "hpics.ci.detect.verify", desc: "Validate claimed intelligence against known baselines — confirm or disprove", icon: FlaskConical },
    ],
  },
  {
    id: "ci_counter",
    label: "Counter-Measures",
    abbr: "Active Counter-Measures",
    icon: Swords,
    color: "text-danger",
    desc: "Active counter-intelligence measures — defense, red-team, DRACO deception, narrative ops",
    tradecraft: "CIA CI deception operations · TSCM doctrine · Active defense frameworks",
    ops: [
      { key: "active", label: "Active Defense Orchestrator", rpc: "hpics.ci.counter.active_defense", desc: "Deploy dynamic defensive countermeasures against active threats", icon: Shield, timeout: "very-slow" },
      { key: "red_team", label: "Automated Red Team", rpc: "hpics.ci.counter.red_team", desc: "Simulate adversary attack on your own assets — find gaps before they do", icon: Swords, timeout: "very-slow" },
      { key: "adv_sim", label: "Adversary Simulation", rpc: "hpics.ci.counter.adversary_sim", desc: "Simulate specific adversary TTPs — test your defenses realistically", icon: Crosshair, timeout: "very-slow" },
      { key: "narrative", label: "Counter-Narrative Generator", rpc: "hpics.ci.counter.narrative", desc: "Craft targeted counter-narratives to neutralize hostile disinformation", icon: Brain, timeout: "slow" },
      { key: "reputation", label: "Reputation Defense Engine", rpc: "hpics.ci.counter.reputation", desc: "Proactive and reactive reputation protection operations", icon: ShieldAlert },
      { key: "draco", label: "DRACO Deception Orchestrator", rpc: "hpics.ci.counter.draco", desc: "Deploy structured denial and deception operations (Barton Whaley doctrine)", icon: Eye, timeout: "very-slow" },
    ],
  },
  {
    id: "iw",
    label: "Info Warfare",
    abbr: "Information Warfare",
    icon: Zap,
    color: "text-warning",
    desc: "Information & cognitive warfare — FM 3-53 MISO, NATO cognitive warfare, memetic operations",
    tradecraft: "FM 3-53 MISO doctrine · NATO cognitive warfare 2022 · Memetic propagation research",
    ops: [
      { key: "cognitive", label: "Cognitive Warfare Engine", rpc: "hpics.ci.warfare.cognitive", desc: "Design cognitive effect operations targeting adversary decision-making", icon: Brain, timeout: "slow" },
      { key: "plan", label: "Cognitive Warfare Plan", rpc: "hpics.ci.warfare.plan", desc: "Full cognitive operations campaign plan (FM 3-53 MISO compliant)", icon: Zap, timeout: "very-slow" },
      { key: "narrative", label: "Narrative Control Engine", rpc: "hpics.ci.warfare.narrative", desc: "Control the narrative landscape — detect and neutralize hostile narratives", icon: Layers, timeout: "slow" },
      { key: "semantic", label: "Semantic Warfare Engine", rpc: "hpics.ci.warfare.semantic", desc: "Linguistic and semantic-level information operations", icon: Brain, timeout: "slow" },
      { key: "memetic", label: "Memetic Propagation Engine", rpc: "hpics.ci.warfare.memetic", desc: "Model viral spread of information and narratives across networks", icon: Network, timeout: "slow" },
      { key: "mass_form", label: "Mass Formation Analyzer", rpc: "hpics.ci.warfare.mass_formation", desc: "Detect and analyze mass formation psychosis patterns in groups", icon: Activity },
      { key: "influence", label: "Influence Campaign Optimizer", rpc: "hpics.ci.warfare.influence", desc: "Optimize influence operation targeting, messaging, and delivery", icon: Zap, timeout: "slow" },
      { key: "syn_cons", label: "Synthetic Consensus Detection", rpc: "hpics.ci.warfare.synthetic_consensus", desc: "Detect or generate synthetic consensus operations (astroturfing)", icon: Network, timeout: "slow" },
    ],
  },
  {
    id: "tscm",
    label: "TSCM",
    abbr: "Technical Surveillance CM",
    icon: ShieldAlert,
    color: "text-success",
    desc: "Technical Surveillance Countermeasures — RF sweeps, thermal imaging, device detection",
    tradecraft: "NSA/CISA TSCM guidelines · RF detection · Spectrum analysis",
    ops: [
      { key: "assess", label: "TSCM Threat Assessment", rpc: "hpics.ci.tscm.assess", desc: "Full technical surveillance threat assessment for environment/meeting", icon: ShieldAlert },
      { key: "sweep", label: "TSCM Sweep Analyzer", rpc: "hpics.ci.tscm.sweep", desc: "Analyze sweep data for hidden devices, bugs, transmitters", icon: Radar },
      { key: "thermal", label: "Thermal Intelligence", rpc: "hpics.ci.tscm.thermal", desc: "Thermal imaging analysis for hidden devices, heat signatures, personnel", icon: Activity },
    ],
  },
  {
    id: "ci_predict",
    label: "Predictive CI",
    abbr: "Predictive Counter-Intelligence",
    icon: Crosshair,
    color: "text-accent",
    desc: "Predictive counter-intelligence — Bayesian intent modeling, trajectory intercept, preemptive CI",
    tradecraft: "Bayesian intent networks · Trajectory intercept doctrine · Cascade modeling",
    ops: [
      { key: "intent", label: "Bayesian Intent Prediction", rpc: "hpics.ci.predict.intent", desc: "Probabilistic model of adversary intent — what are they planning?", icon: Brain },
      { key: "intercept", label: "Trajectory Intercept", rpc: "hpics.ci.predict.intercept", desc: "Identify optimal intervention point to stop adversary operation", icon: Crosshair, timeout: "slow" },
      { key: "precog", label: "Precognitive Pattern Engine", rpc: "hpics.ci.predict.precognitive", desc: "Detect pre-event patterns before threat materializes", icon: Radar, timeout: "slow" },
      { key: "opp", label: "Opportunity Scanner", rpc: "hpics.ci.predict.opportunity", desc: "Identify exploitation opportunities in adversary's posture and gaps", icon: Target },
      { key: "cascade", label: "Cascade Predictor", rpc: "hpics.ci.predict.cascade", desc: "Model downstream effects of intelligence actions — second/third order effects", icon: Layers, timeout: "slow" },
    ],
  },
];

// ─── Operation Card ───────────────────────────────────────────────────────────

function OperationCard({
  op, discipline, contactId, running, onRun,
}: {
  op: Operation;
  discipline: Discipline;
  contactId: string;
  running: string | null;
  onRun: (op: Operation, extraParams?: Record<string, unknown>) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isRunning = running === `${discipline.id}-${op.key}`;
  const blocked = running !== null || (op.requiresContact && !contactId.trim());
  const Icon = op.icon;

  const timeoutLabel = op.timeout === "very-slow" ? "~60s" : op.timeout === "slow" ? "~30s" : null;

  return (
    <Card className="p-4 hover:border-border-hover transition-all">
      <div className="flex items-start gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-bg-secondary ${discipline.color}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <p className="text-sm font-semibold text-text-heading">{op.label}</p>
              <p className="text-xs text-text-muted mt-0.5 leading-relaxed">{op.desc}</p>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className="font-mono text-[9px] text-text-muted bg-bg-secondary px-1 py-0.5 rounded">{op.rpc}</span>
                {op.requiresContact && <Badge variant="info" className="text-[9px] py-0">needs contact ID</Badge>}
                {timeoutLabel && <Badge variant="warning" className="text-[9px] py-0">{timeoutLabel}</Badge>}
              </div>
            </div>
            <div className="flex gap-1 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                className="p-1"
                onClick={() => { setExpanded(v => !v); }}
                aria-label={expanded ? "Collapse" : "Expand"}
              >
                {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={blocked}
                onClick={() => { onRun(op); }}
                aria-label={`Run ${op.label}`}
              >
                {isRunning
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <Play className="w-3 h-3" />
                }
              </Button>
            </div>
          </div>
          {expanded && op.requiresContact && !contactId.trim() && (
            <Alert variant="warning" className="mt-2 text-xs">Enter a Contact ID above to run this operation</Alert>
          )}
        </div>
      </div>
    </Card>
  );
}

// ─── Result Card ──────────────────────────────────────────────────────────────

function ResultCard({ result, onDismiss }: { result: IntelResult; onDismiss: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="p-4 animate-fade-in">
      <div className="flex items-start justify-between mb-2 gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={result.ok ? "success" : "danger"}>{result.ok ? "OK" : "ERR"}</Badge>
          <Badge variant="neutral">{result.discipline}</Badge>
          <span className="text-xs font-semibold text-text-heading">{result.operation}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-text-muted">{result.durationMs}ms</span>
          <span className="text-xs text-text-muted">{new Date(result.ts).toLocaleTimeString()}</span>
          <button
            type="button"
            onClick={onDismiss}
            className="text-text-muted hover:text-danger transition-colors"
            aria-label="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <p className="font-mono text-[9px] text-text-muted mb-2">{result.rpcMethod}</p>
      {result.error && <p className="text-xs text-danger">{result.error}</p>}
      {result.ok && result.data !== undefined && result.data !== null && (
        <>
          <Button variant="ghost" size="sm" onClick={() => { setOpen(v => !v); }}>
            {open ? "Hide" : "Show"} data
          </Button>
          {open && (
            <pre className="mt-2 text-xs text-text-secondary bg-bg-secondary rounded p-3 overflow-auto max-h-72">
              {JSON.stringify(result.data, null, 2)}
            </pre>
          )}
        </>
      )}
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function AdvancedIntelligencePage() {
  const [activeDiscipline, setActiveDiscipline] = useState("humint");
  const [contactId, setContactId] = useState("");
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<IntelResult[]>([]);
  const [showResults, setShowResults] = useState(false);

  const discipline = useMemo(
    () => DISCIPLINES.find(d => d.id === activeDiscipline) ?? DISCIPLINES[0],
    [activeDiscipline],
  );

  const tabs = useMemo(() => DISCIPLINES.map(d => ({ id: d.id, label: d.label })), []);

  function addResult(r: Omit<IntelResult, "id">) {
    setResults(prev => [{ ...r, id: `${Date.now()}-${Math.random()}` }, ...prev].slice(0, 100));
  }

  async function runOp(op: Operation) {
    const key = `${activeDiscipline}-${op.key}`;
    setRunning(key);
    const start = Date.now();

    const params: Record<string, unknown> = {};
    if (op.requiresContact && contactId.trim()) {
      params.contactId = contactId.trim();
    }

    try {
      const result = (await rpc(op.rpc, params)) as { ok: boolean; data?: unknown; error?: string };
      addResult({
        ts: Date.now(),
        discipline: discipline.abbr,
        operation: op.label,
        rpcMethod: op.rpc,
        contactId: contactId.trim() || undefined,
        ok: result.ok,
        data: result.data,
        error: result.error,
        durationMs: Date.now() - start,
      });
      setShowResults(true);
    } catch (err) {
      addResult({
        ts: Date.now(),
        discipline: discipline.abbr,
        operation: op.label,
        rpcMethod: op.rpc,
        contactId: contactId.trim() || undefined,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
      });
      setShowResults(true);
    } finally {
      setRunning(null);
    }
  }

  const successCount = results.filter(r => r.ok).length;
  const errCount = results.filter(r => !r.ok).length;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Advanced Intelligence Station"
        description="Multi-discipline intelligence collection and counter-intelligence — 12 disciplines, 60+ operations"
        icon={<Brain className="w-6 h-6 text-accent" />}
        actions={
          <Button
            variant={showResults ? "primary" : "outline"}
            size="sm"
            onClick={() => { setShowResults(v => !v); }}
          >
            <Activity className="w-4 h-4 mr-1.5" />
            Results ({results.length})
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Disciplines" value="12" icon={<Layers className="w-5 h-5 text-accent" />} />
        <StatCard label="Operations" value="60+" icon={<Zap className="w-5 h-5 text-warning" />} />
        <StatCard label="Success" value={`${successCount}`} icon={<Shield className="w-5 h-5 text-success" />} />
        <StatCard label="Errors" value={`${errCount}`} icon={<AlertTriangle className="w-5 h-5 text-danger" />} />
      </div>

      {/* Results panel */}
      {showResults && (
        <div className="space-y-3 p-4 bg-bg-secondary rounded-xl border border-border">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-text-heading">Intelligence Results ({results.length})</p>
            <Button variant="ghost" size="sm" onClick={() => { setResults([]); }}>Clear all</Button>
          </div>
          {results.length === 0
            ? <EmptyState icon={<Database className="w-7 h-7" />} title="No results yet" description="Run any operation to see results here" />
            : results.map(r => (
              <ResultCard key={r.id} result={r} onDismiss={() => { setResults(prev => prev.filter(x => x.id !== r.id)); }} />
            ))
          }
        </div>
      )}

      {/* Contact ID input */}
      <div className="flex gap-3 items-center p-3.5 bg-bg-card border border-border rounded-xl">
        <Target className="w-4 h-4 text-accent shrink-0" />
        <div className="flex-1">
          <p className="text-xs font-semibold text-text-heading mb-1">Target Contact ID <span className="font-normal text-text-muted">(required for HUMINT/OSINT/FUSION/CI operations)</span></p>
          <input
            type="text"
            value={contactId}
            onChange={e => { setContactId(e.target.value); }}
            placeholder="Enter HPICS contact UUID…"
            className="w-full bg-bg-input border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
          />
        </div>
        {contactId.trim() && (
          <button type="button" onClick={() => { setContactId(""); }} aria-label="Clear" className="text-text-muted hover:text-danger">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Discipline banner */}
      <div className={`p-4 rounded-xl border border-border bg-bg-card`}>
        <div className="flex items-start gap-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center bg-bg-secondary shrink-0 ${discipline.color}`}>
            <discipline.icon className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-0.5">
              <h2 className="text-base font-bold text-text-heading">{discipline.label}</h2>
              <Badge variant="neutral" className="text-[9px]">{discipline.abbr}</Badge>
            </div>
            <p className="text-xs text-text-muted leading-relaxed">{discipline.desc}</p>
            <p className="text-[10px] text-accent mt-1 font-medium italic">{discipline.tradecraft}</p>
          </div>
        </div>
      </div>

      {/* Discipline tabs */}
      <Tabs tabs={tabs} active={activeDiscipline} onChange={setActiveDiscipline} />

      {/* Operations grid */}
      {running && (
        <Alert variant="info">
          <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1.5" />
          Running intelligence operation — heavy pipelines may take 30-90 seconds…
        </Alert>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {discipline.ops.map(op => (
          <OperationCard
            key={op.key}
            op={op}
            discipline={discipline}
            contactId={contactId}
            running={running}
            onRun={runOp}
          />
        ))}
      </div>

      {/* Real-world tradecraft footer */}
      <Card className="p-4 bg-bg-secondary border-border-hover">
        <div className="flex items-start gap-2">
          <Lock className="w-4 h-4 text-success shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-text-heading mb-1">Intelligence Tradecraft Basis</p>
            <p className="text-[10px] text-text-muted leading-relaxed">
              All operations grounded in published doctrine: IC OSINT Strategy 2024-2026 (CIA/ODNI), FM 2-22.3 HUMINT Collector Operations,
              FM 3-53 Military Information Support Operations, NSA OPSEC 5-step process, MITRE ATT&CK framework,
              RAND Corporation ML deception detection research, Barton Whaley cyber deception theory,
              FBI BAP behavioral analysis, CDSE insider threat indicators, NGA GEOINT doctrine, NATO cognitive warfare framework 2022.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
