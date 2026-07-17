import { useState } from "react";
import { C, F, M, SR } from "@aegis/ui";
import { RequestTypesTab } from "./request-types-admin.jsx";
import { WorkflowDesignerTab } from "./workflow-designer.jsx";

// ── Request Pipelines — one surface for the whole intake pipeline ─────
//
// Consolidates the former "Request Types" and "Workflow Designer" tabs.
// A *request pipeline* is a Request Type — what a requester picks, plus
// the intake fields they fill and its display stages — bound to a
// Governance Ladder — the ordered approval / agent steps it runs
// through. The two are linked by the type's `workflowKey`, so an admin
// should define both halves in one place instead of hopping between
// tabs. This wrapper reuses the two existing (tested) editors verbatim;
// it only frames them as the two halves of one concept and gives them a
// single home in the nav.

const SECTIONS = [
  { id: "types", label: "Request Types & Fields", icon: "❏", hint: "What a requester picks + the intake fields they fill" },
  { id: "ladders", label: "Governance Ladders", icon: "⛓", hint: "The approval / agent steps a type runs through" },
];

export function RequestPipelinesTab({ canManage }) {
  const [section, setSection] = useState("types");
  const active = SECTIONS.find((s) => s.id === section) || SECTIONS[0];

  return (
    <div style={{ fontFamily: F }}>
      {/* Framing — the pipeline mental model in one line. */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "11px 14px", background: C.cd, border: `1px solid ${C.br}`, borderRadius: 6, marginBottom: 12 }}>
        <span style={{ fontSize: 10, fontFamily: M, letterSpacing: 1.4, textTransform: "uppercase", color: C.cy, fontWeight: 600 }}>Request pipeline</span>
        <span style={{ fontSize: 12, color: C.t2 }}>
          <span style={{ color: C.t1 }}>Request Type</span> <span style={{ color: C.t4 }}>(intake fields + stages)</span>
          <span style={{ color: C.t4, margin: "0 8px", fontFamily: M }}>——bound via ladder key——▶</span>
          <span style={{ color: C.t1 }}>Governance Ladder</span> <span style={{ color: C.t4 }}>(approval / agent steps)</span>
        </span>
      </div>

      {/* Segmented control — the two halves of the pipeline. */}
      <div style={{ display: "flex", gap: 2, marginBottom: 6, borderBottom: `1px solid ${C.br}` }}>
        {SECTIONS.map((s) => {
          const on = s.id === section;
          return (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              aria-current={on ? "true" : undefined}
              style={{ padding: "8px 14px", background: "transparent", border: "none", borderBottom: `2px solid ${on ? C.cy : "transparent"}`, marginBottom: -1, cursor: "pointer", fontFamily: M, fontSize: 10.5, letterSpacing: 1.2, textTransform: "uppercase", color: on ? C.cy : C.t3, fontWeight: on ? 600 : 400, display: "flex", alignItems: "center", gap: 6 }}
              onMouseEnter={(e) => { if (!on) e.currentTarget.style.color = C.t1; }}
              onMouseLeave={(e) => { if (!on) e.currentTarget.style.color = C.t3; }}
            >
              <span style={{ fontSize: 12 }}>{s.icon}</span>{s.label}
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 10.5, color: C.t4, fontFamily: M, marginBottom: 14 }}>{active.hint}</div>

      {section === "types" ? <RequestTypesTab canManage={canManage} /> : <WorkflowDesignerTab canManage={canManage} />}
    </div>
  );
}
