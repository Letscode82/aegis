import { useState, useEffect, useCallback } from "react";
import { C, F, M, SR } from "@aegis/ui";

// Generic records surface shared by Retention, Transfers and AI-system
// inventory (the migration-hold trio). Each is a list + create/edit modal
// driven by a field config; all write /api/privacy/<endpoint> (dpia:read).

const inp = { width: "100%", background: C.bg, border: `1px solid ${C.br}`, borderRadius: 5, color: C.t1, fontFamily: F, fontSize: 12.5, padding: "7px 9px", boxSizing: "border-box" };
const lbl = { fontSize: 9, fontFamily: M, letterSpacing: .8, textTransform: "uppercase", color: C.t3, marginBottom: 3, display: "block" };

async function api(url, opts) { const r = await fetch(url, opts); const d = await r.json(); if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`); return d; }

function Field({ f, value, onChange }) {
  if (f.type === "select") return <select value={value ?? f.options[0]} onChange={(e) => onChange(e.target.value)} style={inp}>{f.options.map((o) => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}</select>;
  if (f.type === "number") return <input type="number" value={value ?? 0} onChange={(e) => onChange(e.target.value)} style={inp} />;
  if (f.type === "bool") return <label style={{ fontSize: 12, color: C.t2, display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} /> {f.checkLabel || "Yes"}</label>;
  if (f.type === "tags") return <input value={Array.isArray(value) ? value.join(", ") : (value ?? "")} onChange={(e) => onChange(e.target.value)} placeholder="comma-separated" style={inp} />;
  return <input value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={f.placeholder || ""} style={inp} />;
}

function Modal({ cfg, row, onClose, onSaved }) {
  const isNew = !row.id;
  const [f, setF] = useState(() => { const o = {}; for (const fld of cfg.fields) o[fld.key] = row[fld.key] ?? (fld.type === "bool" ? (fld.default ?? true) : fld.type === "number" ? 0 : (fld.type === "select" ? fld.options[0] : "")); return o; });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    setBusy(true); setErr(null);
    const body = { ...f, id: row.id || undefined };
    for (const fld of cfg.fields) if (fld.type === "tags" && typeof body[fld.key] === "string") body[fld.key] = body[fld.key].split(",").map((x) => x.trim()).filter(Boolean);
    try { await api(`/api/privacy/${cfg.endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); onSaved(); }
    catch (e) { setErr(String(e.message || e)); setBusy(false); }
  };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(11,16,32,.9)", zIndex: 130, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.cd, border: `1px solid ${C.br}`, borderRadius: 8, width: "100%", maxWidth: 560, maxHeight: "88vh", overflowY: "auto", fontFamily: F, color: C.t1, padding: 20 }}>
        <div style={{ fontSize: 16, fontFamily: SR, marginBottom: 14 }}>{isNew ? `New ${cfg.singular}` : `Edit ${cfg.singular}`}</div>
        {cfg.fields.map((fld) => <div key={fld.key} style={{ marginBottom: 11 }}><label style={lbl}>{fld.label}</label><Field f={fld} value={f[fld.key]} onChange={(v) => set(fld.key, v)} /></div>)}
        {err && <div style={{ color: C.rd, fontSize: 12, marginBottom: 8 }}>⚠ {err}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} style={{ padding: "8px 14px", border: `1px solid ${C.br}`, color: C.t2, background: "transparent", borderRadius: 6, fontFamily: F, fontSize: 12.5, cursor: "pointer" }}>Cancel</button>
          <button onClick={busy ? undefined : save} style={{ padding: "8px 16px", background: C.tl, color: C.bg, border: "none", borderRadius: 6, fontFamily: F, fontSize: 12.5, fontWeight: 600, cursor: busy ? "default" : "pointer", opacity: busy ? .6 : 1 }}>Save</button>
        </div>
      </div>
    </div>
  );
}

function RecordsSurface({ cfg }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [edit, setEdit] = useState(null);
  const load = useCallback(() => { api(`/api/privacy/${cfg.endpoint}`).then((d) => setRows(d.items)).catch((e) => setErr(String(e.message || e))); }, [cfg.endpoint]);
  useEffect(() => { load(); }, [load]);
  const remove = async (id) => { try { await api(`/api/privacy/${cfg.endpoint}/${id}`, { method: "DELETE" }); load(); } catch (e) { setErr(String(e.message || e)); } };

  return (
    <div style={{ fontFamily: F, color: C.t1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 20, fontFamily: SR }}>{cfg.title}</div>
          <div style={{ fontSize: 12, color: C.t3, fontFamily: M, marginTop: 2 }}>{cfg.subtitle}</div>
        </div>
        <button onClick={() => setEdit({})} style={{ padding: "9px 15px", background: C.tl, color: C.bg, border: "none", borderRadius: 8, fontFamily: F, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>+ New {cfg.singular}</button>
      </div>
      {err && <div style={{ color: C.rd, fontFamily: M, fontSize: 12, marginBottom: 10 }}>⚠ {err}</div>}
      {!rows && !err && <div style={{ padding: 30, textAlign: "center", color: C.t3, fontFamily: M, fontSize: 12 }}>◎ Loading…</div>}
      {rows && rows.length === 0 && <div style={{ padding: 30, textAlign: "center", color: C.t4, fontFamily: M, fontSize: 12 }}>{cfg.empty}</div>}
      <div style={{ display: "grid", gap: 8 }}>
        {(rows || []).map((r) => (
          <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, background: C.cd, border: `1px solid ${C.br}`, borderRadius: 8, padding: "11px 14px" }}>
            <div style={{ flex: 1 }}>{cfg.render(r)}</div>
            <div style={{ display: "flex", gap: 6, flex: "none" }}>
              <button onClick={() => setEdit(r)} style={{ padding: "5px 10px", border: `1px solid ${C.br}`, color: C.t2, background: "transparent", borderRadius: 5, fontFamily: M, fontSize: 10, cursor: "pointer" }}>Edit</button>
              <button onClick={() => remove(r.id)} style={{ padding: "5px 9px", border: `1px solid ${C.br}`, color: C.rd, background: "transparent", borderRadius: 5, fontFamily: M, fontSize: 10, cursor: "pointer" }}>×</button>
            </div>
          </div>
        ))}
      </div>
      {edit && <Modal cfg={cfg} row={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </div>
  );
}

const badge = (col, text) => <span style={{ fontSize: 9, fontFamily: M, fontWeight: 700, letterSpacing: .5, textTransform: "uppercase", color: col, border: `1px solid ${col}`, borderRadius: 4, padding: "1px 7px", marginLeft: 8 }}>{text}</span>;
const TIER_COL = { MINIMAL: C.gn, LIMITED: C.tl, HIGH: C.am, UNACCEPTABLE: C.rd };

export function RetentionView() {
  return <RecordsSurface cfg={{
    endpoint: "retention", title: "Retention & Disposal", singular: "schedule",
    subtitle: "Retention schedules with disposal action and trigger.", empty: "No retention schedules yet.",
    fields: [
      { key: "name", label: "Name", type: "text" }, { key: "dataCategory", label: "Data category", type: "text" },
      { key: "retentionPeriodDays", label: "Retention (days)", type: "number" },
      { key: "action", label: "Disposal action", type: "select", options: ["DELETE", "ANONYMIZE", "REVIEW"] },
      { key: "trigger", label: "Trigger", type: "text", placeholder: "e.g. from last use" },
      { key: "appliesTo", label: "Applies to (systems)", type: "tags" }, { key: "notes", label: "Notes", type: "text" },
    ],
    render: (r) => <div><div style={{ fontSize: 13.5 }}>{r.name} {badge(C.t3, r.action)}</div><div style={{ fontSize: 10.5, color: C.t3, fontFamily: M, marginTop: 3 }}>{r.dataCategory || "—"} · retain {r.retentionPeriodDays}d{r.trigger ? ` · ${r.trigger}` : ""}</div></div>,
  }} />;
}

export function TransfersView() {
  return <RecordsSurface cfg={{
    endpoint: "transfers", title: "Cross-border Transfers", singular: "transfer",
    subtitle: "Transfer register with mechanism (SCC / adequacy / BCR) and status.", empty: "No transfers recorded.",
    fields: [
      { key: "name", label: "Name", type: "text" }, { key: "destinationCountry", label: "Destination country", type: "text" },
      { key: "mechanism", label: "Mechanism", type: "select", options: ["SCC", "ADEQUACY", "BCR", "DEROGATION", "NONE"] },
      { key: "status", label: "Status", type: "select", options: ["ACTIVE", "UNDER_REVIEW", "SUSPENDED"] },
      { key: "safeguards", label: "Safeguards", type: "text" }, { key: "notes", label: "Notes", type: "text" },
    ],
    render: (r) => <div><div style={{ fontSize: 13.5 }}>{r.name} {badge(r.mechanism === "NONE" ? C.rd : C.tl, r.mechanism)}{badge(r.status === "SUSPENDED" ? C.rd : r.status === "UNDER_REVIEW" ? C.am : C.gn, r.status)}</div><div style={{ fontSize: 10.5, color: C.t3, fontFamily: M, marginTop: 3 }}>↗ {r.destinationCountry || "—"}{r.safeguards ? ` · ${r.safeguards}` : ""}</div></div>,
  }} />;
}

export function AiSystemsView() {
  return <RecordsSurface cfg={{
    endpoint: "ai-systems", title: "AI System Inventory", singular: "system",
    subtitle: "Registered AI / automated-decision systems with risk tier and oversight.", empty: "No AI systems registered.",
    fields: [
      { key: "name", label: "Name", type: "text" }, { key: "purpose", label: "Purpose", type: "text" },
      { key: "riskTier", label: "Risk tier", type: "select", options: ["MINIMAL", "LIMITED", "HIGH", "UNACCEPTABLE"] },
      { key: "status", label: "Status", type: "select", options: ["PILOT", "IN_USE", "RETIRED"] },
      { key: "humanOversight", label: "Human oversight", type: "bool", checkLabel: "Meaningful human review in place" },
      { key: "owner", label: "Owner", type: "text" }, { key: "notes", label: "Notes", type: "text" },
    ],
    render: (r) => <div><div style={{ fontSize: 13.5 }}>{r.name} {badge(TIER_COL[r.riskTier] || C.t3, r.riskTier)}{badge(C.t3, r.status)}{!r.humanOversight && badge(C.rd, "no oversight")}</div><div style={{ fontSize: 10.5, color: C.t3, fontFamily: M, marginTop: 3 }}>{r.purpose || "—"}{r.owner ? ` · ${r.owner}` : ""}</div></div>,
  }} />;
}

const DPA_COL = { NONE: C.rd, REQUESTED: C.am, SIGNED: C.gn, EXPIRED: C.rd };
const PROC_TIER_COL = { LOW: C.gn, MEDIUM: C.tl, HIGH: C.am, CRITICAL: C.rd };

export function ProcessorsView() {
  return <RecordsSurface cfg={{
    endpoint: "processors", title: "Processor Register", singular: "processor",
    subtitle: "Processors & sub-processors with DPA status, location and risk tier.", empty: "No processors registered.",
    fields: [
      { key: "name", label: "Name", type: "text" },
      { key: "role", label: "Role", type: "select", options: ["PROCESSOR", "SUB_PROCESSOR", "CONTROLLER", "JOINT_CONTROLLER"] },
      { key: "purpose", label: "Purpose", type: "text" }, { key: "location", label: "Location (country)", type: "text" },
      { key: "dpaStatus", label: "DPA status", type: "select", options: ["NONE", "REQUESTED", "SIGNED", "EXPIRED"] },
      { key: "riskTier", label: "Risk tier", type: "select", options: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] },
      { key: "safeguards", label: "Safeguards", type: "text" }, { key: "contactEmail", label: "Contact email", type: "text" },
      { key: "subProcessors", label: "Sub-processors", type: "tags" }, { key: "notes", label: "Notes", type: "text" },
    ],
    render: (r) => <div><div style={{ fontSize: 13.5 }}>{r.name} {badge(PROC_TIER_COL[r.riskTier] || C.t3, r.riskTier)}{badge(DPA_COL[r.dpaStatus] || C.t3, `DPA ${r.dpaStatus}`)}</div><div style={{ fontSize: 10.5, color: C.t3, fontFamily: M, marginTop: 3 }}>{r.role.replace(/_/g, " ").toLowerCase()}{r.location ? ` · ${r.location}` : ""}{r.purpose ? ` · ${r.purpose}` : ""}</div></div>,
  }} />;
}

const CAT_COL = { STRICTLY_NECESSARY: C.gn, FUNCTIONAL: C.tl, ANALYTICS: C.bl, MARKETING: C.am };

export function CookiesView() {
  return <RecordsSurface cfg={{
    endpoint: "cookies", title: "Cookie & Tracker Registry", singular: "cookie",
    subtitle: "Cookie/tracker inventory by category with consent requirement. (Automated scanning is a separate SDK surface.)", empty: "No cookies registered.",
    fields: [
      { key: "name", label: "Name", type: "text" },
      { key: "category", label: "Category", type: "select", options: ["STRICTLY_NECESSARY", "FUNCTIONAL", "ANALYTICS", "MARKETING"] },
      { key: "provider", label: "Provider", type: "text" }, { key: "purpose", label: "Purpose", type: "text" },
      { key: "domain", label: "Domain", type: "text" }, { key: "durationDays", label: "Duration (days)", type: "number" },
      { key: "consentRequired", label: "Consent", type: "bool", checkLabel: "Consent required before set", default: true },
    ],
    render: (r) => <div><div style={{ fontSize: 13.5 }}>{r.name} {badge(CAT_COL[r.category] || C.t3, r.category.replace(/_/g, " "))}{r.consentRequired && badge(C.am, "consent")}</div><div style={{ fontSize: 10.5, color: C.t3, fontFamily: M, marginTop: 3 }}>{r.provider || "—"}{r.domain ? ` · ${r.domain}` : ""}{r.durationDays != null ? ` · ${r.durationDays}d` : ""}</div></div>,
  }} />;
}

const TRAIN_COL = { DRAFT: C.t3, ACTIVE: C.bl, COMPLETED: C.gn, OVERDUE: C.rd };

export function TrainingView() {
  return <RecordsSurface cfg={{
    endpoint: "training", title: "Training & Awareness", singular: "course",
    subtitle: "Privacy training programs with assignment/completion tracking. (Content delivery is an external LMS.)", empty: "No training programs yet.",
    fields: [
      { key: "courseName", label: "Course name", type: "text" }, { key: "audience", label: "Audience", type: "text" },
      { key: "cadence", label: "Cadence", type: "select", options: ["ANNUAL", "ONBOARDING", "QUARTERLY", "AD_HOC"] },
      { key: "status", label: "Status", type: "select", options: ["DRAFT", "ACTIVE", "COMPLETED", "OVERDUE"] },
      { key: "assignedCount", label: "Assigned", type: "number" }, { key: "completedCount", label: "Completed", type: "number" },
      { key: "dueDate", label: "Due date (YYYY-MM-DD)", type: "text" }, { key: "notes", label: "Notes", type: "text" },
    ],
    render: (r) => { const pct = r.assignedCount > 0 ? Math.round((r.completedCount / r.assignedCount) * 100) : 0; return <div><div style={{ fontSize: 13.5 }}>{r.courseName} {badge(TRAIN_COL[r.status] || C.t3, r.status)}</div><div style={{ fontSize: 10.5, color: C.t3, fontFamily: M, marginTop: 3 }}>{r.cadence.replace(/_/g, " ").toLowerCase()}{r.audience ? ` · ${r.audience}` : ""} · {r.completedCount}/{r.assignedCount} complete ({pct}%)</div></div>; },
  }} />;
}
