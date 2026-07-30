import { useState, useEffect, useCallback } from "react";
import { C, F, M } from "@aegis/ui";

// ── Live contract approval ladder (CTR-8) ────────────────────────────
//
// Replaces the old "approve it *there*" prose pointer with the real
// governance ladder, driven by the shared @aegis/workflow engine. Reads
// GET /api/contracts/[id]/approval; acting posts to .../approval/act.
// When the final step is approved the server auto-advances the contract to
// APPROVED — this panel just reflects it and refreshes the workspace.

const ROLE_LABEL = { requester: "Requester", attorney: "Attorney", legal_ops: "Legal Ops", gc: "General Counsel", paralegal: "Paralegal" };
const RAG_COLOR = { GREEN: C.gn, AMBER: C.am, RED: C.rd };
const BAND_COLOR = { LOW: C.gn, MEDIUM: C.am, HIGH: C.rd, UNSCORED: C.t4 };
const ACTION_LABEL = { approve: "Approve", "review-deviations": "Review deviations", escalate: "Escalate", "review-manually": "Review manually" };

// Advisory AI Risk Review output rendered beneath its ladder rung. Findings
// never gate the ladder — they inform the human reviewer.
function FindingsBlock({ f }) {
  const band = f.band || "UNSCORED";
  const bandColor = BAND_COLOR[band] || C.t4;
  const escalated = f.status === "ESCALATED";
  const failed = f.status === "FAILED";
  const pendingish = f.status === "PENDING" || f.status === "RUNNING";
  return (
    <div style={{ marginTop: 6, padding: "7px 9px", borderRadius: 6, background: C.bg, border: `1px solid ${C.br}` }}>
      {failed ? (
        <div style={{ fontSize: 9.5, fontFamily: M, color: C.rd }}>⚠ AI risk read failed — a reviewer should assess manually.</div>
      ) : pendingish ? (
        <div style={{ fontSize: 9.5, fontFamily: M, color: C.t4 }}>◎ AI risk read {f.status === "RUNNING" ? "running…" : "queued…"}</div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            <span style={{ fontSize: 8.5, fontFamily: M, fontWeight: 700, letterSpacing: .4, color: bandColor, border: `1px solid ${bandColor}`, borderRadius: 3, padding: "1px 6px", textTransform: "uppercase" }}>
              {band}{typeof f.score === "number" ? ` · ${f.score}/100` : ""}
            </span>
            {f.suggestedAction && <span style={{ fontSize: 9, fontFamily: M, color: C.t2 }}>Suggests: <b style={{ color: C.t1 }}>{ACTION_LABEL[f.suggestedAction] || f.suggestedAction}</b></span>}
            <span style={{ fontSize: 8.5, fontFamily: M, color: escalated ? C.am : C.gn, letterSpacing: .3 }}>
              {escalated ? "↑ escalated — look closely" : "✓ cleared confidence bar"}
            </span>
          </div>
          {f.summary && <div style={{ fontSize: 9.5, fontFamily: F, color: C.t3, marginTop: 4, lineHeight: 1.4 }}>{f.summary}</div>}
          {f.drivers && f.drivers.length > 0 && (
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 5 }}>
              {f.drivers.slice(0, 5).map((d, i) => (
                <span key={i} title={`weight ${d.points}`} style={{ fontSize: 8.5, fontFamily: M, color: BAND_COLOR[d.risk] || C.t3, border: `1px solid ${C.br}`, borderRadius: 3, padding: "1px 5px" }}>
                  {d.type}{d.deviation ? " ⚠" : ""}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const actBtn = (color, disabled) => ({
  padding: "6px 12px", background: disabled ? C.cd : color, color: disabled ? C.t4 : C.bg,
  border: `1px solid ${disabled ? C.br : color}`, borderRadius: 5, fontFamily: M, fontSize: 10,
  letterSpacing: .6, fontWeight: 700, textTransform: "uppercase", cursor: disabled ? "not-allowed" : "pointer",
});

export function ApprovalLadderPanel({ contractId, contractStatus, onChanged }) {
  const [state, setState] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(null);
  const [canApprove, setCanApprove] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/contracts/${contractId}/approval`)
      .then((r) => (r.ok ? r.json() : r.json().then((d) => Promise.reject(d.error || `HTTP ${r.status}`))))
      .then((d) => setState(d.state))
      .catch((e) => setErr(String(e)));
  }, [contractId]);

  useEffect(() => { load(); }, [load, contractStatus]);
  useEffect(() => {
    fetch("/api/auth/current-user")
      .then((r) => r.json())
      .then((d) => setCanApprove((d?.user?.permissions || []).includes("contracts:approve")))
      .catch(() => {});
  }, []);

  const act = async (action) => {
    setBusy(action);
    setErr(null);
    try {
      const r = await fetch(`/api/contracts/${contractId}/approval/act`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setState(d.state);
      onChanged?.();
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy(null);
    }
  };

  const runAgent = async () => {
    setBusy("run-agent");
    setErr(null);
    try {
      const r = await fetch(`/api/contracts/${contractId}/approval/run-agent`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setState(d.state);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy(null);
    }
  };

  if (err && !state) return <div style={{ fontSize: 10, fontFamily: M, color: C.rd }}>⚠ {err}</div>;
  if (!state) return <div style={{ fontSize: 10, fontFamily: M, color: C.t4 }}>◎ Loading approval ladder…</div>;

  // Legacy / manual IN_REVIEW with no ladder started — keep a light pointer.
  if (!state.hasLadder) {
    return (
      <div style={{ fontSize: 9.5, fontFamily: M, color: C.t4, marginTop: 8, lineHeight: 1.5 }}>
        In approval — no governance ladder is running for this contract. Advance it manually, or start the guided ladder.
      </div>
    );
  }

  const complete = state.ladderStatus === "COMPLETED";
  const cancelled = state.ladderStatus === "CANCELLED";
  const statusColor = complete ? C.gn : cancelled ? C.rd : C.cy;

  return (
    <div style={{ marginTop: 12, border: `1px solid ${C.br}`, borderRadius: 8, background: C.cd, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: `1px solid ${C.br}`, background: C.s1 }}>
        <span style={{ fontSize: 10, fontFamily: M, letterSpacing: 1.2, color: C.t3, textTransform: "uppercase", fontWeight: 600 }}>Contract Approval Ladder</span>
        <span style={{ fontSize: 9, fontFamily: M, letterSpacing: .5, padding: "2px 8px", borderRadius: 4, color: statusColor, border: `1px solid ${statusColor}`, textTransform: "uppercase" }}>
          {complete ? "Complete" : cancelled ? "Cancelled" : "In progress"}
        </span>
      </div>

      <div style={{ padding: "8px 14px" }}>
        {state.steps.map((s, i) => {
          const done = s.state === "done";
          const cur = s.state === "current";
          const color = done ? C.gn : cur ? C.cy : C.t4;
          return (
            <div key={s.stepOrder} style={{ display: "flex", gap: 10, padding: "7px 0", borderBottom: i < state.steps.length - 1 ? `1px solid ${C.br}33` : "none" }}>
              <div style={{ width: 20, height: 20, flexShrink: 0, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontFamily: M, fontWeight: 700, color: done || cur ? C.bg : C.t3, background: done || cur ? color : "transparent", border: `1px solid ${done || cur ? color : C.br}` }}>
                {done ? "✓" : s.stepOrder}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, fontFamily: F, color: cur ? C.t1 : done ? C.t2 : C.t3, fontWeight: cur ? 600 : 400 }}>{s.name}</span>
                  {s.kind === "AGENT" && <span style={{ fontSize: 8.5, fontFamily: M, color: C.pu || C.bl, border: `1px solid ${C.pu || C.bl}`, borderRadius: 3, padding: "1px 5px", letterSpacing: .3 }}>🤖 AI · advisory</span>}
                  {cur && s.rag && <span style={{ width: 7, height: 7, borderRadius: "50%", background: RAG_COLOR[s.rag] }} title={`SLA ${s.rag}`} />}
                </div>
                <div style={{ fontSize: 9, fontFamily: M, color: C.t4, marginTop: 2 }}>
                  {ROLE_LABEL[s.approverRole] || s.approverRole || "—"}{s.slaHours ? ` · ${s.slaHours}h SLA` : ""}{cur ? " · awaiting decision" : ""}
                </div>
                {s.kind === "AGENT" && s.findings && <FindingsBlock f={s.findings} />}
              </div>
            </div>
          );
        })}
      </div>

      {state.ladderStatus === "IN_PROGRESS" && state.currentStep && (
        <div style={{ padding: "10px 14px", borderTop: `1px solid ${C.br}`, background: C.s1 }}>
          {state.currentStep.kind === "AGENT" && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 9.5, fontFamily: M, color: C.t4, lineHeight: 1.4 }}>
                AI Risk Review output is advisory — a reviewer approves to advance. Conservative-AI governance: no step is gated by an AI actor.
              </div>
              {canApprove && (
                <button disabled={!!busy} onClick={runAgent} style={{ ...actBtn(C.bl || C.cy, !!busy), marginTop: 7 }}>
                  {busy === "run-agent" ? "…" : state.currentStep.findings ? "↻ Re-run AI review" : "🤖 Run AI review"}
                </button>
              )}
            </div>
          )}
          {canApprove ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button disabled={!!busy} onClick={() => act("approve")} style={actBtn(C.gn, !!busy)}>{busy === "approve" ? "…" : "✓ Approve step"}</button>
              <button disabled={!!busy} onClick={() => act("send_back")} style={actBtn(C.am, !!busy)}>↩ Send back</button>
              <button disabled={!!busy} onClick={() => act("reject")} style={actBtn(C.rd, !!busy)}>✕ Reject</button>
            </div>
          ) : (
            <div style={{ fontSize: 9.5, fontFamily: M, color: C.t4 }}>You don't have approval permission for this ladder.</div>
          )}
          {err && <div style={{ fontSize: 9.5, fontFamily: M, color: C.rd, marginTop: 6 }}>⚠ {err}</div>}
        </div>
      )}

      {complete && (
        <div style={{ padding: "10px 14px", borderTop: `1px solid ${C.br}`, fontSize: 10, fontFamily: M, color: C.gn }}>
          ✓ Ladder complete — the contract advanced to <b>Approved</b>. Chain-sealed.
        </div>
      )}
      {cancelled && (
        <div style={{ padding: "10px 14px", borderTop: `1px solid ${C.br}`, fontSize: 10, fontFamily: M, color: C.rd }}>
          ✕ Ladder rejected — the contract reopened to <b>In negotiation</b> for changes.
        </div>
      )}
    </div>
  );
}
