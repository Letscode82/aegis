import { useState, useEffect } from "react";
import { C, F, M, SR } from "@aegis/ui";

// ── Review 3rd-party contract (CTR-12) ───────────────────────────────
//
// The business pastes a contract received on the counterparty's paper and
// submits it for internal-legal review. POST /api/contracts/review-third-party
// creates a THIRD_PARTY contract, extracts + risk-scores the clauses, and starts
// the governance review ladder (AI risk → legal → GC → signature). From there
// the business ↔ legal back-and-forth runs in the collaboration thread.

const inp = { width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.br}`, borderRadius: 5, color: C.t1, fontFamily: F, fontSize: 12, padding: "8px 9px" };
const lbl = { fontSize: 9, fontFamily: M, color: C.t3, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4, display: "block" };

export function ReviewThirdPartyModal({ onClose, onCreated }) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState("MSA");
  const [counterpartyId, setCounterpartyId] = useState("");
  const [text, setText] = useState("");
  const [governingLaw, setGoverningLaw] = useState("");
  const [counterparties, setCounterparties] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    fetch("/api/contracts/counterparties").then((r) => (r.ok ? r.json() : null)).then((d) => setCounterparties(d?.counterparties || d?.options || [])).catch(() => {});
  }, []);

  const submit = async () => {
    if (!title.trim()) { setErr("Give it a title."); return; }
    if (!text.trim()) { setErr("Paste the third-party contract text."); return; }
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/contracts/review-third-party", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), type, counterpartyId: counterpartyId || null, text, governingLaw: governingLaw || null }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      onCreated?.(d.contractId, d);
    } catch (e) { setErr(String(e.message || e)); } finally { setBusy(false); }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 620, maxWidth: "100%", maxHeight: "88vh", overflow: "auto", background: C.cd, border: `1px solid ${C.br}`, borderRadius: 8, padding: 20 }}>
        <div style={{ fontSize: 15, fontFamily: SR, color: C.t1, marginBottom: 3 }}>Review a third-party contract</div>
        <div style={{ fontSize: 11, color: C.t3, marginBottom: 16, lineHeight: 1.5 }}>Paste the counterparty's paper. AEGIS creates it as <b>third-party</b>, extracts and risk-scores the clauses, and starts the internal legal review ladder — then discuss with the business in the collaboration thread and sign when approved.</div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10, marginBottom: 10 }}>
          <div><label style={lbl}>Title</label><input value={title} onChange={(e) => setTitle(e.target.value)} style={inp} placeholder="Acme MSA (their paper)" /></div>
          <div><label style={lbl}>Type</label><input value={type} onChange={(e) => setType(e.target.value)} style={inp} placeholder="MSA" /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div><label style={lbl}>Counterparty</label>
            <select value={counterpartyId} onChange={(e) => setCounterpartyId(e.target.value)} style={inp}>
              <option value="">— (optional)</option>
              {counterparties.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div><label style={lbl}>Governing law</label><input value={governingLaw} onChange={(e) => setGoverningLaw(e.target.value)} style={inp} placeholder="e.g. Delaware" /></div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Third-party contract text</label>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={11} style={{ ...inp, resize: "vertical", fontFamily: F }} placeholder="Paste the full contract text the counterparty sent…" />
        </div>
        {err && <div style={{ color: C.rd, fontFamily: M, fontSize: 10.5, marginBottom: 10 }}>⚠ {err}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "8px 13px", background: "transparent", color: C.t3, border: `1px solid ${C.br}`, borderRadius: 5, fontFamily: M, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", cursor: "pointer" }}>Cancel</button>
          <button onClick={submit} disabled={busy} style={{ padding: "8px 15px", background: C.bl, color: "#fff", border: "none", borderRadius: 5, fontFamily: M, fontSize: 10, letterSpacing: 1, fontWeight: 700, textTransform: "uppercase", cursor: "pointer", opacity: busy ? .6 : 1 }}>{busy ? "Submitting…" : "Submit for review"}</button>
        </div>
      </div>
    </div>
  );
}
