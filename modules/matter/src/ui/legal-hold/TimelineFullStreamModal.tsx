/**
 * TimelineFullStreamModal — full chronological stream of one hold's
 * LegalHoldEvent rows in a portal-rendered modal. Filterable by
 * event type. Used both by `TimelineRailCard` (mid-rail "View all"
 * affordance) and by `HoldStatusRow` (the "Last activity" link).
 *
 * The component is presentational; the parent owns the events list
 * (already fetched once for the rail card's preview) so we don't
 * re-hit the timeline endpoint when the same data is in scope.
 */
import React, { useMemo, useState } from "react";
import { C, F, M } from "@aegis/ui";
import { ActorDisplay, useActorResolver } from "./ActorDisplay";
import { ModalShell } from "./ModalShell";
import type { HoldEventDTO } from "./types";

export const TIMELINE_TYPE_COLORS: Record<string, string> = {
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

export interface TimelineFullStreamModalProps {
  events: HoldEventDTO[];
  onClose: () => void;
  /**
   * Optional event id to highlight on first render. The list is
   * sorted newest-first by the timeline endpoint, so passing the
   * head row's id surfaces "the most recent thing that happened"
   * for the HoldStatusRow last-activity link.
   */
  highlightEventId?: string | null;
  /** Required for actor name resolution. */
  matterId: string;
  holdId: string;
}

export const TimelineFullStreamModal: React.FC<TimelineFullStreamModalProps> = ({
  events,
  onClose,
  highlightEventId,
  matterId,
  holdId,
}) => {
  const actorInputs = useMemo(
    () =>
      events.map((e) => ({ actorId: e.actorId, actorType: e.actorType })),
    [events],
  );
  const actorLookup = useActorResolver(matterId, holdId, actorInputs);
  const [filter, setFilter] = useState<string>("");
  const types = useMemo(() => {
    const set = new Set(events.map((e) => e.type));
    return Array.from(set).sort();
  }, [events]);
  const filtered = filter ? events.filter((e) => e.type === filter) : events;

  return (
    <ModalShell
      onClose={onClose}
      ariaLabel="Hold timeline"
      title="Hold timeline"
      icon="🕒"
      sub={`${events.length} events · twin-recorded with the chain-sealed AuditLog`}
      maxWidth={800}
    >
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        <FilterChip label="All" active={filter === ""} onClick={() => setFilter("")} />
        {types.map((t) => (
          <FilterChip
            key={t}
            label={t}
            active={filter === t}
            color={TIMELINE_TYPE_COLORS[t] ?? C.t3}
            onClick={() => setFilter(t)}
          />
        ))}
      </div>

      <div style={{ marginTop: 14, display: "grid", gap: 6 }}>
        {filtered.map((e) => {
          const highlighted = e.id === highlightEventId;
          return (
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
                background: highlighted ? `${C.em}1f` : "transparent",
                borderLeft: highlighted ? `3px solid ${C.em}` : "3px solid transparent",
              }}
            >
              <span style={{ fontFamily: M, fontSize: 10, color: C.t3 }}>
                {new Date(e.occurredAt).toISOString().replace("T", " ").slice(0, 16)}
              </span>
              <span
                style={{
                  fontFamily: M,
                  fontSize: 10,
                  color: TIMELINE_TYPE_COLORS[e.type] ?? C.tl,
                }}
              >
                {e.type}
              </span>
              <span style={{ color: C.t1 }}>{e.summary}</span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                <ActorDisplay
                  actorId={e.actorId}
                  actorType={e.actorType}
                  lookup={actorLookup}
                  compact
                />
              </span>
            </div>
          );
        })}
      </div>
    </ModalShell>
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
