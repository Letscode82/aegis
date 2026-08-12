import { useState, useEffect, useCallback } from "react";
import { C, F, M, SR } from "@aegis/ui";

// ── Native e-signature signing surface (CTR-15) ──────────────────────
//
// The login-less page a signer reaches via a tokenised link. Review the
// contract → confirm identity + consent → sign. GET/POST
// /api/contract-sign/[token]. Content-hash-bound + IP/UA captured server-side.

const RISK_COLOR = { HIGH: C.rd, MEDIUM: C.am, LOW: C.gn };
const fmtDate = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : "—");
const shell = { minHeight: "100vh", background: C.bg, color: C.t1, fontFamily: F, padding: "6vh 16px", display: "flex", justifyContent: "center" };
const card = { width: "min(820px, 100%)", background: C.cd, border: `1px solid ${C.br}`, borderRadius: 8 };
const btn = (bg, fg) => ({ padding: "10px 18px", background: bg, color: fg || C.bg, border: "none", borderRadius: 5, fontFamily: M, fontSize: 11, letterSpacing: 1, fontWeight: 700, textTransform: "uppercase", cursor: "pointer" });

export function SigningView({ token }) {
  const [ctx, setCtx] = useState(null);
  const [error, setError] = useState(null);
  const [phase, setPhase] = useState("loading"); // loading | invalid | review | done | declined
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [executed, setExecuted] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/contract-sign/${token}`)
      .then((r) => (r.ok ? r.json() : r.json().then((d) => Promise.reject(d.error || `HTTP ${r.status}`))))
      .then((d) => { setCtx(d.context); setName(d.context.signerName || ""); setPhase("review"); })
      .catch((e) => { setError(String(e)); setPhase("invalid"); });
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const sign = async () => {
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/contract-sign/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "sign", typedName: name.trim(), agreed }) });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setExecuted(!!d.executed); setPhase("done");
    } catch (e) { setError(String(e.message || e)); } finally { setBusy(false); }
  };
  const decline = async () => {
    if (!window.confirm("Decline to sign this contract?")) return;
    setBusy(true);
    try { await fetch(`/api/contract-sign/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "decline" }) }); setPhase("declined"); }
    finally { setBusy(false); }
  };

  if (phase === "loading") return <div style={shell}><div style={{ ...card, padding: 40, textAlign: "center", color: C.t3, fontFamily: M }}>◎ Loading…</div></div>;
  if (phase === "invalid") return <div style={shell}><div style={{ ...card, padding: 40, textAlign: "center" }}><div style={{ fontSize: 18, fontFamily: SR, marginBottom: 8 }}>Link unavailable</div><div style={{ fontSize: 12, color: C.t3 }}>{error || "This signing link is invalid, expired, or already used."}</div></div></div>;
  if (phase === "declined") return <div style={shell}><div style={{ ...card, padding: 40, textAlign: "center" }}><div style={{ fontSize: 18, fontFamily: SR, color: C.am }}>Signature declined</div><div style={{ fontSize: 12, color: C.t3, marginTop: 8 }}>You've declined to sign. The legal team has been notified.</div></div></div>;
  if (phase === "done") return <div style={shell}><div style={{ ...card, padding: 40, textAlign: "center" }}><div style={{ fontSize: 40, marginBottom: 10 }}>✓</div><div style={{ fontSize: 20, fontFamily: SR, color: C.gn }}>Signed</div><div style={{ fontSize: 12.5, color: C.t2, marginTop: 10, lineHeight: 1.6 }}>Thank you, {name}. Your electronic signature has been recorded and is bound to the exact contract terms in a tamper-evident ledger{executed ? ", and the contract is now fully executed" : " — awaiting the other party's signature"}.</div></div></div>;

  const c = ctx.contract;
  return <div style={shell}><div style={card}>
    <div style={{ padding: "22px 24px", borderBottom: `1px solid ${C.br}` }}>
      <div style={{ fontSize: 10, fontFamily: M, letterSpacing: 2, color: C.bl, textTransform: "uppercase" }}>AEGIS · Electronic Signature</div>
      <div style={{ fontSize: 22, fontFamily: SR, color: C.t1, marginTop: 4 }}>{c.title}</div>
      <div style={{ fontSize: 11.5, color: C.t3, marginTop: 4 }}>{c.type}{c.counterpartyName ? ` · ${c.counterpartyName}` : ""}{c.governingLaw ? ` · ${c.governingLaw}` : ""}</div>
    </div>

    <div style={{ padding: "18px 24px", maxHeight: "44vh", overflow: "auto", borderBottom: `1px solid ${C.br}` }}>
      <div style={{ fontSize: 12, fontFamily: SR, marginBottom: 10 }}>Contract clauses</div>
      {(c.clauses || []).map((cl) => (
        <div key={cl.id} style={{ padding: "8px 0", borderBottom: `1px solid ${C.br}22` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: C.t1 }}>{String(cl.type).replace(/_/g, " ")}</span>
            <span style={{ fontSize: 8, fontFamily: M, color: RISK_COLOR[cl.risk] || C.t3, border: `1px solid ${(RISK_COLOR[cl.risk] || C.t3)}66`, borderRadius: 3, padding: "0 5px" }}>{cl.risk}</span>
          </div>
          <div style={{ fontSize: 11.5, color: C.t2, lineHeight: 1.5 }}>{cl.text}</div>
        </div>
      ))}
      {(c.obligations || []).length > 0 && <div style={{ marginTop: 12, fontSize: 10, color: C.t4, fontFamily: M }}>{c.obligations.length} obligation(s) · e.g. {c.obligations[0].description} (due {fmtDate(c.obligations[0].dueDate)})</div>}
    </div>

    <div style={{ padding: "20px 24px" }}>
      <div style={{ fontSize: 13, fontFamily: SR, marginBottom: 12 }}>Sign this contract</div>
      <label style={{ display: "block", fontSize: 9, fontFamily: M, color: C.t3, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>Your full legal name</label>
      <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.br}`, borderRadius: 5, color: C.t1, fontFamily: "cursive, " + F, fontSize: 20, padding: "10px 12px", marginBottom: 12 }} placeholder="Type your name to sign" />
      <label style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer", fontSize: 11.5, color: C.t2, lineHeight: 1.5, marginBottom: 14 }}>
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ marginTop: 2 }} />
        <span>I intend this typed name to be my electronic signature, I agree to sign electronically, and I have authority to bind {ctx.party === "COUNTERPARTY" ? (c.counterpartyName || "the counterparty") : "my organization"}. My IP address and timestamp are recorded.</span>
      </label>
      {error && <div style={{ color: C.rd, fontFamily: M, fontSize: 11, marginBottom: 12 }}>⚠ {error}</div>}
      <div style={{ display: "flex", gap: 10 }}>
        <button disabled={busy || !name.trim() || !agreed} onClick={sign} style={{ ...btn(name.trim() && agreed ? C.gn : C.br), opacity: !name.trim() || !agreed ? .5 : 1 }}>{busy ? "Signing…" : "✍ Sign contract"}</button>
        <button disabled={busy} onClick={decline} style={{ padding: "10px 18px", background: "transparent", color: C.rd, border: `1px solid ${C.rd}`, borderRadius: 5, fontFamily: M, fontSize: 11, letterSpacing: 1, fontWeight: 600, textTransform: "uppercase", cursor: "pointer" }}>Decline</button>
      </div>
    </div>
  </div></div>;
}
