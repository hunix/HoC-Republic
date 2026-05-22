import { Loader2 } from "lucide-react";
import { type ReactNode, type ButtonHTMLAttributes, type CSSProperties, forwardRef } from "react";

// ─── Hoisted static styles (avoid allocating new objects on every render) ─────

const HEADING_TEXT_SHADOW: CSSProperties = { textShadow: "0 1px 2px rgba(0,0,0,0.2)" };
const PAGE_HEADING_SHADOW: CSSProperties = { textShadow: "0 1px 3px rgba(0,0,0,0.15)" };
const PROGRESS_TRACK_STYLE: CSSProperties = { padding: 0, border: "none" };
const PROGRESS_GLOW = "inset 0 1px 0 rgba(255,255,255,0.2), 0 0 8px rgba(255,255,255,0.05)";
const SKELETON_NO_BORDER: CSSProperties = { border: "none" };

// ─── Card ────────────────────────────────────────────────────────

interface CardProps {
  children: ReactNode;
  className?: string;
  glass?: boolean;
  hover?: boolean;
  compact?: boolean;
  accent?: "blue" | "green" | "purple" | "amber";
  onClick?: () => void;
}

const accentBorders: Record<string, string> = {
  blue: "border-l-2 border-l-accent",
  green: "border-l-2 border-l-success",
  purple: "border-l-2 border-l-purple",
  amber: "border-l-2 border-l-warning",
};

export function Card({
  children,
  className = "",
  glass,
  hover = true,
  compact,
  accent,
  onClick,
}: CardProps) {
  return (
    <div
      onClick={onClick}
      className={`
        rounded-2xl ${compact ? "p-3.5" : "p-5"}
        ${glass ? "glass-regular" : "glass-thin"}
        ${hover ? "glass-float" : ""}
        ${onClick ? "cursor-pointer glass-press" : ""}
        ${accent ? accentBorders[accent] : ""}
        ${className}
      `}
    >
      {children}
    </div>
  );
}

// ─── Stat Card ───────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon?: ReactNode;
  trend?: "up" | "down" | "neutral";
  className?: string;
}

export function StatCard({ label, value, sub, icon, className = "" }: StatCardProps) {
  return (
    <Card compact className={`flex flex-col gap-1.5 ${className}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          {label}
        </span>
        {icon && <span className="text-text-muted opacity-60">{icon}</span>}
      </div>
      <div className="text-xl font-bold text-text-heading leading-none" style={HEADING_TEXT_SHADOW}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-text-muted">{sub}</div>}
    </Card>
  );
}

// ─── Badge ───────────────────────────────────────────────────────

type BadgeVariant = "success" | "warning" | "danger" | "info" | "purple" | "neutral";

const badgeStyles: Record<BadgeVariant, string> = {
  success: "bg-success/15 text-success border-success/20",
  warning: "bg-warning/15 text-warning border-warning/20",
  danger: "bg-danger/15 text-danger border-danger/20",
  info: "bg-info/15 text-info border-info/20",
  purple: "bg-purple/15 text-purple border-purple/20",
  neutral: "bg-[rgba(100,116,139,0.12)] text-text-muted border-[rgba(100,116,139,0.15)]",
};

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  dot?: boolean;
  className?: string;
}

export function Badge({ children, variant = "neutral", dot, className = "" }: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center gap-1.5 px-2 py-0.5
        rounded-full text-[10px] font-semibold tracking-wide
        border backdrop-blur-sm
        ${badgeStyles[variant]} ${className}
      `}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full bg-current`} />}
      {children}
    </span>
  );
}

// ─── Button ──────────────────────────────────────────────────────

export type BtnVariant = "primary" | "success" | "danger" | "warning" | "outline" | "ghost";

const btnStyles: Record<BtnVariant, string> = {
  primary: `bg-accent/85 text-white backdrop-blur-md border border-accent/30
     hover:bg-accent/95 hover:border-accent/50
     hover:shadow-[0_0_20px_var(--color-accent-glow),inset_0_1px_0_rgba(255,255,255,0.15)]`,
  success: `bg-success/85 text-white backdrop-blur-md border border-success/30
     hover:bg-success/95 hover:border-success/50`,
  danger: `bg-danger/85 text-white backdrop-blur-md border border-danger/30
     hover:bg-danger/95 hover:border-danger/50`,
  warning: `bg-warning/85 text-white backdrop-blur-md border border-warning/30
     hover:bg-warning/95 hover:border-warning/50`,
  outline: `bg-transparent backdrop-blur-sm border border-border/50 text-text-secondary
     hover:border-accent/50 hover:text-accent hover:bg-accent/8
     hover:shadow-[inset_0_1px_0_var(--color-glass-specular)]`,
  ghost: `bg-transparent text-text-secondary
     hover:text-text-primary hover:bg-glass-thin
     hover:backdrop-blur-sm`,
};

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: ReactNode;
}

const sizeStyles = {
  sm: "px-3.5 py-1.5 text-xs",
  md: "px-5 py-2.5 text-[13px]",
  lg: "px-6 py-3 text-sm",
};

export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button(
  { variant = "primary", size = "md", loading, icon, children, className = "", disabled, ...props },
  ref,
) {
  return (
    <button
      type="button"
      ref={ref}
      className={`
        inline-flex items-center justify-center gap-2
        rounded-[var(--radius-pill)] font-semibold
        transition-all duration-200 cursor-pointer
        active:scale-[0.97] active:transition-[transform_0.1s]
        disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100
        ${btnStyles[variant]} ${sizeStyles[size]} ${className}
      `}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : icon}
      {children}
    </button>
  );
});

// ─── Progress Bar ────────────────────────────────────────────────

interface ProgressBarProps {
  value: number;
  max?: number;
  labelLeft?: string;
  labelRight?: string;
  size?: "sm" | "md";
  className?: string;
}

function progressColor(pct: number): string {
  if (pct > 85) {
    return "from-danger to-red-400";
  }
  if (pct > 60) {
    return "from-warning to-amber-400";
  }
  return "from-success to-emerald-400";
}

export function ProgressBar({
  value,
  max = 100,
  labelLeft,
  labelRight,
  size = "sm",
  className = "",
}: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className={className}>
      {(labelLeft || labelRight) && (
        <div className="flex justify-between text-xs text-text-muted mb-1">
          <span>{labelLeft}</span>
          <span>{labelRight}</span>
        </div>
      )}
      <div
        className={`w-full rounded-full overflow-hidden glass-thin ${size === "sm" ? "h-2" : "h-3"}`}
        style={PROGRESS_TRACK_STYLE}
      >
        <div
          className={`h-full rounded-full bg-gradient-to-r ${progressColor(pct)} transition-all duration-500 ease-out`}
          style={{
            width: `${pct}%`,
            boxShadow: pct > 0 ? PROGRESS_GLOW : "none",
          }}
        />
      </div>
    </div>
  );
}

// ─── Page Header ─────────────────────────────────────────────────

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ title, description, icon, actions }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-5 animate-fade-in">
      <div className="flex items-center gap-2.5">
        {icon && <span className="text-accent opacity-70">{icon}</span>}
        <div>
          <h1 className="text-lg font-semibold text-text-heading" style={PAGE_HEADING_SHADOW}>
            {title}
          </h1>
          {description && <p className="text-xs text-text-muted mt-0.5">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

// ─── Empty State ─────────────────────────────────────────────────

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center animate-fade-in">
      {icon && (
        <div className="text-4xl text-text-muted/50 mb-3 p-4 rounded-2xl glass-thin">{icon}</div>
      )}
      <h3 className="text-lg font-semibold text-text-secondary mb-1">{title}</h3>
      {description && <p className="text-sm text-text-muted max-w-md">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ─── Alert ───────────────────────────────────────────────────────

type AlertVariant = "info" | "success" | "warning" | "danger";

const alertStyles: Record<AlertVariant, string> = {
  info: "bg-info/8 border-info/40 text-info",
  success: "bg-success/8 border-success/40 text-success",
  warning: "bg-warning/8 border-warning/40 text-warning",
  danger: "bg-danger/8 border-danger/40 text-danger",
};

interface AlertProps {
  variant?: AlertVariant;
  children: ReactNode;
  className?: string;
}

export function Alert({ variant = "info", children, className = "" }: AlertProps) {
  return (
    <div
      className={`
        px-4 py-3 rounded-xl border-l-4 text-[13px] mb-4
        backdrop-blur-sm
        ${alertStyles[variant]} ${className}
      `}
    >
      {children}
    </div>
  );
}

// ─── Tabs ────────────────────────────────────────────────────────

interface Tab {
  id: string;
  label: string;
  icon?: ReactNode;
  count?: number;
}

interface TabsProps {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}

export function Tabs({ tabs, active, onChange, className = "" }: TabsProps) {
  function handleKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, idx: number) {
    let next = idx;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      next = (idx + 1) % tabs.length;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      next = (idx - 1 + tabs.length) % tabs.length;
    } else if (e.key === "Home") {
      next = 0;
    } else if (e.key === "End") {
      next = tabs.length - 1;
    } else {
      return;
    }
    e.preventDefault();
    onChange(tabs[next]!.id);
    const container = e.currentTarget.parentElement;
    const buttons = container?.querySelectorAll<HTMLButtonElement>("button[role='tab']");
    buttons?.[next]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label="Page sections"
      className={`flex items-center gap-1 glass-regular rounded-2xl p-1.5 ${className}`}
    >
      {tabs.map((tab, idx) => (
        <button
          type="button"
          role="tab"
          key={tab.id}
          id={`tab-${tab.id}`}
          aria-selected={active === tab.id}
          aria-controls={`tabpanel-${tab.id}`}
          tabIndex={active === tab.id ? 0 : -1}
          onClick={() => onChange(tab.id)}
          onKeyDown={(e) => handleKeyDown(e, idx)}
          className={`
            flex items-center gap-2 px-4 py-2
            rounded-xl text-[13px] font-medium
            transition-all duration-300 cursor-pointer
            ${
              active === tab.id
                ? "glass-thick text-text-primary shadow-sm"
                : "text-text-muted hover:text-text-secondary hover:bg-glass-thin"
            }
          `}
        >
          {tab.icon}
          {tab.label}
          {tab.count !== undefined && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-accent/20 text-accent border border-accent/10">
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse glass-thin rounded-lg ${className}`}
      style={SKELETON_NO_BORDER}
    />
  );
}

// ─── Shared interactive components ───────────────────────────────
export { ConfirmDialog } from "./ConfirmDialog";
export { DetailModal } from "./DetailModal";
export { PreviewModal } from "./PreviewModal";
export { RpcStatus } from "./RpcStatus";
export { SortableHeader, sortBy } from "./SortableHeader";
export type { SortDir } from "./SortableHeader";
export { PluginBadge, PluginBadgeRow } from "./PluginBadge";

// ─── Mini Chart (Sparkline) ──────────────────────────────────────

interface MiniChartProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}

export function MiniChart({
  data,
  width = 64,
  height = 20,
  color = "var(--color-accent)",
  className = "",
}: MiniChartProps) {
  if (!data.length) {
    return null;
  }
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");
  const fillPoints = `0,${height} ${points} ${width},${height}`;
  return (
    <svg
      width={width}
      height={height}
      className={`inline-block ${className}`}
      viewBox={`0 0 ${width} ${height}`}
    >
      <polygon points={fillPoints} fill={color} opacity={0.1} />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── Inline Stat ─────────────────────────────────────────────────

interface InlineStatProps {
  label: string;
  value: string | number;
  icon?: ReactNode;
  spark?: number[];
}

export function InlineStat({ label, value, icon, spark }: InlineStatProps) {
  return (
    <div className="flex items-center gap-3 py-2">
      {icon && <span className="text-text-muted opacity-60">{icon}</span>}
      <span className="text-lg font-bold text-text-heading tabular-nums">{value}</span>
      <span className="text-[11px] text-text-muted">{label}</span>
      {spark && <MiniChart data={spark} />}
    </div>
  );
}

// ─── Data Table ──────────────────────────────────────────────────

interface DataTableColumn<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  className?: string;
  sortable?: boolean;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  keyFn: (row: T) => string;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  compact?: boolean;
}

export function DataTable<T>({
  columns,
  data,
  keyFn,
  onRowClick,
  emptyMessage = "No data",
  compact,
}: DataTableProps<T>) {
  if (data.length === 0) {
    return <div className="text-center text-sm text-text-muted py-8">{emptyMessage}</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border/30">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`text-left text-[10px] font-semibold uppercase tracking-wider text-text-muted py-2 px-3 ${col.className ?? ""}`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr
              key={keyFn(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`
                border-b border-border/15 last:border-0
                ${onRowClick ? "cursor-pointer hover:bg-bg-card-hover/50" : ""}
                transition-colors duration-150
              `}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`${compact ? "py-2" : "py-2.5"} px-3 text-sm ${col.className ?? ""}`}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
