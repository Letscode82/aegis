/**
 * TimelineRailCard — last 5 LegalHoldEvent rows in the rail. The
 * "View all" button opens a modal with the full chronological
 * stream (filterable by event type).
 */
import React, { useEffect, useMemo, useState } from "react";
import { Card, SH, C, F, M } from "@aegis/ui";
import type { HoldEventDTO } from "./types";

const TYPE_COLORS: Record<string, string> = {
  HOLD_DRAFTED: C.t3,
  TRIGGER_RECORDED: C.am,
  HOLD_ISSUED: C.bl,
  CUSTODIAN_ADDED: C.t1,
  CUSTODIAN_REMOVED: C.t3,
  CUSTODIAN_ACKNOWLEDGED: C.gn,
  CUSTODIAN_RE_ATTESTED: C.gn,
  REMINDER_SENT: C.am,
  ESCALATED: C.rd,
  DATA_SOURCE_ADDED: C.tl,
  DATA_SOURCE_PRESERVATION_APPLIED: C.tl,
  DATA_SOURCE_PRESERVATION_CONFIRMED: C.gn,
  DATA_SOURCE_PRESERVATION_FAILED: C.rd,
  SCOPE_AMENDED: C.am,
  CUSTODIAN_DEPARTED: C.rd,
  CUSTODIAN_PARTIALLY_RELEASED: C.am,
  HOLD_RELEASED: C.gn,
  HOLD_RE_OPENED: C.bl,
};

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
  matterId: string;
  holdId: string;
}

export const TimelineRailCard: React.FC<TimelineRailCardProps> = ({
  matterId,
  holdId,
}) => {
  const [events, setEvents] = useState<HoldEventDTO[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch(`/api/matter/${matterId}/holds/${holdId}/timeline`)
      .then((r) => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)))
      .then(setEvents)
      .catch(() => setEvents([]));
  }, [matterId, holdId]);

  return (
    <Card>
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
      {events && events.length > 0 && (
        <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
          {events.slice(0, 5).map((e) => (
            <TimelineLine key={e.id} event={e} />
          ))}
        </div>
      )}
      {events && events.length > 5 && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{
            background: "transparent",
            border: `1px solid ${C.br}`,
            color: C.t1,
            padding: "5px 10px",
            borderRadius: 4,
            fontFamily: F,
            fontSize: 10.5,
            cursor: "pointer",
            letterSpacing: 0.3,
            textTransform: "uppercase",
            marginTop: 10,
            width: "100%",
          }}
        >
          View all {events.length}
        </button>
      )}
      {open && events && (
        <TimelineFullStreamModal events={events} onClose={() => setOpen(false)} />
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
        background: TYPE_COLORS[event.type] ?? C.t3,
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

const TimelineFullStreamModal: React.FC<{
  events: HoldEventDTO[];
  onClose: () => void;
}> = ({ events, onClose }) => {
  const [filter, setFilter] = useState<string>("");
  const types = useMemo(() => {
    const set = new Set(events.map((e) => e.type));
    return Array.from(set).sort();
  }, [events]);
  const filtered = filter ? events.filter((e) => e.type === filter) : events;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Hold timeline"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.65)",
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.cd,
          border: `1px solid ${C.brL}`,
          padding: 18,
          minWidth: 640,
          maxWidth: 800,
          maxHeight: "85vh",
          overflowY: "auto",
          fontFamily: F,
          color: C.t1,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <SH icon="🕒" title="Hold timeline" sub={`${events.length} events · twin-recorded with the chain-sealed AuditLog`} />
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: `1px solid ${C.br}`,
              color: C.t2,
              padding: "2px 10px",
              borderRadius: 4,
              cursor: "pointer",
              fontFamily: M,
              fontSize: 11,
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 12 }}>
          <FilterChip label="All" active={filter === ""} onClick={() => setFilter("")} />
          {types.map((t) => (
            <FilterChip
              key={t}
              label={t}
              active={filter === t}
              color={TYPE_COLORS[t] ?? C.t3}
              onClick={() => setFilter(t)}
            />
          ))}
        </div>

        <div style={{ marginTop: 14, display: "grid", gap: 6 }}>
          {filtered.map((e) => (
            <div
              key={e.id}
              style={{
                display: "grid",
                gridTemplateColumns: "150px 220px 1fr 120px",
                gap: 8,
                padding: "5px 6px",
                fontSize: 11,
                fontFamily: F,
                borderBottom: `1px solid ${C.br}22`,
              }}
            >
              <span style={{ fontFamily: M, fontSize: 10, color: C.t3 }}>
                {new Date(e.occurredAt).toISOString().replace("T", " ").slice(0, 16)}
              </span>
              <span style={{ fontFamily: M, fontSize: 10, color: TYPE_COLORS[e.type] ?? C.tl }}>
                {e.type}
              </span>
              <span style={{ color: C.t1 }}>{e.summary}</span>
              <span style={{ fontFamily: M, fontSize: 9, color: C.t4 }}>
                {e.actorType}:{e.actorId?.slice(0, 8) ?? "—"}…
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const FilterChip: React.FC<{
  label: string;
  active: boolean;
  color?: string;
  onClick: () => void;
}> = ({ label, active, color, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      background: active ? color ?? C.bl : "transparent",
      border: `1px solid ${color ?? C.br}`,
      color: active ? C.bg : color ?? C.t2,
      padding: "2px 8px",
      borderRadius: 10,
      fontFamily: M,
      fontSize: 9.5,
      cursor: "pointer",
      letterSpacing: 0.3,
    }}
  >
    {label}
  </button>
);
