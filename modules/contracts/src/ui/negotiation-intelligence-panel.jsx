import { useState, useEffect, useCallback } from "react";
import { C, F, M } from "@aegis/ui";

// ── Negotiation intelligence (CLM C-8) ───────────────────────────────
//
// Reads GET /api/contracts/[id]/negotiation-intelligence — a deterministic
// playbook posture across every clause (accept / counter-with-approved-
// fallback / escalate) plus a redline summary of the latest revision. No AI;
// the server reads the clause library + version diff. Complements the per-
// clause "vs playbook" drill-down with the cross-clause roll-up a negotiator
// reads first.

const STATUS = {
  off_playbook: { label: "Escalate", color: C.rd, hint: "Deviates, no approved fallback" },
  fallback_available: { label: "Counter → fallback", color: C.am, hint: "Deviates; approved fallback on file" },
  on_standard: { label: "On standard", color: C.gn, hint: "Matches the playbook position" },
  no_position: { label: "No position", color: C.t3, hint: "No playbook entry for this clause" },
};
// Posture order: what a negotiator should look at first.
const ORDER = ["off_playbook", "fallback_available", "no_position", "on_standard"];

export function NegotiationIntelligencePanel({ contractId }) {
  const [intel, setIntel] = useState(null);
  const [open, setOpen] = useState({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/contracts/${contractId}/negotiation-intelligence`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.ok) setIntel(d.intelligence); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [contractId]);
  useEffect(() => { load(); }, [load]);

  if (loading && !intel) return null;
  if (!intel || intel.positions.length === 0) return null;

  const { counts, positions, redline, turnCount } = intel;
  const sorted = [...positions].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status));

  return (
    <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.br}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <div style={{ fontSize: 10, fontFamily: M, color: C.t3, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 600 }}>
          Negotiation intelligence
          {turnCount > 0 && <span style={{ color: C.t4 }}> · {turnCount} turn{turnCount === 1 ? "" : "s"}</span>}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
          {counts.offPlaybook > 0 && <Chip t={`${counts.offPlaybook} escalate`} c={C.rd} />}
          {counts.fallbackAvailable > 0 && <Chip t={`${counts.fallbackAvailable} fallback`} c={C.am} />}
          {counts.onStandard > 0 && <Chip t={`${counts.onStandard} on standard`} c={C.gn} />}
          {counts.noPosition > 0 && <Chip t={`${counts.noPosition} no position`} c={C.t3} />}
        </div>
      </div>

      {/* Redline summary of the latest revision */}
      {redline && (
        <div style={{ background: C.s1, borderRadius: 6, padding: "8px 11px", marginBottom: 12 }}>
          <div style={{ fontSize: 10.5, color: C.t1, marginBottom: redline.items.length ? 6 : 0 }}>
            <span style={{ fontFamily: M, fontSize: 9, letterSpacing: .8, textTransform: "uppercase", color: C.bl }}>Redline v{redline.fromVersion} → v{redline.toVersion}</span>
            <span style={{ marginLeft: 8 }}>{redline.headline}</span>
          </div>
          {redline.items.slice(0, 8).map((it, i) => (
            <div key={i} style={{ fontSize: 10, color: C.t2, lineHeight: 1.6, display: "flex", gap: 6 }}>
              <span style={{ color: it.kind === "added" ? C.gn : it.kind === "removed" ? C.rd : C.am }}>
                {it.kind === "added" ? "+" : it.kind === "removed" ? "−" : "~"}
              </span>
              <span>{it.headline}</span>
            </div>
          ))}
        </div>
      )}

      {/* Playbook posture per clause (escalations first) */}
      <div>
        {sorted.map((p) => {
          const s = STATUS[p.status] || STATUS.no_position;
          const isOpen = open[p.clauseType];
          const hasDetail = p.standardText || p.fallbackText || p.guidance;
          return (
            <div key={p.clauseType} style={{ padding: "7px 0", borderBottom: `1px solid ${C.br}22` }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: C.t1 }}>{p.title}</span>
                {p.current?.deviation && <Chip t="DEVIATES" c={C.rd} />}
                <Chip t={s.label} c={s.color} />
                {hasDetail && (
                  <span onClick={() => setOpen((o) => ({ ...o, [p.clauseType]: !o[p.clauseType] }))}
                    style={{ marginLeft: "auto", cursor: "pointer", fontSize: 9, fontFamily: M, letterSpacing: .5, color: C.bl, textTransform: "uppercase" }}>
                    {isOpen ? "▾ positions" : "⚖ positions"}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 10, color: C.t3, marginTop: 2 }}>{p.recommendation}</div>
              {isOpen && hasDetail && (
                <div style={{ marginTop: 7, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div style={{ padding: "7px 9px", background: C.s1, borderRadius: 5, borderLeft: `2px solid ${p.current?.deviation ? C.rd : C.gn}` }}>
                    <div style={lbl(C.t3)}>Playbook standard</div>
                    <div style={{ fontSize: 9.5, color: C.t1, lineHeight: 1.5 }}>{p.standardText || "—"}</div>
                    <div style={{ ...lbl(C.t3), marginTop: 6 }}>In this draft</div>
                    <div style={{ fontSize: 9.5, color: C.t2, lineHeight: 1.5 }}>{p.current?.text || "—"}</div>
                  </div>
                  <div style={{ padding: "7px 9px", background: C.s1, borderRadius: 5 }}>
                    {p.fallbackText && <><div style={lbl(C.t3)}>Approved fallback</div>
                      <div style={{ fontSize: 9.5, color: C.t2, lineHeight: 1.5, marginBottom: 6 }}>{p.fallbackText}</div></>}
                    {p.guidance && <><div style={lbl(C.am)}>Reviewer guidance</div>
                      <div style={{ fontSize: 9.5, color: C.t2, lineHeight: 1.5 }}>{p.guidance}</div></>}
                    {!p.fallbackText && !p.guidance && (
                      <div style={{ fontSize: 9.5, color: C.t4, fontStyle: "italic" }}>No approved fallback on file. {p.riskIfDeviated ? `Risk if deviated: ${p.riskIfDeviated}.` : ""}</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const lbl = (c) => ({ fontSize: 8, fontFamily: M, letterSpacing: .8, textTransform: "uppercase", color: c, marginBottom: 2 });

function Chip({ t, c }) {
  return (
    <span style={{ fontSize: 8.5, fontFamily: M, fontWeight: 700, letterSpacing: .4, padding: "2px 6px", borderRadius: 4, color: c, border: `1px solid ${c}55`, textTransform: "uppercase", whiteSpace: "nowrap" }}>
      {t}
    </span>
  );
}
