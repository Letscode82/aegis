import { useState, useEffect } from "react";
import { C, F, M, SR } from "@aegis/ui";

// ── Draft a contract with AI (CTR-14 + PR A guided draft) ─────────────
//
// Guided draft: describe the deal + the few decisions that actually shape the
// document (which side it's for, special carve-outs), and OneLegal drafts a
// full contract. Two modes:
//   • "brief"     — draft from a plain-language brief (POST /draft-ai)
//   • "precedent" — model a new draft on a prior executed agreement
//                   (POST /draft-from-precedent)
// Always created as a DRAFT — the attorney reviews, edits, and runs the
// approval ladder. Degrades to a deterministic skeleton / precedent copy
// offline. No "redline your own draft" here — that Create/Review mix-up is
// gone; reviewing THEIR paper is a separate surface.

const inp = { width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.br}`, borderRadius: 5, color: C.t1, fontFamily: F, fontSize: 12, padding: "8px 9px" };
const lbl = { fontSize: 9, fontFamily: M, color: C.t3, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4, display: "block" };

// The four document-shaping sides. Mutual is the right default for an NDA;
// our-side for most commercial paper. This is the "mutual / one-way" decision.
const PERSPECTIVES = [
  { v: "OUR_SIDE", label: "Our side", hint: "Protective of us — our standard positions" },
  { v: "MUTUAL", label: "Mutual", hint: "Even-handed — e.g. a mutual NDA" },
  { v: "THEIR_SIDE", label: "Their side", hint: "Representing the counterparty" },
  { v: "NEUTRAL", label: "Neutral", hint: "No side bias — e.g. a joint agreement" },
];

export function AiDraftModal({ onClose, onCreated }) {
  const [mode, setMode] = useState("brief"); // "brief" | "precedent"
  const [title, setTitle] = useState("");
  const [type, setType] = useState("MSA");
  const [perspective, setPerspective] = useState("OUR_SIDE");
  const [counterpartyId, setCounterpartyId] = useState("");
  const [counterpartyName, setCounterpartyName] = useState("");
  const [brief, setBrief] = useState("");
  const [specialTerms, setSpecialTerms] = useState("");
  const [value, setValue] = useState("");
  const [governingLaw, setGoverningLaw] = useState("");
  const [termMonths, setTermMonths] = useState("");
  const [counterparties, setCounterparties] = useState([]);
  const [precedents, setPrecedents] = useState([]);
  const [precedentId, setPrecedentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    fetch("/api/contracts/counterparties").then((r) => (r.ok ? r.json() : null)).then((d) => setCounterparties(d?.counterparties || d?.options || [])).catch(() => {});
    // Precedents to model from — prefer our-paper contracts with real bodies.
    fetch("/api/contracts/overview").then((r) => (r.ok ? r.json() : null)).then((d) => {
      const rows = d?.overview?.contracts || [];
      setPrecedents(rows.filter((c) => c.origin === "OUR_PAPER"));
    }).catch(() => {});
  }, []);

  const submit = async () => {
    if (mode === "precedent") {
      if (!precedentId) { setErr("Pick a precedent to model from."); return; }
      if (!brief.trim()) { setErr("Describe what to adapt from the precedent."); return; }
    } else {
      if (!title.trim()) { setErr("Give it a title."); return; }
      if (!brief.trim()) { setErr("Describe what the contract should cover."); return; }
    }
    setBusy(true); setErr(null);
    try {
      const cp = counterparties.find((c) => c.id === counterpartyId);
      const cpName = cp?.name || counterpartyName || null;
      let r;
      if (mode === "precedent") {
        r = await fetch("/api/contracts/draft-from-precedent", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            precedentContractId: precedentId, brief, title: title.trim() || undefined, type: type || undefined,
            counterpartyId: counterpartyId || null, counterpartyName: cpName,
            governingLaw: governingLaw || null, perspective, specialTerms: specialTerms || null,
          }),
        });
      } else {
        r = await fetch("/api/contracts/draft-ai", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(), type, counterpartyId: counterpartyId || null, counterpartyName: cpName,
            brief, value: value || null, governingLaw: governingLaw || null, termMonths: termMonths || null,
            perspective, specialTerms: specialTerms || null,
          }),
        });
      }
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      onCreated?.(d.contractId, d);
    } catch (e) { setErr(String(e.message || e)); } finally { setBusy(false); }
  };

  const tabBtn = (m, label) => (
    <button type="button" onClick={() => { setMode(m); setErr(null); }} style={{
      padding: "6px 12px", background: mode === m ? (C.pp || C.bl) : "transparent", color: mode === m ? "#fff" : C.t3,
      border: `1px solid ${mode === m ? (C.pp || C.bl) : C.br}`, borderRadius: 5, fontFamily: M, fontSize: 9.5,
      letterSpacing: 0.6, textTransform: "uppercase", fontWeight: 700, cursor: "pointer",
    }}>{label}</button>
  );

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 620, maxWidth: "100%", maxHeight: "90vh", overflow: "auto", background: C.cd, border: `1px solid ${C.br}`, borderRadius: 8, padding: 20 }}>
        <div style={{ fontSize: 15, fontFamily: SR, color: C.t1, marginBottom: 3 }}>✨ Draft a contract</div>
        <div style={{ fontSize: 11, color: C.t3, marginBottom: 14, lineHeight: 1.5 }}>Answer the few decisions that shape the document; OneLegal drafts a full contract on <b>our paper</b> using our playbook. It&rsquo;s created as a <b>DRAFT</b> for you to review, edit, and run through approval — the human is always the gate.</div>

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {tabBtn("brief", "From a brief")}
          {tabBtn("precedent", "From a precedent")}
        </div>

        {mode === "precedent" && (
          <div style={{ marginBottom: 10 }}>
            <label style={lbl}>Precedent to model from</label>
            <select value={precedentId} onChange={(e) => setPrecedentId(e.target.value)} style={inp}>
              <option value="">— pick an executed / existing agreement —</option>
              {precedents.map((c) => <option key={c.id} value={c.id}>{c.title} · {c.type}{c.counterpartyName ? ` · ${c.counterpartyName}` : ""}</option>)}
            </select>
            {precedents.length === 0 && <div style={{ fontSize: 10, color: C.t4, marginTop: 4 }}>No our-paper contracts yet to model from — use “From a brief”.</div>}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10, marginBottom: 10 }}>
          <div><label style={lbl}>Title{mode === "precedent" ? " (optional)" : ""}</label><input value={title} onChange={(e) => setTitle(e.target.value)} style={inp} placeholder={mode === "precedent" ? "defaults to “<precedent> (new)”" : "Acme Master Services Agreement"} /></div>
          <div><label style={lbl}>Type</label><input value={type} onChange={(e) => setType(e.target.value)} style={inp} placeholder="MSA" /></div>
        </div>

        <div style={{ marginBottom: 10 }}>
          <label style={lbl}>Which side is this for?</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {PERSPECTIVES.map((p) => (
              <button key={p.v} type="button" onClick={() => setPerspective(p.v)} title={p.hint} style={{
                padding: "6px 10px", background: perspective === p.v ? `${C.bl}22` : "transparent", color: perspective === p.v ? C.bl : C.t3,
                border: `1px solid ${perspective === p.v ? C.bl : C.br}`, borderRadius: 5, fontFamily: M, fontSize: 10, cursor: "pointer",
              }}>{p.label}</button>
            ))}
          </div>
          <div style={{ fontSize: 10, color: C.t4, marginTop: 4 }}>{PERSPECTIVES.find((p) => p.v === perspective)?.hint}</div>
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

        {mode === "brief" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div><label style={lbl}>Value</label><input value={value} onChange={(e) => setValue(e.target.value)} style={inp} placeholder="100000" type="number" /></div>
            <div><label style={lbl}>Term (months)</label><input value={termMonths} onChange={(e) => setTermMonths(e.target.value)} style={inp} placeholder="12" type="number" /></div>
            <div><label style={lbl}>Governing law</label><input value={governingLaw} onChange={(e) => setGoverningLaw(e.target.value)} style={inp} placeholder="Delaware" /></div>
          </div>
        )}
        {mode === "precedent" && (
          <div style={{ marginBottom: 10 }}>
            <label style={lbl}>Governing law (optional override)</label><input value={governingLaw} onChange={(e) => setGoverningLaw(e.target.value)} style={inp} placeholder="defaults to the precedent’s" />
          </div>
        )}

        <div style={{ marginBottom: 10 }}>
          <label style={lbl}>{mode === "precedent" ? "What to adapt from the precedent?" : "What should the contract cover?"}</label>
          <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={mode === "precedent" ? 4 : 6} style={{ ...inp, resize: "vertical", fontFamily: F }} placeholder={mode === "precedent" ? "e.g. swap the counterparty to Globex, 3-year term, add an EU data-processing addendum…" : "e.g. Managed cloud services, monthly billing, 99.9% uptime SLA, data processed in the EU, 90-day termination for convenience…"} />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Special terms / carve-outs (optional)</label>
          <textarea value={specialTerms} onChange={(e) => setSpecialTerms(e.target.value)} rows={3} style={{ ...inp, resize: "vertical", fontFamily: F }} placeholder="e.g. residuals carve-out; no publicity without consent; 7-year survival for trade secrets…" />
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
