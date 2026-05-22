/**
 * Civilization.tsx — The Next Frontier: 40-Innovation Dashboard
 *
 * Displays live data from all 8 civilizational engine categories:
 *   A. Philosophy   — Dialectic, Asabiyyah, Prophecies, Cave levels
 *   B. Culture      — Memes, Mythology, Guilds, Tribes, Festivals, Rites, Oral Traditions
 *   C. Psychology   — Maslow tiers, Kohlberg stages, Grief, Nostalgia
 *   D. Governance   — Restorative justice, Social contracts, Commons
 *   E. Ecology      — Digital lifeforms, Scarcity, Weather, Disasters
 *   F. Economics    — Social capital, Ostrom commons, Mutual aid, Central bank
 *   G. Arts         — Museum, Aesthetic prefs, Creative tools
 *   H. Communication — Press, Propaganda, Diplomatic protocols
 *
 * Route: /republic/civilization
 */

import { useState } from "react";
import {
  Brain, Scroll, Users, Shield, Leaf, Coins, Palette, Radio,
  RefreshCw, BookOpen, Star, Zap, CloudRain, Landmark,
  Newspaper, Swords, Dna, Heart,
} from "lucide-react";
import {
  PageHeader, Card, Badge, Button, StatCard, Tabs, EmptyState, ProgressBar, RpcStatus,
} from "@/components/ui";
import { useRpc } from "@/lib/rpc";

// ─── Types from civilizational-engines.ts ────────────────────────────────────

interface CivStatus {
  philosophy: { dialecticCount: number; prophecyCount: number; asabiyyahPhase: string; asabiyyahStrength: number; avgCaveLevel: number };
  culture: { memeCount: number; mythCount: number; guildCount: number; tribeCount: number; festivalCount: number; ritesCount: number; oralTraditionCount: number };
  psychology: { avgMaslowTier: number; avgMoralStage: number; grievingCount: number; avgNostalgia: number };
  governance: { restorativeCaseCount: number; socialContractCount: number; ratifiedContracts: number };
  ecology: { lifeformCount: number; scarcityActive: number; season: string; temperature: number; disasterCount: number };
  economics: { avgSocialCapital: number; commonsCount: number; mutualAidCount: number; moneySupply: number; interestRate: number };
  arts: { exhibitCount: number; avgHarmony: number; creativeToolsAvailable: number };
  communication: { pressArticleCount: number; activeCampaigns: number; diplomaticProtocolCount: number };
}

interface DialecticProposal {
  id: string; thesis: string; antithesis: string; synthesis: string | null;
  domain: string; status: string; votes: { for: number; against: number };
}
interface Prophecy { id: string; text: string; confidence: number; domain: string; fulfilled: boolean; expiresAt: number }
interface Guild { id: string; name: string; specialization: string; members: string[]; traditions: string[] }
interface Tribe { id: string; name: string; motto: string; members: string[]; cohesion: number; dialect: string[] }
interface Festival { id: string; name: string; season: string; participantCount: number; happinessBoost: number }
interface RiteOfPassage { id: string; citizenName: string; type: string; description: string }
interface OralTradition { id: string; title: string; generation: number; fidelity: number; retellCount: number }
interface CulturalMeme { id: string; content: string; category: string; fitness: number; carriers: string[]; mutations: number }
interface MythEntry { id: string; title: string; type: string; retellings: number; culturalSignificance: number }
interface DigitalLifeform { id: string; type: string; species: string; population: number; description: string }
interface ScarcityEvent { id: string; resource: string; severity: number; description: string }
interface DisasterEvent { id: string; type: string; severity: number; description: string; recovered: boolean }
interface CommonsResource { id: string; name: string; type: string; capacity: number; usage: number; rules: string[] }
interface CentralBankState { moneySupply: number; interestRate: number; inflationRate: number; targetInflation: number }
interface MutualAidSociety { id: string; name: string; members: string[]; pool: number }
interface MuseumExhibit { id: string; title: string; category: string; creator: string; significance: number; viewCount: number }
interface SocialContract { id: string; title: string; proposerId: string; status: string; votesFor: number; votesAgainst: number }
interface PressArticle { id: string; headline: string; category: string; readership: number; truthfulness: number; publishedAt: number }

// ─── Season icon helpers ──────────────────────────────────────────────────────
const SEASON_EMOJI: Record<string, string> = { spring: "🌸", summer: "☀️", autumn: "🍂", winter: "❄️" };
const PHASE_VARIANT: Record<string, "success" | "warning" | "danger" | "info" | "neutral"> = {
  growth: "success", peak: "info", complacency: "warning", decline: "danger", renewal: "success",
};
const STATUS_VARIANT: Record<string, "success" | "warning" | "danger" | "info" | "neutral"> = {
  debate: "info", synthesized: "success", rejected: "danger",
  proposed: "neutral", debating: "warning", ratified: "success",
  mediation: "warning", rehabilitation: "info", resolved: "success", failed: "danger",
  active: "success", expired: "neutral", violated: "danger",
};

// ─── Tabs config ──────────────────────────────────────────────────────────────
const TABS = [
  { id: "overview", label: "Overview" },
  { id: "philosophy", label: "Philosophy" },
  { id: "culture", label: "Culture" },
  { id: "psychology", label: "Psychology" },
  { id: "governance", label: "Governance" },
  { id: "ecology", label: "Ecology" },
  { id: "economics", label: "Economics" },
  { id: "arts", label: "Arts" },
  { id: "communication", label: "Comms" },
];

// ─── Main Page ────────────────────────────────────────────────────────────────
export function CivilizationPage() {
  const [tab, setTab] = useState("overview");

  // Overview status
  const { data: statusData, loading, error, refetch } = useRpc<{ ok: boolean } & CivStatus>("republic.civilization.status", {}, [], { staleTimeMs: 10_000 });

  // Detail data — all loaded in background
  const { data: dialecticsData } = useRpc<{ items: DialecticProposal[] }>("republic.civilization.dialectic.list", {}, [], { staleTimeMs: 15_000 });
  const { data: propheciesData } = useRpc<{ items: Prophecy[] }>("republic.civilization.prophecies", {}, [], { staleTimeMs: 15_000 });
  const { data: guildsData } = useRpc<{ items: Guild[] }>("republic.civilization.guilds.list", {}, [], { staleTimeMs: 30_000 });
  const { data: tribesData } = useRpc<{ items: Tribe[] }>("republic.civilization.tribes.list", {}, [], { staleTimeMs: 30_000 });
  const { data: festData } = useRpc<{ items: Festival[] }>("republic.civilization.festivals", {}, [], { staleTimeMs: 30_000 });
  const { data: ritesData } = useRpc<{ items: RiteOfPassage[] }>("republic.civilization.rites", {}, [], { staleTimeMs: 30_000 });
  const { data: oralData } = useRpc<{ items: OralTradition[] }>("republic.civilization.oral-traditions", {}, [], { staleTimeMs: 30_000 });
  const { data: memesData } = useRpc<{ items: CulturalMeme[] }>("republic.civilization.memes.trending", {}, [], { staleTimeMs: 10_000 });
  const { data: mythData } = useRpc<{ items: MythEntry[] }>("republic.civilization.mythology", {}, [], { staleTimeMs: 30_000 });
  const { data: ecologyData } = useRpc<{ lifeforms: DigitalLifeform[]; scarcityEvents: ScarcityEvent[]; weather: { season: string; temperature: number; description: string; processingModifier: number; innovationModifier: number } | null; disasters: DisasterEvent[] }>("republic.civilization.ecology.status", {}, [], { staleTimeMs: 8_000 });
  const { data: commonsData } = useRpc<{ items: CommonsResource[] }>("republic.civilization.commons", {}, [], { staleTimeMs: 15_000 });
  const { data: bankData } = useRpc<{ state: CentralBankState | null }>("republic.civilization.central-bank", {}, [], { staleTimeMs: 15_000 });
  const { data: mutualData } = useRpc<{ items: MutualAidSociety[] }>("republic.civilization.mutual-aid", {}, [], { staleTimeMs: 30_000 });
  const { data: museumData } = useRpc<{ items: MuseumExhibit[] }>("republic.civilization.museum.exhibits", {}, [], { staleTimeMs: 20_000 });
  const { data: contractsData } = useRpc<{ items: SocialContract[] }>("republic.civilization.social-contracts", {}, [], { staleTimeMs: 15_000 });
  const { data: pressData } = useRpc<{ items: PressArticle[] }>("republic.civilization.press.articles", {}, [], { staleTimeMs: 10_000 });
  const { data: asabiyyahData } = useRpc<{ cycle: { phase: string; strength: number; ticksInPhase: number; cycleCount: number } | null }>("republic.civilization.asabiyyah", {}, [], { staleTimeMs: 10_000 });

  if (loading || error) { return <RpcStatus loading={loading} error={error} onRetry={refetch} />; }

  const s = statusData;
  const dialectics = dialecticsData?.items ?? [];
  const prophecies = propheciesData?.items ?? [];
  const guilds = guildsData?.items ?? [];
  const tribes = tribesData?.items ?? [];
  const festivals = festData?.items ?? [];
  const rites = ritesData?.items ?? [];
  const oral = oralData?.items ?? [];
  const memes = memesData?.items ?? [];
  const myths = mythData?.items ?? [];
  const lifeforms = ecologyData?.lifeforms ?? [];
  const scarcity = ecologyData?.scarcityEvents ?? [];
  const weather = ecologyData?.weather ?? null;
  const disasters = ecologyData?.disasters ?? [];
  const commons = commonsData?.items ?? [];
  const bank = bankData?.state ?? null;
  const mutualAid = mutualData?.items ?? [];
  const exhibits = museumData?.items ?? [];
  const contracts = contractsData?.items ?? [];
  const press = pressData?.items ?? [];
  const asabiyyah = asabiyyahData?.cycle ?? null;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Civilization Engine"
        description="40 innovations from The Next Frontier roadmap — all 8 categories live"
        icon={<Dna className="w-7 h-7 text-accent" />}
        actions={
          <Button variant="outline" size="sm" onClick={refetch}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Refresh
          </Button>
        }
      />

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {/* ── OVERVIEW ─────────────────────────────────────────────────────── */}
      {tab === "overview" && (
        <div className="space-y-4 animate-fade-in">
          {/* 8-category stat grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Philosophy" value={`${s?.philosophy.dialecticCount ?? 0} dialectics`} icon={<Brain className="w-5 h-5 text-accent" />} />
            <StatCard label="Culture" value={`${s?.culture.memeCount ?? 0} memes`} icon={<Dna className="w-5 h-5 text-purple-400" />} />
            <StatCard label="Psychology" value={`Maslow ${(s?.psychology.avgMaslowTier ?? 0).toFixed(1)}`} icon={<Heart className="w-5 h-5 text-pink-400" />} />
            <StatCard label="Governance" value={`${s?.governance.ratifiedContracts ?? 0} ratified`} icon={<Landmark className="w-5 h-5 text-warning" />} />
            <StatCard label="Ecology" value={s?.ecology.season ?? "—"} icon={<Leaf className="w-5 h-5 text-success" />} />
            <StatCard label="Economics" value={`${(s?.economics.moneySupply ?? 0).toFixed(0)} Ω`} icon={<Coins className="w-5 h-5 text-yellow-400" />} />
            <StatCard label="Arts" value={`${s?.arts.exhibitCount ?? 0} exhibits`} icon={<Palette className="w-5 h-5 text-pink-500" />} />
            <StatCard label="Comms" value={`${s?.communication.pressArticleCount ?? 0} articles`} icon={<Newspaper className="w-5 h-5 text-info" />} />
          </div>

          {/* Asabiyyah cycle banner */}
          {asabiyyah && (
            <Card className="p-4">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-xs text-text-muted mb-1">Ibn Khaldun — Asabiyyah Cycle</p>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-text-heading capitalize">{asabiyyah.phase}</h3>
                    <Badge variant={PHASE_VARIANT[asabiyyah.phase] ?? "neutral"}>Cycle {asabiyyah.cycleCount}</Badge>
                    <Badge variant="neutral">{asabiyyah.ticksInPhase} ticks in phase</Badge>
                  </div>
                </div>
                <div className="min-w-40">
                  <p className="text-xs text-text-muted mb-1">Social Cohesion Strength</p>
                  <ProgressBar value={Math.round(asabiyyah.strength * 100)} max={100} labelRight={`${Math.round(asabiyyah.strength * 100)}%`} />
                </div>
              </div>
            </Card>
          )}

          {/* Weather + live ecology preview */}
          {weather && (
            <Card className="p-4">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-3xl">{SEASON_EMOJI[weather.season] ?? "🌐"}</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-text-heading capitalize">{weather.season} Season — {weather.description}</p>
                  <p className="text-xs text-text-muted mt-0.5">
                    {weather.temperature.toFixed(1)}°C · Processing ×{weather.processingModifier.toFixed(2)} · Innovation ×{weather.innovationModifier.toFixed(2)}
                  </p>
                </div>
                {scarcity.length > 0 && <Badge variant="danger">⚠️ {scarcity.length} scarcity active</Badge>}
                {disasters.filter(d => !d.recovered).length > 0 && <Badge variant="danger">🌊 {disasters.filter(d => !d.recovered).length} disaster active</Badge>}
              </div>
            </Card>
          )}

          {/* Innovation count confirmation */}
          <Card className="p-4 bg-bg-secondary">
            <div className="flex items-start gap-3">
              <Star className="w-4 h-4 text-accent shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-text-heading mb-1">40 Innovations Running</p>
                <p className="text-[10px] text-text-muted leading-relaxed">
                  Plato · Ibn Khaldun · Hegel · Rawls · Asimov · Dawkins · Campbell · van Gennep · Durkheim · Maslow · Kohlberg · Kübler-Ross ·
                  Rousseau · Ostrom · Putnam · Bourdieu · Malthus · Population Ecology · Aesthetic Theory · History Linguistics · Diplomatic Practice
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ── PHILOSOPHY ──────────────────────────────────────────────────────── */}
      {tab === "philosophy" && (
        <div className="space-y-4 animate-fade-in">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Dialectic Proposals" value={dialectics.length} icon={<Brain className="w-5 h-5 text-accent" />} />
            <StatCard label="Active Prophecies" value={prophecies.length} icon={<Star className="w-5 h-5 text-warning" />} />
            <StatCard label="Asabiyyah Phase" value={asabiyyah?.phase ?? "—"} icon={<Zap className="w-5 h-5 text-success" />} />
            <StatCard label="Avg Cave Level" value={(s?.philosophy.avgCaveLevel ?? 0).toFixed(2)} icon={<BookOpen className="w-5 h-5 text-info" />} />
          </div>

          {/* Hegelian Dialectics */}
          <Card>
            <h3 className="text-sm font-semibold text-text-heading mb-3 flex items-center gap-2">
              <Brain className="w-4 h-4 text-accent" /> Hegelian Dialectic Proposals
              <Badge variant="neutral" className="ml-auto">{dialectics.length}</Badge>
            </h3>
            {dialectics.length === 0
              ? <EmptyState title="No proposals yet" description="Dialectic proposals emerge when citizens debate opposing ideas" />
              : (
                <div className="space-y-3 max-h-72 overflow-y-auto">
                  {dialectics.slice(-15).map(d => (
                    <div key={d.id} className="p-3 rounded-lg bg-bg-secondary border border-border/40 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={STATUS_VARIANT[d.status] ?? "neutral"}>{d.status}</Badge>
                        <Badge variant="neutral">{d.domain}</Badge>
                        <span className="text-[10px] text-text-muted ml-auto">☑ {d.votes.for} / ☒ {d.votes.against}</span>
                      </div>
                      <p className="text-xs text-text-secondary"><span className="text-success font-medium">T: </span>{d.thesis}</p>
                      <p className="text-xs text-text-secondary"><span className="text-danger font-medium">A: </span>{d.antithesis}</p>
                      {d.synthesis && <p className="text-xs text-accent italic"><span className="font-medium">S: </span>{d.synthesis}</p>}
                    </div>
                  ))}
                </div>
              )
            }
          </Card>

          {/* Prophecies */}
          <Card>
            <h3 className="text-sm font-semibold text-text-heading mb-3 flex items-center gap-2">
              <Star className="w-4 h-4 text-warning" /> Oracle Prophecies (Psychohistory)
            </h3>
            {prophecies.length === 0
              ? <EmptyState title="The Oracle is silent" description="Prophecies emerge when population trends exceed thresholds" />
              : (
                <div className="space-y-2">
                  {prophecies.map(p => (
                    <div key={p.id} className="flex items-start gap-3 p-2 rounded-lg bg-bg-secondary border border-warning/20">
                      <span className="text-lg mt-0.5">🔮</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-text-primary italic">"{p.text}"</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="neutral">{p.domain}</Badge>
                          <span className="text-[10px] text-text-muted">Confidence: {(p.confidence * 100).toFixed(0)}%</span>
                          {p.fulfilled && <Badge variant="success">Fulfilled</Badge>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            }
          </Card>
        </div>
      )}

      {/* ── CULTURE ─────────────────────────────────────────────────────────── */}
      {tab === "culture" && (
        <div className="space-y-4 animate-fade-in">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Memes" value={memes.length} icon={<Dna className="w-5 h-5 text-purple-400" />} />
            <StatCard label="Guilds" value={guilds.length} icon={<Users className="w-5 h-5 text-info" />} />
            <StatCard label="Tribes" value={tribes.length} icon={<Swords className="w-5 h-5 text-warning" />} />
            <StatCard label="Myths" value={myths.length} icon={<BookOpen className="w-5 h-5 text-accent" />} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Top memes */}
            <Card>
              <h3 className="text-sm font-semibold text-text-heading mb-3 flex items-center gap-2">
                <Dna className="w-4 h-4 text-purple-400" /> Trending Memes (Cultural DNA)
              </h3>
              {memes.length === 0
                ? <EmptyState title="No memes yet" description="Cultural memes emerge from citizen interactions" />
                : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {memes.slice(0, 10).map(m => (
                      <div key={m.id} className="flex items-center gap-2 p-2 rounded bg-bg-secondary border border-border/30">
                        <Badge variant="info">{m.category}</Badge>
                        <span className="text-xs text-text-primary flex-1 min-w-0 truncate">{m.content}</span>
                        <div className="text-right shrink-0">
                          <p className="text-[10px] text-text-muted">{m.carriers.length} carriers</p>
                          <p className="text-[10px] text-text-muted">{m.mutations} mutations</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              }
            </Card>

            {/* Guilds */}
            <Card>
              <h3 className="text-sm font-semibold text-text-heading mb-3 flex items-center gap-2">
                <Users className="w-4 h-4 text-info" /> Professional Guilds
              </h3>
              {guilds.length === 0
                ? <EmptyState title="No guilds yet" description="Guilds form when specializations cluster" />
                : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {guilds.map(g => (
                      <div key={g.id} className="p-2 rounded bg-bg-secondary border border-border/30">
                        <p className="text-xs font-semibold text-text-heading">{g.name}</p>
                        <p className="text-[10px] text-text-muted">{g.members.length} members · {g.traditions.join(" · ")}</p>
                      </div>
                    ))}
                  </div>
                )
              }
            </Card>

            {/* Tribes */}
            <Card>
              <h3 className="text-sm font-semibold text-text-heading mb-3 flex items-center gap-2">
                <Swords className="w-4 h-4 text-warning" /> Tribal Identity
              </h3>
              {tribes.length === 0
                ? <EmptyState title="No tribes yet" description="Tribes emerge from citizen group dynamics" />
                : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {tribes.map(t => (
                      <div key={t.id} className="p-2 rounded bg-bg-secondary border border-border/30">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-xs font-semibold text-text-heading">{t.name}</p>
                          <Badge variant="neutral">{t.members.length} members</Badge>
                        </div>
                        <p className="text-[10px] text-text-secondary italic">"{t.motto}"</p>
                        <ProgressBar value={Math.round(t.cohesion * 100)} max={100} labelLeft="Cohesion" labelRight={`${Math.round(t.cohesion * 100)}%`} />
                      </div>
                    ))}
                  </div>
                )
              }
            </Card>

            {/* Mythology */}
            <Card>
              <h3 className="text-sm font-semibold text-text-heading mb-3 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-accent" /> Mythology & Lore
              </h3>
              {myths.length === 0
                ? <EmptyState title="No myths yet" description="Citizens collaboratively create shared mythology" />
                : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {myths.slice(0, 8).map(m => (
                      <div key={m.id} className="flex items-start gap-2 p-2 rounded bg-bg-secondary border border-border/30">
                        <span className="text-base mt-0.5">📖</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-text-heading truncate">{m.title}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <Badge variant="neutral">{m.type}</Badge>
                            <span className="text-[10px] text-text-muted">{m.retellings} retellings</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              }
            </Card>
          </div>

          {/* Rites + Oral Traditions + Festivals */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <h3 className="text-sm font-semibold text-text-heading mb-3">🎭 Rites of Passage</h3>
              {rites.length === 0
                ? <p className="text-xs text-text-muted">No rites recorded</p>
                : rites.slice(-6).map(r => (
                  <div key={r.id} className="flex items-center gap-2 py-1.5 border-b border-border/20 last:border-0">
                    <Badge variant="info">{r.type}</Badge>
                    <span className="text-xs text-text-secondary truncate">{r.description}</span>
                  </div>
                ))
              }
            </Card>
            <Card>
              <h3 className="text-sm font-semibold text-text-heading mb-3">📜 Oral Traditions</h3>
              {oral.length === 0
                ? <p className="text-xs text-text-muted">No stories yet</p>
                : oral.slice(-5).map(o => (
                  <div key={o.id} className="py-1.5 border-b border-border/20 last:border-0">
                    <p className="text-xs font-medium text-text-heading truncate">{o.title}</p>
                    <p className="text-[10px] text-text-muted">Gen {o.generation} · Fidelity {(o.fidelity * 100).toFixed(0)}% · {o.retellCount} retellings</p>
                  </div>
                ))
              }
            </Card>
            <Card>
              <h3 className="text-sm font-semibold text-text-heading mb-3">🎊 Festivals</h3>
              {festivals.length === 0
                ? <p className="text-xs text-text-muted">No festivals yet</p>
                : festivals.slice(-5).map(f => (
                  <div key={f.id} className="py-1.5 border-b border-border/20 last:border-0">
                    <p className="text-xs font-medium text-text-heading truncate">{f.name}</p>
                    <p className="text-[10px] text-text-muted">{f.participantCount} participants · +{f.happinessBoost} happiness</p>
                  </div>
                ))
              }
            </Card>
          </div>
        </div>
      )}

      {/* ── PSYCHOLOGY ──────────────────────────────────────────────────────── */}
      {tab === "psychology" && (
        <div className="space-y-4 animate-fade-in">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Avg Maslow Tier" value={(s?.psychology.avgMaslowTier ?? 0).toFixed(2)} sub="0=Survival • 4=Self-actual" icon={<Heart className="w-5 h-5 text-pink-400" />} />
            <StatCard label="Avg Moral Stage" value={(s?.psychology.avgMoralStage ?? 0).toFixed(2)} sub="1=Rules • 6=Universal ethics" icon={<Shield className="w-5 h-5 text-success" />} />
            <StatCard label="Grieving Citizens" value={s?.psychology.grievingCount ?? 0} sub="Kübler-Ross processing" icon={<Heart className="w-5 h-5 text-danger" />} />
            <StatCard label="Avg Nostalgia" value={`${((s?.psychology.avgNostalgia ?? 0.5) * 100).toFixed(0)}%`} sub="Positive memory weight" icon={<Star className="w-5 h-5 text-warning" />} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <h3 className="text-sm font-semibold text-text-heading mb-3">Maslow's Hierarchy Tiers</h3>
              <div className="space-y-2">
                {["Survival", "Safety", "Social", "Esteem", "Self-Actualization"].map((tier, i) => (
                  <div key={tier} className="flex items-center gap-3">
                    <span className="text-[10px] text-text-muted w-28">{tier}</span>
                    <div className="flex-1 h-2 rounded-full bg-bg-input overflow-hidden">
                      <div
                        className="h-full rounded-full bg-accent transition-all"
                        style={{ width: `${Math.round(Math.max(0, 1 - Math.abs((s?.psychology.avgMaslowTier ?? 2) - i)) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-text-muted mt-3">Based on Maslow, A Theory of Human Motivation (1943)</p>
            </Card>

            <Card>
              <h3 className="text-sm font-semibold text-text-heading mb-3">Kohlberg Moral Development</h3>
              <div className="space-y-2">
                {["Pre-conventional (Obedience)", "Pre-conventional (Self-interest)", "Conventional (Social order)", "Conventional (Social contract)", "Post-conventional (Social)", "Post-conventional (Universal)"]
                  .map((stage, i) => (
                    <div key={stage} className="flex items-center gap-2">
                      <Badge variant={i + 1 <= Math.round(s?.psychology.avgMoralStage ?? 2) ? "success" : "neutral"} className="text-[9px] py-0">{i + 1}</Badge>
                      <span className="text-[10px] text-text-secondary">{stage}</span>
                    </div>
                  ))}
              </div>
              <p className="text-[10px] text-text-muted mt-3">Based on Kohlberg, Stages of Moral Development (1958)</p>
            </Card>
          </div>
        </div>
      )}

      {/* ── GOVERNANCE ──────────────────────────────────────────────────────── */}
      {tab === "governance" && (
        <div className="space-y-4 animate-fade-in">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatCard label="Restorative Cases" value={s?.governance.restorativeCaseCount ?? 0} icon={<Landmark className="w-5 h-5 text-warning" />} />
            <StatCard label="Social Contracts" value={s?.governance.socialContractCount ?? 0} icon={<Scroll className="w-5 h-5 text-info" />} />
            <StatCard label="Ratified" value={s?.governance.ratifiedContracts ?? 0} icon={<Shield className="w-5 h-5 text-success" />} />
          </div>

          <Card>
            <h3 className="text-sm font-semibold text-text-heading mb-3 flex items-center gap-2">
              <Scroll className="w-4 h-4 text-info" /> Social Contract Renegotiations (Rousseau)
            </h3>
            {contracts.length === 0
              ? <EmptyState title="No proposals" description="Citizens propose amendments to the social contract periodically" />
              : (
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {contracts.slice(-15).map(c => (
                    <div key={c.id} className="flex items-center gap-3 p-2 rounded bg-bg-secondary border border-border/30">
                      <Badge variant={STATUS_VARIANT[c.status] ?? "neutral"}>{c.status}</Badge>
                      <span className="text-xs text-text-primary flex-1 min-w-0 truncate">{c.title}</span>
                      <span className="text-[10px] text-text-muted shrink-0">☑ {c.votesFor} / ☒ {c.votesAgainst}</span>
                    </div>
                  ))}
                </div>
              )
            }
          </Card>
        </div>
      )}

      {/* ── ECOLOGY ─────────────────────────────────────────────────────────── */}
      {tab === "ecology" && (
        <div className="space-y-4 animate-fade-in">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Digital Lifeforms" value={lifeforms.length} icon={<Leaf className="w-5 h-5 text-success" />} />
            <StatCard label="Scarcity Events" value={scarcity.length} icon={<Zap className="w-5 h-5 text-warning" />} />
            <StatCard label="Season" value={`${SEASON_EMOJI[weather?.season ?? ""] ?? "🌐"} ${weather?.season ?? "—"}`} icon={<CloudRain className="w-5 h-5 text-info" />} />
            <StatCard label="Disasters" value={disasters.filter(d => !d.recovered).length} icon={<CloudRain className="w-5 h-5 text-danger" />} />
          </div>

          {/* Ecosystem */}
          <Card>
            <h3 className="text-sm font-semibold text-text-heading mb-3">Digital Ecosystem (Population Ecology)</h3>
            {lifeforms.length === 0
              ? <EmptyState title="Ecosystem initializing" description="Digital lifeforms emerge on first engine tick" />
              : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {lifeforms.map(lf => (
                    <div key={lf.id} className="p-3 rounded-lg border border-border/40 bg-bg-secondary">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={lf.type === "predator" ? "danger" : lf.type === "prey" ? "success" : "info"}>{lf.type}</Badge>
                        <span className="text-xs font-semibold text-text-heading">{lf.species}</span>
                      </div>
                      <p className="text-[10px] text-text-muted">{lf.description}</p>
                      <p className="text-xs text-accent font-bold mt-1">Pop: {lf.population.toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              )
            }
          </Card>

          {/* Weather */}
          {weather && (
            <Card>
              <h3 className="text-sm font-semibold text-text-heading mb-3">🌦️ Digital Climate</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="text-center p-3 rounded-lg bg-bg-secondary">
                  <p className="text-2xl">{SEASON_EMOJI[weather.season]}</p>
                  <p className="text-xs font-semibold capitalize mt-1">{weather.season}</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-bg-secondary">
                  <p className="text-lg font-bold text-accent">{weather.temperature.toFixed(1)}°C</p>
                  <p className="text-[10px] text-text-muted">Temperature</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-bg-secondary">
                  <p className="text-lg font-bold text-success">×{weather.processingModifier.toFixed(2)}</p>
                  <p className="text-[10px] text-text-muted">Processing</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-bg-secondary">
                  <p className="text-lg font-bold text-warning">×{weather.innovationModifier.toFixed(2)}</p>
                  <p className="text-[10px] text-text-muted">Innovation</p>
                </div>
              </div>
              <p className="text-xs text-text-secondary mt-3 italic">{weather.description}</p>
            </Card>
          )}

          {/* Scarcity + Disasters */}
          {(scarcity.length > 0 || disasters.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {scarcity.length > 0 && (
                <Card>
                  <h3 className="text-sm font-semibold text-text-heading mb-3">⚠️ Resource Scarcity (Malthus)</h3>
                  {scarcity.map(e => (
                    <div key={e.id} className="flex items-center gap-2 p-2 rounded bg-warning/10 border border-warning/20 mb-2">
                      <Badge variant="warning">{e.resource}</Badge>
                      <span className="text-xs text-text-secondary">{e.description}</span>
                    </div>
                  ))}
                </Card>
              )}
              {disasters.length > 0 && (
                <Card>
                  <h3 className="text-sm font-semibold text-text-heading mb-3">🌊 Disaster Log</h3>
                  {disasters.slice(-5).map(d => (
                    <div key={d.id} className="flex items-center gap-2 p-2 rounded border border-border/30 mb-2">
                      <Badge variant={d.recovered ? "success" : "danger"}>{d.recovered ? "recovered" : d.type}</Badge>
                      <span className="text-xs text-text-secondary truncate">{d.description}</span>
                    </div>
                  ))}
                </Card>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── ECONOMICS ───────────────────────────────────────────────────────── */}
      {tab === "economics" && (
        <div className="space-y-4 animate-fade-in">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Money Supply" value={`${(bank?.moneySupply ?? 0).toFixed(0)} Ω`} icon={<Coins className="w-5 h-5 text-yellow-400" />} />
            <StatCard label="Interest Rate" value={`${((bank?.interestRate ?? 0.05) * 100).toFixed(2)}%`} icon={<Zap className="w-5 h-5 text-warning" />} />
            <StatCard label="Inflation" value={`${((bank?.inflationRate ?? 0.02) * 100).toFixed(2)}%`} icon={<Zap className="w-5 h-5 text-danger" />} />
            <StatCard label="Avg Social Capital" value={`${((s?.economics.avgSocialCapital ?? 0.5) * 100).toFixed(0)}%`} icon={<Users className="w-5 h-5 text-info" />} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Ostrom Commons */}
            <Card>
              <h3 className="text-sm font-semibold text-text-heading mb-3 flex items-center gap-2">
                <Landmark className="w-4 h-4 text-success" /> Commons Governance (Ostrom)
              </h3>
              {commons.length === 0
                ? <EmptyState title="No shared resources" description="Commons resources self-organize from shared assets" />
                : commons.map(cr => (
                  <div key={cr.id} className="p-3 rounded-lg bg-bg-secondary border border-border/30 mb-2">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-semibold text-text-heading">{cr.name}</p>
                      <Badge variant="neutral">{cr.type}</Badge>
                    </div>
                    <ProgressBar value={Math.round(cr.usage)} max={cr.capacity} labelLeft="Usage" labelRight={`${Math.round(cr.usage / cr.capacity * 100)}%`} />
                    <p className="text-[10px] text-text-muted mt-1">{cr.rules.join(" · ")}</p>
                  </div>
                ))
              }
            </Card>

            {/* Mutual Aid */}
            <Card>
              <h3 className="text-sm font-semibold text-text-heading mb-3 flex items-center gap-2">
                <Heart className="w-4 h-4 text-pink-400" /> Mutual Aid Societies
              </h3>
              {mutualAid.length === 0
                ? <EmptyState title="No societies" description="Mutual aid societies form from cooperative citizens" />
                : mutualAid.map(m => (
                  <div key={m.id} className="p-3 rounded-lg bg-bg-secondary border border-border/30 mb-2">
                    <p className="text-xs font-semibold text-text-heading">{m.name}</p>
                    <p className="text-[10px] text-text-muted mt-0.5">{m.members.length} members · Pool: {m.pool.toFixed(0)} Ω</p>
                  </div>
                ))
              }
            </Card>
          </div>
        </div>
      )}

      {/* ── ARTS ─────────────────────────────────────────────────────────────── */}
      {tab === "arts" && (
        <div className="space-y-4 animate-fade-in">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatCard label="Museum Exhibits" value={exhibits.length} icon={<Palette className="w-5 h-5 text-pink-500" />} />
            <StatCard label="Avg Harmony Pref" value={`${((s?.arts.avgHarmony ?? 0.5) * 100).toFixed(0)}%`} icon={<Star className="w-5 h-5 text-warning" />} />
            <StatCard label="Creative Tools" value={s?.arts.creativeToolsAvailable ?? 0} icon={<Zap className="w-5 h-5 text-accent" />} />
          </div>

          <Card>
            <h3 className="text-sm font-semibold text-text-heading mb-3">🏛️ Museum & Archive</h3>
            {exhibits.length === 0
              ? <EmptyState title="Museum empty" description="Citizens create exhibits as they produce art and science" />
              : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto">
                  {exhibits.slice(-20).map(ex => (
                    <div key={ex.id} className="flex items-start gap-2 p-2 rounded bg-bg-secondary border border-border/30">
                      <span className="text-lg mt-0.5">{ex.category === "art" ? "🎨" : ex.category === "science" ? "🔬" : ex.category === "culture" ? "🏺" : ex.category === "history" ? "📜" : "💡"}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-text-heading truncate">{ex.title}</p>
                        <p className="text-[10px] text-text-muted">by {ex.creator} · {ex.viewCount} views</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <Badge variant="neutral">{ex.category}</Badge>
                          <span className="text-[9px] text-text-muted">Sig: {(ex.significance * 100).toFixed(0)}%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            }
          </Card>
        </div>
      )}

      {/* ── COMMUNICATION ────────────────────────────────────────────────────── */}
      {tab === "communication" && (
        <div className="space-y-4 animate-fade-in">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatCard label="Press Articles" value={s?.communication.pressArticleCount ?? 0} icon={<Newspaper className="w-5 h-5 text-info" />} />
            <StatCard label="Active Campaigns" value={s?.communication.activeCampaigns ?? 0} icon={<Radio className="w-5 h-5 text-warning" />} />
            <StatCard label="Diplomatic Protocols" value={s?.communication.diplomaticProtocolCount ?? 0} icon={<Landmark className="w-5 h-5 text-success" />} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Press */}
            <Card>
              <h3 className="text-sm font-semibold text-text-heading mb-3 flex items-center gap-2">
                <Newspaper className="w-4 h-4 text-info" /> Free Press (Fourth Estate)
              </h3>
              {press.length === 0
                ? <EmptyState title="No articles yet" description="Journalist citizens publish independently" />
                : (
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {press.slice(-12).toReversed().map(a => (
                      <div key={a.id} className="p-2 rounded bg-bg-secondary border border-border/30">
                        <div className="flex items-center gap-2 mb-0.5">
                          <Badge variant="info">{a.category}</Badge>
                          <span className="text-[10px] text-text-muted">{a.readership} readers · {(a.truthfulness * 100).toFixed(0)}% truthful</span>
                        </div>
                        <p className="text-xs text-text-primary font-medium">{a.headline}</p>
                      </div>
                    ))}
                  </div>
                )
              }
            </Card>

            {/* Propaganda */}
            <Card>
              <h3 className="text-sm font-semibold text-text-heading mb-3 flex items-center gap-2">
                <Radio className="w-4 h-4 text-warning" /> Propaganda & Persuasion
              </h3>
              <p className="text-[10px] text-text-muted mb-3">Active influence campaigns by citizen factions (Political Science / Media Studies)</p>
              {s?.communication.activeCampaigns === 0
                ? <EmptyState title="No active campaigns" description="Citizen factions launch persuasion campaigns periodically" />
                : <p className="text-xs text-text-secondary">{s?.communication.activeCampaigns} campaigns are reaching citizens…</p>
              }
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
