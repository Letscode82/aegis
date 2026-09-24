import { useState, useEffect, useCallback } from "react";
import { C, F, M, SR, ReviewCockpit, useReviewKeyboard } from "@aegis/ui";

// Contract review cockpit (PR-R2). A Relativity-style pass over the
// contracts that need review, on the shared ReviewCockpit:
//   left   — the review queue (J/K to move, U to jump to the next in-review)
//   center — the contract: review verdict, flagged clauses, key terms
//   right  — the decision: advance the CLM lifecycle (state-machine guarded)
//            + run the deep AI review. Move through the queue without leaving.
// Reuses the existing /overview, /{id}, /{id}/assessment and /{id}/status
// endpoints — no new API, no schema.

const money = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}k`;
  return `$${v.toFixed(0)}`;
};
const STATUS_COLOR = { DRAFT: C.t3, IN_REVIEW: C.bl, IN_NEGOTIATION: C.am, APPROVED: C.tl, EXECUTED: C.gn, ACTIVE: C.gn, EXPIRED: C.rd, TERMINATED: C.t4 };
const RISK_COLOR = { LOW: C.gn, MEDIUM: C.am, HIGH: C.rd };
const VERDICT = {
  SIGN_AS_IS: { label: "OK to sign as-is", c: C.gn, glyph: "✓" },
  NEGOTIATE: { label: "Negotiate before signing", c: C.am, glyph: "⚖" },
  DO_NOT_SIGN: { label: "Do not sign as-is", c: C.rd, glyph: "⛔" },
};
const POS = { ACCEPT: C.gn, NEGOTIATE: C.am, REJECT: C.rd };
const REVIEWED = new Set(["APPROVED", "EXECUTED", "ACTIVE", "TERMINATED", "EXPIRED"]);
const TRANSITION_LABEL = { IN_REVIEW: "Send to review", IN_NEGOTIATION: "Send to negotiation", APPROVED: "Approve", EXECUTED: "Mark executed", ACTIVE: "Activate", TERMINATED: "Terminate", DRAFT: "Back to draft", EXPIRED: "Mark expired" };
const TRANSITION_COLOR = { APPROVED: C.gn, EXECUTED: C.gn, ACTIVE: C.gn, IN_NEGOTIATION: C.am, TERMINATED: C.rd, DRAFT: C.t3, IN_REVIEW: C.bl, EXPIRED: C.t4 };

export function ContractReviewCockpit({ contracts, startIndex = 0, onClose, onChanged }) {
  const [list, setList] = useState(contracts || []);
  const [idx, setIdx] = useState(Math.min(Math.max(0, startIndex), Math.max(0, (contracts || []).length - 1)));
  const [detail, setDetail] = useState(null);
  const [assessment, setAssessment] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [changed, setChanged] = useState(false);

  const active = list[idx] || null;
  const activeId = active ? active.id : null;

  const load = useCallback((id) => {
    if (!id) return;
    setDetail(null);
    setAssessment(null);
    setError(null);
    fetch(`/api/contracts/${id}`)
      .then((r) => (r.ok ? r.json() : r.json().then((d) => Promise.reject(d.error || `HTTP ${r.status}`))))
      .then((d) => setDetail(d.contract || d))
      .catch((e) => setError(String(e)));
    fetch(`/api/contracts/${id}/assessment`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setAssessment(d && d.assessment ? d.assessment : null))
      .catch(() => setAssessment(null));
  }, []);
  useEffect(() => { load(activeId); }, [activeId, load]);

  const close = () => { if (changed && onChanged) onChanged(); onClose(); };
  const go = (delta) => setIdx((i) => Math.min(list.length - 1, Math.max(0, i + delta)));
  const nextReviewable = () => {
    for (let k = 1; k <= list.length; k++) {
      const j = (idx + k) % list.length;
      if (!REVIEWED.has(list[j].status)) { setIdx(j); return; }
    }
  };
  const markStatus = (id, status) => setList((L) => L.map((c) => (c.id === id ? { ...c, status } : c)));

  const transition = async (status) => {
    if (!activeId) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/contracts/${activeId}/status`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      markStatus(activeId, d.status);
      setChanged(true);
      load(activeId);
      if (REVIEWED.has(d.status)) setTimeout(nextReviewable, 0);
    } catch (e) { setError(String(e.message || e)); } finally { setBusy(false); }
  };

  const runAI = async () => {
    if (!activeId) return;
    setAiBusy(true); setError(null);
    try {
      const r = await fetch(`/api/contracts/${activeId}/assessment`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setAssessment(d.assessment);
    } catch (e) { setError(String(e.message || e)); } finally { setAiBusy(false); }
  };

  const allowed = (detail && detail.allowedTransitions) || [];

  useReviewKeyboard([
    { keys: ["j", "ArrowDown"], run: () => go(1) },
    { keys: ["k", "ArrowUp"], run: () => go(-1) },
    { keys: ["u"], run: nextReviewable },
    { keys: ["a"], run: () => { if (allowed.includes("APPROVED") && !busy) transition("APPROVED"); } },
    { keys: ["Escape"], run: close },
  ]);

  const doneCount = list.filter((c) => REVIEWED.has(c.status)).length;

  const queue = (
    <div>
      <div style={{ padding: "10px 12px 8px", fontSize: 9, fontFamily: M, color: C.t4, letterSpacing: 1, textTransform: "uppercase", borderBottom: `1px solid ${C.br}` }}>Review queue · {list.length}</div>
      {list.map((c, i) => {
        const activeRow = i === idx;
        return (
          <div key={c.id} onClick={() => setIdx(i)} style={{ padding: "9px 12px", borderBottom: `1px solid ${C.br}33`, cursor: "pointer", background: activeRow ? C.s1 : "transparent", borderLeft: `2px solid ${activeRow ? C.bl : "transparent"}`, opacity: REVIEWED.has(c.status) ? 0.6 : 1 }}>
            <div style={{ fontSize: 12, color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</div>
            <div style={{ display: "flex", gap: 8, marginTop: 3, alignItems: "center" }}>
              <span style={{ fontFamily: M, fontSize: 8.5, letterSpacing: 0.5, color: STATUS_COLOR[c.status] || C.t3 }}>{String(c.status).replace(/_/g, " ")}</span>
              {c.risk && <span style={{ fontFamily: M, fontSize: 8.5, color: RISK_COLOR[c.risk] || C.t3 }}>{c.risk}</span>}
              {c.counterpartyName && <span style={{ fontFamily: M, fontSize: 9, color: C.t4, marginLeft: "auto", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 110 }}>{c.counterpartyName}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );

  const v = assessment ? VERDICT[assessment.verdict] || VERDICT.NEGOTIATE : null;
  const viewer = (
    <div style={{ padding: 16 }}>
      {!detail && !error && <div style={{ padding: 40, textAlign: "center", color: C.t3, fontFamily: M, fontSize: 12 }}>◎ Loading contract…</div>}
      {error && <div style={{ color: C.rd, fontFamily: M, fontSize: 12, marginBottom: 10 }}>⚠ {error}</div>}
      {detail && (
        <>
          <div style={{ fontSize: 18, fontFamily: SR, color: C.t1 }}>{detail.title}</div>
          <div style={{ fontSize: 11, color: C.t3, fontFamily: M, marginTop: 2 }}>
            {detail.type} · {String(detail.status).replace(/_/g, " ")}{detail.counterpartyName ? ` · ${detail.counterpartyName}` : ""}{detail.value != null ? ` · ${money(detail.value)}` : ""}
          </div>

          {v && (
            <div style={{ marginTop: 12, border: `1px solid ${v.c}55`, borderLeft: `3px solid ${v.c}`, borderRadius: 8, padding: "10px 12px", background: C.s1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 15 }}>{v.glyph}</span>
                <span style={{ fontSize: 13.5, fontFamily: SR, color: v.c }}>{v.label}</span>
                <span style={{ fontSize: 8.5, fontFamily: M, color: assessment.source === "ai" ? C.bl : C.t4, border: `1px solid ${assessment.source === "ai" ? C.bl : C.br}`, borderRadius: 3, padding: "1px 6px", textTransform: "uppercase", marginLeft: "auto" }}>{assessment.source === "ai" ? "🤖 AI" : "deterministic"}</span>
              </div>
              <div style={{ fontSize: 11.5, color: C.t2, marginTop: 6, lineHeight: 1.5 }}>{assessment.summary}{assessment.riskScore != null ? ` · clause risk ${assessment.riskScore}/100` : ""}</div>
            </div>
          )}

          <div style={{ marginTop: 12, fontSize: 9, fontFamily: M, color: C.t4, letterSpacing: 1, textTransform: "uppercase" }}>Flagged clauses</div>
          {assessment && assessment.issues && assessment.issues.length > 0 ? (
            <div style={{ display: "grid", gap: 8, marginTop: 6 }}>
              {assessment.issues.map((it, i) => (
                <div key={i} style={{ padding: "9px 11px", background: C.bg, border: `1px solid ${C.br}`, borderLeft: `3px solid ${POS[it.position] || C.am}`, borderRadius: 6 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 3 }}>
                    <span style={{ fontSize: 11.5, color: C.t1, fontWeight: 600 }}>{String(it.clauseType).replace(/_/g, " ")}</span>
                    <span style={{ fontSize: 8, fontFamily: M, color: RISK_COLOR[it.severity] || C.t3, border: `1px solid ${RISK_COLOR[it.severity] || C.t3}66`, borderRadius: 3, padding: "0 5px", textTransform: "uppercase" }}>{it.severity}</span>
                    <span style={{ fontSize: 8.5, fontFamily: M, color: POS[it.position] || C.am, border: `1px solid ${POS[it.position] || C.am}`, borderRadius: 3, padding: "1px 6px", textTransform: "uppercase", fontWeight: 700, marginLeft: "auto" }}>{it.position}</span>
                  </div>
                  <div style={{ fontSize: 11, color: C.t2, lineHeight: 1.45 }}>{it.concern}</div>
                  {it.recommendedPosition && <div style={{ fontSize: 10.5, color: C.t3, marginTop: 4 }}><b style={{ color: C.tl }}>Our position:</b> {it.recommendedPosition}</div>}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: C.gn, marginTop: 6 }}>✓ No clauses flagged.</div>
          )}
        </>
      )}
    </div>
  );

  const coding = (
    <div style={{ padding: 16 }}>
      <div style={{ fontSize: 9, fontFamily: M, color: C.t4, letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>Your decision</div>
      {!detail && <div style={{ fontSize: 11, color: C.t3, fontFamily: M }}>Select a contract.</div>}
      {detail && (
        <div style={{ display: "grid", gap: 10 }}>
          <button type="button" disabled={aiBusy} onClick={runAI} style={btnOutline(C.bl)}>{aiBusy ? "Reviewing…" : assessment && assessment.source === "ai" ? "↻ Re-run AI review" : "🔍 Deep AI review"}</button>
          {allowed.length === 0 && <div style={{ fontSize: 11, color: C.t3, fontFamily: M }}>No lifecycle actions available from {String(detail.status).replace(/_/g, " ").toLowerCase()}.</div>}
          {allowed.map((s) => (
            <button key={s} type="button" disabled={busy} onClick={() => transition(s)} style={btn(TRANSITION_COLOR[s] || C.bl, busy)}>
              {TRANSITION_LABEL[s] || s}{s === "APPROVED" ? " · A" : ""}
            </button>
          ))}
        </div>
      )}
      {error && <div style={{ color: C.rd, fontSize: 11, fontFamily: M, marginTop: 10 }}>⚠ {error}</div>}
      <div style={{ fontSize: 9, color: C.t4, fontFamily: M, marginTop: 16, lineHeight: 1.4 }}>Lifecycle transitions are state-machine guarded and chain-sealed. Clause positions are advisory.</div>
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 120, background: C.bg }}>
      <ReviewCockpit
        title="Contract review"
        subtitle={active ? active.title : undefined}
        onBack={close}
        progress={{ done: doneCount, total: list.length, label: "Resolved" }}
        legend={[
          { keys: ["J"], label: "Next" },
          { keys: ["K"], label: "Prev" },
          { keys: ["U"], label: "Next to review" },
          { keys: ["A"], label: "Approve" },
          { keys: ["Esc"], label: "Close" },
        ]}
        queue={queue}
        viewer={viewer}
        coding={coding}
      />
    </div>
  );
}

const btn = (bg, busy) => ({ background: bg, color: C.bg, border: "none", padding: "10px 14px", borderRadius: 4, fontFamily: M, fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1, textAlign: "left" });
const btnOutline = (col) => ({ background: "transparent", color: col, border: `1px solid ${col}`, padding: "10px 14px", borderRadius: 4, fontFamily: M, fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", cursor: "pointer", textAlign: "left" });
