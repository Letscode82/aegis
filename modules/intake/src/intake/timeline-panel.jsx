import { useState, useEffect } from "react";
import { C, F, M, Card } from "@aegis/ui";

// ── W1-3 · Ticket Timeline panel (issue #105) ────────────────────────
//
// The whole story of a ticket as one verifiable chain: filed →
// classified → routed → agent drafted → handed to a person → task
// done → stage moved → closed. Human, agent, and system actions render
// in one stream with resolved names; each event carries its chain
// position + content-hash prefix, so "tamper-evident" is something you
// can point at, not just claim.

const ACTOR_STYLE = {
  AGENT: { c: C.pp, icon: "🤖", label: "AI agent" },
  SYSTEM: { c: C.t3, icon: "⚙", label: "System" },
  USER: { c: C.cy, icon: "●", label: "" },
};

const ACTION_LABEL = {
  "intake.ticket.created": "Request filed",
  "intake.routing_rule.fired": "Routing rule fired",
  "intake.ticket.assigned": "Assigned",
  "intake.recommendation.approved": "Recommendation approved",
  "intake.recommendation.edited_approved": "Recommendation edited & approved",
  "intake.recommendation.rejected": "Recommendation rejected",
  "intake.recommendation.reassigned": "Reassigned",
  "intake.recommendation.snoozed": "Snoozed",
  "intake.recommendation.manual_close": "Manually closed",
  "intake.ticket.escalated": "Escalated",
  "intake.ticket.sla_breached": "SLA breached",
  "intake.ticket.auto_escalated": "Auto-escalated",
  "intake.ticket.closed": "Closed",
  "intake.ticket.handoff": "Hand-off (baton passed)",
  "intake.ticket.stage_advanced": "Stage advanced",
  "intake.ticket.agent_no_match": "No agent matched — manual triage",
  "intake.ticket.matter_spawned": "Matter created from this request",
  "intake.document.uploaded": "Document attached",
  "intake.ticket.assignment_added": "Team member added",
  "intake.ticket.assignment_removed": "Team member removed",
  "intake.ticket.task_added": "Task added",
  "intake.ticket.task_updated": "Task updated",
  "intake.ticket.task_removed": "Task removed",
  "intake.ticket.work_status_changed": "Work status changed",
  "intake.ticket.party_added": "Party added",
  "intake.ticket.party_removed": "Party removed",
};
const label = (a) => ACTION_LABEL[a] || a.split(".").pop().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

const relTime = (iso) => {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
};

export function TicketTimelinePanel({ ticketId }) {
  const [events, setEvents] = useState(null);
  const [err, setErr] = useState(null);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    let on = true;
    setEvents(null); setErr(null);
    fetch(`/api/intake/tickets/${encodeURIComponent(ticketId)}/timeline`)
      .then((r) => r.status === 403 ? { ok: false, forbidden: true } : r.json())
      .then((d) => {
        if (!on) return;
        if (d.forbidden) { setErr("forbidden"); return; }
        if (!d.ok) throw new Error(d.error || "Load failed");
        setEvents(d.events || []);
      })
      .catch((e) => { if (on) setErr(String(e.message || e)); });
    return () => { on = false; };
  }, [ticketId]);

  if (err === "forbidden") return null;

  return (
    <Card style={{ marginTop: 14 }}>
      <div onClick={() => setExpanded((x) => !x)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: C.cy, letterSpacing: 1.2, fontFamily: M, textTransform: "uppercase" }}>
          ⛓ Timeline {events ? `(${events.length})` : ""}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 9, fontFamily: M, color: C.gn, letterSpacing: .8 }}>CHAIN-SEALED · TAMPER-EVIDENT</span>
          <span style={{ fontSize: 11, color: C.t3 }}>{expanded ? "▾" : "▸"}</span>
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 10, maxHeight: 340, overflowY: "auto", paddingRight: 4 }}>
          {err && err !== "forbidden" && <div style={{ fontSize: 10.5, color: C.rd, fontFamily: M }}>{err}</div>}
          {events === null && !err && <div style={{ fontSize: 10.5, color: C.t3, fontFamily: M }}>◎ loading the ledger…</div>}
          {events && events.length === 0 && <div style={{ fontSize: 10.5, color: C.t4, fontFamily: M }}>No ledger events yet for this ticket.</div>}
          {events && events.map((e, i) => {
            const st = ACTOR_STYLE[e.actorType] || ACTOR_STYLE.USER;
            return (
              <div key={e.id} style={{ display: "flex", gap: 10, position: "relative", paddingBottom: i === events.length - 1 ? 0 : 12 }}>
                {/* rail */}
                {i !== events.length - 1 && <div style={{ position: "absolute", left: 7, top: 16, bottom: 0, width: 1, background: C.br }} />}
                <div style={{ width: 15, height: 15, borderRadius: "50%", background: C.bg, border: `2px solid ${st.c}`, flexShrink: 0, marginTop: 1, zIndex: 1, fontSize: 8, textAlign: "center", lineHeight: "11px" }}>{e.actorType === "AGENT" ? "🤖" : ""}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11.5, color: C.t1, fontWeight: 600 }}>{label(e.action)}</span>
                    <span style={{ fontSize: 9.5, fontFamily: M, color: st.c }}>{e.actorName || st.label || e.actorType}</span>
                    <span style={{ fontSize: 9, fontFamily: M, color: C.t4 }}>{relTime(e.at)}</span>
                  </div>
                  {e.detail && <div style={{ fontSize: 10, color: C.t3, marginTop: 1 }}>{e.detail}</div>}
                  <div style={{ fontSize: 8.5, fontFamily: M, color: C.t4, marginTop: 2, letterSpacing: .3 }} title="Per-organization chain position · SHA-256 content hash — verify in Audit Log">
                    #{e.chainPosition} · {e.hashPrefix}…
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
