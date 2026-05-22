/**
 * Chat Feature — Markdown Table
 *
 * Reusable table renderer for pipe-delimited markdown tables.
 * Extracted from markdown.tsx per DDD component size limits.
 */

import React from "react";

export function MarkdownTable({ rows }: { rows: string[][] }) {
  if (rows.length < 2) {
    return null;
  }
  const header = rows[0] ?? [];
  const body = rows.slice(2); // skip header + separator row

  return (
    <div className="my-2 overflow-x-auto rounded-lg border border-border/40">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="bg-bg-secondary/60 border-b border-border/40">
            {header.map((cell, j) => (
              <th
                key={j}
                className="px-3 py-1.5 text-left font-semibold text-text-primary whitespace-nowrap"
              >
                {cell.trim()}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, i) => (
            <tr
              key={i}
              className={`border-b border-border/20 ${i % 2 === 0 ? "" : "bg-bg-secondary/20"}`}
            >
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-1.5 text-text-secondary whitespace-nowrap">
                  {cell.trim()}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
