import { useState, useEffect, useCallback } from "react";
import { C, F, M, SR } from "@aegis/ui";

// ── Playbook-driven Negotiate (PR D) ─────────────────────────────────
//
// Per-clause counter off the concession ladder (preferred → fallback →
// walk-away), a "what moved this round" banner from the trajectory across
// counterparty turns, and advisory stall flags each resolved on the human gate.

const card = { background: C.cd, border: `1px solid ${C.br}`, borderRadius: 10, padding: 14 };
const btn = (fill, fg) => ({ padding: "5px 10px", background: fill, color: fg, border: `1px solid ${fill === "transparent" ? C.br : fill}`, borderRadius: 5, fontFamily: M, fontSize: 9.5, letterSpacing: 0.5, textTransform: "uppercase", fontWeight: 700, cursor: "pointer" });
const ACTION = {
  accept: { c: C.gn, label: "Accept" },
  hold_fallback: { c: C.am, label: "Hold fallback" },
  counter_preferred: { c: C.bl, label: "Counter" },
  walk_away: { c: C.rd, label: "Walk-away" },
  no_position: { c: C.t4, label: "No position" },
};
const DIR = {
  toward: { c: C.gn, s: "▲" }, resolved: { c: C.gn, s: "✓" },
  away: { c: C.rd, s: "▼" }, stalled: { c: C.am, s: "▬" }, new: { c: C.t4, s: "•" },
};

async function api(url, opts) {
  const r = await fetch(url, { headers: { "Content-Type": "application/json" }, ...opts });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.ok === false) throw new Error(d.error || `HTTP ${r.status}`);
  return d;
}

function Ladder({ ladder }) {
  if (!ladder?.length) return null;
  return (
    <div style={{ marginTop: 8, display: "grid", gap: 4 }}>
      {ladder.map((r, i) => (
        <div key={i} style={{ fontSize: 10.5, lineHeight: 1.4, display: "flex", gap: 7 }}>
          <span style={{ fontFamily: M, fontSize: 8.5, letterSpacing: 0.4, minWidth: 64, color: r.rung === "preferred" ? C.gn : r.rung === "walk_away" ? C.rd : C.am }}>
            {r.rung === "preferred" ? "PREFERRED" : r.rung === "walk_away" ? "WALK-AWAY" : `FALLBACK ${r.index + 1}`}
          </span>
          <span style={{ color: C.t2 }}>{r.text}</span>
        </div>
      ))}
    </div>
  );
}

export function NegotiatePanel({ contractId }) {
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [open, setOpen] = useState({}); // clauseType → ladder expanded

  const load = useCallback(async () => {
    setBusy(true); setErr(null);
    try { const d = await api(`/api/contracts/${contractId}/negotiate`); setPlan(d.plan); }
    catch (e) { setErr(String(e.message || e)); }
    finally { setBusy(false); }
  }, [contractId]);
  useEffect(() => { load(); }, [load]);

  const resolveFlag = (fid, action) => (async () => {
    setBusy(true); setErr(null);
    try { await api(`/api/contracts/${contractId}/negotiate-flags/${fid}`, { method: "POST", body: JSON.stringify({ action }) }); await load(); }
    catch (e) { setErr(String(e.message || e)); setBusy(false); }
  })();

  const c = plan?.counts;
  const actionable = (plan?.proposals || []).filter((p) => p.action !== "accept" && p.action !== "no_position");
  const pendingFlags = (plan?.flags || []).filter((f) => f.status === "PENDING");

  return (
    <div style={{ fontFamily: F, color: C.t1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontFamily: SR }}>Negotiate</div>
          <div style={{ fontSize: 11, color: C.t3 }}>Counter each clause off your playbook ladder and track what moved this round.</div>
        </div>
        <button style={btn(C.bl, "#fff")} disabled={busy} onClick={load}>↻ Refresh plan</button>
      </div>

      {err && <div style={{ color: C.rd, fontFamily: M, fontSize: 11, marginBottom: 10 }}>⚠ {err}</div>}

      {plan && (
        <>
          {/* what-moved banner */}
          <div style={{ ...card, marginBottom: 12, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 12, color: C.t1, marginBottom: 4 }}>{plan.movedHeadline}</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 10.5, fontFamily: M }}>
                <span style={{ color: C.gn }}>{c.accept} accept</span>
                <span style={{ color: C.am }}>{c.holdFallback} hold fallback</span>
                <span style={{ color: C.bl }}>{c.counterPreferred} counter</span>
                <span style={{ color: C.rd }}>{c.walkAway} walk-away</span>
              </div>
            </div>
            <div style={{ fontSize: 9.5, fontFamily: M, color: C.t4 }}>{plan.turnCount} counterparty turn{plan.turnCount === 1 ? "" : "s"}</div>
          </div>

          {/* advisory stall flags */}
          {pendingFlags.length > 0 && (
            <div style={{ ...card, marginBottom: 12, borderColor: C.am }}>
              <div style={{ fontSize: 10, fontFamily: M, color: C.am, letterSpacing: 0.5, marginBottom: 8 }}>⚠ STALLED — NEEDS A CALL</div>
              {pendingFlags.map((f) => (
                <div key={f.decisionId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "6px 0", borderTop: `1px solid ${C.br}` }}>
                  <span style={{ fontSize: 11, color: C.t2 }}>{f.reason}</span>
                  <div style={{ display: "flex", gap: 5 }}>
                    <button style={btn("transparent", C.gn)} disabled={busy} onClick={() => resolveFlag(f.decisionId, "approve")}>Acknowledge</button>
                    <button style={btn("transparent", C.t3)} disabled={busy} onClick={() => resolveFlag(f.decisionId, "reject")}>Dismiss</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* movement trajectory */}
          {(plan.movement || []).length > 0 && (
            <div style={{ ...card, marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontFamily: M, color: C.t4, letterSpacing: 0.5, marginBottom: 8 }}>MOVEMENT</div>
              <div style={{ display: "grid", gap: 4 }}>
                {plan.movement.map((m) => {
                  const d = DIR[m.direction] || DIR.new;
                  return (
                    <div key={m.clauseType} style={{ fontSize: 11, display: "flex", gap: 7, alignItems: "center" }}>
                      <span style={{ color: d.c, fontFamily: M, width: 12 }}>{d.s}</span>
                      <span style={{ color: C.t2 }}>{m.headline}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* counters */}
          {actionable.length === 0 ? (
            <div style={{ ...card, fontSize: 12, color: C.gn }}>✓ Every clause is on an acceptable position — nothing to counter.</div>
          ) : actionable.map((p) => {
            const a = ACTION[p.action] || ACTION.counter_preferred;
            const isOpen = !!open[p.clauseType];
            return (
              <div key={p.clauseType} style={{ ...card, marginBottom: 10, borderLeft: `3px solid ${a.c}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 9, fontFamily: M, color: "#fff", background: a.c, borderRadius: 4, padding: "2px 7px", letterSpacing: 0.5 }}>{a.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{p.clauseType.replace(/_/g, " ")}</span>
                  </div>
                  <button style={{ ...btn("transparent", C.t3), textTransform: "none", letterSpacing: 0 }} onClick={() => setOpen((o) => ({ ...o, [p.clauseType]: !o[p.clauseType] }))}>
                    {isOpen ? "Hide ladder" : "Show ladder"}
                  </button>
                </div>
                <div style={{ fontSize: 10.5, color: C.t4, fontStyle: "italic", marginTop: 6 }}>{p.rationale}</div>
                {p.counterText && (
                  <div style={{ marginTop: 8, padding: "8px 10px", background: `${a.c}0e`, border: `1px dashed ${a.c}66`, borderRadius: 6 }}>
                    <span style={{ fontFamily: M, fontSize: 9, color: a.c }}>COUNTER WITH</span>
                    <div style={{ fontSize: 11.5, color: C.t1, lineHeight: 1.5, marginTop: 2 }}>{p.counterText}</div>
                  </div>
                )}
                {isOpen && <Ladder ladder={p.ladder} />}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
