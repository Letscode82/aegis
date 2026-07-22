import { C, M, SR } from "@aegis/ui";

// ── Adaptive Cockpit step panel (PR-C) ───────────────────────────────
//
// When a governance ladder is running on the current ticket, the Cockpit
// stops being one fixed layout and instead LEADS with whatever the
// ladder's current step actually needs. The step's `screenKey` (+ kind)
// decides the mode:
//
//   • agent   — an AGENT step: the agent has already run; the human
//               reviews its recommendation + deliverable, then approves.
//   • approve — a human review/sign-off gate: surface the deliverable
//               produced by the previous stage and the approve controls.
//   • work    — a deep-work step (intake / draft / upload): the human
//               does the work in the Work panel below.
//
// This component is the single primary-action surface while a ladder
// runs: it renders the step's mode banner, the prior-stage deliverable
// (download link to the .docx), and the ladder act buttons — so the
// WorkflowLadderCard below can drop its own duplicate action row.

// Map a step's screenKey → mode. AGENT steps are always "agent".
// Human steps default to "approve" (most ladder gates are sign-offs);
// intake/draft/upload-style screens are "work".
export function stepModeFor(step) {
  if (!step) return "none";
  if (step.kind === "AGENT") return "agent";
  const k = (step.screenKey || "").toLowerCase();
  if (/intake|draft|upload|submit|docket|compose|prepare/.test(k)) return "work";
  return "approve";
}

const MODE = {
  agent: { icon: "🤖", label: "Agent output — review & approve", color: C.pp,
    hint: "The agent has completed its pass. Review its recommendation and deliverable, then approve to advance the ladder — or send it back." },
  approve: { icon: "✋", label: "Your approval needed", color: C.am,
    hint: "Review the deliverable from the previous stage, then approve to advance — or send it back for rework." },
  work: { icon: "🛠", label: "Deep work", color: C.cy,
    hint: "This step needs hands-on work. Use the Work panel below to draft / attach the deliverable, then approve to advance." },
  none: { icon: "", label: "", color: C.br, hint: "" },
};

export function CockpitStepPanel({ ticket, instance, busy, sendBackTo, onSendBackToChange, onAct }) {
  if (!instance) return null;
  const steps = instance.definition?.steps || [];
  const total = steps.length;
  const step = steps.find((s) => s.stepOrder === instance.currentStepOrder) || null;
  const done = instance.status !== "IN_PROGRESS";
  const mode = done ? "none" : stepModeFor(step);
  const m = MODE[mode] || MODE.none;
  const rag = instance.rag || [];
  const previousSteps = rag.filter((r) => r.stepOrder < instance.currentStepOrder && r.color !== "skipped");
  // The .docx deliverable exists whenever an agent produced a rec on this
  // ticket — that's the artifact an approval step is signing off on.
  const hasDeliverable = !!ticket?.agentRecommendation;
  const rec = ticket?.agentRecommendation;

  if (done) {
    return (
      <div style={{ padding: "12px 14px", marginBottom: 12, background: instance.status === "COMPLETED" ? C.gnG : C.s1,
        border: `1px solid ${instance.status === "COMPLETED" ? C.gn : C.br}`, borderLeft: `3px solid ${instance.status === "COMPLETED" ? C.gn : C.t3}`, borderRadius: 6 }}>
        <div style={{ fontSize: 10, fontFamily: M, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 600, color: instance.status === "COMPLETED" ? C.gn : C.t3 }}>
          {instance.status === "COMPLETED" ? "✓ Ladder complete" : `Ladder ${instance.status.toLowerCase()}`}
        </div>
        <div style={{ fontSize: 11.5, color: C.t2, marginTop: 3 }}>{instance.definition?.name || "Governance ladder"} — all steps resolved.</div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 12, background: C.cd, border: `1px solid ${m.color}55`, borderLeft: `3px solid ${m.color}`, borderRadius: 6, overflow: "hidden" }}>
      {/* Mode banner */}
      <div style={{ padding: "11px 14px", background: `${m.color}14` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ fontSize: 16 }}>{m.icon}</span>
            <div>
              <div style={{ fontSize: 10.5, fontFamily: M, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700, color: m.color }}>{m.label}</div>
              <div style={{ fontSize: 12.5, color: C.t1, fontFamily: SR, marginTop: 1 }}>
                Step {instance.currentStepOrder} of {total} · {step?.name || "—"}
              </div>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 8.5, fontFamily: M, color: C.t3, letterSpacing: 1.2, textTransform: "uppercase" }}>{instance.definition?.name || "Ladder"}</div>
            {step?.approverRole && <div style={{ fontSize: 9.5, fontFamily: M, color: C.t2, marginTop: 2 }}>role: {step.approverRole}</div>}
          </div>
        </div>
        <div style={{ fontSize: 11, color: C.t2, lineHeight: 1.5, marginTop: 8 }}>{m.hint}</div>
      </div>

      {/* Prior-stage deliverable (what an approval / agent step is signing off) */}
      {(mode === "approve" || mode === "agent") && (
        <div style={{ padding: "10px 14px", borderTop: `1px solid ${C.br}` }}>
          <div style={{ fontSize: 9, fontFamily: M, color: C.t3, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 600, marginBottom: 6 }}>Deliverable to review</div>
          {hasDeliverable ? (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11.5, color: C.t1, fontWeight: 500 }}>
                  {rec.suggestedAction ? rec.suggestedAction.replace(/-/g, " ") : "Prepared output"}
                  {typeof rec.confidence === "number" && <span style={{ color: C.t3, fontFamily: M, fontSize: 10, marginLeft: 8 }}>conf {Math.round(rec.confidence * 100)}%</span>}
                </div>
                {rec.reasoning && <div style={{ fontSize: 10.5, color: C.t3, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 340 }}>{rec.reasoning}</div>}
              </div>
              <a href={`/api/intake/tickets/${encodeURIComponent(ticket.id)}/deliverable`} target="_blank" rel="noreferrer"
                style={{ padding: "6px 12px", border: `1px solid ${C.tl}`, color: C.tl, borderRadius: 3, fontSize: 9.5, fontFamily: M, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap" }}>
                📄 Download .docx
              </a>
            </div>
          ) : mode === "agent" ? (
            <div style={{ fontSize: 11, color: C.pp, fontFamily: M, display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: C.pp, animation: "pulse 1.1s ease-in-out infinite" }} />
              Agent is running its pass — its recommendation will appear here. Refresh in a moment if it doesn&apos;t.
            </div>
          ) : (
            <div style={{ fontSize: 11, color: C.t3 }}>No agent deliverable on this ticket yet — this is a manual review.</div>
          )}
        </div>
      )}

      {/* Ladder act buttons — the single primary-action surface while a ladder runs */}
      <div style={{ padding: "10px 14px", borderTop: `1px solid ${C.br}`, display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
        <div onClick={busy ? undefined : () => onAct("approve")} style={{ padding: "6px 13px", border: `1px solid ${C.gn}`, color: busy ? C.t3 : C.gn, borderRadius: 3, cursor: busy ? "default" : "pointer", fontSize: 9.5, fontFamily: M, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700, opacity: busy ? 0.5 : 1 }}>✓ Approve step</div>
        {previousSteps.length > 0 && (
          <>
            <select value={sendBackTo} onChange={(e) => onSendBackToChange(e.target.value)} style={{ background: C.s1, border: `1px solid ${C.br}`, color: C.t2, fontSize: 9.5, fontFamily: M, padding: "4px 6px", borderRadius: 3 }}>
              <option value="">send back to…</option>
              {previousSteps.map((s) => <option key={s.stepOrder} value={s.stepOrder}>{s.stepOrder}. {s.name}</option>)}
            </select>
            <div onClick={busy || !sendBackTo ? undefined : () => onAct("send_back", { targetStep: Number(sendBackTo) })} style={{ padding: "6px 11px", border: `1px solid ${C.am}`, color: busy || !sendBackTo ? C.t3 : C.am, borderRadius: 3, cursor: busy || !sendBackTo ? "default" : "pointer", fontSize: 9.5, fontFamily: M, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700, opacity: busy || !sendBackTo ? 0.5 : 1 }}>↩ Send back</div>
          </>
        )}
        <div onClick={busy ? undefined : () => onAct("reject")} style={{ padding: "6px 11px", border: `1px solid ${C.rd}`, color: busy ? C.t3 : C.rd, borderRadius: 3, cursor: busy ? "default" : "pointer", fontSize: 9.5, fontFamily: M, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700, opacity: busy ? 0.5 : 1 }}>✕ Reject</div>
        {busy && <span style={{ fontSize: 10, fontFamily: M, color: C.pp, letterSpacing: 0.5 }}>◎ Working — advancing the ladder{step?.kind === "AGENT" ? " · running the agent" : ""}…</span>}
      </div>
    </div>
  );
}
