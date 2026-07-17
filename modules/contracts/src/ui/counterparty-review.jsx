import { useState, useEffect, useCallback } from "react";
import { C, F, M, SR } from "@aegis/ui";

// ── Counterparty Review portal (CTR-3) ───────────────────────────────
//
// The login-less external surface a counterparty contact reaches via a
// tokenised link. Flow: consent gate → read the draft (clauses +
// obligations) → accept / counter / comment. Every action is chain-
// sealed server-side; nothing here executes the contract — it feeds a
// governed internal review step. Self-contained (no AppShell); the page
// mounts it full-bleed.

const RISK_COLOR = { HIGH: C.rd, MEDIUM: C.am, LOW: C.gn };
const fmtDate = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : "—");
const money = (n, ccy) => {
  if (n == null) return null;
  const sym = ccy === "EUR" ? "€" : ccy === "GBP" ? "£" : "$";
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1_000_000) return `${sym}${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `${sym}${(v / 1_000).toFixed(1)}k`;
  return `${sym}${v.toFixed(0)}`;
};

const shell = { minHeight: "100vh", background: C.bg, color: C.t1, fontFamily: F, padding: "6vh 16px", display: "flex", justifyContent: "center" };
const card = { width: "min(820px, 100%)", background: C.cd, border: `1px solid ${C.br}`, borderRadius: 8 };
const btn = (bg, fg) => ({ padding: "9px 16px", background: bg, color: fg || C.bg, border: "none", borderRadius: 5, fontFamily: M, fontSize: 11, letterSpacing: 1, fontWeight: 700, textTransform: "uppercase", cursor: "pointer" });
const ghost = (col) => ({ padding: "9px 16px", background: "transparent", color: col, border: `1px solid ${col}`, borderRadius: 5, fontFamily: M, fontSize: 11, letterSpacing: 1, fontWeight: 600, textTransform: "uppercase", cursor: "pointer" });

export function CounterpartyReviewView({ token }) {
  const [ctx, setCtx] = useState(null);
  const [error, setError] = useState(null);
  const [phase, setPhase] = useState("loading"); // loading | invalid | consent | review | done
  const [decision, setDecision] = useState(null); // ACCEPT | COUNTER | COMMENT
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [doneKind, setDoneKind] = useState(null);

  const load = useCallback(() => {
    fetch(`/api/contract-review/${token}`)
      .then((r) => (r.ok ? r.json() : r.json().then((d) => Promise.reject(d.error || `HTTP ${r.status}`))))
      .then((d) => { setCtx(d.context); setPhase(d.context.consented ? "review" : "consent"); })
      .catch((e) => { setError(String(e)); setPhase("invalid"); });
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const consent = async () => {
    setBusy(true);
    try {
      const r = await fetch(`/api/contract-review/${token}/consent`, { method: "POST" });
      if (!r.ok) throw new Error((await r.json()).error || `HTTP ${r.status}`);
      setPhase("review");
    } catch (e) { setError(String(e.message || e)); } finally { setBusy(false); }
  };

  const submit = async () => {
    if (!decision) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/contract-review/${token}/respond`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, comment }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setDoneKind(decision);
      if (decision === "COMMENT") { setComment(""); setDecision(null); load(); }
      else setPhase("done");
    } catch (e) { setError(String(e.message || e)); } finally { setBusy(false); }
  };

  if (phase === "loading") return <div style={shell}><div style={{ ...card, padding: 48, textAlign: "center", color: C.t3, fontFamily: M, letterSpacing: 1 }}>◎ Loading review…</div></div>;

  if (phase === "invalid") return <div style={shell}><div style={{ ...card, padding: 40, textAlign: "center" }}>
    <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
    <div style={{ fontSize: 18, fontFamily: SR, marginBottom: 8 }}>This review link is no longer valid</div>
    <div style={{ fontSize: 12, color: C.t3, lineHeight: 1.6 }}>{error || "The link may have expired, been used, or been revoked."} Please contact the legal team that sent it for a fresh link.</div>
  </div></div>;

  const c = ctx.contract;

  if (phase === "done") return <div style={shell}><div style={{ ...card, padding: 40, textAlign: "center" }} role="status" aria-live="polite">
    <div style={{ fontSize: 40, marginBottom: 12 }}>{doneKind === "ACCEPT" ? "✅" : "↩︎"}</div>
    <div style={{ fontSize: 19, fontFamily: SR, marginBottom: 8 }}>{doneKind === "ACCEPT" ? "Response recorded — accepted" : "Counter-proposal recorded"}</div>
    <div style={{ fontSize: 12, color: C.t3, lineHeight: 1.6, maxWidth: 460, margin: "0 auto" }}>
      Thank you. Your response on <b style={{ color: C.t1 }}>{c.title}</b> has been recorded and sent to the legal team for review.
      Nothing is executed by this step — the internal team will follow up. You can close this window.
    </div>
  </div></div>;

  // consent + review share the header
  const header = (
    <div style={{ padding: "18px 22px", borderBottom: `1px solid ${C.br}`, borderLeft: `3px solid ${RISK_COLOR[c.risk]}` }}>
      <div style={{ fontSize: 10, fontFamily: M, letterSpacing: 2, color: C.cy, textTransform: "uppercase", marginBottom: 5 }}>Counterparty Contract Review</div>
      <div style={{ fontSize: 22, fontFamily: SR, lineHeight: 1.2 }}>{c.title}</div>
      <div style={{ fontSize: 11.5, color: C.t3, marginTop: 4 }}>
        Prepared for <b style={{ color: C.t1 }}>{ctx.counterpartyName || ctx.counterpartyContact.name}</b>
        {c.type ? ` · ${c.type}` : ""}{money(c.value, c.currency) ? ` · ${money(c.value, c.currency)}` : ""}
        {c.governingLaw ? ` · ${c.governingLaw}` : ""}
      </div>
      <div style={{ marginTop: 8, display: "inline-block", padding: "3px 8px", borderRadius: 3, fontSize: 9, fontFamily: M, letterSpacing: 1, textTransform: "uppercase", color: C.am, border: `1px solid ${C.am}66` }}>
        Draft — not an executed instrument
      </div>
    </div>
  );

  if (phase === "consent") return <div style={shell}><div style={card}>
    {header}
    <div style={{ padding: "22px" }}>
      <div style={{ fontSize: 13, fontFamily: SR, marginBottom: 10 }}>Before you review</div>
      <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.7, marginBottom: 16 }}>
        You've been invited to review a draft contract. The contents are <b>confidential</b> and provided solely for
        your review. By continuing you acknowledge that this draft is not an offer or an executed agreement, that your
        comments and responses will be recorded and shared with the sending organisation's legal team, and that no
        term becomes binding through this portal — execution follows a separate signature process.
      </div>
      {error && <div style={{ color: C.rd, fontFamily: M, fontSize: 11, marginBottom: 12 }}>⚠ {error}</div>}
      <button disabled={busy} onClick={consent} style={btn(C.cy)}>{busy ? "…" : "I understand — view the draft"}</button>
    </div>
  </div></div>;

  // review
  return <div style={shell}><div style={card}>
    {header}
    <div style={{ padding: "18px 22px", borderBottom: `1px solid ${C.br}` }}>
      <div style={{ fontSize: 10, fontFamily: M, color: C.t3, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 600, marginBottom: 12 }}>
        Key terms <span style={{ color: C.t4 }}>· {c.clauses.length} clause{c.clauses.length === 1 ? "" : "s"}</span>
      </div>
      {c.clauses.length === 0 ? <div style={{ fontSize: 12, color: C.t4, fontStyle: "italic" }}>No itemised clauses on this draft.</div>
        : c.clauses.map((cl) => (
          <div key={cl.id} style={{ padding: "9px 0", borderBottom: `1px solid ${C.br}22` }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 3 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600 }}>{cl.type.replace(/_/g, " ")}</span>
              <span style={{ fontSize: 8.5, fontFamily: M, letterSpacing: .6, padding: "1px 6px", borderRadius: 3, textTransform: "uppercase", color: RISK_COLOR[cl.risk], border: `1px solid ${RISK_COLOR[cl.risk]}55` }}>{cl.risk}</span>
            </div>
            <div style={{ fontSize: 11.5, color: C.t2, lineHeight: 1.55 }}>{cl.text}</div>
          </div>
        ))}
      {c.obligations.length > 0 && <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 10, fontFamily: M, color: C.t3, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>Key dates &amp; obligations</div>
        {c.obligations.map((o) => (
          <div key={o.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "5px 0", fontSize: 11, borderBottom: `1px solid ${C.br}22` }}>
            <span style={{ color: C.t2 }}>{o.description}</span>
            <span style={{ color: C.t4, fontFamily: M, flexShrink: 0 }}>{fmtDate(o.dueDate)}</span>
          </div>
        ))}
      </div>}
    </div>

    {/* Response */}
    <div style={{ padding: "18px 22px" }}>
      <div style={{ fontSize: 13, fontFamily: SR, marginBottom: 12 }}>Your response</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {[{ k: "ACCEPT", label: "Accept the draft", col: C.gn }, { k: "COUNTER", label: "Propose changes (counter)", col: C.am }, { k: "COMMENT", label: "Add a comment", col: C.bl }].map((o) => (
          <button key={o.k} onClick={() => setDecision(o.k)} style={decision === o.k ? btn(o.col) : ghost(o.col)}>{o.label}</button>
        ))}
      </div>
      {(decision === "COUNTER" || decision === "COMMENT") && (
        <textarea
          value={comment} onChange={(e) => setComment(e.target.value)}
          placeholder={decision === "COUNTER" ? "Describe the changes you're proposing (clause, requested wording, rationale)…" : "Your comment for the legal team…"}
          rows={5}
          style={{ width: "100%", background: C.bg, border: `1px solid ${C.br}`, borderRadius: 5, color: C.t1, fontFamily: F, fontSize: 12, padding: "10px 12px", outline: "none", resize: "vertical", marginBottom: 12 }}
        />
      )}
      {decision === "ACCEPT" && <div style={{ fontSize: 11.5, color: C.t3, lineHeight: 1.6, marginBottom: 12 }}>
        You're recording that the counterparty accepts this draft. This does <b>not</b> execute the contract — the legal team will proceed to signature separately.
      </div>}
      {error && <div style={{ color: C.rd, fontFamily: M, fontSize: 11, marginBottom: 12 }}>⚠ {error}</div>}
      {doneKind === "COMMENT" && !decision && <div style={{ color: C.gn, fontFamily: M, fontSize: 11, marginBottom: 12 }}>✓ Comment recorded — add more, or accept / counter when ready.</div>}
      <button
        disabled={busy || !decision || ((decision === "COUNTER") && !comment.trim())}
        onClick={submit}
        style={{ ...btn(decision ? C.cy : C.br), opacity: !decision || (decision === "COUNTER" && !comment.trim()) ? 0.5 : 1 }}
      >
        {busy ? "Recording…" : decision === "ACCEPT" ? "Submit — accept" : decision === "COUNTER" ? "Submit counter-proposal" : decision === "COMMENT" ? "Add comment" : "Choose a response"}
      </button>
    </div>
  </div></div>;
}
