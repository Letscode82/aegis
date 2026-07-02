import { useState, useEffect, useCallback } from "react";
import { C, F, M, SR, Card, inputStyle } from "@aegis/ui";

// ── Track 1 · Activity 7 — request-types admin surface ───────────────
//
// Surfaces the item-1 configurable-workstreams backend: intake request
// types (key, name, workstream, stage workflow). Reads/writes
// /api/admin/intake/request-types (gated admin:manage_users). DRL's
// Contracts / Trademarks / Litigation workstreams are configured here.

const labelS = { fontSize: 9.5, fontFamily: M, color: C.t3, letterSpacing: 1, textTransform: "uppercase", marginBottom: 3 };
const btn = (bg) => ({ padding: "5px 11px", background: bg, color: C.bg, fontSize: 9.5, fontFamily: M, letterSpacing: 1.2, cursor: "pointer", textTransform: "uppercase", fontWeight: 700, borderRadius: 3, border: "none" });

function TypeForm({ onCancel, onSaved }) {
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [workstream, setWorkstream] = useState("");
  const [stages, setStages] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const save = async () => {
    if (!name.trim()) { setErr("Name is required."); return; }
    setBusy(true); setErr(null);
    try {
      const body = {
        name, key: key || undefined, workstream: workstream || null,
        stages: stages.split(",").map((s) => s.trim()).filter(Boolean),
      };
      const r = await fetch("/api/admin/intake/request-types", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error(d.error || `Save failed (HTTP ${r.status})`);
      onSaved();
    } catch (e) { setErr(String(e.message || e)); } finally { setBusy(false); }
  };
  return (
    <Card style={{ marginBottom: 12, borderLeft: `3px solid ${C.cy}` }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: C.cy, letterSpacing: 1.2, fontFamily: M, textTransform: "uppercase", marginBottom: 12 }}>New request type</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div><div style={labelS}>Name</div><input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} placeholder="Trademark clearance" /></div>
        <div><div style={labelS}>Key (auto if blank)</div><input value={key} onChange={(e) => setKey(e.target.value)} style={inputStyle} placeholder="trademark-clearance" /></div>
        <div><div style={labelS}>Workstream</div><input value={workstream} onChange={(e) => setWorkstream(e.target.value)} style={inputStyle} placeholder="Trademarks" /></div>
        <div><div style={labelS}>Stages (comma-separated)</div><input value={stages} onChange={(e) => setStages(e.target.value)} style={inputStyle} placeholder="Intake, Search, Opinion, Filed" /></div>
      </div>
      {err && <div style={{ marginTop: 10, padding: "7px 11px", background: C.rdG, borderLeft: `3px solid ${C.rd}`, borderRadius: 4, fontSize: 11, color: C.t1, fontFamily: M }}>{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button onClick={save} disabled={busy} style={{ ...btn(C.cy), opacity: busy ? .6 : 1 }}>{busy ? "Saving…" : "Create type"}</button>
        <button onClick={onCancel} style={{ ...btn(C.s1), color: C.t2 }}>Cancel</button>
      </div>
    </Card>
  );
}

export function RequestTypesTab({ canManage }) {
  const [types, setTypes] = useState(null);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);

  const reload = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/intake/request-types?all=1");
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error(d.error || `Load failed (HTTP ${r.status})`);
      setTypes(d.types || []); setError(null);
    } catch (e) { setError(String(e.message || e)); setTypes([]); }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const toggleActive = async (t) => {
    try {
      const r = await fetch(`/api/admin/intake/request-types/${t.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ active: !t.active }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error(d.error || `Update failed (HTTP ${r.status})`);
      reload();
    } catch (e) { alert(String(e.message || e)); }
  };
  const del = async (t) => {
    if (!window.confirm(`Delete request type "${t.name}"?`)) return;
    try {
      const r = await fetch(`/api/admin/intake/request-types/${t.id}`, { method: "DELETE" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error(d.error || `Delete failed (HTTP ${r.status})`);
      reload();
    } catch (e) { alert(String(e.message || e)); }
  };

  if (types === null && !error) return <div style={{ padding: 40, textAlign: "center", color: C.t3, fontFamily: M, fontSize: 12, letterSpacing: 1 }}>◎ Loading request types…</div>;
  if (error) return <Card style={{ borderLeft: `3px solid ${C.rd}` }}><div style={{ fontSize: 12, color: C.t2, fontFamily: F }}>Couldn't load request types: {error}</div></Card>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 15, fontFamily: SR, color: C.t1 }}>Request types</div>
          <div style={{ fontSize: 10.5, color: C.t3, fontFamily: M, marginTop: 2 }}>Configurable intake workstreams with a stage workflow. DRL's Contracts / Trademarks / Litigation are configured here.</div>
        </div>
        {canManage && !creating && <button onClick={() => setCreating(true)} style={btn(C.cy)}>+ New type</button>}
      </div>

      {creating && <TypeForm onCancel={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} />}

      {types.length === 0 && !creating && <div style={{ padding: "24px 0", textAlign: "center", color: C.t4, fontSize: 11, fontFamily: M }}>No request types configured.{canManage && <> Click <span style={{ color: C.cy, fontWeight: 600 }}>+ NEW TYPE</span> to add the first workstream.</>}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {types.map((t) => (
          <Card key={t.id} style={{ borderLeft: `3px solid ${t.active ? C.gn : C.t4}`, opacity: t.active ? 1 : .65 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 13, color: C.t1, fontWeight: 600 }}>{t.name}</div>
                <div style={{ fontSize: 9.5, fontFamily: M, color: C.t3, marginTop: 2 }}>{t.key}{t.workstream ? ` · ${t.workstream}` : ""}</div>
              </div>
              {canManage && <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div onClick={() => toggleActive(t)} title={t.active ? "Deactivate" : "Activate"} style={{ width: 30, height: 16, borderRadius: 9, background: t.active ? C.gn : C.br, position: "relative", cursor: "pointer", flexShrink: 0 }}>
                  <div style={{ position: "absolute", top: 2, left: t.active ? 16 : 2, width: 12, height: 12, borderRadius: "50%", background: C.bg, transition: "left .15s" }} />
                </div>
                <span onClick={() => del(t)} title="Delete" style={{ fontSize: 12, color: C.t3, cursor: "pointer" }}>✕</span>
              </div>}
            </div>
            {t.stages.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
                {t.stages.map((s, i) => <span key={i} style={{ fontSize: 9, fontFamily: M, color: C.t2, background: C.s2, borderRadius: 3, padding: "2px 6px" }}>{i + 1}. {s}</span>)}
              </div>
            )}
            {t.fields.length > 0 && <div style={{ fontSize: 9.5, fontFamily: M, color: C.t4, marginTop: 6 }}>{t.fields.length} custom field{t.fields.length === 1 ? "" : "s"}</div>}
          </Card>
        ))}
      </div>
    </div>
  );
}
