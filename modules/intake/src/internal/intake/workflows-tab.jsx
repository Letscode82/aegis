import { useState, useEffect, useCallback } from "react";
import { C, F, M, SR, Card } from "@aegis/ui";
import { ALL_AGENTS } from "../agents";
import { DefinitionEditor } from "./workflow-designer.jsx";
import { TypeForm, FieldsEditor } from "./request-types-admin.jsx";

// ── Workflows — one surface, everything flows from the ladder ─────────
//
// Replaces the two-tab "Request Pipelines" split. A workflow is the whole
// request pipeline read top-to-bottom:
//   0 · INTAKE      — the request type + the fields the requester fills
//   1..N · STEPS    — the governance ladder (human/agent steps, SLAs)
// anchored on the ladder. The intake type is bound to the ladder by its
// workflowKey; editing both from one page removes the "what's a
// workflowKey" confusion. Guided mode (default on) walks the two halves
// one at a time; flip it off for the flat editor.

const agentName = (id) => { const a = ALL_AGENTS.find((x) => x.id === id); return a ? (a.shortName || a.name) : id; };
const firstLadderAgent = (def) => {
  const s = (def?.steps || []).find((x) => x.kind === "AGENT" && (x.agentConfigJson || x.agentConfig || {}).agentKey);
  return s ? ((s.agentConfigJson || s.agentConfig).agentKey) : null;
};
const sectionLabel = { fontSize: 10, fontFamily: M, color: C.t3, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 600, marginBottom: 10 };

function Toggle({ on, onChange, label }) {
  return (
    <div onClick={() => onChange(!on)} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}>
      <span style={{ fontSize: 10, fontFamily: M, color: C.t3, letterSpacing: 1, textTransform: "uppercase" }}>{label}</span>
      <div style={{ width: 34, height: 18, borderRadius: 10, background: on ? C.cy : C.br, position: "relative", transition: "background .15s" }}>
        <div style={{ position: "absolute", top: 2, left: on ? 18 : 2, width: 14, height: 14, borderRadius: "50%", background: C.bg, transition: "left .15s" }} />
      </div>
    </div>
  );
}

export function WorkflowsTab({ canManage }) {
  const [defs, setDefs] = useState(null);
  const [types, setTypes] = useState([]);
  const [error, setError] = useState(null);
  const [selKey, setSelKey] = useState(null);
  const [creating, setCreating] = useState(false);
  // Guided setup preference is remembered per-user (localStorage), default on.
  const [guided, setGuided] = useState(() => {
    if (typeof window === "undefined") return true;
    try { const v = window.localStorage.getItem("aegis:workflows:guided"); return v === null ? true : v === "1"; } catch { return true; }
  });
  useEffect(() => { try { window.localStorage.setItem("aegis:workflows:guided", guided ? "1" : "0"); } catch { /* noop */ } }, [guided]);
  const [intakeTypeId, setIntakeTypeId] = useState(null); // which bound type's fields to edit (shared ladders)
  const [settingUpIntake, setSettingUpIntake] = useState(false);
  const [intakeOpen, setIntakeOpen] = useState(false); // the optional intake form is collapsed by default

  const load = useCallback(async () => {
    try {
      const [dr, tr] = await Promise.all([
        fetch("/api/workflows/definitions?includeInactive=false"),
        fetch(`/api/admin/intake/request-types?all=1`).catch(() => null),
      ]);
      const dd = await dr.json().catch(() => ({}));
      setDefs(dr.ok && dd.ok ? (dd.definitions || []) : []);
      if (tr && tr.ok) { const td = await tr.json().catch(() => ({})); setTypes(td.ok ? (td.types || []) : []); }
      setError(null);
    } catch (e) { setError(String(e.message || e)); setDefs([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const boundTypes = (defKey) => types.filter((t) => t.workflowKey === defKey);
  const sel = defs && selKey ? defs.find((d) => d.key === selKey) : null;

  const openWorkflow = (key) => { setSelKey(key); setCreating(false); setSettingUpIntake(false); setIntakeOpen(false); setIntakeTypeId(null); };
  const afterDefSaved = (savedDef) => { load().then(() => { if (savedDef?.key) openWorkflow(savedDef.key); }); setCreating(false); };

  if (error) return <div style={{ padding: 20, background: C.rdG, border: `1px solid ${C.rd}55`, borderRadius: 5, fontSize: 12, color: C.t1 }}>Couldn't load workflows: {error} <span onClick={load} style={{ marginLeft: 8, color: C.cy, cursor: "pointer", fontFamily: M }}>RETRY</span></div>;
  if (!defs) return <div style={{ padding: 40, textAlign: "center", color: C.t3, fontFamily: M, fontSize: 12, letterSpacing: 1 }}>◎ Loading workflows…</div>;

  // ── Editor for the selected (or new) workflow ─────────────────────
  if (creating) {
    return (
      <div style={{ fontFamily: F }}>
        <div onClick={() => setCreating(false)} style={{ cursor: "pointer", fontSize: 11, color: C.cy, fontFamily: M, marginBottom: 12 }}>← All workflows</div>
        <div style={sectionLabel}>New workflow · governance steps</div>
        <div style={{ fontSize: 11, color: C.t3, marginBottom: 12 }}>Name it and lay out the approval / agent steps — that's the workflow. You can optionally add an intake form afterwards.</div>
        {canManage
          ? <DefinitionEditor def={null} onCancel={() => setCreating(false)} onSaved={afterDefSaved} />
          : <div style={{ fontSize: 12, color: C.t3 }}>You don't have permission to create workflows.</div>}
      </div>
    );
  }

  if (sel) {
    const bts = boundTypes(sel.key);
    const bt = bts.find((t) => t.id === intakeTypeId) || bts[0] || null;
    const ladderAgent = firstLadderAgent(sel);

    const showIntakeBody = intakeOpen || settingUpIntake;
    const intakeSummary = bt
      ? `${bt.name}${typeof bt.fields?.length === "number" ? ` · ${bt.fields.length} field${bt.fields.length === 1 ? "" : "s"}` : ""}`
      : "None — anyone can file into this workflow by request type";

    // Governance ladder — the substance of the workflow. Always primary.
    const GovernanceSection = (
      <div>
        <div style={{ ...sectionLabel, marginTop: 4 }}>Governance ladder · the steps</div>
        {guided && <div style={{ fontSize: 10.5, color: C.t3, marginBottom: 10 }}>How the request is approved: ordered human / agent steps with roles, SLAs, and skip rules. {ladderAgent ? <>The first agent step (<b>{agentName(ladderAgent)}</b>) also processes the ticket automatically.</> : "Add an agent step to have an AI agent process the ticket."}</div>}
        {canManage
          ? <DefinitionEditor def={sel} onCancel={() => {}} onSaved={afterDefSaved} />
          : <div style={{ fontSize: 12, color: C.t3 }}>You don't have permission to edit steps.</div>}
      </div>
    );

    // Intake form — OPTIONAL and secondary. Collapsed by default; a
    // one-line summary the admin can expand to configure. The ladder is
    // what matters; the intake form just captures answers up front.
    const IntakeCard = (
      <Card style={{ borderLeft: `3px solid ${C.br}` }}>
        <div onClick={() => setIntakeOpen((o) => !o)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ ...sectionLabel, marginBottom: 2 }}>Intake form <span style={{ color: C.t4, fontWeight: 400, letterSpacing: 0 }}>· optional</span></div>
            <div style={{ fontSize: 10.5, color: bt ? C.t2 : C.t4, fontFamily: M }}>{intakeSummary}</div>
          </div>
          <div style={{ fontSize: 10.5, color: C.cy, fontFamily: M, whiteSpace: "nowrap" }}>{showIntakeBody ? "▾ Hide" : bt ? "▸ Edit" : "▸ Add"}</div>
        </div>
        {showIntakeBody && (
          <div style={{ marginTop: 12, borderTop: `1px solid ${C.br}`, paddingTop: 12 }}>
            {bts.length > 1 && (
              <div style={{ marginBottom: 8 }}>
                <select value={bt?.id || ""} onChange={(e) => setIntakeTypeId(e.target.value)} style={{ background: C.bg, border: `1px solid ${C.br}`, borderRadius: 4, color: C.t1, fontFamily: M, fontSize: 10.5, padding: "5px 7px" }}>
                  {bts.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <div style={{ fontSize: 10, color: C.am, fontFamily: M, marginTop: 6 }}>⚠ {bts.length} request types share this workflow — editing the intake for <b>{bt?.name}</b> only.</div>
              </div>
            )}
            {bt ? (
              <>
                {guided && <div style={{ fontSize: 10.5, color: C.t3, marginBottom: 10 }}>These fields render on the New Request form for a <b>{bt.name}</b>. Values flow into the ladder as context (e.g. skip a step when <code style={{ color: C.tl }}>contract_value &lt; 50000</code>).</div>}
                <FieldsEditor type={bt} onCancel={() => {}} onSaved={load} />
              </>
            ) : settingUpIntake ? (
              <TypeForm initialWorkflowKey={sel.key} onCancel={() => setSettingUpIntake(false)} onSaved={() => { setSettingUpIntake(false); load(); }} />
            ) : (
              <div>
                {guided && <div style={{ fontSize: 11, color: C.t3, lineHeight: 1.6, marginBottom: 10 }}>No structured fields yet — requesters file by request type only. Add a form so they answer the right questions up front.</div>}
                {canManage && <button onClick={() => setSettingUpIntake(true)} style={{ padding: "7px 14px", background: C.cy, color: C.bg, border: "none", borderRadius: 4, fontFamily: M, fontSize: 10.5, letterSpacing: 1, fontWeight: 700, textTransform: "uppercase", cursor: "pointer" }}>+ Set up intake form</button>}
              </div>
            )}
          </div>
        )}
      </Card>
    );

    return (
      <div style={{ fontFamily: F }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 6 }}>
          <div onClick={() => setSelKey(null)} style={{ cursor: "pointer", fontSize: 11, color: C.cy, fontFamily: M }}>← All workflows</div>
          <Toggle on={guided} onChange={setGuided} label="Show guidance" />
        </div>
        <div style={{ fontSize: 20, fontFamily: SR, color: C.t1, marginBottom: 2 }}>{sel.name}</div>
        <div style={{ fontSize: 10.5, fontFamily: M, color: C.t3, marginBottom: 14 }}>Pipeline · v{sel.version} · {(sel.steps || []).length} step{(sel.steps || []).length === 1 ? "" : "s"}{bt ? ` · intake: ${bt.name}` : " · no intake form"}</div>

        {/* Ladder first (the substance), optional intake form below. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {GovernanceSection}
          {IntakeCard}
        </div>
      </div>
    );
  }

  // ── List of workflows ─────────────────────────────────────────────
  return (
    <div style={{ fontFamily: F }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 6 }}>
        <div>
          <div style={{ fontSize: 10, fontFamily: M, letterSpacing: 2, color: C.cy, textTransform: "uppercase" }}>Operations · Legal · Configuration</div>
          <div style={{ fontSize: 22, fontFamily: SR, color: C.t1 }}>Workflows</div>
        </div>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <Toggle on={guided} onChange={setGuided} label="Guided setup" />
          {canManage && <button onClick={() => setCreating(true)} style={{ padding: "7px 14px", background: C.cy, color: C.bg, border: "none", borderRadius: 4, fontFamily: M, fontSize: 10.5, letterSpacing: 1, fontWeight: 700, textTransform: "uppercase", cursor: "pointer" }}>+ New workflow</button>}
        </div>
      </div>
      <div style={{ fontSize: 11, color: C.t3, marginBottom: 16, maxWidth: 620, lineHeight: 1.5 }}>
        Each workflow is a request pipeline: the <b>intake form</b> a requester fills and the <b>governance steps</b> it runs through. Everything is edited from one place — pick a workflow to see it end to end.
      </div>

      {defs.length === 0 ? (
        <div style={{ padding: 28, textAlign: "center", background: C.cd, border: `1px dashed ${C.br}`, borderRadius: 6 }}>
          <div style={{ fontSize: 13, fontFamily: SR, color: C.t1, marginBottom: 6 }}>No workflows yet</div>
          <div style={{ fontSize: 11, color: C.t3 }}>Seed the governance library from the Agents / admin tools, or create one with <b>+ New workflow</b>.</div>
        </div>
      ) : defs.map((d) => {
        const dbts = boundTypes(d.key);
        const bt = dbts[0];
        const la = firstLadderAgent(d);
        return (
          <div key={d.key} onClick={() => openWorkflow(d.key)} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 14px", background: C.cd, border: `1px solid ${C.br}`, borderRadius: 6, marginBottom: 8, cursor: "pointer" }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = C.cy)} onMouseLeave={(e) => (e.currentTarget.style.borderColor = C.br)}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, color: C.t1, fontWeight: 600 }}>{d.name}</div>
              <div style={{ fontSize: 10, fontFamily: M, color: C.t3, marginTop: 3 }}>
                {bt ? <span style={{ color: C.cy }}>◈ {bt.name}{dbts.length > 1 ? ` +${dbts.length - 1}` : ""}{typeof bt.fields?.length === "number" ? ` · ${bt.fields.length} field${bt.fields.length === 1 ? "" : "s"}` : ""}</span> : <span style={{ color: C.t4 }}>◈ no intake form</span>}
                <span style={{ color: C.t4 }}> · {(d.steps || []).length} step{(d.steps || []).length === 1 ? "" : "s"}</span>
                {la ? <span style={{ color: C.pp }}> · ⚙ {agentName(la)}</span> : null}
              </div>
            </div>
            <div style={{ fontSize: 9, fontFamily: M, color: C.t4, letterSpacing: 1 }}>v{d.version}</div>
            <div style={{ color: C.cy, fontSize: 16 }}>›</div>
          </div>
        );
      })}
    </div>
  );
}
