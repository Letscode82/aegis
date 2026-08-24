/**
 * AutoPilotPanel (CAP-5) — the single-prompt agentic orchestrator surface.
 *
 * Type a directive, run the AutoPilot: it plans a pipeline of tools (cull →
 * review → assessment → case graph → assemble) and executes the read steps
 * itself, PAUSING at each mutating step for your approval. Every step shows its
 * status; a gated step shows Approve / Reject. The assembled case brief renders
 * when the run finishes. Governance is enforced server-side — the buttons just
 * surface the gate.
 */
import React, { useCallback, useEffect, useState } from "react";
import { C, F, M, SR } from "@aegis/ui";

interface StepDTO {
  id: string;
  ordinal: number;
  tool: string;
  title: string;
  blurb: string;
  kind: string;
  status: string;
  output: unknown;
  agentDecisionId: string | null;
  error: string | null;
  finishedAt: string | null;
}
interface RunDTO {
  id: string;
  reviewSetId: string;
  directive: string;
  status: string;
  summary: string | null;
  degraded: boolean;
  createdAt: string;
  steps: StepDTO[];
}

export interface AutoPilotPanelProps {
  apiBase: string;
  reviewSetId: string;
  canMutate?: boolean;
}

const STATUS_STYLE: Record<string, { color: string; icon: string; label: string }> = {
  PENDING: { color: C.t4, icon: "○", label: "Queued" },
  RUNNING: { color: C.bl, icon: "◐", label: "Running…" },
  WAITING_APPROVAL: { color: C.am, icon: "⏳", label: "Needs approval" },
  DONE: { color: C.gn, icon: "✓", label: "Done" },
  SKIPPED: { color: C.t4, icon: "⤼", label: "Skipped" },
  FAILED: { color: C.rd, icon: "✕", label: "Failed" },
};

const SAMPLE_DIRECTIVE =
  "Work up this collection: who disclosed confidential material, when, and to whom; flag privilege; build the timeline and a theory of the case.";

export const AutoPilotPanel: React.FC<AutoPilotPanelProps> = ({ apiBase, reviewSetId, canMutate = true }) => {
  const [run, setRun] = useState<RunDTO | null>(null);
  const [directive, setDirective] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${apiBase}/${reviewSetId}/autopilot`);
      const d = await r.json();
      if (d.ok) setRun(d.run);
    } catch {
      /* ignore */
    } finally {
      setLoaded(true);
    }
  }, [apiBase, reviewSetId]);

  useEffect(() => {
    load();
  }, [load]);

  const start = useCallback(async () => {
    const text = directive.trim();
    if (!text || busy) return;
    setBusy(true);
    setErr("");
    try {
      const r = await fetch(`${apiBase}/${reviewSetId}/autopilot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ directive: text }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setRun(d.run);
    } catch (e) {
      setErr(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  }, [apiBase, reviewSetId, directive, busy]);

  const act = useCallback(
    async (stepId: string, action: "approve" | "reject") => {
      if (busy) return;
      setBusy(true);
      setErr("");
      try {
        const r = await fetch(`${apiBase}/${reviewSetId}/autopilot/step`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stepId, action }),
        });
        const d = await r.json();
        if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
        setRun(d.run);
      } catch (e) {
        setErr(String((e as Error).message || e));
      } finally {
        setBusy(false);
      }
    },
    [apiBase, reviewSetId, busy],
  );

  const showStarter = !run || run.status === "DONE";

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "20px 22px", minHeight: 0 }}>
      <div style={{ maxWidth: 820, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Intro / directive box */}
        {showStarter && (
          <div style={{ border: `1px solid ${C.br}`, borderRadius: 12, padding: "16px 18px", background: C.cd }}>
            <div style={{ fontFamily: SR, fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
              {run ? "Run AutoPilot again" : "Case AutoPilot"}
            </div>
            <div style={{ fontSize: 12.5, color: C.t3, marginBottom: 12 }}>
              One directive. The AutoPilot plans the workup, runs the read steps itself, and pauses at each
              evidence-touching step for your approval — then assembles the findings.
            </div>
            <textarea
              value={directive}
              onChange={(e) => setDirective(e.target.value)}
              rows={3}
              placeholder={SAMPLE_DIRECTIVE}
              style={{
                width: "100%",
                boxSizing: "border-box",
                resize: "vertical",
                background: C.bg,
                border: `1px solid ${C.br}`,
                borderRadius: 10,
                color: C.t1,
                fontFamily: F,
                fontSize: 13,
                padding: "11px 13px",
                outline: "none",
              }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
              <button
                onClick={start}
                disabled={busy || !directive.trim()}
                style={{
                  padding: "9px 16px",
                  background: directive.trim() ? C.pp : C.br,
                  color: directive.trim() ? C.bg : C.t3,
                  border: "none",
                  borderRadius: 9,
                  fontFamily: F,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: directive.trim() ? "pointer" : "not-allowed",
                }}
              >
                {busy ? "Planning…" : "▶ Run AutoPilot"}
              </button>
              <button
                type="button"
                onClick={() => setDirective(SAMPLE_DIRECTIVE)}
                style={{ padding: "9px 13px", background: "transparent", color: C.cy, border: `1px solid ${C.cy}`, borderRadius: 9, fontFamily: F, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
              >
                Insert sample directive
              </button>
            </div>
            {err && <div style={{ fontSize: 12, color: C.rd, marginTop: 10 }}>{err}</div>}
          </div>
        )}

        {!loaded && <div style={{ fontSize: 12.5, color: C.t4, fontFamily: M }}>Loading…</div>}

        {run && (
          <>
            {!showStarter && err && <div style={{ fontSize: 12, color: C.rd }}>{err}</div>}
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontFamily: M, fontSize: 10, letterSpacing: 1, color: C.pp, textTransform: "uppercase" }}>
                AutoPilot run · {run.status.replace(/_/g, " ").toLowerCase()}
              </div>
              <div style={{ fontSize: 11, color: C.t4, fontFamily: M }}>{new Date(run.createdAt).toLocaleString()}</div>
            </div>
            <div style={{ fontSize: 13, color: C.t2, fontStyle: "italic", borderLeft: `2px solid ${C.br}`, paddingLeft: 10 }}>
              “{run.directive}”
            </div>

            {/* Steps */}
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {run.steps.map((s, i) => (
                <StepRow
                  key={s.id}
                  step={s}
                  last={i === run.steps.length - 1}
                  canMutate={canMutate}
                  busy={busy}
                  onAct={act}
                />
              ))}
            </div>

            {/* Assembled findings */}
            {run.summary && (
              <div style={{ border: `1px solid ${C.pp}44`, borderRadius: 12, padding: "16px 18px", background: `${C.pp}0d` }}>
                <div style={{ fontFamily: M, fontSize: 10, letterSpacing: 1, color: C.pp, textTransform: "uppercase", marginBottom: 8 }}>
                  Assembled findings{run.degraded ? " · deterministic (no model key)" : ""}
                </div>
                <pre style={{ whiteSpace: "pre-wrap", fontFamily: M, fontSize: 12.5, lineHeight: 1.6, color: C.t1, margin: 0 }}>
                  {run.summary}
                </pre>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

const StepRow: React.FC<{
  step: StepDTO;
  last: boolean;
  canMutate: boolean;
  busy: boolean;
  onAct: (stepId: string, action: "approve" | "reject") => void;
}> = ({ step, last, canMutate, busy, onAct }) => {
  const st = STATUS_STYLE[step.status] ?? STATUS_STYLE.PENDING!;
  const gated = step.status === "WAITING_APPROVAL";
  return (
    <div style={{ display: "grid", gridTemplateColumns: "28px 1fr", gap: 12 }}>
      {/* Rail */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: "50%",
            border: `2px solid ${st.color}`,
            color: st.color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: M,
            fontSize: 13,
            fontWeight: 700,
            flex: "none",
          }}
        >
          {st.icon}
        </div>
        {!last && <div style={{ flex: 1, width: 2, minHeight: 18, background: C.br, marginTop: 2 }} />}
      </div>
      {/* Body */}
      <div style={{ paddingBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: C.t1 }}>{step.title}</span>
          {step.kind === "mutating" && (
            <span style={{ fontSize: 9, fontFamily: M, letterSpacing: 0.5, color: C.am, border: `1px solid ${C.am}`, borderRadius: 4, padding: "1px 5px", textTransform: "uppercase" }}>
              Gated
            </span>
          )}
          <span style={{ fontSize: 10.5, fontFamily: M, color: st.color }}>{st.label}</span>
        </div>
        <div style={{ fontSize: 11.5, color: C.t3, marginTop: 2 }}>{step.blurb}</div>

        {gated && (
          <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 11.5, color: C.am }}>
              This step mutates evidence — approve to execute (chain-sealed), or skip it.
            </span>
            <button
              disabled={busy || !canMutate}
              onClick={() => onAct(step.id, "approve")}
              style={{ padding: "5px 12px", background: canMutate ? C.gn : C.br, color: canMutate ? C.bg : C.t3, border: "none", borderRadius: 7, fontFamily: F, fontSize: 11.5, fontWeight: 700, cursor: canMutate && !busy ? "pointer" : "not-allowed" }}
            >
              Approve
            </button>
            <button
              disabled={busy || !canMutate}
              onClick={() => onAct(step.id, "reject")}
              style={{ padding: "5px 12px", background: "transparent", color: C.t2, border: `1px solid ${C.br}`, borderRadius: 7, fontFamily: F, fontSize: 11.5, fontWeight: 600, cursor: canMutate && !busy ? "pointer" : "not-allowed" }}
            >
              Skip
            </button>
          </div>
        )}

        {step.error && <div style={{ fontSize: 11.5, color: C.rd, marginTop: 6 }}>{step.error}</div>}
        {step.status === "DONE" && step.tool !== "assemble" && <StepOutput tool={step.tool} output={step.output} />}
      </div>
    </div>
  );
};

const StepOutput: React.FC<{ tool: string; output: unknown }> = ({ tool, output }) => {
  if (!output || typeof output !== "object") return null;
  const o = output as Record<string, unknown>;
  let text = "";
  if (tool === "cull") {
    text = `Suppressed ${num(o.threadSuppressed)} thread member(s) + ${num(o.nearDuplicate)} near-duplicate(s).`;
  } else if (tool === "ai_review") {
    const routes = (o.routes as Record<string, unknown>) ?? {};
    text = `Scored ${num(o.scored)} · ${num(routes.attorney)} attorney · ${num(routes.reviewer)} reviewer · ${num(routes.autoCull)} auto-cull.`;
  } else if (tool === "eca") {
    const stages = (o.stages as Array<{ label: string; count: number }>) ?? [];
    text = stages.map((s) => `${s.label}: ${s.count}`).join(" · ");
  } else if (tool === "case_graph") {
    text = `${num(o.responsiveCount)} responsive · ${num(o.clusters)} issue cluster(s) · ${num(o.timeline)} timeline fact(s) · ${num(o.entities)} entities.`;
  }
  if (!text) return null;
  return <div style={{ fontSize: 11.5, color: C.t2, marginTop: 6, fontFamily: M }}>{text}</div>;
};

function num(v: unknown): number {
  return typeof v === "number" ? v : 0;
}
