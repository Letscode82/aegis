/**
 * HoldStatusRow — three lines of structured counts under the
 * header strip. Reads from the workspace-summary endpoint so we
 * don't re-walk custodians + sources client-side.
 *
 * Cyber-Response density: dot-separators, monospace numerics,
 * inline status colour where applicable (overdue ack count is red,
 * preservation conflict count is red, etc.).
 */
import React from "react";
import { Card, C, F, M } from "@aegis/ui";
import type { HoldWorkspaceSummaryDTO } from "./types";

export interface HoldStatusRowProps {
  summary: HoldWorkspaceSummaryDTO | null;
  /**
   * Click handler for the "Last activity" affordance. Wired by
   * HoldDetailPage to open TimelineFullStreamModal scrolled to the
   * most recent event. Optional so the row stays renderable as a
   * display-only component (Storybook, unit tests).
   */
  onOpenLastActivity?: () => void;
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "never";
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "—";
  const deltaSec = Math.floor((Date.now() - ts) / 1000);
  if (deltaSec < 60) return "just now";
  if (deltaSec < 3600) return `${Math.floor(deltaSec / 60)}m ago`;
  if (deltaSec < 86400) return `${Math.floor(deltaSec / 3600)}h ago`;
  if (deltaSec < 86400 * 7) return `${Math.floor(deltaSec / 86400)}d ago`;
  return new Date(iso).toISOString().slice(0, 10);
}

function formatDueIn(iso: string | null): string {
  if (!iso) return "—";
  const ts = new Date(iso).getTime();
  const delta = ts - Date.now();
  if (delta < 0) return "overdue";
  const days = Math.ceil(delta / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days}d`;
}

const Cell: React.FC<{ value: React.ReactNode; color?: string }> = ({
  value,
  color,
}) => (
  <span
    style={{
      fontFamily: M,
      fontSize: 11,
      color: color ?? C.t1,
      fontWeight: 600,
      letterSpacing: 0.4,
    }}
  >
    {value}
  </span>
);

const Sep: React.FC = () => (
  <span
    style={{
      color: C.t4,
      margin: "0 8px",
      fontFamily: M,
      fontSize: 10,
    }}
    aria-hidden="true"
  >
    ·
  </span>
);

export const HoldStatusRow: React.FC<HoldStatusRowProps> = ({
  summary,
  onOpenLastActivity,
}) => {
  if (!summary) {
    return (
      <Card>
        <div style={{ color: C.t3, fontFamily: M, fontSize: 11 }}>Loading…</div>
      </Card>
    );
  }
  const { counts, lastActivityAt, nextReminderDueAt, cadenceDays } = summary;
  const overdueColor = counts.custodiansOverdue > 0 ? C.rd : C.t3;
  const conflictColor = counts.dataSourcesConflict > 0 ? C.rd : C.t3;

  return (
    <Card style={{ paddingTop: 10, paddingBottom: 10 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: 6,
          fontFamily: F,
          fontSize: 10.5,
          color: C.t2,
        }}
      >
        <Line>
          <Cell value={counts.custodians} /> custodian
          {counts.custodians === 1 ? "" : "s"}
          <Sep />
          <Cell value={counts.custodiansAcknowledged} color={C.gn} /> acknowledged
          <Sep />
          <Cell value={counts.custodiansPending} color={C.am} /> pending
          <Sep />
          <Cell value={counts.custodiansOverdue} color={overdueColor} /> overdue
          {counts.custodiansReleased > 0 && (
            <>
              <Sep />
              <Cell value={counts.custodiansReleased} color={C.t4} /> released
            </>
          )}
          {counts.custodiansDeparted > 0 && (
            <>
              <Sep />
              <Cell value={counts.custodiansDeparted} color={C.rd} /> departed
            </>
          )}
        </Line>
        <Line>
          <Cell value={counts.dataSources} /> data source
          {counts.dataSources === 1 ? "" : "s"}
          <Sep />
          <Cell value={counts.dataSourcesPreserved} color={C.gn} /> preserved
          <Sep />
          <Cell value={counts.dataSourcesItConfirmed} color={C.gn} /> IT-confirmed
          <Sep />
          <Cell value={counts.dataSourcesConflict} color={conflictColor} /> conflicts
        </Line>
        <Line>
          Last activity{" "}
          {onOpenLastActivity && lastActivityAt ? (
            <button
              type="button"
              onClick={onOpenLastActivity}
              aria-label="Open timeline at most recent event"
              style={{
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: "pointer",
                fontFamily: M,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: 0.4,
                color: C.t1,
                textDecoration: "underline",
                textDecorationColor: `${C.t4}80`,
                textUnderlineOffset: 2,
              }}
            >
              {formatRelativeTime(lastActivityAt)}
            </button>
          ) : (
            <Cell value={formatRelativeTime(lastActivityAt)} color={C.t1} />
          )}
          <Sep />
          Next reminder{" "}
          <Cell
            value={formatDueIn(nextReminderDueAt)}
            color={
              nextReminderDueAt && new Date(nextReminderDueAt).getTime() < Date.now()
                ? C.rd
                : C.t1
            }
          />
          <Sep />
          Cadence <Cell value={`${cadenceDays}d`} color={C.t1} />
          <Sep />
          {counts.notices} notice{counts.notices === 1 ? "" : "s"} issued
          <Sep />
          {counts.events} event{counts.events === 1 ? "" : "s"} logged
        </Line>
      </div>
    </Card>
  );
};

const Line: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center" }}>
    {children}
  </div>
);
