import { useState, useEffect, useCallback } from "react";
import { C, F, M, SR } from "@aegis/ui";

// ── Playbook clause library (CTR-5) ──────────────────────────────────
//
// The clause bank: the standard / fallback positions a contract's clauses
// are reviewed against. Read for everyone with contracts:read_all; admins
// (contracts:approve) edit inline. Every save/delete is chain-sealed
// server-side. Opened from the Contracts repository "Playbook" button.

const RISK_COLOR = { HIGH: C.rd, MEDIUM: C.am, LOW: C.gn };
const CLAUSE_TYPES = ["LIABILITY_CAP", "INDEMNITY", "IP", "PAYMENT", "AUTO_RENEWAL", "TERMINATION", "GOVERNING_LAW", "CONFIDENTIALITY", "ASSIGNMENT", "WARRANTY", "OTHER"];
const input = { width: "100%", background: C.bg, border: `1px solid ${C.br}`, borderRadius: 4, color: C.t1, fontFamily: F, fontSize: 11, padding: "6px 8px", outline: "none", boxSizing: "border-box" };
const lbl = { fontSize: 8.5, fontFamily: M, letterSpacing: .8, textTransform: "uppercase", color: C.t3, marginBottom: 2 };
const btn = (bg, fg) => ({ padding: "5px 11px", background: bg, color: fg || C.bg, border: "none", borderRadius: 4, fontFamily: M, fontSize: 9.5, letterSpacing: 1, fontWeight: 700, textTransform: "uppercase", cursor: "pointer" });
const ghost = (col) => ({ padding: "5px 11px", background: "transparent", color: col, border: `1px solid ${col}`, borderRadius: 4, fontFamily: M, fontSize: 9.5, letterSpacing: 1, fontWeight: 600, textTransform: "uppercase", cursor: "pointer" });

const empty = () => ({ clauseType: "", title: "", standardText: "", fallbackText: "", guidance: "", riskIfDeviated: "MEDIUM" });

export function ClauseLibraryModal({ canManage, onClose }) {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // entry object or "new" or null
  const [form, setForm] = useState(empty());
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/contracts/clause-library${canManage ? "?all=1" : ""}`)
      .then((r) => (r.ok ? r.json() : r.json().then((d) => Promise.reject(d.error || `HTTP ${r.status}`))))
      .then((d) => setEntries(d.entries || []))
      .catch((e) => setError(String(e)));
  }, [canManage]);
  useEffect(() => { load(); }, [load]);

  const startEdit = (e) => { setEditing(e.id); setForm({ ...e, fallbackText: e.fallbackText || "", guidance: e.guidance || "" }); };
  const startNew = () => { setEditing("new"); setForm(empty()); };

  const save = async () => {
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/contracts/clause-library", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setEditing(null); load();
    } catch (e) { setError(String(e.message || e)); } finally { setBusy(false); }
  };
  const del = async (id) => {
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/contracts/clause-library", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      load();
    } catch (e) { setError(String(e.message || e)); } finally { setBusy(false); }
  };

  const upd = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(4,7,15,.72)", zIndex: 1100, display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "5vh 16px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ fontFamily: F, background: C.bg, border: `1px solid ${C.br}`, borderRadius: 8, width: "min(760px, 100%)" }}>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.br}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 10, fontFamily: M, letterSpacing: 2, color: C.bl, textTransform: "uppercase" }}>Contract Playbook</div>
            <div style={{ fontSize: 17, fontFamily: SR, color: C.t1 }}>Clause library</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {canManage && editing === null && <button onClick={startNew} style={btn(C.cy)}>+ Entry</button>}
            <div onClick={onClose} style={{ cursor: "pointer", fontSize: 10, fontFamily: M, color: C.t3, letterSpacing: 1, alignSelf: "center" }}>✕ CLOSE</div>
          </div>
        </div>

        <div style={{ padding: "14px 18px" }}>
          {error && <div style={{ color: C.rd, fontFamily: M, fontSize: 11, marginBottom: 10 }}>⚠ {error}</div>}

          {editing !== null && (
            <div style={{ padding: "12px 14px", background: C.cd, border: `1px solid ${C.br}`, borderRadius: 6, marginBottom: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 120px", gap: 8, marginBottom: 8 }}>
                <div><div style={lbl}>Clause type</div>
                  <select value={form.clauseType} onChange={upd("clauseType")} disabled={editing !== "new"} style={input}>
                    <option value="">Select…</option>
                    {CLAUSE_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
                  </select></div>
                <div><div style={lbl}>Title</div><input value={form.title} onChange={upd("title")} style={input} /></div>
                <div><div style={lbl}>Risk if deviated</div>
                  <select value={form.riskIfDeviated} onChange={upd("riskIfDeviated")} style={input}>
                    {["LOW", "MEDIUM", "HIGH"].map((r) => <option key={r} value={r}>{r}</option>)}
                  </select></div>
              </div>
              <div style={{ marginBottom: 8 }}><div style={lbl}>Standard position (preferred)</div><textarea value={form.standardText} onChange={upd("standardText")} rows={2} style={{ ...input, resize: "vertical" }} /></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                <div><div style={lbl}>Acceptable fallback</div><textarea value={form.fallbackText} onChange={upd("fallbackText")} rows={2} style={{ ...input, resize: "vertical" }} /></div>
                <div><div style={lbl}>Reviewer guidance</div><textarea value={form.guidance} onChange={upd("guidance")} rows={2} style={{ ...input, resize: "vertical" }} /></div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button disabled={busy || !form.clauseType || !form.title.trim() || !form.standardText.trim()} onClick={save} style={btn(C.gn)}>{busy ? "…" : "Save"}</button>
                <button onClick={() => setEditing(null)} style={ghost(C.t3)}>Cancel</button>
              </div>
            </div>
          )}

          {!entries ? <div style={{ fontSize: 11, color: C.t4, fontFamily: M }}>Loading…</div>
            : entries.length === 0 ? <div style={{ fontSize: 11, color: C.t4, fontStyle: "italic" }}>No clause library entries yet.</div>
            : entries.map((e) => (
              <div key={e.id} style={{ padding: "10px 0", borderBottom: `1px solid ${C.br}22`, opacity: e.active ? 1 : .5 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 3 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: C.t1 }}>{e.title}</span>
                  <span style={{ fontSize: 8.5, fontFamily: M, color: C.t3 }}>{e.clauseType.replace(/_/g, " ")}</span>
                  <span style={{ fontSize: 8.5, fontFamily: M, letterSpacing: .5, padding: "1px 6px", borderRadius: 3, color: RISK_COLOR[e.riskIfDeviated], border: `1px solid ${RISK_COLOR[e.riskIfDeviated]}55` }}>{e.riskIfDeviated} if deviated</span>
                  {canManage && (
                    <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                      <span onClick={() => startEdit(e)} style={{ cursor: "pointer", fontSize: 9, fontFamily: M, color: C.bl, letterSpacing: .5, textTransform: "uppercase" }}>Edit</span>
                      <span onClick={() => del(e.id)} style={{ cursor: "pointer", fontSize: 9, fontFamily: M, color: C.rd, letterSpacing: .5, textTransform: "uppercase" }}>Delete</span>
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 10.5, color: C.t2, lineHeight: 1.5 }}>{e.standardText}</div>
                {e.fallbackText && <div style={{ fontSize: 10, color: C.t3, marginTop: 3 }}><span style={{ color: C.t4 }}>Fallback: </span>{e.fallbackText}</div>}
                {e.guidance && <div style={{ fontSize: 10, color: C.am, marginTop: 3 }}><span style={{ color: C.t4 }}>Guidance: </span>{e.guidance}</div>}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
