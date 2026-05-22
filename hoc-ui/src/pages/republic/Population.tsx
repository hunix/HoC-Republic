import {
  Users,
  Search,
  Heart,
  Brain,
  Zap,
  Star,
  Shield,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { PageHeader, Card, Badge, ProgressBar, StatCard, Button, RpcStatus } from "@/components/ui";
import { useRpc } from "@/lib/rpc";

const TABLE_PAGE_SIZE = 50;
const COLORS = ["#3b82f6", "#8b5cf6", "#06b6d4", "#f59e0b", "#10b981", "#ef4444"];

interface CitizenFull {
  id: string;
  name: string;
  generation: number;
  specialization: string;
  activity: string;
  energy: number;
  happiness: number;
  health: number;
  credits: number;
  age: number;
  skillCount: number;
  skills: string[];
  familySize: number;
  genomeId?: string | null;
  personality?: {
    openness?: number;
    conscientiousness?: number;
    extraversion?: number;
    agreeableness?: number;
    neuroticism?: number;
  };
  relationships?: Array<{ citizenId: string; citizenName: string; type: string; strength: number }>;
  partnerId?: string | null;
  maritalStatus?: string;
  children?: string[];
  parentIds?: string[];
  mood?: string;
  goals?: Array<{ id: string; description: string; priority?: string; progress?: number }>;
  xp?: number;
  level?: number;
  intelligence?: number;
  masteryLevel?: number;
  autonomyScore?: number;
  skillProficiency?: Record<string, number>;
  learningRate?: number;
  role?: string;
  status: string;
  projects?: number;
  tasksCompleted?: number;
}

export function PopulationPage() {
  const { data, loading, error, refetch } = useRpc<{
    citizens?: CitizenFull[];
    stats?: {
      total: number;
      totalFiltered: number;
      active: number;
      hibernated: number;
      specializationDistribution?: Record<string, number>;
      activityDistribution?: Record<string, number>;
    };
  }>("republic.population.list", { limit: 1000 });

  const citizens = data?.citizens ?? [];
  const totalFromServer = data?.stats?.total ?? citizens.length;

  // Backend returns specializationDistribution as Record<string,number> — convert to chart arrays
  const specDist = data?.stats?.specializationDistribution ?? {};
  const roleDistribution: { name: string; value: number }[] = Object.entries(specDist)
    .map(([name, value]) => ({ name, value }))
    .toSorted((a, b) => b.value - a.value)
    .slice(0, 8); // top 8 roles for readability

  // Derive skill bar from top specializations weighted by avg intelligence
  const skillDistribution: { skill: string; avg: number }[] = roleDistribution
    .slice(0, 6)
    .map(({ name }) => ({
      skill: name,
      avg:
        Math.round(
          citizens
            .filter((c) => c.specialization === name)
            .reduce((sum, c, _i, arr) => sum + (c.intelligence ?? 50) / arr.length, 0),
        ) || 50,
    }));

  const active = data?.stats?.active ?? citizens.filter((c) => c.activity !== "Sleeping").length;
  const elite = citizens.filter((c) => (c.intelligence ?? 0) > 85).length;
  const projects = citizens.reduce((s, c) => s + (c.projects ?? 0), 0);
  const [search, setSearch] = useState("");
  const [tablePage, setTablePage] = useState(0);
  const navigate = useNavigate();

  const openDetail = (id: string) => navigate(`/republic/citizens/${id}`);
  const openNewTab = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    window.open(`/republic/citizens/${id}`, "_blank");
  };

  const filtered = search
    ? citizens.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    : citizens;
  const totalTablePages = Math.max(1, Math.ceil(filtered.length / TABLE_PAGE_SIZE));
  const tablePageClamped = Math.min(tablePage, totalTablePages - 1);
  const pageRows = filtered.slice(
    tablePageClamped * TABLE_PAGE_SIZE,
    (tablePageClamped + 1) * TABLE_PAGE_SIZE,
  );

  return (
    <div className="animate-slide-up space-y-6">
      <RpcStatus loading={loading} error={error} onRetry={refetch} />
      <PageHeader
        title="Population"
        description={`${totalFromServer.toLocaleString()} citizens of the republic — click any citizen to view their full profile`}
        icon={<Users size={28} />}
        actions={
          <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={refetch}>
            Refresh
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Citizens"
          value={totalFromServer.toLocaleString()}
          sub="Active population"
          icon={<Users size={16} />}
        />
        <StatCard
          label="Active Now"
          value={active}
          sub={`${citizens.length > 0 ? Math.round((active / citizens.length) * 100) : 0}% engagement`}
          icon={<Zap size={16} />}
        />
        <StatCard label="Elite Citizens" value={elite} sub="IQ > 85" icon={<Star size={16} />} />
        <StatCard
          label="Active Projects"
          value={projects}
          sub="Across all citizens"
          icon={<Heart size={16} />}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <h3 className="text-sm font-semibold text-text-heading mb-4">Role Distribution</h3>
          <div className="h-52 flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={roleDistribution}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  innerRadius={50}
                  dataKey="value"
                  label={({ name }) => name}
                >
                  {roleDistribution.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "#1a2332",
                    border: "1px solid #1e2d42",
                    borderRadius: "8px",
                    color: "#f0f4f8",
                    fontSize: "12px",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <h3 className="text-sm font-semibold text-text-heading mb-4">Average Skills</h3>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={skillDistribution} layout="vertical">
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  tick={{ fill: "#64748b", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="skill"
                  width={80}
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "#1a2332",
                    border: "1px solid #1e2d42",
                    borderRadius: "8px",
                    color: "#f0f4f8",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="avg" fill="#3b82f6" radius={[0, 6, 6, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Citizens Table */}
      <Card hover={false}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-text-heading">
            Citizens{" "}
            <span className="text-text-muted font-normal text-xs">
              ({tablePageClamped * TABLE_PAGE_SIZE + 1}–
              {Math.min((tablePageClamped + 1) * TABLE_PAGE_SIZE, filtered.length)} of{" "}
              {filtered.length.toLocaleString()}) · click a row to view full profile
            </span>
          </h3>
          <div className="relative w-64">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setTablePage(0);
              }}
              placeholder="Search citizens..."
              className="w-full bg-bg-input border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted outline-none focus:border-border-focus transition-all"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                {[
                  "Citizen",
                  "Role",
                  "Intelligence",
                  "Autonomy",
                  "Mastery",
                  "Status",
                  "Projects",
                ].map((h) => (
                  <th
                    key={h}
                    className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted border-b border-border"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-text-muted">
                    {citizens.length === 0
                      ? "No citizens found. The republic simulation may not be running."
                      : "No citizens match your search."}
                  </td>
                </tr>
              ) : (
                pageRows.map((c) => (
                  <tr
                    key={c.id}
                    className="hover:bg-accent/5 transition-colors cursor-pointer border-b border-border/20 last:border-0 group"
                    onClick={() => openDetail(c.id)}
                    title="Click to view full profile"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent to-purple flex items-center justify-center text-white text-xs font-bold">
                          {c.name.charAt(0)}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-text-primary">{c.name}</div>
                          <div className="text-[11px] text-text-muted">{c.activity}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="purple">{c.role ?? c.specialization}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Brain size={12} className="text-accent" />
                        <ProgressBar value={Math.min(Math.round(c.intelligence ?? 0), 100)} className="w-20" size="sm" />
                        <span className="text-xs text-text-muted w-6">{Math.round(c.intelligence ?? 0)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Zap size={12} className="text-warning" />
                        <ProgressBar
                          value={Math.round((c.autonomyScore ?? 0) * 100)}
                          className="w-20"
                          size="sm"
                        />
                        <span className="text-xs text-text-muted w-6">
                          {Math.round((c.autonomyScore ?? 0) * 100)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Shield size={12} className="text-success" />
                        <ProgressBar
                          value={Math.round((c.masteryLevel ?? 0) * 100)}
                          className="w-20"
                          size="sm"
                        />
                        <span className="text-xs text-text-muted w-6">
                          {Math.round((c.masteryLevel ?? 0) * 100)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={c.activity !== "Sleeping" ? "success" : "neutral"}>
                        {c.activity !== "Sleeping" ? "active" : "sleeping"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-text-secondary">
                      <div className="flex items-center gap-2">
                        <span>{c.projects}</span>
                        <button
                          type="button"
                          title="Open in new tab"
                          aria-label="Open citizen in new tab"
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:text-accent text-text-muted"
                          onClick={(e) => openNewTab(e, c.id)}
                        >
                          <svg
                            width="11"
                            height="11"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                          >
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15,3 21,3 21,9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        {totalTablePages > 1 && (
          <div className="flex items-center justify-between pt-3 border-t border-border/30">
            <Button
              variant="outline"
              size="sm"
              icon={<ChevronLeft size={14} />}
              disabled={tablePageClamped === 0}
              onClick={() => setTablePage((p) => Math.max(0, p - 1))}
            >
              Prev
            </Button>
            <span className="text-xs text-text-muted">
              Page {tablePageClamped + 1} / {totalTablePages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={tablePageClamped >= totalTablePages - 1}
              onClick={() => setTablePage((p) => Math.min(totalTablePages - 1, p + 1))}
            >
              Next <ChevronRight size={14} className="ml-1" />
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
