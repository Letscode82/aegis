import { useState } from "react";
import { C, F, M, SR } from "@aegis/ui";

// ── Guided contract-approval wizard (CTR-8) ──────────────────────────
//
// The user-guided path onto the Approve stage. Four steps —
// Scope → AI risk check → Route → Submit — that end by starting the shared
// `clm_contract_approval` ladder (POST /approval/submit) and moving the
// contract into IN_REVIEW. The single-page lifecycle controls stay for
// power users; this wizard is the guided parallel entry point, mirroring
// the Legal Hold wizard idiom.

const money = (n, ccy) => {
  if (n == null) return "—";
  const v = Number(n) || 0;
  const sym = ccy === "EUR" ? "€" : ccy === "GBP" ? "£" : "$";
  if (Math.abs(v) >= 1_000_000) return `${sym}${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `${sym}${(v / 1_000).toFixed(1)}k`;
  return `${sym}${v.toFixed(0)}`;
};

// Preview of the seeded clm_contract_approval ladder (packages/workflow/src/library.ts).
const LADDER_PREVIEW = [
  { n: 1, name: "Draft & Submit", role: "Requester", kind: "HUMAN" },
  { n: 2, name: "AI Risk Review", role: "Attorney", kind: "AGENT" },
  { n: 3, name: "Legal Review", role: "Attorney", kind: "HUMAN" },
  { n: 4, name: "Finance Review", role: "Legal Ops", kind: "HUMAN", skipUnder: 10000 },
  { n: 5, name: "GC Approval", role: "General Counsel", kind: "HUMAN" },
  { n: 6, name: "Counter-signature", role: "General Counsel", kind: "HUMAN" },
];

const STEPS = ["Scope", "AI risk check", "Route", "Submit"];

function Dot({ i, cur }) {
  const done = i < cur, active = i === cur;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 20, height: 20, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontFamily: M, fontWeight: 700, color: done || active ? C.bg : C.t3, background: done || active ? (done ? C.gn : C.cy) : "transparent", border: `1px solid ${done ? C.gn : active ? C.cy : C.br}` }}>{done ? "✓" : i + 1}</span>
      <span style={{ fontSize: 10, fontFamily: M, color: active ? C.t1 : C.t4, fontWeight: active ? 700 : 500 }}>{STEPS[i]}</span>
    </div>
  );
}

export function ApprovalWizard({ contract, contractId, onClose, onSubmitted }) {
  const [step, setStep] = useState(0);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [done, setDone] = useState(false);

  const value = Number(contract?.value ?? 0);
  const rs = contract?.riskScore;

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/contracts/${contractId}/approval/submit`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setDone(true);
      onSubmitted?.();
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  const canNext = step === 1 ? ack : true;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(620px, 96vw)", maxHeight: "90vh", overflowY: "auto", background: C.bg, border: `1px solid ${C.br}`, borderRadius: 10, fontFamily: F, color: C.t1 }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.br}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 9.5, fontFamily: M, letterSpacing: 1.6, color: C.bl, textTransform: "uppercase" }}>Guided · Submit for approval</div>
            <div style={{ fontSize: 17, fontFamily: SR, marginTop: 2 }}>{contract?.title || "Contract"}</div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: C.t3, fontSize: 20, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>

        {!done && (
          <div style={{ padding: "12px 20px", borderBottom: `1px solid ${C.br}`, display: "flex", gap: 14, flexWrap: "wrap" }}>
            {STEPS.map((_, i) => <Dot key={i} i={i} cur={step} />)}
          </div>
        )}

        <div style={{ padding: "18px 20px", minHeight: 200 }}>
          {done ? (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <div style={{ fontSize: 34 }}>✓</div>
              <div style={{ fontSize: 16, fontFamily: SR, marginTop: 8 }}>Submitted for approval</div>
              <div style={{ fontSize: 11, fontFamily: M, color: C.t3, marginTop: 8, lineHeight: 1.6, maxWidth: 420, marginInline: "auto" }}>
                The <b style={{ color: C.t2 }}>Contract Approval ladder</b> is now running and the contract moved to <b style={{ color: C.cy }}>In approval</b>. Track and approve each step from the ladder panel in the contract workspace.
              </div>
              <button onClick={onClose} style={{ marginTop: 18, padding: "8px 18px", background: C.bl, color: "#fff", border: `1px solid ${C.bl}`, borderRadius: 6, fontFamily: M, fontSize: 11, fontWeight: 700, letterSpacing: .8, textTransform: "uppercase", cursor: "pointer" }}>Open workspace</button>
            </div>
          ) : step === 0 ? (
            <div>
              <div style={{ fontSize: 12, fontFamily: M, color: C.t3, marginBottom: 14, lineHeight: 1.5 }}>Confirm what you're routing into the approval ladder.</div>
              {[["Counterparty", contract?.counterpartyName || "—"], ["Type", (contract?.type || "—").replace(/_/g, " ")], ["Value", money(contract?.value, contract?.currency)], ["Current stage", (contract?.status || "").replace(/_/g, " ")]].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.br}33`, fontSize: 12 }}>
                  <span style={{ fontFamily: M, fontSize: 10, color: C.t4, textTransform: "uppercase", letterSpacing: .8 }}>{k}</span>
                  <span style={{ color: C.t1 }}>{v}</span>
                </div>
              ))}
            </div>
          ) : step === 1 ? (
            <div>
              <div style={{ fontSize: 12, fontFamily: M, color: C.t3, marginBottom: 14, lineHeight: 1.5 }}>The deterministic, clause-derived risk read. Acknowledge it before routing — AI findings are advisory and never gate the ladder on their own.</div>
              {rs && rs.score != null ? (
                <div style={{ padding: "14px 16px", border: `1px solid ${C.br}`, borderRadius: 8, background: C.cd }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                    <span style={{ fontSize: 30, fontFamily: SR, color: rs.band === "HIGH" ? C.rd : rs.band === "MEDIUM" ? C.am : C.gn }}>{rs.score}</span>
                    <span style={{ fontSize: 11, fontFamily: M, color: C.t3 }}>/100 · {rs.band}</span>
                    <span style={{ fontSize: 10, fontFamily: M, color: C.t4, marginLeft: "auto" }}>{rs.deviationCount || 0} deviation{rs.deviationCount === 1 ? "" : "s"}</span>
                  </div>
                  {(rs.drivers || []).length > 0 && (
                    <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {rs.drivers.map((d, i) => <span key={i} style={{ fontSize: 9, fontFamily: M, color: d.deviation ? C.rd : C.t3, border: `1px solid ${d.deviation ? C.rd : C.br}`, borderRadius: 3, padding: "2px 6px" }}>{d.type.replace(/_/g, " ")}{d.deviation ? " ⚠" : ""}</span>)}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ padding: "14px 16px", border: `1px dashed ${C.br}`, borderRadius: 8, fontSize: 11, fontFamily: M, color: C.t4 }}>No clauses extracted yet — this contract is unscored. Legal review in the ladder will assess risk directly.</div>
              )}
              <label style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 16, cursor: "pointer", fontSize: 11.5 }}>
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} style={{ marginTop: 2 }} />
                <span style={{ color: C.t2, lineHeight: 1.5 }}>I've reviewed the AI risk read and I'm routing this contract into the approval ladder.</span>
              </label>
            </div>
          ) : step === 2 ? (
            <div>
              <div style={{ fontSize: 12, fontFamily: M, color: C.t3, marginBottom: 14, lineHeight: 1.5 }}>The governance route this contract will run. Steps advance one reviewer at a time; any step can send it back.</div>
              {LADDER_PREVIEW.map((s) => {
                const skipped = s.skipUnder != null && value < s.skipUnder;
                return (
                  <div key={s.n} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.br}33`, opacity: skipped ? .45 : 1 }}>
                    <span style={{ width: 20, height: 20, flexShrink: 0, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontFamily: M, fontWeight: 700, color: C.t3, border: `1px solid ${C.br}` }}>{s.n}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ fontSize: 12 }}>{s.name}</span>
                        {s.kind === "AGENT" && <span style={{ fontSize: 8.5, fontFamily: M, color: C.bl, border: `1px solid ${C.bl}`, borderRadius: 3, padding: "1px 5px" }}>🤖 AI</span>}
                        {skipped && <span style={{ fontSize: 8.5, fontFamily: M, color: C.t4 }}>skipped · value under {money(s.skipUnder)}</span>}
                      </div>
                      <div style={{ fontSize: 9, fontFamily: M, color: C.t4, marginTop: 2 }}>{s.role}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 12, fontFamily: M, color: C.t3, marginBottom: 14, lineHeight: 1.5 }}>Submitting starts the ladder and moves this contract to <b style={{ color: C.cy }}>In approval</b>. It stays there until every step is approved, then advances to <b style={{ color: C.gn }}>Approved</b> automatically.</div>
              <div style={{ padding: "14px 16px", border: `1px solid ${C.br}`, borderRadius: 8, background: C.cd, fontSize: 11.5, fontFamily: M, color: C.t2, lineHeight: 1.6 }}>
                Ladder: <b>Contract Approval</b><br />
                Contract: <b>{contract?.title}</b> · {money(contract?.value, contract?.currency)}<br />
                Governance: chain-sealed at every step.
              </div>
              {err && <div style={{ fontSize: 10.5, fontFamily: M, color: C.rd, marginTop: 12 }}>⚠ {err}</div>}
            </div>
          )}
        </div>

        {!done && (
          <div style={{ padding: "14px 20px", borderTop: `1px solid ${C.br}`, display: "flex", justifyContent: "space-between", gap: 10 }}>
            <button onClick={() => (step === 0 ? onClose() : setStep(step - 1))} style={{ padding: "8px 16px", background: "transparent", color: C.t3, border: `1px solid ${C.br}`, borderRadius: 6, fontFamily: M, fontSize: 10.5, letterSpacing: .6, textTransform: "uppercase", cursor: "pointer" }}>{step === 0 ? "Cancel" : "← Back"}</button>
            {step < STEPS.length - 1 ? (
              <button disabled={!canNext} onClick={() => setStep(step + 1)} style={{ padding: "8px 18px", background: canNext ? C.bl : C.cd, color: canNext ? "#fff" : C.t4, border: `1px solid ${canNext ? C.bl : C.br}`, borderRadius: 6, fontFamily: M, fontSize: 10.5, fontWeight: 700, letterSpacing: .6, textTransform: "uppercase", cursor: canNext ? "pointer" : "not-allowed" }}>Next →</button>
            ) : (
              <button disabled={busy} onClick={submit} style={{ padding: "8px 20px", background: busy ? C.cd : C.gn, color: busy ? C.t4 : C.bg, border: `1px solid ${busy ? C.br : C.gn}`, borderRadius: 6, fontFamily: M, fontSize: 10.5, fontWeight: 700, letterSpacing: .6, textTransform: "uppercase", cursor: busy ? "not-allowed" : "pointer" }}>{busy ? "Submitting…" : "✓ Submit for approval"}</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
