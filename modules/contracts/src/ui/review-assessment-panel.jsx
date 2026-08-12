import { useState, useEffect, useCallback } from "react";
import { C, F, M, SR } from "@aegis/ui";

// ── Review assessment / position summary (CTR-13) ────────────────────
//
// "What can we sign, and which clauses are we NOT comfortable with." Loads the
// deterministic assessment instantly (GET), and a "Deep AI review" button runs
// Claude over the full contract text (POST) — robust to any client template.
// Advisory only; the reviewer decides. Prominent on third-party paper.

const VERDICT = {
  SIGN_AS_IS:  { label: "OK to sign as-is", c: C.gn, glyph: "✓" },
  NEGOTIATE:   { label: "Negotiate before signing", c: C.am, glyph: "⚖" },
  DO_NOT_SIGN: { label: "Do not sign as-is", c: C.rd, glyph: "⛔" },
};
const POS = {
  ACCEPT:    { label: "Accept", c: C.gn },
  NEGOTIATE: { label: "Negotiate", c: C.am },
  REJECT:    { label: "Reject", c: C.rd },
};
const SEV = { HIGH: C.rd, MEDIUM: C.am, LOW: C.gn };

export function ReviewAssessmentPanel({ contractId, isThirdParty }) {
  const [a, setA] = useState(null);
  const [error, setError] = useState(null);
  const [aiBusy, setAiBusy] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/contracts/${contractId}/assessment`)
      .then((r) => (r.ok ? r.json() : r.json().then((d) => Promise.reject(d.error || `HTTP ${r.status}`))))
      .then((d) => setA(d.assessment))
      .catch((e) => setError(String(e)));
  }, [contractId]);
  useEffect(() => { load(); }, [load]);

  const runAI = async () => {
    setAiBusy(true); setError(null);
    try {
      const r = await fetch(`/api/contracts/${contractId}/assessment`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setA(d.assessment);
    } catch (e) { setError(String(e.message || e)); } finally { setAiBusy(false); }
  };

  if (error && !a) return null; // best-effort panel
  if (!a) return null;
  const v = VERDICT[a.verdict] || VERDICT.NEGOTIATE;

  return (
    <div style={{ marginTop: 16, border: `1px solid ${v.c}55`, borderLeft: `3px solid ${v.c}`, borderRadius: 8, background: C.cd, overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", background: C.s1, borderBottom: `1px solid ${C.br}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 16 }}>{v.glyph}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 9, fontFamily: M, color: C.t3, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 600 }}>
            Review assessment{isThirdParty ? " · third-party paper" : ""}
          </div>
          <div style={{ fontSize: 14, fontFamily: SR, color: v.c, marginTop: 2 }}>{v.label}</div>
        </div>
        <span style={{ fontSize: 9, fontFamily: M, color: a.source === "ai" ? C.bl : C.t4, border: `1px solid ${a.source === "ai" ? C.bl : C.br}`, borderRadius: 3, padding: "2px 6px", textTransform: "uppercase" }}>
          {a.source === "ai" ? "🤖 AI review" : a.degraded ? "AI unavailable — deterministic" : "deterministic"}
        </span>
        <button onClick={runAI} disabled={aiBusy} style={{ padding: "6px 11px", background: "transparent", color: C.bl, border: `1px solid ${C.bl}`, borderRadius: 5, fontFamily: M, fontSize: 9.5, letterSpacing: .8, fontWeight: 700, textTransform: "uppercase", cursor: "pointer", opacity: aiBusy ? .6 : 1 }}>{aiBusy ? "Reviewing…" : a.source === "ai" ? "↻ Re-run AI" : "🔍 Deep AI review"}</button>
      </div>

      <div style={{ padding: "12px 16px" }}>
        <div style={{ fontSize: 12, fontFamily: F, color: C.t1, marginBottom: 12, lineHeight: 1.5 }}>
          {a.summary} {a.riskScore != null && <span style={{ color: C.t4, fontFamily: M, fontSize: 10 }}>· clause risk {a.riskScore}/100 ({a.riskBand})</span>}
        </div>
        {error && <div style={{ color: C.rd, fontFamily: M, fontSize: 10.5, marginBottom: 8 }}>⚠ {error}</div>}
        {a.issues.length === 0 ? (
          <div style={{ fontSize: 11.5, fontFamily: F, color: C.gn }}>✓ No clauses flagged — nothing we're uncomfortable with.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {a.issues.map((it, i) => {
              const p = POS[it.position] || POS.NEGOTIATE;
              return (
                <div key={i} style={{ padding: "9px 11px", background: C.bg, border: `1px solid ${C.br}`, borderLeft: `3px solid ${p.c}`, borderRadius: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                    <span style={{ fontSize: 11.5, fontFamily: F, color: C.t1, fontWeight: 600 }}>{String(it.clauseType).replace(/_/g, " ")}</span>
                    <span style={{ fontSize: 8, fontFamily: M, color: SEV[it.severity] || C.t3, border: `1px solid ${(SEV[it.severity] || C.t3)}66`, borderRadius: 3, padding: "0 5px", textTransform: "uppercase" }}>{it.severity}</span>
                    <span style={{ fontSize: 8.5, fontFamily: M, color: p.c, border: `1px solid ${p.c}`, borderRadius: 3, padding: "1px 6px", textTransform: "uppercase", fontWeight: 700, marginLeft: "auto" }}>{p.label}</span>
                  </div>
                  <div style={{ fontSize: 11, fontFamily: F, color: C.t2, lineHeight: 1.45 }}>{it.concern}</div>
                  {it.recommendedPosition && <div style={{ fontSize: 10.5, fontFamily: F, color: C.t3, marginTop: 4, lineHeight: 1.45 }}><b style={{ color: C.tl }}>Our position:</b> {it.recommendedPosition}</div>}
                </div>
              );
            })}
          </div>
        )}
        <div style={{ fontSize: 9, fontFamily: M, color: C.t4, marginTop: 10, lineHeight: 1.4 }}>Advisory — informs your review; you decide what to accept, negotiate, or reject. The AI read covers the whole document, not just standard clause types.</div>
      </div>
    </div>
  );
}
