import { useState, useEffect, useCallback } from "react";
import { C, F, M, SR } from "@aegis/ui";

// RoPA / Data Map (Art. 30). List of processing activities + an editor for
// lawful basis, retention, data types, subject categories, systems, and
// cross-border transfers. Reads/writes /api/privacy/ropa (privacy:dpia:read).

const input = { width: "100%", background: C.bg, border: `1px solid ${C.br}`, borderRadius: 5, color: C.t1, fontFamily: F, fontSize: 12.5, padding: "7px 9px", boxSizing: "border-box" };
const lbl = { fontSize: 9, fontFamily: M, letterSpacing: .8, textTransform: "uppercase", color: C.t3, marginBottom: 3, display: "block" };
const chips = (a) => (a || []).join(", ");

async function api(url, opts) {
  const r = await fetch(url, opts);
  const d = await r.json();
  if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
  return d;
}

function Editor({ activity, onClose, onSaved }) {
  const isNew = !activity.id;
  const [f, setF] = useState({
    name: activity.name || "", lawfulBasis: activity.lawfulBasis || "",
    retentionPeriodDays: activity.retentionPeriodDays ?? 0,
    dataTypes: chips(activity.dataTypes), dataSubjectCategories: chips(activity.dataSubjectCategories),
    systems: chips(activity.systems), transferredCountries: chips(activity.transferredCountries),
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const toArr = (s) => String(s).split(",").map((x) => x.trim()).filter(Boolean);

  const save = async () => {
    if (!f.name.trim()) { setErr("Name is required"); return; }
    setBusy(true); setErr(null);
    const body = {
      name: f.name, lawfulBasis: f.lawfulBasis, retentionPeriodDays: Number(f.retentionPeriodDays) || 0,
      dataTypes: toArr(f.dataTypes), dataSubjectCategories: toArr(f.dataSubjectCategories),
      systems: toArr(f.systems), transferredCountries: toArr(f.transferredCountries),
    };
    try {
      if (isNew) await api("/api/privacy/ropa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      else await api(`/api/privacy/ropa/${activity.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      onSaved();
    } catch (e) { setErr(String(e.message || e)); setBusy(false); }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(11,16,32,.9)", zIndex: 130, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.cd, border: `1px solid ${C.br}`, borderRadius: 8, width: "100%", maxWidth: 640, maxHeight: "88vh", overflowY: "auto", fontFamily: F, color: C.t1, padding: 20 }}>
        <div style={{ fontSize: 17, fontFamily: SR, marginBottom: 14 }}>{isNew ? "New processing activity" : "Edit processing activity"}</div>
        <label style={lbl}>Name</label>
        <input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Customer support ticketing" style={{ ...input, marginBottom: 12 }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 130px", gap: 12, marginBottom: 12 }}>
          <div><label style={lbl}>Lawful basis</label><input value={f.lawfulBasis} onChange={(e) => set("lawfulBasis", e.target.value)} placeholder="Consent / Contract / Legitimate interest…" style={input} /></div>
          <div><label style={lbl}>Retention (days)</label><input type="number" value={f.retentionPeriodDays} onChange={(e) => set("retentionPeriodDays", e.target.value)} style={input} /></div>
        </div>
        {[["dataTypes", "Data types"], ["dataSubjectCategories", "Data-subject categories"], ["systems", "Systems"], ["transferredCountries", "Transfers to (countries)"]].map(([k, label]) => (
          <div key={k} style={{ marginBottom: 12 }}>
            <label style={lbl}>{label} <span style={{ color: C.t4 }}>(comma-separated)</span></label>
            <input value={f[k]} onChange={(e) => set(k, e.target.value)} style={input} />
          </div>
        ))}
        {err && <div style={{ color: C.rd, fontSize: 12, marginBottom: 10 }}>⚠ {err}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} style={{ padding: "8px 14px", border: `1px solid ${C.br}`, color: C.t2, background: "transparent", borderRadius: 6, fontFamily: F, fontSize: 12.5, cursor: "pointer" }}>Cancel</button>
          <button onClick={busy ? undefined : save} style={{ padding: "8px 16px", background: C.tl, color: C.bg, border: "none", borderRadius: 6, fontFamily: F, fontSize: 12.5, fontWeight: 600, cursor: busy ? "default" : "pointer", opacity: busy ? .6 : 1 }}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

export function RopaView() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [edit, setEdit] = useState(null); // activity object or {} for new

  const load = useCallback(() => {
    api("/api/privacy/ropa").then((d) => setRows(d.items)).catch((e) => setErr(String(e.message || e)));
  }, []);
  useEffect(() => { load(); }, [load]);

  const remove = async (id) => {
    try { await api(`/api/privacy/ropa/${id}`, { method: "DELETE" }); load(); } catch (e) { setErr(String(e.message || e)); }
  };

  return (
    <div style={{ fontFamily: F, color: C.t1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 20, fontFamily: SR }}>Data Map · Records of Processing</div>
          <div style={{ fontSize: 12, color: C.t3, fontFamily: M, marginTop: 2 }}>Article 30 records — lawful basis, retention, data categories, systems and cross-border transfers.</div>
        </div>
        <button onClick={() => setEdit({})} style={{ padding: "9px 15px", background: C.tl, color: C.bg, border: "none", borderRadius: 8, fontFamily: F, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>+ New activity</button>
      </div>

      {err && <div style={{ color: C.rd, fontFamily: M, fontSize: 12, marginBottom: 10 }}>⚠ {err}</div>}
      {!rows && !err && <div style={{ padding: 30, textAlign: "center", color: C.t3, fontFamily: M, fontSize: 12 }}>◎ Loading…</div>}
      {rows && rows.length === 0 && <div style={{ padding: 30, textAlign: "center", color: C.t4, fontFamily: M, fontSize: 12 }}>No processing activities recorded yet.</div>}

      <div style={{ display: "grid", gap: 8 }}>
        {(rows || []).map((a) => (
          <div key={a.id} style={{ background: C.cd, border: `1px solid ${C.br}`, borderRadius: 8, padding: "12px 14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontFamily: SR, color: C.t1 }}>{a.name}</div>
                <div style={{ fontSize: 10.5, color: C.t3, fontFamily: M, marginTop: 3 }}>{a.lawfulBasis || "— no lawful basis —"} · retain {a.retentionPeriodDays}d{a.transferredCountries.length ? ` · ↗ ${a.transferredCountries.join(", ")}` : ""}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 7 }}>
                  {a.dataTypes.map((t) => <span key={t} style={{ fontSize: 9, fontFamily: M, color: C.tl, border: `1px solid ${C.tl}55`, borderRadius: 3, padding: "1px 6px" }}>{t}</span>)}
                  {a.systems.map((t) => <span key={t} style={{ fontSize: 9, fontFamily: M, color: C.t3, border: `1px solid ${C.br}`, borderRadius: 3, padding: "1px 6px" }}>⚙ {t}</span>)}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flex: "none" }}>
                <button onClick={() => setEdit(a)} style={{ padding: "5px 10px", border: `1px solid ${C.br}`, color: C.t2, background: "transparent", borderRadius: 5, fontFamily: M, fontSize: 10, cursor: "pointer" }}>Edit</button>
                <button onClick={() => remove(a.id)} style={{ padding: "5px 9px", border: `1px solid ${C.br}`, color: C.rd, background: "transparent", borderRadius: 5, fontFamily: M, fontSize: 10, cursor: "pointer" }}>×</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {edit && <Editor activity={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </div>
  );
}
