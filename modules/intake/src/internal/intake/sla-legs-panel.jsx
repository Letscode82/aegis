import { useState, useEffect, useCallback } from "react";
import { C, M, SR, Card } from "@aegis/ui";

// ── W2-4 · Multi-leg SLA — who held the clock, for how long ─────────
//
// Reads GET /api/intake/tickets/[id]/sla-legs: the ticket's single SLA
// window partitioned into custody legs by the hand-off ledger (queue →
// agent → reviewer → …). Renders a proportional segmented bar with the
// breach marker pinned at 100% of the window, plus a per-leg legend.
// A hand-off can't hide a breach — the leg that was holding the baton
// when the clock ran out carries the ⚠.

const HOLDER_COLOR = { queue: C.t3, agent: C.pp, human: C.cy };
const HOLDER_ICON = { queue: "◍", agent: "🤖", human: "◉" };

function human(ms) {
  const m = Math.round(ms / 60000);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export function SlaLegsPanel({ ticketId }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    try {
      setErr(null);
      const r = await fetch(`/api/intake/tickets/${encodeURIComponent(ticketId)}/sla-legs`);
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setData(d);
    } catch (e) {
      setErr(String(e.message || e));
    }
  }, [ticketId]);
  useEffect(() => { load(); }, [load]);

  if (err) return null; // quiet panel — the main SLA block still shows
  if (!data) return null;
  const { legs, slaMs, totalElapsedMs, breached, closed } = data;
  if (!legs || legs.length === 0) return null;

  // Bar scale: the longer of (elapsed, SLA window) so the breach marker
  // always fits and pre-breach tickets show remaining headroom.
  const scaleMs = Math.max(totalElapsedMs, slaMs, 1);
  const breachLeftPct = Math.min((slaMs / scaleMs) * 100, 100);

  return (
    <Card d={120}>
      <div style={{ fontSize: 11, fontWeight: 600, color: C.cy, marginBottom: 10, letterSpacing: 1.2, fontFamily: M, textTransform: "uppercase", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
        <span>◔ SLA Custody Legs</span>
        <span style={{ fontSize: 9, color: breached ? C.rd : C.t4, fontFamily: M, letterSpacing: 1 }}>
          {breached ? "WINDOW BREACHED" : closed ? "CLOCK STOPPED" : "CLOCK RUNNING"} · {human(totalElapsedMs)} elapsed
        </span>
      </div>

      {/* Proportional custody bar with the breach marker at 100% SLA */}
      <div style={{ position: "relative", height: 14, background: C.s1, borderRadius: 3, overflow: "hidden", marginBottom: 4 }}>
        <div style={{ display: "flex", height: "100%" }}>
          {legs.map((l, i) => (
            <div
              key={i}
              title={`${l.holderLabel} · ${human(l.elapsedMs)} (${l.pctOfSla}% of window)`}
              style={{
                width: `${(l.elapsedMs / scaleMs) * 100}%`,
                background: (HOLDER_COLOR[l.holder] || C.t3) + (l.active ? "" : "99"),
                borderRight: i < legs.length - 1 ? `1px solid ${C.cd}` : "none",
                minWidth: l.elapsedMs > 0 ? 3 : 0,
              }}
            />
          ))}
        </div>
        {breachLeftPct < 100 && (
          <div title="SLA window expires here" style={{ position: "absolute", top: 0, bottom: 0, left: `${breachLeftPct}%`, width: 2, background: C.rd }} />
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8.5, color: C.t4, fontFamily: M, marginBottom: 10 }}>
        <span>SUBMITTED</span>
        <span style={{ color: breached ? C.rd : C.t4 }}>SLA {Math.round(slaMs / 3600000)}h</span>
        <span>{closed ? "CLOSED" : "NOW"}</span>
      </div>

      {/* Per-leg legend */}
      {legs.map((l, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", background: l.active ? C.s1 : "transparent", borderRadius: 4, borderLeft: `3px solid ${HOLDER_COLOR[l.holder] || C.t3}`, marginBottom: 3 }}>
          <span style={{ fontSize: 11, width: 18, textAlign: "center" }}>{HOLDER_ICON[l.holder] || "◍"}</span>
          <span style={{ fontSize: 11, color: C.t1, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {l.holderLabel}
            {l.active && <span style={{ fontSize: 8.5, color: C.gn, fontFamily: M, marginLeft: 6, letterSpacing: 1 }}>HOLDING NOW</span>}
            {l.breachedDuringLeg && <span style={{ fontSize: 8.5, color: C.rd, fontFamily: M, marginLeft: 6, letterSpacing: 1 }}>⚠ BREACH HAPPENED HERE</span>}
          </span>
          <span style={{ fontSize: 10.5, fontFamily: M, color: l.pctOfSla >= 70 ? C.am : C.t2 }}>{human(l.elapsedMs)}</span>
          <span style={{ fontSize: 9.5, fontFamily: M, color: C.t4, width: 70, textAlign: "right" }}>{l.pctOfSla}% of window</span>
        </div>
      ))}
      <div style={{ fontSize: 9.5, color: C.t4, marginTop: 8, lineHeight: 1.5, fontFamily: M }}>
        Legs derive from the hand-off ledger — every baton pass starts a new clock segment. One window, no resets.
      </div>
    </Card>
  );
}
