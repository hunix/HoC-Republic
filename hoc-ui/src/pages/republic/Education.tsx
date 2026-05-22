import { GraduationCap, BookOpen, Award, TrendingUp, RefreshCw } from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader, Card, Badge, Button, StatCard, ProgressBar , RpcStatus } from "@/components/ui";
import { useRpc } from "@/lib/rpc";

const SKILL_DATA = [
  { name: "Engineering", value: 35, color: "#6366f1" },
  { name: "Science", value: 28, color: "#06b6d4" },
  { name: "Arts", value: 18, color: "#f59e0b" },
  { name: "Commerce", value: 12, color: "#10b981" },
  { name: "Governance", value: 7, color: "#8b5cf6" },
];

const GRAD_DATA = [
  { month: "Sep", grads: 12 },
  { month: "Oct", grads: 19 },
  { month: "Nov", grads: 23 },
  { month: "Dec", grads: 15 },
  { month: "Jan", grads: 31 },
  { month: "Feb", grads: 28 },
];

const TRACKS = [
  { name: "Advanced Engineering", enrolled: 48, capacity: 60, level: "Elite", progress: 0.72 },
  { name: "AI Mastery Program", enrolled: 35, capacity: 40, level: "Elite", progress: 0.6 },
  { name: "Governance & Law", enrolled: 22, capacity: 30, level: "Intermediate", progress: 0.85 },
  { name: "Economics & Trade", enrolled: 29, capacity: 35, level: "Intermediate", progress: 0.55 },
  { name: "Creative Arts", enrolled: 18, capacity: 25, level: "Foundation", progress: 0.4 },
];

const TOP_STUDENTS = [
  { name: "Aria-7", track: "Advanced Engineering", gpa: 4.0, medals: 3 },
  { name: "Nova-12", track: "AI Mastery Program", gpa: 3.95, medals: 2 },
  { name: "Bolt-5", track: "Governance & Law", gpa: 3.88, medals: 1 },
  { name: "Cleo-9", track: "Economics & Trade", gpa: 3.82, medals: 2 },
];

export function EducationPage() {
  const { data, refetch, loading, error } = useRpc<{
    skillData?: typeof SKILL_DATA;
    gradData?: typeof GRAD_DATA;
    tracks?: typeof TRACKS;
    topStudents?: typeof TOP_STUDENTS;
    totalStudents?: number;
    graduatesThisMonth?: number;
    avgGpa?: number;
  }>("republic.education.status", {});
  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }
  const skillData = data?.skillData ?? SKILL_DATA;
  const gradData = data?.gradData ?? GRAD_DATA;
  const tracks = data?.tracks ?? TRACKS;
  const topStudents = data?.topStudents ?? TOP_STUDENTS;
  const totalStudents = data?.totalStudents ?? tracks.reduce((s, t) => s + t.enrolled, 0);
  const graduatesThisMonth =
    data?.graduatesThisMonth ?? GRAD_DATA[GRAD_DATA.length - 1]?.grads ?? 0;
  const avgGpa =
    data?.avgGpa ??
    +(TOP_STUDENTS.reduce((s, s2) => s + s2.gpa, 0) / TOP_STUDENTS.length).toFixed(2);
  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Education"
        description="Curriculum tracks, graduate statistics, and citizen learning programs"
        icon={<GraduationCap size={28} />}
        actions={
          <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={refetch}>
            Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          label="Total Enrolled"
          value={totalStudents}
          icon={<BookOpen size={16} />}
          sub="Across all tracks"
        />
        <StatCard
          label="Graduates This Month"
          value={graduatesThisMonth}
          icon={<GraduationCap size={16} />}
        />
        <StatCard
          label="Active Tracks"
          value={tracks.length}
          icon={<Award size={16} />}
          sub={`${tracks.filter((t) => t.level === "Elite").length} elite`}
        />
        <StatCard
          label="Avg GPA"
          value={avgGpa}
          icon={<TrendingUp size={16} />}
          sub="Top quartile"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Skill Distribution Pie */}
        <Card>
          <h3 className="font-semibold text-text-heading mb-4">🧠 Skill Distribution</h3>
          <div className="flex items-center gap-4">
            <ResponsiveContainer width={180} height={180}>
              <PieChart>
                <Pie
                  data={skillData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  dataKey="value"
                  paddingAngle={3}
                >
                  {skillData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number | undefined) => [`${v ?? 0}%`, "Share"]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2 flex-1">
              {SKILL_DATA.map((s) => (
                <div key={s.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
                    <span className="text-text-secondary">{s.name}</span>
                  </div>
                  <span className="font-semibold text-text-heading">{s.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Monthly Graduates */}
        <Card>
          <h3 className="font-semibold text-text-heading mb-4">📈 Monthly Graduates</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={gradData}>
              <XAxis
                dataKey="month"
                tick={{ fill: "#64748b", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{
                  background: "#1e293b",
                  border: "1px solid #334155",
                  borderRadius: 8,
                }}
              />
              <Bar dataKey="grads" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Curriculum Tracks */}
      <Card>
        <h3 className="font-semibold text-text-heading mb-4">📚 Curriculum Tracks</h3>
        <div className="space-y-4">
          {TRACKS.map((t) => (
            <div key={t.name}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-text-heading">{t.name}</span>
                  <Badge
                    variant={
                      t.level === "Elite"
                        ? "purple"
                        : t.level === "Intermediate"
                          ? "info"
                          : "neutral"
                    }
                  >
                    {t.level}
                  </Badge>
                </div>
                <span className="text-xs text-text-muted">
                  {t.enrolled} / {t.capacity} enrolled
                </span>
              </div>
              <ProgressBar value={t.enrolled} max={t.capacity} />
            </div>
          ))}
        </div>
      </Card>

      {/* Top Students */}
      <Card>
        <h3 className="font-semibold text-text-heading mb-4">🏆 Top Students</h3>
        <div className="divide-y divide-border/20">
          {topStudents.map((s, i) => (
            <div key={s.name} className="flex items-center gap-4 py-3">
              <span className="w-6 h-6 rounded-full bg-accent/20 text-accent text-xs font-bold flex items-center justify-center">
                {i + 1}
              </span>
              <div className="flex-1">
                <p className="font-medium text-text-heading text-sm">{s.name}</p>
                <p className="text-xs text-text-muted">{s.track}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-success text-sm">GPA {s.gpa}</p>
                <p className="text-xs text-text-muted">🏅 {s.medals} medals</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
