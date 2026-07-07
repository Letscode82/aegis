import { useState, useEffect, useCallback } from "react";
import { C, F, M, SR, Card, inputStyle, useToast } from "@aegis/ui";

// ── Track 1 · Activity 7 — request-types admin surface ───────────────
//
// Surfaces the item-1 configurable-workstreams backend: intake request
// types (key, name, workstream, stage workflow). Reads/writes
// /api/admin/intake/request-types (gated admin:manage_users). DRL's
// Contracts / Trademarks / Litigation workstreams are configured here.

const labelS = { fontSize: 9.5, fontFamily: M, color: C.t3, letterSpacing: 1, textTransform: "uppercase", marginBottom: 3 };
const btn = (bg) => ({ padding: "5px 11px", background: bg, color: C.bg, fontSize: 9.5, fontFamily: M, letterSpacing: 1.2, cursor: "pointer", textTransform: "uppercase", fontWeight: 700, borderRadius: 3, border: "none" });

function TypeForm({ onCancel, onSaved }) {
  const [ladderKeys, setLadderKeys] = useState([]);
  useEffect(() => {
    fetch("/api/workflows/definitions").then((r) => r.json()).then((d) => {
      if (d?.ok) setLadderKeys((d.definitions || []).map((x) => x.key));
    }).catch(() => {});
  }, []);
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [workstream, setWorkstream] = useState("");
  const [stages, setStages] = useState("");
  const [workflowKey, setWorkflowKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const save = async () => {
    if (!name.trim()) { setErr("Name is required."); return; }
    setBusy(true); setErr(null);
    try {
      const body = {
        name, key: key || undefined, workstream: workstream || null,
        stages: stages.split(",").map((s) => s.trim()).filter(Boolean),
        workflowKey: workflowKey.trim() || null,
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
        <div><div style={labelS}>Workflow ladder key (optional)</div><input value={workflowKey} onChange={(e) => setWorkflowKey(e.target.value)} style={inputStyle} placeholder="clm_contract_approval" list="workflow-ladder-keys" /></div>
      </div>
      <datalist id="workflow-ladder-keys">{ladderKeys.map((k) => <option key={k} value={k} />)}</datalist>
      {err && <div style={{ marginTop: 10, padding: "7px 11px", background: C.rdG, borderLeft: `3px solid ${C.rd}`, borderRadius: 4, fontSize: 11, color: C.t1, fontFamily: M }}>{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button onClick={save} disabled={busy} style={{ ...btn(C.cy), opacity: busy ? .6 : 1 }}>{busy ? "Saving…" : "Create type"}</button>
        <button onClick={onCancel} style={{ ...btn(C.s1), color: C.t2 }}>Cancel</button>
      </div>
    </Card>
  );
}

// W3-3 — per-type field editor. Fields are replaced wholesale on save
// (the PUT already supports it), which keeps edits deterministic.
const FIELD_KINDS = ["text", "textarea", "select", "date", "number", "boolean"];

function keyFromLabel(label) {
  return String(label || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function FieldsEditor({ type, onCancel, onSaved }) {
  const [rows, setRows] = useState(() =>
    (type.fields || []).map((f) => ({
      key: f.key, label: f.label, kind: f.kind, required: !!f.required,
      options: (f.options || []).map((o) => o.label ?? o.value).join(", "),
    })),
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const patch = (i, k, v) => setRows((r) => r.map((row, j) => (j === i ? { ...row, [k]: v } : row)));
  const addRow = () => setRows((r) => [...r, { key: "", label: "", kind: "text", required: false, options: "" }]);
  const removeRow = (i) => setRows((r) => r.filter((_, j) => j !== i));

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const fields = rows
        .filter((r) => r.label.trim())
        .map((r, i) => ({
          key: (r.key.trim() || keyFromLabel(r.label)),
          label: r.label.trim(),
          kind: r.kind,
          required: !!r.required,
          sortOrder: (i + 1) * 10,
          options: r.kind === "select"
            ? r.options.split(",").map((o) => o.trim()).filter(Boolean).map((o) => ({ value: o, label: o }))
            : [],
        }));
      const resp = await fetch(`/api/admin/intake/request-types/${type.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ fields }) });
      const d = await resp.json().catch(() => ({}));
      if (!resp.ok || !d.ok) throw new Error(d.error || `Save failed (HTTP ${resp.status})`);
      onSaved();
    } catch (e) { setErr(String(e.message || e)); } finally { setBusy(false); }
  };

  return (
    <div style={{ marginTop: 10, padding: 10, background: C.s1, border: `1px solid ${C.br}`, borderRadius: 5 }}>
      <div style={{ fontSize: 9.5, fontFamily: M, color: C.tl, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>Fields shown on New Request</div>
      {rows.length === 0 && <div style={{ fontSize: 10.5, color: C.t4, fontFamily: M, marginBottom: 8 }}>No fields yet — add the questions this workstream needs answered up front.</div>}
      {rows.map((r, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto auto", gap: 6, alignItems: "center", marginBottom: 5 }}>
          <input value={r.label} onChange={(e) => patch(i, "label", e.target.value)} placeholder="Label (e.g. Counterparty name)" style={{ ...inputStyle, fontSize: 10.5 }} />
          <select value={r.kind} onChange={(e) => patch(i, "kind", e.target.value)} style={{ ...inputStyle, fontSize: 10.5 }}>
            {FIELD_KINDS.map((k) => <option key={k} value={k} style={{ background: C.s1 }}>{k}</option>)}
          </select>
          <label style={{ fontSize: 9.5, fontFamily: M, color: C.t3, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
            <input type="checkbox" checked={r.required} onChange={(e) => patch(i, "required", e.target.checked)} /> req
          </label>
          <span onClick={() => removeRow(i)} style={{ fontSize: 12, color: C.t4, cursor: "pointer", padding: "0 4px" }}>✕</span>
          {r.kind === "select" && <input value={r.options} onChange={(e) => patch(i, "options", e.target.value)} placeholder="Options, comma-separated" style={{ ...inputStyle, fontSize: 10.5, gridColumn: "1 / span 4" }} />}
        </div>
      ))}
      {err && <div style={{ margin: "8px 0", padding: "6px 10px", background: C.rdG, borderLeft: `3px solid ${C.rd}`, borderRadius: 4, fontSize: 10.5, color: C.t1, fontFamily: M }}>{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button onClick={addRow} style={{ ...btn(C.s2), color: C.t2 }}>+ Field</button>
        <button onClick={save} disabled={busy} style={{ ...btn(C.tl), opacity: busy ? .6 : 1 }}>{busy ? "Saving…" : "Save fields"}</button>
        <button onClick={onCancel} style={{ ...btn(C.s1), color: C.t2 }}>Cancel</button>
      </div>
    </div>
  );
}

// W-D — governance workflow ladders (packages/workflow). Lists the
// org's ladder definitions so admins can copy a key into a request
// type's "Workflow ladder key", and seeds the 10-ladder pharma-GC
// library idempotently.
function GovernanceLaddersCard({ canManage, onDefinitions }) {
  const [defs, setDefs] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/workflows/definitions");
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.ok) { setDefs(d.definitions || []); onDefinitions?.(d.definitions || []); }
    } catch { /* card is best-effort */ }
  }, [onDefinitions]);
  useEffect(() => { load(); }, [load]);
  const seed = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/admin/workflows/seed-library", { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error(d.error || `Seed failed (HTTP ${r.status})`);
      setMsg(`Seeded ${d.keys.length} governance ladders.`);
      load();
    } catch (e) { setMsg(String(e.message || e)); } finally { setBusy(false); }
  };
  return (
    <Card style={{ marginBottom: 14, borderLeft: `3px solid ${C.pp}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.pp, letterSpacing: 1.2, fontFamily: M, textTransform: "uppercase" }}>Governance ladders</div>
          <div style={{ fontSize: 10.5, color: C.t3, fontFamily: M, marginTop: 2 }}>Bind a ladder to a request type via its key — tickets of that type then run the approval workflow (RAG strip on the Cockpit).</div>
        </div>
        {canManage && <button onClick={seed} disabled={busy} style={{ ...btn(C.pp), opacity: busy ? .6 : 1 }}>{busy ? "Seeding…" : "Seed 10-ladder library"}</button>}
      </div>
      {msg && <div style={{ marginTop: 8, fontSize: 10.5, fontFamily: M, color: C.t2 }}>{msg}</div>}
      {defs && defs.length > 0 && (
        <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
          {defs.map((d) => (
            <span key={d.key} title={`${d.name} · ${d.steps?.length ?? 0} steps${d.description ? ` — ${d.description}` : ""}`} style={{ padding: "3px 8px", border: `1px solid ${C.br}`, borderRadius: 3, fontSize: 9.5, fontFamily: M, color: C.t2 }}>
              {d.key} <span style={{ color: C.t4 }}>· {d.steps?.length ?? 0} steps</span>
            </span>
          ))}
        </div>
      )}
      {defs && defs.length === 0 && <div style={{ marginTop: 8, fontSize: 10.5, fontFamily: M, color: C.t4 }}>No ladders defined yet{canManage ? " — seed the library to start." : "."}</div>}
    </Card>
  );
}

export function RequestTypesTab({ canManage }) {
  const toast = useToast();
  const [types, setTypes] = useState(null);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [editingFieldsId, setEditingFieldsId] = useState(null);

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
    } catch (e) { toast.error(String(e.message || e)); }
  };
  const del = async (t) => {
    if (!window.confirm(`Delete request type "${t.name}"?`)) return;
    try {
      const r = await fetch(`/api/admin/intake/request-types/${t.id}`, { method: "DELETE" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error(d.error || `Delete failed (HTTP ${r.status})`);
      reload();
    } catch (e) { toast.error(String(e.message || e)); }
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

      <GovernanceLaddersCard canManage={canManage} />

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
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
              {t.fields.length > 0 && <span style={{ fontSize: 9.5, fontFamily: M, color: C.t4 }}>{t.fields.length} custom field{t.fields.length === 1 ? "" : "s"}</span>}
              {canManage && <span onClick={() => setEditingFieldsId(editingFieldsId === t.id ? null : t.id)} style={{ fontSize: 9.5, fontFamily: M, color: C.tl, cursor: "pointer", letterSpacing: .8 }}>{editingFieldsId === t.id ? "▾ Close fields" : "▸ Edit fields"}</span>}
            </div>
            {editingFieldsId === t.id && <FieldsEditor type={t} onCancel={() => setEditingFieldsId(null)} onSaved={() => { setEditingFieldsId(null); reload(); }} />}
          </Card>
        ))}
      </div>
    </div>
  );
}
