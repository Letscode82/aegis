import { useState, useEffect } from "react";
import { C, F, M, SR, Card } from "@aegis/ui";
import { ALL_AGENTS } from "../agents";
import { profileFor } from "../agents/agent-profiles";
import { AgentDesigner } from "./agent-designer/AgentDesigner";

// ── Agents console (program #6) — the "admin manages agents" surface ──
//
// One always-visible pane for every registered agent: what it is, the
// playbook + version it applies, its "risks to weigh" checklist, the
// request types bound to it, live 7-day metrics, and an enable/disable
// toggle. This is where an admin CONFIGURES agents (on/off, routing);
// agent LOGIC stays in code (the governance boundary that keeps
// conservative-AI guarantees intact). Thresholds/playbook editing is
// the next configurable knob (needs agents to read persisted config).

export function AgentsConsoleTab({ canManage, settings, toggle }) {
  const [metricsById, setMetricsById] = useState(null);
  const [types, setTypes] = useState([]);
  const [designerAgent, setDesignerAgent] = useState(null); // {id,name} | null

  useEffect(() => {
    let on = true;
    fetch("/api/intake/agent-metrics?days=7").then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (on && d?.agents) setMetricsById(Object.fromEntries(d.agents.map((a) => [a.agentId, a]))); }).catch(() => {});
    fetch("/api/intake/request-types").then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (on && d?.types) setTypes(d.types); }).catch(() => {});
    return () => { on = false; };
  }, []);

  const enabledOf = (id) => !(settings && settings[id] && settings[id].enabled === false);

  // Live Claude connectivity check — tells "AI unavailable" apart (key /
  // model / quota) with one server-side ping, so a degraded agent is
  // diagnosable without reading deploy logs.
  const [aiHealth, setAiHealth] = useState(null); // null | "checking" | result
  const checkAi = async () => {
    setAiHealth("checking");
    try {
      const r = await fetch("/api/_health/claude");
      setAiHealth(await r.json());
    } catch (e) { setAiHealth({ ok: false, reason: String(e.message || e) }); }
  };

  return (
    <div>
      <div style={{ marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 15, fontFamily: SR, color: C.t1 }}>Agents</div>
          <div style={{ fontSize: 10.5, color: C.t3, fontFamily: M, marginTop: 2 }}>
            Every agent, what standard it applies, which request types it handles, and how it's performing. Admins configure routing + on/off here; agent logic is code (that's what keeps the governance guarantee).
          </div>
        </div>
        {canManage && (
          <div style={{ textAlign: "right" }}>
            <button onClick={checkAi} disabled={aiHealth === "checking"} style={{ background: "transparent", border: `1px solid ${C.tl}`, color: C.tl, fontSize: 9.5, fontFamily: M, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700, padding: "6px 12px", borderRadius: 3, cursor: aiHealth === "checking" ? "default" : "pointer", opacity: aiHealth === "checking" ? 0.6 : 1 }}>
              {aiHealth === "checking" ? "Testing…" : "◎ Test AI connection"}
            </button>
            {aiHealth && aiHealth !== "checking" && (
              <div style={{ marginTop: 6, maxWidth: 340, fontSize: 10, fontFamily: M, color: aiHealth.ok ? C.gn : C.rd, textAlign: "left", padding: "7px 9px", background: (aiHealth.ok ? C.gn : C.rd) + "14", border: `1px solid ${(aiHealth.ok ? C.gn : C.rd)}55`, borderRadius: 3, lineHeight: 1.5 }}>
                {aiHealth.ok
                  ? `✓ AI reachable · model ${aiHealth.model} · ${aiHealth.ms}ms`
                  : `✕ ${aiHealth.reason || "AI unavailable"}${aiHealth.status ? ` (HTTP ${aiHealth.status})` : ""}`}
                {!aiHealth.ok && aiHealth.detail ? <div style={{ color: C.t3, marginTop: 3 }}>{aiHealth.detail}</div> : null}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {ALL_AGENTS.map((a) => {
          const prof = profileFor(a.id) || {};
          const m = metricsById?.[a.id];
          const bound = types.filter((t) => t.preferredAgentId === a.id).map((t) => t.name);
          const on = enabledOf(a.id);
          return (
            <Card key={a.id} style={{ borderLeft: `3px solid ${on ? C.pp : C.t4}`, opacity: on ? 1 : 0.7 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: C.t1, fontWeight: 600 }}>{a.icon || "◦"} {a.name}</div>
                  <div style={{ fontSize: 9.5, fontFamily: M, color: C.t3, marginTop: 1 }}>
                    {a.id}{prof.playbook ? ` · ${prof.playbook.id} ${prof.playbook.version}` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  {canManage && (
                    <button onClick={() => setDesignerAgent({ id: a.id, name: a.name })} title="Configure every aspect of this agent" style={{ background: "transparent", border: `1px solid ${C.cy}`, color: C.cy, fontFamily: M, fontSize: 8.5, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", padding: "3px 7px", borderRadius: 3, cursor: "pointer" }}>⚙ Configure</button>
                  )}
                  {canManage && toggle && (
                    <div onClick={() => toggle(a.id)} title={on ? "Disable this agent" : "Enable this agent"} style={{ width: 30, height: 16, borderRadius: 9, background: on ? C.gn : C.br, position: "relative", cursor: "pointer", transition: "background .12s" }}>
                      <div style={{ position: "absolute", top: 2, left: on ? 16 : 2, width: 12, height: 12, borderRadius: "50%", background: C.bg, transition: "left .12s" }} />
                    </div>
                  )}
                </div>
              </div>

              {a.description && <div style={{ fontSize: 10.5, color: C.t2, fontFamily: F, marginTop: 6, lineHeight: 1.45 }}>{a.description}</div>}

              {/* Metrics */}
              <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
                {[
                  ["7d recs", m ? m.produced : "—"],
                  ["accept", m && m.produced ? `${Math.round((m.acceptRate || 0) * 100)}%` : "—"],
                  ["avg conf", m && m.avgConfidence != null ? `${Math.round(m.avgConfidence * 100)}%` : "—"],
                  ["degraded", m && m.produced ? `${Math.round((m.degradedRate || 0) * 100)}%` : "—"],
                ].map(([k, v]) => (
                  <div key={k}>
                    <div style={{ fontSize: 8.5, fontFamily: M, color: C.t4, letterSpacing: 0.8, textTransform: "uppercase" }}>{k}</div>
                    <div style={{ fontSize: 13, fontFamily: SR, color: C.t1 }}>{v}</div>
                  </div>
                ))}
              </div>

              {/* Bound request types */}
              <div style={{ fontSize: 9.5, fontFamily: M, color: C.t3, marginTop: 8 }}>
                Handles: {bound.length ? bound.map((n) => <span key={n} style={{ color: C.pp }}>{n} </span>) : <span style={{ color: C.t4 }}>auto-routed by content</span>}
              </div>

              {/* Knowledge — one link to the live, editable source (Agent
                  Designer → Knowledge tab). The Designer shows the real
                  clause codes / templates the agent reads. */}
              {canManage && (
                <div style={{ marginTop: 8, borderTop: `1px solid ${C.br}`, paddingTop: 8, fontSize: 9.5, fontFamily: M }}>
                  <span style={{ color: C.t3 }}>📚 Knowledge · </span>
                  <span onClick={() => setDesignerAgent({ id: a.id, name: a.name })} style={{ color: C.cy, cursor: "pointer" }}>Edit in Designer →</span>
                </div>
              )}

              {/* Risks to weigh — the doc-mandated approval checklist */}
              {prof.risks?.length > 0 && (
                <details style={{ marginTop: 6 }}>
                  <summary style={{ fontSize: 9.5, fontFamily: M, color: C.am, cursor: "pointer", letterSpacing: 0.5 }}>⚖ Risks to weigh before approving ({prof.risks.length})</summary>
                  <ul style={{ margin: "6px 0 0", paddingLeft: 16 }}>
                    {prof.risks.map((r, i) => <li key={i} style={{ fontSize: 10, color: C.t3, fontFamily: F, lineHeight: 1.4, marginBottom: 3 }}>{r}</li>)}
                  </ul>
                </details>
              )}

              {a.productionReady === false && <div style={{ fontSize: 9, fontFamily: M, color: C.am, marginTop: 6 }}>⚠ demo-only (hidden in production until its real backend lands)</div>}
            </Card>
          );
        })}
      </div>

      {designerAgent && (
        <AgentDesigner agentKey={designerAgent.id} agentName={designerAgent.name} onClose={() => setDesignerAgent(null)} />
      )}
    </div>
  );
}
