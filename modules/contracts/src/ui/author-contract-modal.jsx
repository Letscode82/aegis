import { useState, useEffect } from "react";
import { C, F, M, SR } from "@aegis/ui";

// ── Author a new contract from a template (CLM Phase 4a) ─────────────
//
// The originate-inside-Contracts flow. Pick a template (oKF template store),
// fill the header fields, and POST /api/contracts/author — which creates a
// DRAFT contract, persists the rendered draft body, and runs the shared
// extractor (clauses + obligations + v1 snapshot), all chain-sealed. On
// success the parent opens the new contract's drill-in.

const COMMON_TYPES = [
  "NDA", "Master Services Agreement", "Data Processing Addendum",
  "Statement of Work", "License Agreement", "Supply Agreement", "Other",
];

const field = { width: "100%", padding: "8px 10px", fontSize: 12, fontFamily: F, color: C.t1, background: C.bg, border: `1px solid ${C.br}`, borderRadius: 5, boxSizing: "border-box" };
const lbl = { fontSize: 9, fontFamily: M, letterSpacing: 1, textTransform: "uppercase", color: C.t3, marginBottom: 4, display: "block" };

export function AuthorContractModal({ onClose, onCreated }) {
  const [templates, setTemplates] = useState([]);
  const [counterparties, setCounterparties] = useState([]);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("NDA");
  const [templateKey, setTemplateKey] = useState("");
  const [counterpartyId, setCounterpartyId] = useState("");
  const [value, setValue] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [governingLaw, setGoverningLaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    fetch("/api/contracts/templates")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.ok || d?.templates) setTemplates(d.templates || []); })
      .catch(() => {});
    fetch("/api/contracts/counterparties")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.ok) setCounterparties(d.counterparties || []); })
      .catch(() => {});
  }, []);

  // When a template is chosen, default the title/type from it if still blank.
  const pickTemplate = (key) => {
    setTemplateKey(key);
    const t = templates.find((x) => x.key === key);
    if (t) {
      if (!title.trim()) setTitle(t.name);
      if (t.kind === "NDA") setType("NDA");
      else if (t.kind === "CONTRACT") setType("Master Services Agreement");
      else if (t.kind === "NOTICE") setType("Notice");
    }
  };

  const submit = async () => {
    if (!title.trim()) { setErr("Title is required."); return; }
    if (!type.trim()) { setErr("Type is required."); return; }
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/contracts/author", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(), type: type.trim(),
          templateKey: templateKey || null,
          counterpartyId: counterpartyId || null,
          value: value === "" ? null : Number(value),
          currency, governingLaw: governingLaw.trim() || null,
        }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      onCreated?.(d.contractId, d);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "#0008", backdropFilter: "blur(2px)", zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "6vh 16px" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(560px, 100%)", background: C.cd, border: `1px solid ${C.br}`, borderRadius: 10, padding: 22, fontFamily: F, color: C.t1, maxHeight: "84vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontFamily: M, letterSpacing: 2, color: C.bl, textTransform: "uppercase" }}>Author</div>
          <div style={{ fontSize: 19, fontFamily: SR, color: C.t1 }}>New contract from template</div>
          <span onClick={onClose} style={{ marginLeft: "auto", cursor: "pointer", color: C.t3, fontFamily: M, fontSize: 13 }}>✕</span>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <label style={lbl}>Template</label>
            <select value={templateKey} onChange={(e) => pickTemplate(e.target.value)} style={field}>
              <option value="">— Blank draft (no template) —</option>
              {templates.map((t) => <option key={t.id} value={t.key}>{t.kind} · {t.name}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Globex — Mutual NDA" style={field} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={lbl}>Type</label>
              <select value={type} onChange={(e) => setType(e.target.value)} style={field}>
                {COMMON_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Counterparty</label>
              <select value={counterpartyId} onChange={(e) => setCounterpartyId(e.target.value)} style={field}>
                <option value="">— None yet —</option>
                {counterparties.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr .8fr 1fr", gap: 12 }}>
            <div>
              <label style={lbl}>Value (optional)</label>
              <input value={value} onChange={(e) => setValue(e.target.value)} type="number" placeholder="0" style={field} />
            </div>
            <div>
              <label style={lbl}>Currency</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} style={field}>
                {["USD", "EUR", "GBP"].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Governing law</label>
              <input value={governingLaw} onChange={(e) => setGoverningLaw(e.target.value)} placeholder="Delaware" style={field} />
            </div>
          </div>
        </div>

        {err && <div style={{ fontSize: 11, color: C.rd, fontFamily: M, marginTop: 12 }}>⚠ {err}</div>}

        <div style={{ display: "flex", gap: 8, marginTop: 18, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "8px 14px", background: "transparent", color: C.t3, border: `1px solid ${C.br}`, borderRadius: 5, fontFamily: M, fontSize: 10.5, letterSpacing: .8, cursor: "pointer", textTransform: "uppercase" }}>Cancel</button>
          <button disabled={busy} onClick={submit} style={{ padding: "8px 16px", background: C.bl, color: "#fff", border: "none", borderRadius: 5, fontFamily: M, fontSize: 10.5, letterSpacing: .8, fontWeight: 700, cursor: busy ? "default" : "pointer", textTransform: "uppercase", opacity: busy ? .6 : 1 }}>
            {busy ? "Authoring…" : "Create draft →"}
          </button>
        </div>
        <div style={{ fontSize: 9.5, color: C.t4, fontFamily: M, marginTop: 12, lineHeight: 1.5 }}>
          Creates a DRAFT contract, extracts clauses + obligations from the template body, and snapshots v1 — all chain-sealed. You can re-extract, send for counterparty review, and advance the lifecycle from the drill-in.
        </div>
      </div>
    </div>
  );
}
