/**
 * CustodianSearchFilterBar — search + status-chip filters + sort
 * dropdown for the CustodiansPanel (sub-PR 4c.4, Item 14).
 *
 * Real holds run 50-500 custodians. The vertical scroll-only list
 * doesn't scale; this bar keeps the list usable at customer size.
 *
 * Filter state lives in URL query params so users can bookmark
 * and share narrowed views (e.g. ?filter=overdue&q=marc). The
 * parent CustodiansPanel owns the URL <-> state sync via Next.js
 * router; this component just renders the controls.
 */
import React from "react";
import { C, F, M } from "@aegis/ui";

export type CustodianStatusFilter =
  | "all"
  | "acknowledged"
  | "pending"
  | "overdue"
  | "released"
  | "with-conflicts";

export type CustodianSortKey =
  | "recent-activity"
  | "name-asc"
  | "status"
  | "days-pending";

const STATUS_CHIPS: { key: CustodianStatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "acknowledged", label: "Acknowledged" },
  { key: "pending", label: "Pending" },
  { key: "overdue", label: "Overdue" },
  { key: "released", label: "Released" },
  { key: "with-conflicts", label: "With conflicts" },
];

const SORT_OPTIONS: { key: CustodianSortKey; label: string }[] = [
  { key: "recent-activity", label: "Most recent activity" },
  { key: "name-asc", label: "Name (A-Z)" },
  { key: "status", label: "Status" },
  { key: "days-pending", label: "Days pending" },
];

export interface CustodianSearchFilterBarProps {
  query: string;
  onQueryChange: (q: string) => void;
  statuses: Set<CustodianStatusFilter>;
  onToggleStatus: (s: CustodianStatusFilter) => void;
  sortKey: CustodianSortKey;
  onSortChange: (k: CustodianSortKey) => void;
  resultCount: number;
  totalCount: number;
}

export const CustodianSearchFilterBar: React.FC<CustodianSearchFilterBarProps> = ({
  query,
  onQueryChange,
  statuses,
  onToggleStatus,
  sortKey,
  onSortChange,
  resultCount,
  totalCount,
}) => {
  const filtered = resultCount !== totalCount;

  return (
    <div
      style={{
        display: "grid",
        gap: 8,
        margin: "10px 0",
        padding: "10px 12px",
        background: C.s1,
        border: `1px solid ${C.br}`,
        borderRadius: 4,
      }}
      role="search"
      aria-label="Custodian search and filter"
    >
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search by name or email…"
          aria-label="Search custodians"
          style={{
            flex: 1,
            minWidth: 220,
            background: C.cd,
            border: `1px solid ${C.br}`,
            color: C.t1,
            padding: "5px 10px",
            borderRadius: 4,
            fontFamily: M,
            fontSize: 11,
            outline: "none",
          }}
        />
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontFamily: M,
            fontSize: 10,
            color: C.t3,
            letterSpacing: 0.4,
            textTransform: "uppercase",
          }}
        >
          Sort
          <select
            value={sortKey}
            onChange={(e) =>
              onSortChange(e.target.value as CustodianSortKey)
            }
            style={{
              background: C.cd,
              border: `1px solid ${C.br}`,
              color: C.t1,
              padding: "4px 8px",
              borderRadius: 4,
              fontFamily: F,
              fontSize: 11,
              outline: "none",
            }}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          flexWrap: "wrap",
        }}
      >
        {STATUS_CHIPS.map((c) => {
          const active = statuses.has(c.key);
          return (
            <button
              type="button"
              key={c.key}
              onClick={() => onToggleStatus(c.key)}
              aria-pressed={active}
              style={{
                background: active ? C.bl : "transparent",
                border: `1px solid ${active ? C.bl : C.br}`,
                color: active ? C.bg : C.t2,
                padding: "3px 10px",
                borderRadius: 12,
                fontFamily: M,
                fontSize: 10,
                cursor: "pointer",
                letterSpacing: 0.3,
              }}
            >
              {c.label}
            </button>
          );
        })}
        <span style={{ flex: 1 }} />
        <span
          style={{
            fontFamily: M,
            fontSize: 10,
            color: filtered ? C.bl : C.t4,
            letterSpacing: 0.4,
          }}
        >
          {filtered
            ? `Showing ${resultCount} of ${totalCount} custodian${totalCount === 1 ? "" : "s"}`
            : `${totalCount} custodian${totalCount === 1 ? "" : "s"}`}
        </span>
      </div>
    </div>
  );
};
