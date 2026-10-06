import { useState, useEffect } from "react";
import { C, F, M, SR, Card } from "@aegis/ui";

// ── Track 1 · Activity 6 — litigation tracking view ──────────────────
//
// A focused summary for litigation/dispute tickets, composing the
// item-4 Litigation agent's triage output with the item-3 parties
// (adverse party / counsel). Tracking-only — it reinforces that NO
// legal hold was placed by triage (the agent's standing concern).
// Renders nothing for non-litigation tickets.

const HIGHLIGHT_ROLES = { adverse_party: "Adverse party", opposing_counsel: "Opposing counsel", our_counsel: "Our counsel" };

export function isLitigationTicket(ticket) {
  if (!ticket) return false;
  if (ticket.agentRecommendation?.agentId === "litigation-agent") return true;
  const hay = `${ticket.type || ""} ${ticket.aiTriage?.category || ""}`.toLowerCase();
  return /litigation|dispute/.test(hay);
}

export function LitigationSummaryCard({ ticket }) {
  const [parties, setParties] = useState([]);
  useEffect(() => {
    if (!isLitigationTicket(ticket)) return;
    let on = true;
    fetch(`/api/intake/tickets/${encodeURIComponent(ticket.id)}/parties`)
      .then((r) => r.json()).then((d) => { if (on && d.ok) setParties(d.parties || []); }).catch(() => {});
    return () => { on = false; };
  }, [ticket?.id]);

  if (!isLitigationTicket(ticket)) return null;

  const rec = ticket.agentRecommendation;
  const concerns = Array.isArray(rec?.concerns) ? rec.concerns : [];
  const holdNote = concerns.find((c) => /legal hold|preservation/i.test(String(c)));
  const deadlineNote = concerns.find((c) => /deadline|respond|statut/i.test(String(c)));
  const highlighted = parties.filter((p) => HIGHLIGHT_ROLES[p.role]);

  return (
    <Card style={{ background: C.rdG || C.s1, borderLeft: `3px solid ${C.rd}`, marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 10, fontFamily: M, color: C.rd, letterSpacing: 2, textTransform: "uppercase", fontWeight: 700 }}>§ Litigation intake</span>
        <span style={{ fontSize: 9, fontFamily: M, color: C.t3, letterSpacing: .5 }}>tracking-only</span>
      </div>

      {/* Standing safety reminder — the agent never places a hold. */}
      <div style={{ fontSize: 10.5, color: C.am, fontFamily: M, background: C.s1, borderRadius: 4, padding: "6px 9px", marginBottom: 8, lineHeight: 1.4 }}>
        ⚠ {holdNote || "No legal hold has been placed by this triage — confirm preservation separately."}
      </div>

      {highlighted.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 9, fontFamily: M, color: C.t3, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>Parties</div>
          {highlighted.map((p) => (
            <div key={p.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 11, color: C.t1, padding: "2px 0" }}>
              <span style={{ fontSize: 8.5, fontFamily: M, color: p.role === "adverse_party" ? C.rd : C.cy, letterSpacing: .5, textTransform: "uppercase", minWidth: 96 }}>{HIGHLIGHT_ROLES[p.role]}</span>
              <span>{p.name || p.counterpartyId || p.personId}</span>
            </div>
          ))}
        </div>
      )}

      {deadlineNote && (
        <div style={{ fontSize: 10.5, color: C.t2, fontFamily: M, marginBottom: 6 }}>⏱ {deadlineNote}</div>
      )}

      {rec?.draftedResponse && (
        <div style={{ fontSize: 11, color: C.t2, fontFamily: F, lineHeight: 1.5, whiteSpace: "pre-wrap", maxHeight: 132, overflowY: "auto", borderTop: `1px solid ${C.br}`, paddingTop: 6, marginTop: 4 }}>
          {rec.draftedResponse}
        </div>
      )}

      <div style={{ fontSize: 9, fontFamily: M, color: C.t4, marginTop: 8, letterSpacing: .3 }}>
        Add adverse party / counsel in the Parties panel · assign + track status in Delivery. Always attorney-reviewed.
      </div>
    </Card>
  );
}
