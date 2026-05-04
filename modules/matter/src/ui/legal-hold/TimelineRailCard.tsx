/**
 * TimelineRailCard — last 5 LegalHoldEvent rows in the rail. Clicking
 * the card surface (or the "View all" footer button) opens
 * `TimelineFullStreamModal` rendered out of the parent's portal.
 *
 * Events are owned by `HoldDetailPage` so the same list can be
 * shared with the status-row "Last activity" link without a second
 * timeline fetch.
 */
import React from "react";
import { Card, SH, C, F, M } from "@aegis/ui";
import { TIMELINE_TYPE_COLORS } from "./TimelineFullStreamModal";
import type { HoldEventDTO } from "./types";

function relativeTime(iso: string): string {
  const ts = new Date(iso).getTime();
  const delta = Math.floor((Date.now() - ts) / 1000);
  if (delta < 60) return `${delta}s ago`;
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
  if (delta < 86400 * 7) return `${Math.floor(delta / 86400)}d ago`;
  return iso.slice(0, 10);
}

export interface TimelineRailCardProps {
  events: HoldEventDTO[] | null;
  /** Parent owns the modal — the card just signals "open me". */
  onOpenStream: () => void;
}

export const TimelineRailCard: React.FC<TimelineRailCardProps> = ({
  events,
  onOpenStream,
}) => {
  const hasEvents = !!events && events.length > 0;

  return (
    <Card onClick={hasEvents ? onOpenStream : undefined}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <SH icon="🕒" title="Timeline" />
        <span style={{ fontFamily: M, fontSize: 9, color: C.t4, letterSpacing: 0.4 }}>
          {events?.length ?? 0} EVENTS
        </span>
      </div>
      {!events && (
        <div style={{ color: C.t3, fontSize: 11, fontFamily: M, marginTop: 8 }}>
          Loading…
        </div>
      )}
      {events && events.length === 0 && (
        <div style={{ color: C.t3, fontSize: 11, fontFamily: M, marginTop: 8 }}>
          No events yet.
        </div>
      )}
      {hasEvents && (
        <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
          {events.slice(0, 5).map((e) => (
            <TimelineLine key={e.id} event={e} />
          ))}
        </div>
      )}
      {hasEvents && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenStream();
          }}
          aria-label={`Open full timeline (${events.length} events)`}
          style={{
            marginTop: 10,
            padding: "5px 0 0",
            borderTop: `1px solid ${C.br}33`,
            fontFamily: M,
            fontSize: 9.5,
            color: C.t3,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            textAlign: "center",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            width: "100%",
          }}
        >
          View all {events.length} →
        </button>
      )}
    </Card>
  );
};

const TimelineLine: React.FC<{ event: HoldEventDTO }> = ({ event }) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "8px 70px 1fr",
      gap: 8,
      alignItems: "flex-start",
      fontFamily: F,
      fontSize: 10.5,
    }}
  >
    <span
      style={{
        width: 6,
        height: 6,
        marginTop: 5,
        borderRadius: "50%",
        background: TIMELINE_TYPE_COLORS[event.type] ?? C.t3,
      }}
      aria-hidden="true"
    />
    <span style={{ fontFamily: M, fontSize: 9.5, color: C.t4 }}>
      {relativeTime(event.occurredAt)}
    </span>
    <span style={{ color: C.t1, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis" }}>
      {event.summary}
    </span>
  </div>
);
