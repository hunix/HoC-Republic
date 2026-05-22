/**
 * SortableHeader — a table <th> that toggles asc/desc sort on click.
 * Usage:
 *   <SortableHeader col="name" sortKey={sortKey} sortDir={sortDir} onSort={setSort} label="Name" />
 */
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

export type SortDir = "asc" | "desc";

interface Props<K extends string> {
  col: K;
  label: string;
  sortKey: K | null;
  sortDir: SortDir;
  onSort: (key: K, dir: SortDir) => void;
  className?: string;
}

export function SortableHeader<K extends string>({
  col,
  label,
  sortKey,
  sortDir,
  onSort,
  className = "",
}: Props<K>) {
  const active = sortKey === col;
  const Icon = active ? (sortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th
      className={`text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-text-muted border-b border-border cursor-pointer select-none hover:text-text-primary transition-colors ${className}`}
      onClick={() => onSort(col, active && sortDir === "asc" ? "desc" : "asc")}
    >
      <span className="flex items-center gap-1">
        {label}
        <Icon size={11} className={active ? "text-accent" : "opacity-40"} />
      </span>
    </th>
  );
}

/** Sort an array by a key with asc/desc direction */
export function sortBy<T>(arr: T[], key: keyof T | null, dir: SortDir): T[] {
  if (!key) {
    return arr;
  }
  return arr.toSorted((a: T, b: T) => {
    const av = a[key];
    const bv = b[key];
    if (av == null && bv == null) {
      return 0;
    }
    if (av == null) {
      return 1;
    }
    if (bv == null) {
      return -1;
    }
    const cmp =
      typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).localeCompare(String(bv), undefined, { numeric: true });
    return dir === "asc" ? cmp : -cmp;
  });
}
