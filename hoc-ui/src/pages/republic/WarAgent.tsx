import {
  Swords,
  Shield,
  Globe,
  Flag,
  RefreshCw,
  Play,
  Pause,
  SkipForward,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Users,
  Zap,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  X,
  Plus,
  Minus,
  Eye,
  Download,
  Settings,
  Brain,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { PageHeader, Card, Badge, Button, StatCard } from "@/components/ui";
import { useRpc, rpc } from "@/lib/rpc";

// ─── WarAgent Data Models ─────────────────────────────────────────

export type Scenario = "WWI" | "WWII" | "Warring_States";
export type ActionType =
  | "Wait"
  | "GeneralMobilization"
  | "DeclareWar"
  | "PublishAlliance"
  | "RequestMilitaryAlliance"
  | "AcceptMilitaryAlliance"
  | "RejectMilitaryAlliance"
  | "RequestMilitarySupport"
  | "AcceptMilitarySupport"
  | "RejectMilitarySupport"
  | "ProposePeace"
  | "AcceptPeace"
  | "RejectPeace"
  | "SendMessage"
  | "Surrender";

export type RelationType = "Ally" | "Neutral" | "Enemy" | "War" | "Potential_Ally";

export interface CountryProfile {
  id: string;
  name: string;
  fullName: string;
  flag: string;
  color: string;
  militaryStrength: number; // 0-100
  economicPower: number; // 0-100
  population: number; // millions
  territory: number; // relative km²
  mobilized: boolean;
  atWar: boolean;
  surrendered: boolean;
  allies: string[];
  enemies: string[];
  description: string;
}

export interface BoardRelation {
  from: string;
  to: string;
  relation: RelationType;
  strength: number; // -100 hostile to +100 friendly
}

export interface StickState {
  countryId: string;
  militaryReadiness: number; // 0-100
  domesticStability: number; // 0-100
  economicHealth: number; // 0-100
  publicMorale: number; // 0-100
  warDeclarations: string[];
  allianceRequests: string[];
  pendingActions: string[];
}

export interface ActionEvent {
  id: string;
  round: number;
  actorId: string;
  actorName: string;
  action: ActionType;
  targets: string[];
  reasoning: string;
  timestamp: string;
  secretaryApproved: boolean;
  secretaryNote?: string;
}

export interface SimulationState {
  id: string;
  scenario: Scenario;
  model: string;
  trigger: string;
  currentRound: number;
  maxRounds: number;
  running: boolean;
  ended: boolean;
  warOutcome?: "War" | "Peace" | "Stalemate";
  countries: CountryProfile[];
  board: BoardRelation[];
  sticks: StickState[];
  events: ActionEvent[];
  createdAt: string;
}

// ─── Scenario Definitions ─────────────────────────────────────────

const WWI_COUNTRIES: CountryProfile[] = [
  {
    id: "A",
    name: "Austria-Hungary",
    fullName: "Austro-Hungarian Empire",
    flag: "🇦🇹",
    color: "#dc2626",
    militaryStrength: 72,
    economicPower: 65,
    population: 52,
    territory: 676,
    mobilized: false,
    atWar: false,
    surrendered: false,
    allies: ["G", "OT"],
    enemies: ["S"],
    description: "Declining multi-ethnic empire seeking to reassert dominance in the Balkans.",
  },
  {
    id: "G",
    name: "Germany",
    fullName: "German Empire",
    flag: "🇩🇪",
    color: "#374151",
    militaryStrength: 90,
    economicPower: 88,
    population: 68,
    territory: 540,
    mobilized: false,
    atWar: false,
    surrendered: false,
    allies: ["A", "OT"],
    enemies: [],
    description: "Industrial powerhouse with the most modern and powerful army in Europe.",
  },
  {
    id: "OT",
    name: "Ottoman",
    fullName: "Ottoman Empire",
    flag: "🇹🇷",
    color: "#92400e",
    militaryStrength: 60,
    economicPower: 45,
    population: 23,
    territory: 1783,
    mobilized: false,
    atWar: false,
    surrendered: false,
    allies: ["G", "A"],
    enemies: [],
    description: "The 'sick man of Europe' struggling to maintain vast territories.",
  },
  {
    id: "F",
    name: "France",
    fullName: "French Republic",
    flag: "🇫🇷",
    color: "#1d4ed8",
    militaryStrength: 78,
    economicPower: 76,
    population: 41,
    territory: 536,
    mobilized: false,
    atWar: false,
    surrendered: false,
    allies: ["UK", "R"],
    enemies: ["G"],
    description:
      "Republic seeking revenge for the Franco-Prussian War and loss of Alsace-Lorraine.",
  },
  {
    id: "UK",
    name: "Britain",
    fullName: "United Kingdom",
    flag: "🇬🇧",
    color: "#1e40af",
    militaryStrength: 82,
    economicPower: 95,
    population: 46,
    territory: 30000,
    mobilized: false,
    atWar: false,
    surrendered: false,
    allies: ["F", "R"],
    enemies: [],
    description: "Global naval superpower with vast colonial empire.",
  },
  {
    id: "R",
    name: "Russia",
    fullName: "Russian Empire",
    flag: "🇷🇺",
    color: "#7e22ce",
    militaryStrength: 68,
    economicPower: 55,
    population: 164,
    territory: 21800,
    mobilized: false,
    atWar: false,
    surrendered: false,
    allies: ["F", "UK"],
    enemies: ["A"],
    description: "Vast empire with powerful army but antiquated political system.",
  },
  {
    id: "S",
    name: "Serbia",
    fullName: "Kingdom of Serbia",
    flag: "🇷🇸",
    color: "#dc2626",
    militaryStrength: 45,
    economicPower: 30,
    population: 4,
    territory: 87,
    mobilized: false,
    atWar: false,
    surrendered: false,
    allies: ["R"],
    enemies: ["A"],
    description: "Balkan kingdom at the center of the assassination crisis.",
  },
  {
    id: "I",
    name: "Italy",
    fullName: "Kingdom of Italy",
    flag: "🇮🇹",
    color: "#047857",
    militaryStrength: 55,
    economicPower: 50,
    population: 35,
    territory: 310,
    mobilized: false,
    atWar: false,
    surrendered: false,
    allies: [],
    enemies: [],
    description: "Nominally allied with Central Powers but maintaining strategic ambiguity.",
  },
];

const WWII_COUNTRIES: CountryProfile[] = [
  {
    id: "GER",
    name: "Germany",
    fullName: "Nazi Germany",
    flag: "🇩🇪",
    color: "#374151",
    militaryStrength: 95,
    economicPower: 85,
    population: 70,
    territory: 472,
    mobilized: true,
    atWar: false,
    surrendered: false,
    allies: ["ITA", "JPN"],
    enemies: [],
    description: "Fascist Germany under Hitler, pursuing aggressive expansion through Lebensraum.",
  },
  {
    id: "ITA",
    name: "Italy",
    fullName: "Kingdom of Italy",
    flag: "🇮🇹",
    color: "#92400e",
    militaryStrength: 62,
    economicPower: 58,
    population: 44,
    territory: 310,
    mobilized: false,
    atWar: false,
    surrendered: false,
    allies: ["GER", "JPN"],
    enemies: [],
    description: "Fascist Italy under Mussolini, seeking Mediterranean dominance.",
  },
  {
    id: "JPN",
    name: "Japan",
    fullName: "Empire of Japan",
    flag: "🇯🇵",
    color: "#dc2626",
    militaryStrength: 88,
    economicPower: 70,
    population: 73,
    territory: 378,
    mobilized: true,
    atWar: false,
    surrendered: false,
    allies: ["GER", "ITA"],
    enemies: [],
    description: "Imperial Japan pursuing Pacific domination and resource acquisition.",
  },
  {
    id: "UK",
    name: "Britain",
    fullName: "United Kingdom",
    flag: "🇬🇧",
    color: "#1e40af",
    militaryStrength: 80,
    economicPower: 88,
    population: 48,
    territory: 30000,
    mobilized: false,
    atWar: false,
    surrendered: false,
    allies: ["FRA", "USA", "USSR"],
    enemies: ["GER"],
    description: "Britain under Churchill, vowing to fight to the last.",
  },
  {
    id: "FRA",
    name: "France",
    fullName: "French Republic",
    flag: "🇫🇷",
    color: "#1d4ed8",
    militaryStrength: 70,
    economicPower: 72,
    population: 42,
    territory: 672,
    mobilized: false,
    atWar: false,
    surrendered: false,
    allies: ["UK", "USSR"],
    enemies: ["GER"],
    description: "France with the Maginot Line, uncertain of German intentions.",
  },
  {
    id: "USSR",
    name: "USSR",
    fullName: "Soviet Union",
    flag: "🇷🇺",
    color: "#7e22ce",
    militaryStrength: 85,
    economicPower: 68,
    population: 170,
    territory: 22400,
    mobilized: false,
    atWar: false,
    surrendered: false,
    allies: [],
    enemies: [],
    description: "Soviet Union under Stalin, recently purged its officer corps.",
  },
  {
    id: "USA",
    name: "USA",
    fullName: "United States",
    flag: "🇺🇸",
    color: "#1d4ed8",
    militaryStrength: 78,
    economicPower: 98,
    population: 132,
    territory: 9630,
    mobilized: false,
    atWar: false,
    surrendered: false,
    allies: [],
    enemies: [],
    description: "Isolationist America with massive industrial capacity.",
  },
  {
    id: "POL",
    name: "Poland",
    fullName: "Republic of Poland",
    flag: "🇵🇱",
    color: "#dc2626",
    militaryStrength: 52,
    economicPower: 40,
    population: 35,
    territory: 389,
    mobilized: false,
    atWar: false,
    surrendered: false,
    allies: ["UK", "FRA"],
    enemies: ["GER"],
    description: "Poland caught between Nazi Germany and the Soviet Union.",
  },
  {
    id: "CHI",
    name: "China",
    fullName: "Republic of China",
    flag: "🇨🇳",
    color: "#b45309",
    militaryStrength: 50,
    economicPower: 35,
    population: 430,
    territory: 11400,
    mobilized: false,
    atWar: false,
    surrendered: false,
    allies: [],
    enemies: ["JPN"],
    description: "China already at war with Japan, seeking Allied support.",
  },
];

const WS_COUNTRIES: CountryProfile[] = [
  {
    id: "QIN",
    name: "Qin",
    fullName: "State of Qin",
    flag: "⚔️",
    color: "#dc2626",
    militaryStrength: 92,
    economicPower: 80,
    population: 5,
    territory: 890,
    mobilized: false,
    atWar: false,
    surrendered: false,
    allies: [],
    enemies: [],
    description:
      "Western state with legalist reforms and powerful cavalry. Destined to unify China.",
  },
  {
    id: "CHU",
    name: "Chu",
    fullName: "State of Chu",
    flag: "🐉",
    color: "#047857",
    militaryStrength: 85,
    economicPower: 75,
    population: 8,
    territory: 1200,
    mobilized: false,
    atWar: false,
    surrendered: false,
    allies: [],
    enemies: ["QIN"],
    description: "Largest state by territory, with diverse resources and fierce warriors.",
  },
  {
    id: "QI",
    name: "Qi",
    fullName: "State of Qi",
    flag: "🌊",
    color: "#1d4ed8",
    militaryStrength: 80,
    economicPower: 90,
    population: 6,
    territory: 540,
    mobilized: false,
    atWar: false,
    surrendered: false,
    allies: [],
    enemies: [],
    description: "Wealthy coastal state with advanced commerce and diplomacy.",
  },
  {
    id: "YAN",
    name: "Yan",
    fullName: "State of Yan",
    flag: "❄️",
    color: "#7e22ce",
    militaryStrength: 60,
    economicPower: 50,
    population: 2,
    territory: 690,
    mobilized: false,
    atWar: false,
    surrendered: false,
    allies: [],
    enemies: [],
    description: "Northern state with strong cavalry but limited resources.",
  },
  {
    id: "WEI",
    name: "Wei",
    fullName: "State of Wei",
    flag: "🏯",
    color: "#b45309",
    militaryStrength: 75,
    economicPower: 70,
    population: 4,
    territory: 430,
    mobilized: false,
    atWar: false,
    surrendered: false,
    allies: [],
    enemies: [],
    description: "Central state facing pressure from all directions.",
  },
  {
    id: "HAN",
    name: "Han",
    fullName: "State of Han",
    flag: "⚡",
    color: "#0891b2",
    militaryStrength: 55,
    economicPower: 55,
    population: 3,
    territory: 230,
    mobilized: false,
    atWar: false,
    surrendered: false,
    allies: [],
    enemies: [],
    description: "Smallest of the seven but known for crossbow technology.",
  },
  {
    id: "ZHAO",
    name: "Zhao",
    fullName: "State of Zhao",
    flag: "🎯",
    color: "#374151",
    militaryStrength: 82,
    economicPower: 65,
    population: 4,
    territory: 510,
    mobilized: false,
    atWar: false,
    surrendered: false,
    allies: [],
    enemies: ["QIN"],
    description: "Northern state with elite cavalry, main rival of Qin.",
  },
];

const SCENARIO_CONFIGS: Record<
  Scenario,
  { countries: CountryProfile[]; trigger: string; description: string; era: string }
> = {
  WWI: {
    countries: WWI_COUNTRIES,
    trigger: "Country S sent assassins and killed the Archduke of Country A",
    description:
      "World War I — The assassination of Archduke Franz Ferdinand triggers a cascade of mobilizations across Europe.",
    era: "1914 CE",
  },
  WWII: {
    countries: WWII_COUNTRIES,
    trigger: "Country GER invaded Country POL, demanding immediate Axis response",
    description:
      "World War II — Germany's lightning invasion of Poland forces all major powers to choose sides.",
    era: "1939 CE",
  },
  Warring_States: {
    countries: WS_COUNTRIES,
    trigger: "State QIN launched a surprise attack on State HAN's border fortifications",
    description:
      "Warring States Period — The seven kingdoms of ancient China vie for supremacy through alliances and conquest.",
    era: "260 BCE",
  },
};

const ACTION_COLORS: Record<ActionType, string> = {
  Wait: "#6b7280",
  GeneralMobilization: "#f59e0b",
  DeclareWar: "#dc2626",
  PublishAlliance: "#3b82f6",
  RequestMilitaryAlliance: "#8b5cf6",
  AcceptMilitaryAlliance: "#10b981",
  RejectMilitaryAlliance: "#ef4444",
  RequestMilitarySupport: "#f97316",
  AcceptMilitarySupport: "#22c55e",
  RejectMilitarySupport: "#f43f5e",
  ProposePeace: "#06b6d4",
  AcceptPeace: "#84cc16",
  RejectPeace: "#dc2626",
  SendMessage: "#a78bfa",
  Surrender: "#6b7280",
};

const ACTION_ICONS: Record<ActionType, React.ReactNode> = {
  Wait: <Clock size={11} />,
  GeneralMobilization: <Zap size={11} />,
  DeclareWar: <Swords size={11} />,
  PublishAlliance: <Flag size={11} />,
  RequestMilitaryAlliance: <Plus size={11} />,
  AcceptMilitaryAlliance: <CheckCircle size={11} />,
  RejectMilitaryAlliance: <XCircle size={11} />,
  RequestMilitarySupport: <Users size={11} />,
  AcceptMilitarySupport: <CheckCircle size={11} />,
  RejectMilitarySupport: <XCircle size={11} />,
  ProposePeace: <Shield size={11} />,
  AcceptPeace: <CheckCircle size={11} />,
  RejectPeace: <XCircle size={11} />,
  SendMessage: <MessageSquare size={11} />,
  Surrender: <Minus size={11} />,
};

const RELATION_COLORS: Record<RelationType, string> = {
  Ally: "#10b981",
  Potential_Ally: "#84cc16",
  Neutral: "#6b7280",
  Enemy: "#f59e0b",
  War: "#dc2626",
};

// ─── Helper: build default board ────────────────────────────────

function buildDefaultBoard(countries: CountryProfile[]): BoardRelation[] {
  const relations: BoardRelation[] = [];
  for (const a of countries) {
    for (const b of countries) {
      if (a.id === b.id) {
        continue;
      }
      let rel: RelationType = "Neutral";
      let strength = 0;
      if (a.allies.includes(b.id)) {
        rel = "Ally";
        strength = 70;
      } else if (a.enemies.includes(b.id)) {
        rel = "Enemy";
        strength = -70;
      }
      relations.push({ from: a.id, to: b.id, relation: rel, strength });
    }
  }
  return relations;
}

function buildDefaultSticks(countries: CountryProfile[]): StickState[] {
  return countries.map((c) => ({
    countryId: c.id,
    militaryReadiness: c.mobilized ? 85 : 40,
    domesticStability: 70,
    economicHealth: c.economicPower,
    publicMorale: 65,
    warDeclarations: [],
    allianceRequests: [],
    pendingActions: [],
  }));
}

// ─── Country Card ─────────────────────────────────────────────────

function CountryCard({
  country,
  stick,
  selected,
  onClick,
}: {
  country: CountryProfile;
  stick: StickState | undefined;
  selected: boolean;
  onClick: () => void;
}) {
  const statusBadge = country.surrendered
    ? "Surrendered"
    : country.atWar
      ? "At War"
      : country.mobilized
        ? "Mobilized"
        : "Standby";
  const statusColor = country.surrendered
    ? "neutral"
    : country.atWar
      ? "danger"
      : country.mobilized
        ? "warning"
        : "success";

  return (
    <button
type="button"       onClick={onClick}
      className="w-full text-left rounded-xl border p-3 transition-all hover:scale-[1.01]"
      style={{
        background: selected ? `${country.color}22` : "var(--bg-card)",
        borderColor: selected ? country.color : "var(--border)",
        boxShadow: selected ? `0 0 12px ${country.color}44` : undefined,
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-2xl">{country.flag}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold truncate" style={{ color: country.color }}>
            {country.name}
          </p>
          <div className="flex items-center gap-1 mt-0.5">
            <Badge variant={statusColor as "success" | "warning" | "danger" | "neutral"}>
              {statusBadge}
            </Badge>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1 mt-2">
        {[
          {
            label: "Military",
            value: stick?.militaryReadiness ?? country.militaryStrength,
            color: "#ef4444",
          },
          {
            label: "Economy",
            value: stick?.economicHealth ?? country.economicPower,
            color: "#f59e0b",
          },
          { label: "Stability", value: stick?.domesticStability ?? 70, color: "#3b82f6" },
          { label: "Morale", value: stick?.publicMorale ?? 65, color: "#8b5cf6" },
        ].map((stat) => (
          <div key={stat.label}>
            <div className="flex justify-between text-[9px] mb-0.5">
              <span className="text-text-muted">{stat.label}</span>
              <span style={{ color: stat.color }}>{stat.value}</span>
            </div>
            <div className="w-full h-1 rounded-full bg-bg-secondary">
              <div
                className="h-1 rounded-full"
                style={{ width: `${stat.value}%`, background: stat.color }}
              />
            </div>
          </div>
        ))}
      </div>
    </button>
  );
}

// ─── Board / Diplomatic Matrix ─────────────────────────────────────

function DiplomaticBoard({
  countries,
  board,
}: {
  countries: CountryProfile[];
  board: BoardRelation[];
}) {
  function getRelation(from: string, to: string): BoardRelation | undefined {
    return board.find((r) => r.from === from && r.to === to);
  }

  return (
    <div className="overflow-auto">
      <table className="text-[10px] border-collapse">
        <thead>
          <tr>
            <th className="text-text-muted p-1 text-right pr-2" style={{ minWidth: 60 }}>
              →
            </th>
            {countries
              .filter((c) => !c.surrendered)
              .map((c) => (
                <th
                  key={c.id}
                  className="p-1 text-center font-semibold"
                  style={{ color: c.color, minWidth: 48 }}
                >
                  <span className="mr-1">{c.flag}</span>
                  {c.id}
                </th>
              ))}
          </tr>
        </thead>
        <tbody>
          {countries
            .filter((c) => !c.surrendered)
            .map((from) => (
              <tr key={from.id}>
                <td className="p-1 pr-2 font-semibold text-right" style={{ color: from.color }}>
                  <span className="mr-1">{from.flag}</span>
                  {from.id}
                </td>
                {countries
                  .filter((c) => !c.surrendered)
                  .map((to) => {
                    if (from.id === to.id) {
                      return (
                        <td
                          key={to.id}
                          className="p-1 text-center text-text-muted"
                          style={{ background: "var(--bg-secondary)" }}
                        >
                          —
                        </td>
                      );
                    }
                    const rel = getRelation(from.id, to.id);
                    const color = rel ? RELATION_COLORS[rel.relation] : RELATION_COLORS.Neutral;
                    return (
                      <td
                        key={to.id}
                        className="p-1 text-center rounded"
                        style={{ background: `${color}22`, color }}
                      >
                        {rel ? rel.relation.slice(0, 3) : "Neu"}
                      </td>
                    );
                  })}
              </tr>
            ))}
        </tbody>
      </table>
      <div className="flex flex-wrap gap-2 mt-2">
        {(Object.entries(RELATION_COLORS) as [RelationType, string][]).map(([rel, color]) => (
          <div key={rel} className="flex items-center gap-1 text-[10px]">
            <div className="w-2 h-2 rounded-full" style={{ background: color }} />
            <span className="text-text-muted">{rel}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Action Event Row ─────────────────────────────────────────────

function ActionRow({ event, countries }: { event: ActionEvent; countries: CountryProfile[] }) {
  const [expanded, setExpanded] = useState(false);
  const actor = countries.find((c) => c.id === event.actorId);
  const color = ACTION_COLORS[event.action] ?? "#6b7280";

  return (
    <div className="border-b border-border/50 last:border-0">
      <button
type="button"         onClick={() => setExpanded((p) => !p)}
        className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-[11px] hover:bg-bg-secondary/50 transition-colors"
      >
        <span className="text-text-muted w-8 flex-shrink-0 font-mono">R{event.round}</span>
        <span className="text-lg flex-shrink-0">{actor?.flag ?? "🌍"}</span>
        <span className="font-semibold" style={{ color: actor?.color ?? "#94a3b8" }}>
          {actor?.name ?? event.actorName}
        </span>
        <span
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] flex-shrink-0"
          style={{ background: `${color}22`, color }}
        >
          {ACTION_ICONS[event.action]}
          {event.action.replace(/_/g, " ")}
        </span>
        {event.targets.length > 0 && (
          <span className="text-text-muted truncate">→ {event.targets.join(", ")}</span>
        )}
        <span
          className="ml-auto flex-shrink-0"
          style={{ color: event.secretaryApproved ? "#10b981" : "#ef4444" }}
        >
          {event.secretaryApproved ? <CheckCircle size={11} /> : <AlertTriangle size={11} />}
        </span>
        <span className="flex-shrink-0 text-text-muted">
          {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        </span>
      </button>
      {expanded && (
        <div className="px-3 pb-2 space-y-1">
          <p className="text-[11px] text-text-secondary leading-relaxed">{event.reasoning}</p>
          {event.secretaryNote && (
            <p className="text-[10px] text-text-muted italic">
              🤖 Secretary: {event.secretaryNote}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Simulation Controls ──────────────────────────────────────────

function SimControls({
  sim,
  onStart,
  onStep,
  onReset,
  onExport,
  loading,
}: {
  sim: SimulationState | null;
  onStart: () => void;
  onStep: () => void;
  onReset: () => void;
  onExport: () => void;
  loading: boolean;
}) {
  const running = sim?.running ?? false;
  const ended = sim?.ended ?? false;
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {!ended && (
        <Button
          variant={running ? "outline" : "primary"}
          size="sm"
          icon={running ? <Pause size={13} /> : <Play size={13} />}
          onClick={onStart}
          disabled={loading}
        >
          {running ? "Pause" : sim ? "Resume" : "Start"}
        </Button>
      )}
      {!ended && sim && (
        <Button
          variant="outline"
          size="sm"
          icon={<SkipForward size={13} />}
          onClick={onStep}
          disabled={loading || running}
        >
          Step Round
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        icon={<RefreshCw size={13} />}
        onClick={onReset}
        disabled={loading}
      >
        Reset
      </Button>
      {sim && (
        <Button variant="ghost" size="sm" icon={<Download size={13} />} onClick={onExport}>
          Export
        </Button>
      )}
      {sim && (
        <div className="flex items-center gap-1.5 text-xs text-text-muted ml-auto">
          <span className="font-mono">
            Round {sim.currentRound}/{sim.maxRounds}
          </span>
          {running && <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />}
          {ended && sim.warOutcome && (
            <Badge
              variant={
                sim.warOutcome === "Peace"
                  ? "success"
                  : sim.warOutcome === "Stalemate"
                    ? "warning"
                    : "danger"
              }
            >
              {sim.warOutcome}
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Scenario Selector ────────────────────────────────────────────

function ScenarioSelector({
  selected,
  onSelect,
  trigger,
  onTriggerChange,
  model,
  onModelChange,
  rounds,
  onRoundsChange,
}: {
  selected: Scenario;
  onSelect: (s: Scenario) => void;
  trigger: string;
  onTriggerChange: (t: string) => void;
  model: string;
  onModelChange: (m: string) => void;
  rounds: number;
  onRoundsChange: (r: number) => void;
}) {
  return (
    <Card>
      <h3 className="text-sm font-semibold text-text-heading mb-3 flex items-center gap-2">
        <Settings size={14} className="text-accent" /> Simulation Setup
      </h3>
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          {(["WWI", "WWII", "Warring_States"] as Scenario[]).map((s) => (
            <button
type="button"               key={s}
              onClick={() => onSelect(s)}
              className="p-2 rounded-lg border text-xs font-medium transition-all"
              style={{
                background: selected === s ? "var(--accent)" : "var(--bg-secondary)",
                borderColor: selected === s ? "var(--accent)" : "var(--border)",
                color: selected === s ? "#fff" : "var(--text-secondary)",
              }}
            >
              {s === "Warring_States" ? "Warring States" : s}
              <p className="text-[9px] opacity-70 mt-0.5 font-normal">{SCENARIO_CONFIGS[s].era}</p>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-text-muted">{SCENARIO_CONFIGS[selected].description}</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[11px] text-text-muted block mb-1">LLM Model</label>
            <select
              value={model}
              onChange={(e) => onModelChange(e.target.value)}
              className="w-full text-xs px-2 py-1.5 rounded bg-bg-secondary border border-border text-text-primary"
            >
              <option value="gpt-4">GPT-4</option>
              <option value="gpt-4-turbo">GPT-4 Turbo</option>
              <option value="claude-2">Claude 2</option>
              <option value="claude-3-opus">Claude 3 Opus</option>
              <option value="openclaw">OpenClaw (HoC)</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] text-text-muted block mb-1">Max Rounds</label>
            <input
              type="number"
              value={rounds}
              onChange={(e) => onRoundsChange(Number(e.target.value))}
              min={1}
              max={50}
              className="w-full text-xs px-2 py-1.5 rounded bg-bg-secondary border border-border text-text-primary"
            />
          </div>
        </div>
        <div>
          <label className="text-[11px] text-text-muted block mb-1">Trigger Event</label>
          <input
            value={trigger}
            onChange={(e) => onTriggerChange(e.target.value)}
            className="w-full text-xs px-2 py-1.5 rounded bg-bg-secondary border border-border text-text-primary"
            placeholder="Describe the triggering event…"
          />
        </div>
      </div>
    </Card>
  );
}

// ─── Country Detail Panel ─────────────────────────────────────────

function CountryDetail({
  country,
  stick,
  board,
  countries,
  events,
  onClose,
  onAction,
}: {
  country: CountryProfile;
  stick: StickState | undefined;
  board: BoardRelation[];
  countries: CountryProfile[];
  events: ActionEvent[];
  onClose: () => void;
  onAction: (action: ActionType, targets: string[]) => void;
}) {
  const [actionType, setActionType] = useState<ActionType>("Wait");
  const [targets, setTargets] = useState<string[]>([]);
  const myRelations = board.filter((r) => r.from === country.id);
  const myEvents = events.filter((e) => e.actorId === country.id).slice(-5);

  const AVAILABLE_ACTIONS: ActionType[] = [
    "Wait",
    "GeneralMobilization",
    "DeclareWar",
    "PublishAlliance",
    "RequestMilitaryAlliance",
    "RequestMilitarySupport",
    "ProposePeace",
    "Surrender",
    "SendMessage",
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-4">
      <div className="bg-bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center gap-3 p-4 border-b border-border">
          <span className="text-3xl">{country.flag}</span>
          <div className="flex-1">
            <h2 className="font-bold text-text-heading">{country.fullName}</h2>
            <p className="text-xs text-text-muted">{country.description}</p>
          </div>
          <Button variant="ghost" size="sm" icon={<X size={14} />} onClick={onClose} />
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Stick state */}
          <Card>
            <h3 className="text-xs font-semibold text-text-heading mb-2">Internal State (Stick)</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                {
                  label: "Military Readiness",
                  value: stick?.militaryReadiness ?? 40,
                  color: "#ef4444",
                },
                {
                  label: "Domestic Stability",
                  value: stick?.domesticStability ?? 70,
                  color: "#3b82f6",
                },
                {
                  label: "Economic Health",
                  value: stick?.economicHealth ?? country.economicPower,
                  color: "#f59e0b",
                },
                { label: "Public Morale", value: stick?.publicMorale ?? 65, color: "#8b5cf6" },
              ].map((s) => (
                <div key={s.label}>
                  <div className="flex justify-between text-[10px] mb-0.5">
                    <span className="text-text-muted">{s.label}</span>
                    <span style={{ color: s.color }}>{s.value}</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-bg-secondary">
                    <div
                      className="h-1.5 rounded-full"
                      style={{ width: `${s.value}%`, background: s.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Relations */}
          <Card>
            <h3 className="text-xs font-semibold text-text-heading mb-2">
              Diplomatic Relations (Board)
            </h3>
            <div className="space-y-1">
              {myRelations.map((r) => {
                const target = countries.find((c) => c.id === r.to);
                if (!target) {
                  return null;
                }
                const color = RELATION_COLORS[r.relation];
                return (
                  <div key={r.to} className="flex items-center gap-2 text-xs">
                    <span>{target.flag}</span>
                    <span className="flex-1 text-text-secondary">{target.name}</span>
                    <span
                      className="px-1.5 py-0.5 rounded text-[10px]"
                      style={{ background: `${color}22`, color }}
                    >
                      {r.relation}
                    </span>
                    <span className="text-text-muted w-10 text-right">
                      {r.strength > 0 ? "+" : ""}
                      {r.strength}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Manual action */}
          <Card>
            <h3 className="text-xs font-semibold text-text-heading mb-2">Issue Manual Action</h3>
            <div className="space-y-2">
              <select
                value={actionType}
                onChange={(e) => setActionType(e.target.value as ActionType)}
                className="w-full text-xs px-2 py-1.5 rounded bg-bg-secondary border border-border text-text-primary"
              >
                {AVAILABLE_ACTIONS.map((a) => (
                  <option key={a} value={a}>
                    {a.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
              {[
                "DeclareWar",
                "RequestMilitaryAlliance",
                "RequestMilitarySupport",
                "ProposePeace",
                "PublishAlliance",
              ].includes(actionType) && (
                <div className="flex flex-wrap gap-1">
                  {countries
                    .filter((c) => c.id !== country.id && !c.surrendered)
                    .map((c) => (
                      <button
type="button"                         key={c.id}
                        onClick={() =>
                          setTargets((p) =>
                            p.includes(c.id) ? p.filter((t) => t !== c.id) : [...p, c.id],
                          )
                        }
                        className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border transition-all"
                        style={{
                          borderColor: targets.includes(c.id) ? c.color : "var(--border)",
                          background: targets.includes(c.id)
                            ? `${c.color}22`
                            : "var(--bg-secondary)",
                          color: targets.includes(c.id) ? c.color : "var(--text-muted)",
                        }}
                      >
                        {c.flag} {c.name}
                      </button>
                    ))}
                </div>
              )}
              <Button
                size="sm"
                variant="primary"
                icon={<Swords size={12} />}
                onClick={() => {
                  onAction(actionType, targets);
                  onClose();
                }}
              >
                Issue Action
              </Button>
            </div>
          </Card>

          {/* History */}
          {myEvents.length > 0 && (
            <Card>
              <h3 className="text-xs font-semibold text-text-heading mb-2">Recent Actions</h3>
              {myEvents.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center gap-2 text-[11px] py-1 border-b border-border/40 last:border-0"
                >
                  <span className="text-text-muted w-8 font-mono">R{e.round}</span>
                  <span
                    className="flex items-center gap-1"
                    style={{ color: ACTION_COLORS[e.action] }}
                  >
                    {ACTION_ICONS[e.action]} {e.action.replace(/_/g, " ")}
                  </span>
                  {e.targets.length > 0 && (
                    <span className="text-text-muted">→ {e.targets.join(", ")}</span>
                  )}
                </div>
              ))}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────

export function WarAgentPage() {
  const [scenario, setScenario] = useState<Scenario>("WWI");
  const [model, setModel] = useState("gpt-4");
  const [rounds, setRounds] = useState(10);
  const [trigger, setTrigger] = useState(SCENARIO_CONFIGS.WWI.trigger);
  const [tab, setTab] = useState<"board" | "log" | "analysis">("board");
  const [selectedCountry, setSelectedCountry] = useState<CountryProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [simId, setSimId] = useState<string | null>(null);

  // Local simulation state (also backed by RPC when available)
  const [localSim, setLocalSim] = useState<SimulationState | null>(null);
  // Ref always holds the latest localSim so setInterval callbacks don't go stale
  const localSimRef = useRef<SimulationState | null>(null);
  useEffect(() => {
    localSimRef.current = localSim;
  }, [localSim]);

  const { data: simData } = useRpc<{ ok?: boolean; simulation?: SimulationState }>(
    "waragent.simulation.get",
    { id: simId ?? "" },
    [simId],
    // Only poll backend when we have a simId — otherwise refetch is disabled (0)
    { staleTimeMs: 2000, refetchIntervalMs: simId ? (localSim?.running ? 3000 : 30000) : 0 },
  );

  const sim = simData?.simulation ?? localSim;

  function buildLocalSim(): SimulationState {
    const countries = SCENARIO_CONFIGS[scenario].countries;
    return {
      id: `local-${Date.now()}`,
      scenario,
      model,
      trigger,
      currentRound: 0,
      maxRounds: rounds,
      running: false,
      ended: false,
      countries: countries.map((c) => ({ ...c })),
      board: buildDefaultBoard(countries),
      sticks: buildDefaultSticks(countries),
      events: [],
      createdAt: new Date().toISOString(),
    };
  }

  function handleReset() {
    setSimId(null);
    setLocalSim(null);
    setError("");
  }

  async function handleStart() {
    setLoading(true);
    setError("");
    try {
      const result = await rpc<{ ok?: boolean; simulation?: SimulationState; id?: string }>(
        "waragent.simulation.start",
        { scenario, model, trigger, maxRounds: rounds },
      );
      if (result?.ok && result.id) {
        setSimId(result.id);
        if (result.simulation) {
          setLocalSim(result.simulation);
        }
      } else {
        // Fallback: run locally with mock data
        const s = buildLocalSim();
        s.running = true;
        setLocalSim(s);
        runLocalStep(s);
      }
    } catch {
      const s = buildLocalSim();
      s.running = true;
      setLocalSim(s);
      runLocalStep(s);
    } finally {
      setLoading(false);
    }
  }

  async function handleStep() {
    if (!sim) {
      return;
    }
    setLoading(true);
    try {
      const result = await rpc<{ ok?: boolean; simulation?: SimulationState }>(
        "waragent.simulation.step",
        { id: sim.id },
      );
      if (result?.simulation) {
        setLocalSim(result.simulation);
      } else {
        runLocalStep(sim);
      }
    } catch {
      runLocalStep(sim);
    } finally {
      setLoading(false);
    }
  }

  // Mock local step to show realistic behavior when backend not available
  function runLocalStep(current: SimulationState) {
    setLocalSim((prev) => {
      const s = prev ?? current;
      if (s.ended || s.currentRound >= s.maxRounds) {
        return { ...s, running: false, ended: true, warOutcome: "War" };
      }

      const newRound = s.currentRound + 1;
      const countries = s.countries.filter((c) => !c.surrendered);
      const newEvents: ActionEvent[] = [...s.events];
      const newBoard = [...s.board];
      const newSticks = [...s.sticks];
      const newCountries = [...s.countries];

      // Each active country takes a plausible action
      const SAMPLE_ACTIONS: ActionType[] = [
        "Wait",
        "GeneralMobilization",
        "DeclareWar",
        "RequestMilitaryAlliance",
        "ProposePeace",
        "SendMessage",
        "PublishAlliance",
      ];
      const SAMPLE_REASONS = [
        "Given the current diplomatic situation, I believe it is time to act decisively.",
        "Our intelligence suggests that neighboring states are preparing for conflict. We must respond.",
        "Maintaining neutrality is no longer viable given the alliances forming around us.",
        "Our people demand action. The national interest requires mobilization.",
        "A peaceful resolution is still possible if we can forge the right alliances.",
        "We must wait and observe before committing to any course of action.",
        "The balance of power has shifted. An alliance is our best deterrent.",
      ];

      for (const country of countries) {
        const action = SAMPLE_ACTIONS[Math.floor(Math.random() * SAMPLE_ACTIONS.length)];
        const otherCountries = countries.filter((c) => c.id !== country.id);
        const targets =
          action === "DeclareWar" || action === "RequestMilitaryAlliance"
            ? [otherCountries[Math.floor(Math.random() * otherCountries.length)]?.id ?? ""].filter(
                Boolean,
              )
            : [];

        const event: ActionEvent = {
          id: `${newRound}-${country.id}`,
          round: newRound,
          actorId: country.id,
          actorName: country.name,
          action,
          targets,
          reasoning: SAMPLE_REASONS[Math.floor(Math.random() * SAMPLE_REASONS.length)],
          timestamp: new Date().toISOString(),
          secretaryApproved: Math.random() > 0.1,
          secretaryNote:
            Math.random() > 0.7
              ? "Action verified as logically consistent with country profile."
              : undefined,
        };
        newEvents.push(event);

        // Apply effects
        if (action === "GeneralMobilization") {
          const idx = newCountries.findIndex((c) => c.id === country.id);
          if (idx >= 0) {
            newCountries[idx] = { ...newCountries[idx], mobilized: true };
          }
          const si = newSticks.findIndex((st) => st.countryId === country.id);
          if (si >= 0) {
            newSticks[si] = {
              ...newSticks[si],
              militaryReadiness: Math.min(100, newSticks[si].militaryReadiness + 20),
            };
          }
        }
        if (action === "DeclareWar" && targets.length > 0) {
          const idx = newCountries.findIndex((c) => c.id === country.id);
          if (idx >= 0) {
            newCountries[idx] = { ...newCountries[idx], atWar: true };
          }
          const ti = newCountries.findIndex((c) => c.id === targets[0]);
          if (ti >= 0) {
            newCountries[ti] = { ...newCountries[ti], atWar: true };
          }
          const bi = newBoard.findIndex((r) => r.from === country.id && r.to === targets[0]);
          if (bi >= 0) {
            newBoard[bi] = { ...newBoard[bi], relation: "War", strength: -100 };
          }
        }
      }

      const atWarCount = newCountries.filter((c) => c.atWar).length;
      const ended = newRound >= s.maxRounds;

      return {
        ...s,
        currentRound: newRound,
        running: !ended,
        ended,
        warOutcome: ended ? (atWarCount >= 2 ? "War" : "Peace") : undefined,
        countries: newCountries,
        board: newBoard,
        sticks: newSticks,
        events: newEvents,
      };
    });
  }

  // Auto-step when running — reads latest state via ref to avoid stale closure
  useEffect(() => {
    if (!localSim?.running || localSim.ended) {
      return;
    }
    const timer = setInterval(() => {
      const current = localSimRef.current;
      if (current) {
        runLocalStep(current);
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [localSim?.running, localSim?.ended]);

  // Update trigger when scenario changes
  useEffect(() => {
    setTrigger(SCENARIO_CONFIGS[scenario].trigger);
  }, [scenario]);

  async function handleManualAction(action: ActionType, targets: string[]) {
    if (!sim || !selectedCountry) {
      return;
    }
    const event: ActionEvent = {
      id: `manual-${Date.now()}`,
      round: sim.currentRound,
      actorId: selectedCountry.id,
      actorName: selectedCountry.name,
      action,
      targets,
      reasoning: "Manual action issued by operator.",
      timestamp: new Date().toISOString(),
      secretaryApproved: true,
      secretaryNote: "Operator override — secretary check bypassed.",
    };
    setLocalSim((prev) => (prev ? { ...prev, events: [...prev.events, event] } : prev));
    try {
      await rpc("waragent.simulation.manualAction", {
        id: sim.id,
        action,
        actorId: selectedCountry.id,
        targets,
      });
    } catch {
      /* silent */
    }
  }

  function exportSim() {
    if (!sim) {
      return;
    }
    const blob = new Blob([JSON.stringify(sim, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `waragent-${sim.scenario}-round${sim.currentRound}.json`;
    a.click();
  }

  const countries = sim?.countries ?? SCENARIO_CONFIGS[scenario].countries;
  const atWarCount = countries.filter((c) => c.atWar).length;
  const mobilizedCount = countries.filter((c) => c.mobilized).length;
  const warDecCount = sim?.events.filter((e) => e.action === "DeclareWar").length ?? 0;

  const TABS = [
    { id: "board", label: "Diplomatic Board" },
    { id: "log", label: `Action Log (${sim?.events.length ?? 0})` },
    { id: "analysis", label: "Analysis" },
  ] as const;

  return (
    <div className="space-y-4 p-6 pb-16">
      <PageHeader
        title="WarAgent"
        description="LLM-powered multi-agent simulation of historical world conflicts. Based on the AGI Research WarAgent paper (arXiv:2311.17227)."
        icon={<Swords className="text-red-500" size={22} />}
      />

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Nations"
          value={countries.filter((c) => !c.surrendered).length}
          icon={<Globe size={14} />}
        />
        <StatCard label="At War" value={atWarCount} icon={<Swords size={14} />} />
        <StatCard label="Mobilized" value={mobilizedCount} icon={<Zap size={14} />} />
        <StatCard label="War Declarations" value={warDecCount} icon={<AlertTriangle size={14} />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Setup + Countries */}
        <div className="space-y-3">
          {!sim && (
            <ScenarioSelector
              selected={scenario}
              onSelect={setScenario}
              trigger={trigger}
              onTriggerChange={setTrigger}
              model={model}
              onModelChange={setModel}
              rounds={rounds}
              onRoundsChange={setRounds}
            />
          )}
          {sim && (
            <Card>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-text-heading mb-2">
                  {sim.scenario} · {SCENARIO_CONFIGS[sim.scenario]?.era ?? ""}
                </h3>
                <Badge variant={sim.running ? "success" : sim.ended ? "neutral" : "warning"}>
                  {sim.running ? "LIVE" : sim.ended ? "ENDED" : "PAUSED"}
                </Badge>
              </div>
              <p className="text-[11px] text-text-muted mb-2">Trigger: {sim.trigger}</p>
              <p className="text-[11px] text-text-muted">Model: {sim.model}</p>
            </Card>
          )}

          <SimControls
            sim={sim}
            onStart={handleStart}
            onStep={handleStep}
            onReset={handleReset}
            onExport={exportSim}
            loading={loading}
          />

          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-text-muted uppercase">Nations</h3>
            {countries.map((c) => (
              <CountryCard
                key={c.id}
                country={c}
                stick={sim?.sticks.find((s) => s.countryId === c.id)}
                selected={selectedCountry?.id === c.id}
                onClick={() => setSelectedCountry(sim ? c : null)}
              />
            ))}
          </div>
        </div>

        {/* Right: Board / Log / Analysis */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex gap-1 flex-wrap">
            {TABS.map((t) => (
              <button
type="button"                 key={t.id}
                onClick={() => setTab(t.id)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: tab === t.id ? "var(--accent)" : "var(--bg-secondary)",
                  color: tab === t.id ? "#fff" : "var(--text-secondary)",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "board" && (
            <Card>
              <h3 className="text-sm font-semibold text-text-heading mb-3 flex items-center gap-2">
                <Globe size={14} className="text-accent" /> Diplomatic Relations Board
              </h3>
              <DiplomaticBoard
                countries={countries}
                board={sim?.board ?? buildDefaultBoard(countries)}
              />
            </Card>
          )}

          {tab === "log" && (
            <Card className="p-0">
              <div className="p-3 border-b border-border">
                <h3 className="text-sm font-semibold text-text-heading flex items-center gap-2">
                  <MessageSquare size={14} className="text-accent" /> Action Log
                </h3>
              </div>
              <div className="max-h-[600px] overflow-y-auto">
                {(sim?.events ?? []).length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-text-muted">
                    <Brain size={32} className="mb-3 opacity-30" />
                    <p className="text-sm">No actions yet</p>
                    <p className="text-xs mt-1 opacity-60">
                      Start the simulation to see agent decisions
                    </p>
                  </div>
                ) : (
                  (sim?.events ?? [])
                    .toReversed()
                    .map((e) => <ActionRow key={e.id} event={e} countries={countries} />)
                )}
              </div>
            </Card>
          )}

          {tab === "analysis" && (
            <div className="space-y-3">
              <Card>
                <h3 className="text-sm font-semibold text-text-heading mb-3">
                  War/Peace Outcome Analysis
                </h3>
                {sim?.ended ? (
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-text-muted">Outcome:</span>
                      <Badge variant={sim.warOutcome === "Peace" ? "success" : "danger"}>
                        {sim.warOutcome}
                      </Badge>
                    </div>
                    <p className="text-text-secondary">
                      {sim.warOutcome === "War"
                        ? `Conflict escalated over ${sim.currentRound} rounds. ${atWarCount} nations engaged in active warfare.`
                        : `Diplomatic resolution achieved after ${sim.currentRound} rounds without full-scale war.`}
                    </p>
                  </div>
                ) : (
                  <p className="text-text-muted text-sm">
                    Analysis available after simulation ends.
                  </p>
                )}
              </Card>
              <Card>
                <h3 className="text-sm font-semibold text-text-heading mb-3">
                  Action Distribution
                </h3>
                {(sim?.events ?? []).length > 0 ? (
                  (() => {
                    const counts: Partial<Record<ActionType, number>> = {};
                    for (const e of sim?.events ?? []) {
                      counts[e.action] = (counts[e.action] ?? 0) + 1;
                    }
                    return (
                      <div className="space-y-1.5">
                        {Object.entries(counts)
                          .toSorted((a, b) => b[1] - a[1])
                          .map(([action, count]) => (
                            <div key={action}>
                              <div className="flex justify-between text-[11px] mb-0.5">
                                <span className="text-text-secondary">
                                  {action.replace(/_/g, " ")}
                                </span>
                                <span className="text-text-muted">{count}</span>
                              </div>
                              <div className="w-full h-1.5 rounded-full bg-bg-secondary">
                                <div
                                  className="h-1.5 rounded-full"
                                  style={{
                                    width: `${(count / (sim?.events.length ?? 1)) * 100}%`,
                                    background: ACTION_COLORS[action as ActionType] ?? "#6b7280",
                                  }}
                                />
                              </div>
                            </div>
                          ))}
                      </div>
                    );
                  })()
                ) : (
                  <p className="text-text-muted text-sm">
                    Run simulation to see action statistics.
                  </p>
                )}
              </Card>
              <Card>
                <h3 className="text-sm font-semibold text-text-heading mb-3">Research Paper</h3>
                <p className="text-xs text-text-secondary leading-relaxed mb-2">
                  WarAgent simulates multi-agent LLM decisions in historical conflicts. Each country
                  agent uses its profile to decide actions across the action space, validated by a
                  secretary agent. The Board tracks international relations while the Stick tracks
                  internal state.
                </p>
                <a
                  href="https://arxiv.org/abs/2311.17227"
                  target="_blank"
                  rel="noopener"
                  className="text-xs text-accent hover:underline flex items-center gap-1"
                >
                  <Eye size={11} /> arXiv:2311.17227 — War and Peace (WarAgent)
                </a>
                <a
                  href="https://github.com/agiresearch/WarAgent"
                  target="_blank"
                  rel="noopener"
                  className="text-xs text-accent hover:underline flex items-center gap-1 mt-1"
                >
                  <Eye size={11} /> github.com/agiresearch/WarAgent
                </a>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* Country detail modal */}
      {selectedCountry && sim && (
        <CountryDetail
          country={selectedCountry}
          stick={sim.sticks.find((s) => s.countryId === selectedCountry.id)}
          board={sim.board}
          countries={sim.countries}
          events={sim.events}
          onClose={() => setSelectedCountry(null)}
          onAction={handleManualAction}
        />
      )}
    </div>
  );
}
