import { useState, useEffect } from "react";
import { C, F, M, SR, Card, SH } from "@aegis/ui";

// ── Workflow SLA — "where is every matter stopped" (program #3) ──────
//
// Reads /api/workflows/sla-overview: every in-flight governance-ladder
// instance with the step it's stuck on + how long vs its SLA, plus
// delay-per-stage insights (which stages eat the time, human vs agent).
// Renders nothing when no workflows are running, so it stays invisible
// until ladders are in use.

function fmtH(h) {
  if (h == null) return "—";
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 48) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}

export function WorkflowSlaPanel() {
  const [ov, setOv] = useState(null);
  useEffect(() => {
    let live = true;
    fetch("/api/workflows/sla-overview")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (live && d?.ok) setOv(d.overview); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  if (!ov || (ov.instances.length === 0 && ov.stageDelays.length === 0)) return null;
  const { summary, instances, stageDelays } = ov;
  const maxStage = Math.max(1, ...stageDelays.map((s) => s.avgHours));

  return (
    <div style={{ marginTop: 18 }}>
      <SH icon="⛓" title="Governance workflow SLA" sub="Where every matter is stopped, and where the delay lives" c={C.pp} />

      {/* Summary strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 12 }}>
        {[
          ["In flight", summary.inProgress, C.t1],
          ["SLA breached", summary.breached, summary.breached ? C.rd : C.gn],
          ["Avg human stage", fmtH(summary.humanAvgHours), C.am],
          ["Avg agent stage", fmtH(summary.agentAvgHours), C.pp],
        ].map(([label, val, col]) => (
          <Card key={label} style={{ padding: "10px 12px" }}>
            <div style={{ fontSize: 9, fontFamily: M, color: C.t3, letterSpacing: 1.2, textTransform: "uppercase" }}>{label}</div>
            <div style={{ fontSize: 20, fontFamily: SR, color: col, marginTop: 2 }}>{val}</div>
          </Card>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 12 }}>
        {/* Stuck instances */}
        <Card>
          <div style={{ fontSize: 10, fontFamily: M, color: C.t2, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Stopped here now</div>
          {instances.length === 0 && <div style={{ fontSize: 11, color: C.t4, fontFamily: M }}>Nothing pending in a workflow. 🎉</div>}
          {instances.map((i) => (
            <div key={i.instanceId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: `1px solid ${C.br}` }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: i.breached ? C.rd : C.am, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: C.t1 }}>
                  <span style={{ color: C.t3, fontFamily: M }}>{i.entityId}</span> · {i.definitionName}
                </div>
                <div style={{ fontSize: 9.5, fontFamily: M, color: C.t3 }}>
                  {i.currentStepKind === "AGENT" ? "⚙ " : ""}step {i.currentStepOrder} · {i.currentStepName}{i.currentStepRole ? ` · ${i.currentStepRole}` : ""}
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 11, fontFamily: M, color: i.breached ? C.rd : C.t2, fontWeight: 600 }}>{fmtH(i.hoursOnStep)}{i.breached ? " ⚠" : ""}</div>
                <div style={{ fontSize: 9, fontFamily: M, color: C.t4 }}>{i.slaHours ? `SLA ${i.slaHours}h` : "no SLA"} · open {fmtH(i.totalHoursOpen)}</div>
              </div>
            </div>
          ))}
        </Card>

        {/* Delay per stage */}
        <Card>
          <div style={{ fontSize: 10, fontFamily: M, color: C.t2, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Avg time pending per stage</div>
          {stageDelays.length === 0 && <div style={{ fontSize: 11, color: C.t4, fontFamily: M }}>No completed stages yet.</div>}
          {stageDelays.map((s) => (
            <div key={s.stepName} style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontFamily: M, color: C.t2, marginBottom: 2 }}>
                <span>{s.kind === "AGENT" ? "⚙ " : ""}{s.stepName}</span>
                <span style={{ color: s.kind === "AGENT" ? C.pp : C.am }}>{fmtH(s.avgHours)}</span>
              </div>
              <div style={{ height: 5, background: C.s2, borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${Math.round((s.avgHours / maxStage) * 100)}%`, height: "100%", background: s.kind === "AGENT" ? C.pp : C.am }} />
              </div>
            </div>
          ))}
          {summary.humanAvgHours > summary.agentAvgHours * 2 && (
            <div style={{ fontSize: 9.5, fontFamily: F, color: C.t3, marginTop: 6, fontStyle: "italic" }}>The delay lives in the human stages — agents clear their rungs ~{Math.round(summary.humanAvgHours / Math.max(summary.agentAvgHours, 0.1))}× faster.</div>
          )}
        </Card>
      </div>
    </div>
  );
}
