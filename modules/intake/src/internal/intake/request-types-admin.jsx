import { useState, useEffect } from "react";
import { C, M, Card, inputStyle } from "@aegis/ui";
import { ALL_AGENTS } from "../agents";

// ── Track 1 · Activity 7 — request-types admin surface ───────────────
//
// Surfaces the item-1 configurable-workstreams backend: intake request
// types (key, name, workstream, stage workflow). Reads/writes
// /api/admin/intake/request-types (gated admin:manage_users). DRL's
// Contracts / Trademarks / Litigation workstreams are configured here.

const labelS = { fontSize: 9.5, fontFamily: M, color: C.t3, letterSpacing: 1, textTransform: "uppercase", marginBottom: 3 };
const btn = (bg) => ({ padding: "5px 11px", background: bg, color: C.bg, fontSize: 9.5, fontFamily: M, letterSpacing: 1.2, cursor: "pointer", textTransform: "uppercase", fontWeight: 700, borderRadius: 3, border: "none" });

export function TypeForm({ onCancel, onSaved, initialWorkflowKey }) {
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
  const [workflowKey, setWorkflowKey] = useState(initialWorkflowKey || "");
  const [preferredAgentId, setPreferredAgentId] = useState("");
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
        preferredAgentId: preferredAgentId || null,
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
        <div><div style={labelS}>Handled by agent</div><select value={preferredAgentId} onChange={(e) => setPreferredAgentId(e.target.value)} style={inputStyle}><option value="">Auto — router decides by content</option>{ALL_AGENTS.map((a) => <option key={a.id} value={a.id}>{a.shortName || a.name}</option>)}</select></div>
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

export function FieldsEditor({ type, onCancel, onSaved }) {
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

