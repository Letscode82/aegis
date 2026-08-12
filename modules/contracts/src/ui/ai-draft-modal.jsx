import { useState, useEffect } from "react";
import { C, F, M, SR } from "@aegis/ui";

// ── Draft a contract with AI (CTR-14) ────────────────────────────────
//
// Describe the deal in plain language + key terms; Claude drafts a full
// contract on our paper using our playbook positions. Created as a DRAFT — the
// attorney reviews, edits, and runs the approval ladder. POST /api/contracts/
// draft-ai; degrades to a deterministic skeleton offline.

const inp = { width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.br}`, borderRadius: 5, color: C.t1, fontFamily: F, fontSize: 12, padding: "8px 9px" };
const lbl = { fontSize: 9, fontFamily: M, color: C.t3, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4, display: "block" };

export function AiDraftModal({ onClose, onCreated }) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState("MSA");
  const [counterpartyId, setCounterpartyId] = useState("");
  const [counterpartyName, setCounterpartyName] = useState("");
  const [brief, setBrief] = useState("");
  const [value, setValue] = useState("");
  const [governingLaw, setGoverningLaw] = useState("");
  const [termMonths, setTermMonths] = useState("");
  const [counterparties, setCounterparties] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    fetch("/api/contracts/counterparties").then((r) => (r.ok ? r.json() : null)).then((d) => setCounterparties(d?.counterparties || d?.options || [])).catch(() => {});
  }, []);

  const submit = async () => {
    if (!title.trim()) { setErr("Give it a title."); return; }
    if (!brief.trim()) { setErr("Describe what the contract should cover."); return; }
    setBusy(true); setErr(null);
    try {
      const cp = counterparties.find((c) => c.id === counterpartyId);
      const r = await fetch("/api/contracts/draft-ai", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(), type, counterpartyId: counterpartyId || null, counterpartyName: cp?.name || counterpartyName || null,
          brief, value: value || null, governingLaw: governingLaw || null, termMonths: termMonths || null,
        }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      onCreated?.(d.contractId, d);
    } catch (e) { setErr(String(e.message || e)); } finally { setBusy(false); }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 600, maxWidth: "100%", maxHeight: "88vh", overflow: "auto", background: C.cd, border: `1px solid ${C.br}`, borderRadius: 8, padding: 20 }}>
        <div style={{ fontSize: 15, fontFamily: SR, color: C.t1, marginBottom: 3 }}>✨ Draft a contract with AI</div>
        <div style={{ fontSize: 11, color: C.t3, marginBottom: 16, lineHeight: 1.5 }}>Describe the deal; AEGIS drafts a full contract on <b>our paper</b> using our playbook. It's created as a <b>DRAFT</b> for you to review, edit, and run through approval — the human is always the gate.</div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10, marginBottom: 10 }}>
          <div><label style={lbl}>Title</label><input value={title} onChange={(e) => setTitle(e.target.value)} style={inp} placeholder="Acme Master Services Agreement" /></div>
          <div><label style={lbl}>Type</label><input value={type} onChange={(e) => setType(e.target.value)} style={inp} placeholder="MSA" /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div><label style={lbl}>Counterparty</label>
            <select value={counterpartyId} onChange={(e) => setCounterpartyId(e.target.value)} style={inp}>
              <option value="">— (or type below)</option>
              {counterparties.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div><label style={lbl}>…or name</label><input value={counterpartyName} onChange={(e) => setCounterpartyName(e.target.value)} style={inp} placeholder="Acme Corp" disabled={!!counterpartyId} /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div><label style={lbl}>Value</label><input value={value} onChange={(e) => setValue(e.target.value)} style={inp} placeholder="100000" type="number" /></div>
          <div><label style={lbl}>Term (months)</label><input value={termMonths} onChange={(e) => setTermMonths(e.target.value)} style={inp} placeholder="12" type="number" /></div>
          <div><label style={lbl}>Governing law</label><input value={governingLaw} onChange={(e) => setGoverningLaw(e.target.value)} style={inp} placeholder="Delaware" /></div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>What should the contract cover?</label>
          <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={7} style={{ ...inp, resize: "vertical", fontFamily: F }} placeholder="e.g. Managed cloud services, monthly billing, 99.9% uptime SLA, data processed in the EU, our standard liability cap and mutual NDA, 90-day termination for convenience…" />
        </div>
        {err && <div style={{ color: C.rd, fontFamily: M, fontSize: 10.5, marginBottom: 10 }}>⚠ {err}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "8px 13px", background: "transparent", color: C.t3, border: `1px solid ${C.br}`, borderRadius: 5, fontFamily: M, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", cursor: "pointer" }}>Cancel</button>
          <button onClick={submit} disabled={busy} style={{ padding: "8px 15px", background: C.pp || C.bl, color: "#fff", border: "none", borderRadius: 5, fontFamily: M, fontSize: 10, letterSpacing: 1, fontWeight: 700, textTransform: "uppercase", cursor: "pointer", opacity: busy ? .6 : 1 }}>{busy ? "Drafting…" : "✨ Draft it"}</button>
        </div>
      </div>
    </div>
  );
}
