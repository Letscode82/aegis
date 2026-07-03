import { useState, useEffect, useCallback } from "react";
import { C, F, M, SR, Card, Pill } from "@aegis/ui";

// ── W1-2 · My Requests — the requester's status portal (issue #104) ──
//
// Everything I filed, newest first: friendly status, stage, SLA
// posture, and the latest ledger activity in plain language — so the
// requester never has to send a "where is it?" email. Teaching empty
// state routes them to New Request. Phone-friendly single column.

const slaColor = (s) => /overdue|breach/i.test(s || "") ? C.rd : /risk/i.test(s || "") ? C.am : C.gn;
const statusColor = (r) => r.closed ? C.t3 : /escalated/i.test(r.status) ? C.rd : /review|approved/i.test(r.status) ? C.bl : C.am;

// Ledger actions → requester-friendly language. Fallback: humanized key.
const ACTIVITY_LABEL = {
  "intake.ticket.created": "Request received",
  "intake.routing_rule.fired": "Routed automatically",
  "intake.recommendation.approved": "Response approved by legal",
  "intake.recommendation.edited_approved": "Response approved by legal",
  "intake.recommendation.rejected": "Under manual review",
  "intake.recommendation.reassigned": "Reassigned within legal",
  "intake.recommendation.snoozed": "Queued for later review",
  "intake.recommendation.manual_close": "Closed by legal",
  "intake.ticket.assigned": "Assigned to an attorney",
  "intake.ticket.escalated": "Escalated",
  "intake.ticket.sla_breached": "Escalated (SLA)",
  "intake.ticket.closed": "Closed",
  "intake.ticket.handoff": "Moved between reviewers",
  "intake.ticket.stage_advanced": "Moved to the next stage",
  "intake.document.uploaded": "Document attached",
  "intake.ticket.party_added": "Details updated",
};
const humanizeActivity = (action) =>
  ACTIVITY_LABEL[action] || action.split(".").pop().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

const relTime = (iso) => {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
};

export function MyRequestsTab({ onFileNew }) {
  const [requests, setRequests] = useState(null);
  const [err, setErr] = useState(null);
  const [showClosed, setShowClosed] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/intake/my-requests");
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error(d.error || `Load failed (HTTP ${r.status})`);
      setRequests(d.requests || []); setErr(null);
    } catch (e) { setErr(String(e.message || e)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (err) return <Card style={{ borderLeft: `3px solid ${C.rd}` }}><div style={{ fontSize: 12, color: C.t2, fontFamily: F }}>Couldn't load your requests: {err}</div></Card>;

  const open = (requests || []).filter((r) => !r.closed);
  const closed = (requests || []).filter((r) => r.closed);
  const visible = showClosed ? requests || [] : open;

  return (
    <div style={{ maxWidth: 860 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 18, fontFamily: SR, color: C.t1 }}>My requests</div>
          <div style={{ fontSize: 10.5, color: C.t3, fontFamily: M, marginTop: 2 }}>Live status of everything you've filed — no chaser emails needed.</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {closed.length > 0 && (
            <span onClick={() => setShowClosed((s) => !s)} style={{ fontSize: 9.5, fontFamily: M, color: C.t3, cursor: "pointer", letterSpacing: .8 }}>
              {showClosed ? "hide" : "show"} closed ({closed.length})
            </span>
          )}
          <div onClick={onFileNew} style={{ padding: "7px 13px", background: C.cy, color: C.bg, fontSize: 9.5, fontFamily: M, letterSpacing: 1.2, cursor: "pointer", textTransform: "uppercase", fontWeight: 700, borderRadius: 3 }}>+ New request</div>
        </div>
      </div>

      {requests === null ? (
        <div>{[0, 1, 2].map((i) => <div key={i} style={{ height: 56, background: C.s1, borderRadius: 5, marginBottom: 7, opacity: .5 - i * .12 }} />)}</div>
      ) : visible.length === 0 ? (
        <Card style={{ textAlign: "center", padding: 30 }}>
          <div style={{ fontSize: 20, fontFamily: SR, color: C.t1, marginBottom: 6 }}>{open.length === 0 && closed.length > 0 ? "All your requests are resolved" : "No requests yet"}</div>
          <div style={{ fontSize: 11.5, color: C.t2, fontFamily: F, marginBottom: 12 }}>{open.length === 0 && closed.length > 0 ? "Need something else from legal?" : "File your first request — it takes under a minute and you can track it here."}</div>
          <div onClick={onFileNew} style={{ display: "inline-block", padding: "9px 16px", background: C.cy, color: C.bg, fontSize: 10, fontFamily: M, letterSpacing: 1.5, cursor: "pointer", textTransform: "uppercase", fontWeight: 700, borderRadius: 3 }}>File a request →</div>
        </Card>
      ) : (
        visible.map((r) => (
          <div key={r.id} style={{ padding: "11px 14px", background: C.s1, border: `1px solid ${C.br}`, borderLeft: `3px solid ${statusColor(r)}`, borderRadius: 5, marginBottom: 7, opacity: r.closed ? .65 : 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 10.5, fontFamily: M, color: C.cy, fontWeight: 600 }}>{r.id}</span>
              <span style={{ fontSize: 12, color: C.t1, fontWeight: 500 }}>{r.type}</span>
              <Pill t={r.status} c={statusColor(r)} />
              <span style={{ flex: 1 }} />
              {!r.closed && <span style={{ fontSize: 9.5, fontFamily: M, color: slaColor(r.slaStatus) }}>{r.slaStatus} · {r.slaHours}h SLA</span>}
            </div>
            <div style={{ fontSize: 11, color: C.t2, marginTop: 4, lineHeight: 1.45 }}>{r.descSnippet}{r.descSnippet.length >= 120 ? "…" : ""}</div>
            <div style={{ fontSize: 9.5, fontFamily: M, color: C.t4, marginTop: 5 }}>
              filed {relTime(r.submittedAt)}
              {r.lastActivity && <> · latest: <span style={{ color: C.t2 }}>{humanizeActivity(r.lastActivity.action)}</span> {relTime(r.lastActivity.at)}</>}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
