import { useState, useEffect, useCallback } from "react";
import { C, F, M, SR, Card, inputStyle, useToast } from "@aegis/ui";
import { ALL_AGENTS } from "../agents";

// ── Workflow Designer (program #1) ───────────────────────────────────
//
// Visual builder for governance ladders (packages/workflow). Create or
// edit a definition: add/reorder steps, set each step's assigned role,
// SLA, optional skip rule, and whether it's a HUMAN approval or an
// AGENT step (pick which of the registered agents runs it). Save POSTs
// to /api/workflows/definitions (defineWorkflow upserts on org+key and
// bumps the version). No new backend — the engine already models all
// of this.
//
// Design intent: minimum clicks. Presets add a fully-formed step in one
// click; a step's role/SLA/agent are inline selects, not modals.

// Canonical @aegis/auth role names (steps gate on user.roleName).
const ROLES = ["gc", "attorney", "paralegal", "legal_ops", "requester", "external_counsel", "viewer"];
const SKIP_OPS = ["lt", "lte", "gt", "gte", "eq", "ne", "in"];

const labelS = { fontSize: 9.5, fontFamily: M, color: C.t3, letterSpacing: 1, textTransform: "uppercase", marginBottom: 3 };
const btn = (bg) => ({ padding: "5px 11px", background: bg, color: C.bg, fontSize: 9.5, fontFamily: M, letterSpacing: 1.2, cursor: "pointer", textTransform: "uppercase", fontWeight: 700, borderRadius: 3, border: "none" });
const ghostBtn = { padding: "4px 9px", background: "transparent", border: `1px solid ${C.br}`, color: C.t2, fontSize: 9.5, fontFamily: M, letterSpacing: 1, cursor: "pointer", borderRadius: 3 };

const HUMAN_PRESETS = [
  { name: "Legal Review", screenKey: "legal_review", approverRole: "attorney", slaHours: 48 },
  { name: "Finance Review", screenKey: "finance_review", approverRole: "legal_ops", slaHours: 48 },
  { name: "GC Approval", screenKey: "gc_approval", approverRole: "gc", slaHours: 72 },
  { name: "Requester Submit", screenKey: "intake", approverRole: "requester", slaHours: null },
];

function emptyHuman(order) {
  return { stepOrder: order, name: "New step", screenKey: "review", approverRole: "attorney", kind: "HUMAN", slaHours: 24, agentKey: "", minConfidence: 0.8, skipField: "", skipOp: "lt", skipValue: "" };
}
function emptyAgent(order) {
  const first = ALL_AGENTS[0];
  return { stepOrder: order, name: `AI: ${first?.shortName || first?.name || "review"}`, screenKey: "agent_review", approverRole: "attorney", kind: "AGENT", slaHours: 8, agentKey: first?.id || "", minConfidence: 0.8, skipField: "", skipOp: "lt", skipValue: "" };
}

// Definition (from the API) → editor rows.
function toRows(def) {
  return (def.steps || []).slice().sort((a, b) => a.stepOrder - b.stepOrder).map((s, i) => {
    const cfg = s.agentConfigJson || {};
    const skip = (s.metadataJson || {}).skip_if || {};
    return {
      stepOrder: i + 1,
      name: s.name,
      screenKey: s.screenKey,
      approverRole: s.approverRole || "",
      kind: s.kind || "HUMAN",
      slaHours: s.slaHours ?? "",
      agentKey: cfg.agentKey || "",
      minConfidence: typeof cfg.minConfidence === "number" ? cfg.minConfidence : 0.8,
      skipField: skip.field || "",
      skipOp: skip.op || "lt",
      skipValue: skip.value !== undefined ? String(skip.value) : "",
    };
  });
}

// Editor rows → the API step shape.
function toSteps(rows) {
  return rows.map((r, i) => {
    const step = {
      stepOrder: i + 1,
      name: r.name.trim() || `Step ${i + 1}`,
      screenKey: r.screenKey.trim() || "review",
      approverRole: r.approverRole || null,
      kind: r.kind,
      slaHours: r.slaHours === "" ? null : Number(r.slaHours),
      agentConfigJson: r.kind === "AGENT" ? { agentKey: r.agentKey, minConfidence: Number(r.minConfidence) || 0.8 } : {},
      metadataJson: {},
    };
    if (r.skipField.trim()) {
      let v = r.skipValue;
      if (v === "true") v = true; else if (v === "false") v = false;
      else if (v !== "" && !isNaN(Number(v))) v = Number(v);
      step.metadataJson = { skip_if: { field: r.skipField.trim(), op: r.skipOp, value: v } };
    }
    return step;
  });
}

function StepRow({ row, index, total, onChange, onMove, onDelete }) {
  const set = (patch) => onChange(index, { ...row, ...patch });
  const isAgent = row.kind === "AGENT";
  return (
    <div style={{ border: `1px solid ${isAgent ? C.pp + "66" : C.br}`, borderRadius: 4, padding: 10, marginBottom: 8, background: C.s1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontFamily: M, color: C.t3, minWidth: 18 }}>{index + 1}.</span>
        <input value={row.name} onChange={(e) => set({ name: e.target.value })} style={{ ...inputStyle, flex: 1, fontSize: 12 }} placeholder="Step name" />
        <div onClick={() => set({ kind: isAgent ? "HUMAN" : "AGENT" })} title="Toggle human / agent step" style={{ ...ghostBtn, color: isAgent ? C.pp : C.t2, borderColor: isAgent ? C.pp : C.br }}>{isAgent ? "⚙ AGENT" : "◧ HUMAN"}</div>
        <div style={{ display: "flex", gap: 3 }}>
          <div onClick={() => index > 0 && onMove(index, index - 1)} style={{ ...ghostBtn, opacity: index > 0 ? 1 : 0.3, padding: "4px 7px" }}>↑</div>
          <div onClick={() => index < total - 1 && onMove(index, index + 1)} style={{ ...ghostBtn, opacity: index < total - 1 ? 1 : 0.3, padding: "4px 7px" }}>↓</div>
          <div onClick={() => onDelete(index)} style={{ ...ghostBtn, color: C.rd, borderColor: C.rd + "66", padding: "4px 7px" }}>✕</div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isAgent ? "1fr 1fr 1fr" : "1fr 1fr", gap: 8 }}>
        <div>
          <div style={labelS}>{isAgent ? "Escalates to role" : "Approver role"}</div>
          <select value={row.approverRole} onChange={(e) => set({ approverRole: e.target.value })} style={{ ...inputStyle, fontSize: 11 }}>
            <option value="">(any staff)</option>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <div style={labelS}>SLA hours</div>
          <input type="number" value={row.slaHours} onChange={(e) => set({ slaHours: e.target.value })} style={{ ...inputStyle, fontSize: 11 }} placeholder="none" />
        </div>
        {isAgent && (
          <div>
            <div style={labelS}>Agent</div>
            <select value={row.agentKey} onChange={(e) => set({ agentKey: e.target.value })} style={{ ...inputStyle, fontSize: 11 }}>
              {ALL_AGENTS.map((a) => <option key={a.id} value={a.id}>{a.shortName || a.name}</option>)}
            </select>
          </div>
        )}
      </div>
      {isAgent && (
        <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={labelS}>Escalate below confidence</span>
          <input type="number" step="0.05" min="0" max="1" value={row.minConfidence} onChange={(e) => set({ minConfidence: e.target.value })} style={{ ...inputStyle, fontSize: 11, width: 80 }} />
          <span style={{ fontSize: 9.5, color: C.t4, fontFamily: M }}>below this, a human on the role above decides</span>
        </div>
      )}
      <details style={{ marginTop: 6 }}>
        <summary style={{ fontSize: 9.5, fontFamily: M, color: C.t3, cursor: "pointer" }}>Skip this step when… (optional)</summary>
        <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center" }}>
          <input value={row.skipField} onChange={(e) => set({ skipField: e.target.value })} style={{ ...inputStyle, fontSize: 11, flex: 1 }} placeholder="field (e.g. contract_value)" />
          <select value={row.skipOp} onChange={(e) => set({ skipOp: e.target.value })} style={{ ...inputStyle, fontSize: 11, width: 70 }}>
            {SKIP_OPS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <input value={row.skipValue} onChange={(e) => set({ skipValue: e.target.value })} style={{ ...inputStyle, fontSize: 11, width: 100 }} placeholder="value" />
        </div>
      </details>
    </div>
  );
}

function DefinitionEditor({ def, onCancel, onSaved }) {
  const toast = useToast();
  const isNew = !def;
  const [key, setKey] = useState(def?.key || "");
  const [name, setName] = useState(def?.name || "");
  const [description, setDescription] = useState(def?.description || "");
  const [rows, setRows] = useState(def ? toRows(def) : [emptyHuman(1)]);
  const [busy, setBusy] = useState(false);

  const changeRow = (i, next) => setRows((rs) => rs.map((r, j) => (j === i ? next : r)));
  const move = (from, to) => setRows((rs) => { const c = rs.slice(); const [x] = c.splice(from, 1); c.splice(to, 0, x); return c; });
  const del = (i) => setRows((rs) => rs.filter((_, j) => j !== i));
  const addHuman = () => setRows((rs) => rs.length < 15 ? [...rs, emptyHuman(rs.length + 1)] : rs);
  const addAgent = () => setRows((rs) => rs.length < 15 ? [...rs, emptyAgent(rs.length + 1)] : rs);
  const addPreset = (p) => setRows((rs) => rs.length < 15 ? [...rs, { ...emptyHuman(rs.length + 1), ...p, slaHours: p.slaHours ?? "" }] : rs);

  const save = async () => {
    if (!name.trim()) { toast.error("Name is required."); return; }
    if (rows.length === 0) { toast.error("Add at least one step."); return; }
    setBusy(true);
    try {
      const body = { key: (key || name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")), name: name.trim(), description: description.trim() || null, steps: toSteps(rows) };
      const r = await fetch("/api/workflows/definitions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error(d.error || `Save failed (HTTP ${r.status})`);
      toast.success(`Saved "${d.definition.name}" (v${d.definition.version}).`);
      onSaved();
    } catch (e) { toast.error(String(e.message || e)); } finally { setBusy(false); }
  };

  return (
    <Card style={{ borderLeft: `3px solid ${C.pp}` }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: C.pp, letterSpacing: 1.2, fontFamily: M, textTransform: "uppercase", marginBottom: 12 }}>{isNew ? "New workflow" : `Edit · ${def.name} (v${def.version})`}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div><div style={labelS}>Name</div><input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} placeholder="NDA Approval Ladder" /></div>
        <div><div style={labelS}>Key {isNew ? "(auto if blank)" : "(locked)"}</div><input value={key} onChange={(e) => setKey(e.target.value)} disabled={!isNew} style={{ ...inputStyle, opacity: isNew ? 1 : 0.6 }} placeholder="nda_approval_ladder" /></div>
      </div>
      <div style={{ marginBottom: 12 }}><div style={labelS}>Description</div><input value={description} onChange={(e) => setDescription(e.target.value)} style={inputStyle} placeholder="What this workflow governs" /></div>

      <div style={{ fontSize: 10, fontFamily: M, color: C.t2, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Steps ({rows.length}/15)</div>
      {rows.map((r, i) => <StepRow key={i} row={r} index={i} total={rows.length} onChange={changeRow} onMove={move} onDelete={del} />)}

      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 4, marginBottom: 14 }}>
        <div onClick={addHuman} style={ghostBtn}>+ Human step</div>
        <div onClick={addAgent} style={{ ...ghostBtn, color: C.pp, borderColor: C.pp }}>+ Agent step ⚙</div>
        <span style={{ fontSize: 9, fontFamily: M, color: C.t4, alignSelf: "center", marginLeft: 4 }}>presets:</span>
        {HUMAN_PRESETS.map((p) => <div key={p.name} onClick={() => addPreset(p)} style={{ ...ghostBtn, fontSize: 9 }}>+ {p.name}</div>)}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={save} disabled={busy} style={{ ...btn(C.pp), opacity: busy ? 0.6 : 1 }}>{busy ? "Saving…" : isNew ? "Create workflow" : "Save changes"}</button>
        <button onClick={onCancel} style={{ ...btn(C.s1), color: C.t2 }}>Cancel</button>
      </div>
    </Card>
  );
}

export function WorkflowDesignerTab({ canManage }) {
  const toast = useToast();
  const [defs, setDefs] = useState(null);
  const [editing, setEditing] = useState(null); // def object, or "new", or null
  const [seeding, setSeeding] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/workflows/definitions?includeInactive=false");
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.ok) setDefs(d.definitions || []);
      else setDefs([]);
    } catch { setDefs([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const seed = async () => {
    setSeeding(true);
    try {
      const r = await fetch("/api/admin/workflows/seed-library", { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error(d.error || `Seed failed (HTTP ${r.status})`);
      toast.success(`Seeded ${d.keys.length} governance ladders.`);
      load();
    } catch (e) { toast.error(String(e.message || e)); } finally { setSeeding(false); }
  };

  if (defs === null) return <div style={{ padding: 40, textAlign: "center", color: C.t3, fontFamily: M, fontSize: 12, letterSpacing: 1 }}>◎ Loading workflows…</div>;

  if (editing) {
    return <DefinitionEditor def={editing === "new" ? null : editing} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />;
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: 15, fontFamily: SR, color: C.t1 }}>Workflow Designer</div>
          <div style={{ fontSize: 10.5, color: C.t3, fontFamily: M, marginTop: 2 }}>Build the approval ladder a request type runs — steps, who approves each, SLAs, and where agents pick up. Bind a ladder to a type in Request Types.</div>
        </div>
        {canManage && <div style={{ display: "flex", gap: 8 }}>
          {defs.length === 0 && <button onClick={seed} disabled={seeding} style={{ ...btn(C.tl), opacity: seeding ? 0.6 : 1 }}>{seeding ? "Seeding…" : "Seed 10-ladder library"}</button>}
          <button onClick={() => setEditing("new")} style={btn(C.pp)}>+ New workflow</button>
        </div>}
      </div>

      {defs.length === 0 && <div style={{ padding: "24px 0", textAlign: "center", color: C.t4, fontSize: 11, fontFamily: M }}>No workflows yet.{canManage && <> Seed the pharma-GC library or click <span style={{ color: C.pp, fontWeight: 600 }}>+ NEW WORKFLOW</span>.</>}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {defs.map((d) => (
          <Card key={d.id} style={{ borderLeft: `3px solid ${C.pp}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, color: C.t1, fontWeight: 600 }}>{d.name}</div>
                <div style={{ fontSize: 9.5, fontFamily: M, color: C.t3, marginTop: 2 }}>{d.key} · v{d.version} · {d.steps?.length ?? 0} steps</div>
              </div>
              {canManage && <div onClick={() => setEditing(d)} style={ghostBtn}>Edit</div>}
            </div>
            {d.description && <div style={{ fontSize: 10.5, color: C.t3, fontFamily: F, marginTop: 6, lineHeight: 1.4 }}>{d.description}</div>}
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 8 }}>
              {(d.steps || []).slice().sort((a, b) => a.stepOrder - b.stepOrder).map((s) => (
                <span key={s.id} title={`${s.approverRole || "any"}${s.slaHours ? ` · SLA ${s.slaHours}h` : ""}`} style={{ fontSize: 9, fontFamily: M, padding: "2px 6px", borderRadius: 3, border: `1px solid ${s.kind === "AGENT" ? C.pp + "66" : C.br}`, color: s.kind === "AGENT" ? C.pp : C.t2 }}>
                  {s.kind === "AGENT" ? "⚙ " : ""}{s.stepOrder}. {s.name}
                </span>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
