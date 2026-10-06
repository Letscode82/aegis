import { useState, useEffect, useCallback } from "react";
import { C, F, M, SR, inputStyle } from "@aegis/ui";

// ── Track 1 · Activity 3 — hand-off (baton-pass) dialog ──────────────
//
// Surfaces the item-6 hand-off backend: pass a ticket's baton between an
// AI agent and a human (or across human tiers / to a queue), with a
// reason. Reads/writes /api/intake/tickets/[id]/handoff. The ticket
// never leaves the platform — only its holder changes.

const HOLDER_LABEL = { agent: "AI agent", human: "a person", queue: "queue" };

function holderPill(holder, userName) {
  const map = { agent: C.pp, human: C.cy, queue: C.t3 };
  const c = map[holder] || C.t3;
  const text = holder === "human" ? (userName || "a person") : (holder ? holder : "unassigned");
  return (
    <span style={{ fontSize: 10, fontFamily: M, letterSpacing: 1, textTransform: "uppercase", color: c, border: `1px solid ${c}55`, borderRadius: 3, padding: "2px 7px" }}>
      {holder === "agent" ? "🤖 " : holder === "human" ? "👤 " : ""}{text}
    </span>
  );
}

export function HandoffDialog({ ticket, onClose, onDone }) {
  const [state, setState] = useState(null);
  const [assignees, setAssignees] = useState([]);
  const [toHolder, setToHolder] = useState("human");
  const [toUserId, setToUserId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let on = true;
    fetch(`/api/intake/tickets/${encodeURIComponent(ticket.id)}/handoff`)
      .then((r) => r.json()).then((d) => { if (on && d.ok) setState(d.state); }).catch(() => {});
    fetch("/api/intake/assignees").then((r) => r.json()).then((d) => { if (on) setAssignees(d.assignees || []); }).catch(() => {});
    return () => { on = false; };
  }, [ticket.id]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = useCallback(async () => {
    if (toHolder === "human" && !toUserId) { setErr("Pick the person receiving the baton."); return; }
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/intake/tickets/${encodeURIComponent(ticket.id)}/handoff`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ toHolder, toUserId: toHolder === "human" ? toUserId : null, reason: reason.trim() || null }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error(d.error || `Hand-off failed (HTTP ${r.status})`);
      const who = toHolder === "human" ? (assignees.find((a) => a.id === toUserId)?.name || "the assignee") : HOLDER_LABEL[toHolder];
      onDone?.(`⇄ ${ticket.id} handed off to ${who}`, "bl");
      onClose();
    } catch (e) { setErr(String(e.message || e)); setBusy(false); }
  }, [toHolder, toUserId, reason, ticket.id, assignees, onDone, onClose]);

  const holderBtn = (value, label) => (
    <div onClick={() => setToHolder(value)} style={{ flex: 1, textAlign: "center", padding: "8px 6px", border: `1px solid ${toHolder === value ? C.cy : C.br}`, background: toHolder === value ? C.cy + "18" : C.s1, color: toHolder === value ? C.cy : C.t2, borderRadius: 4, cursor: "pointer", fontSize: 10.5, fontFamily: M, letterSpacing: .5 }}>{label}</div>
  );

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(11,16,32,.9)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", animation: "fu .2s ease", padding: 20, overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.cd, border: `1px solid ${C.br}`, borderLeft: `3px solid ${C.cy}`, borderRadius: 8, padding: 24, maxWidth: 480, width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ fontSize: 10, fontFamily: M, color: C.cy, letterSpacing: 2, textTransform: "uppercase", fontWeight: 600, marginBottom: 6 }}>⇄ HAND OFF · {ticket.id}</div>
        <div style={{ fontSize: 17, fontFamily: SR, color: C.t1, marginBottom: 4 }}>Pass the baton</div>
        <div style={{ fontSize: 10.5, color: C.t3, fontFamily: M, marginBottom: 12 }}>The ticket stays on the platform — only its holder changes. Chain-sealed in the audit log.</div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, fontSize: 11, color: C.t2, fontFamily: M }}>
          <span style={{ color: C.t3 }}>Currently held by:</span>
          {state ? holderPill(state.holder, state.holderUserId && (assignees.find((a) => a.id === state.holderUserId)?.name)) : <span style={{ color: C.t4 }}>loading…</span>}
        </div>

        <div style={{ fontSize: 9.5, fontFamily: M, color: C.t4, letterSpacing: .8, marginBottom: 4 }}>Hand off to</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          {holderBtn("human", "👤 A person")}
          {holderBtn("agent", "🤖 Back to agent")}
          {holderBtn("queue", "▤ Queue")}
        </div>

        {toHolder === "human" && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 9.5, fontFamily: M, color: C.t4, letterSpacing: .8, marginBottom: 3 }}>Assignee</div>
            <select value={toUserId} onChange={(e) => setToUserId(e.target.value)} style={{ ...inputStyle, width: "100%", fontSize: 11 }}>
              <option value="">Select a person…</option>
              {assignees.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.roleName || "user"}</option>)}
            </select>
          </div>
        )}

        <div style={{ fontSize: 9.5, fontFamily: M, color: C.t4, letterSpacing: .8, marginBottom: 3 }}>Reason (optional)</div>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why the baton is moving — for the audit trail" style={{ ...inputStyle, width: "100%", fontSize: 11, marginBottom: 10 }} />

        {state?.history?.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 9, fontFamily: M, color: C.t4, letterSpacing: 1, textTransform: "uppercase", marginBottom: 5 }}>Recent hand-offs</div>
            {state.history.slice(0, 4).map((h) => (
              <div key={h.id} style={{ fontSize: 10, color: C.t3, fontFamily: M, padding: "3px 0", borderBottom: `1px solid ${C.br}33` }}>
                {h.fromHolder ? `${h.fromHolder} → ` : ""}{h.toHolder}{h.reason ? ` · ${h.reason}` : ""}
              </div>
            ))}
          </div>
        )}

        {err && <div style={{ padding: "8px 12px", marginBottom: 10, background: C.rdG, borderLeft: `3px solid ${C.rd}`, borderRadius: 4, fontSize: 11, color: C.t1, fontFamily: M }}>{err}</div>}

        <div style={{ display: "flex", gap: 8 }}>
          <div onClick={busy ? undefined : submit} style={{ flex: 1, textAlign: "center", padding: "9px 14px", background: C.cy, color: C.bg, fontSize: 10, fontFamily: M, letterSpacing: 1.5, cursor: busy ? "default" : "pointer", textTransform: "uppercase", fontWeight: 700, borderRadius: 3, opacity: busy ? .6 : 1 }}>{busy ? "Handing off…" : "Hand off"}</div>
          <div onClick={onClose} style={{ padding: "9px 14px", border: `1px solid ${C.br}`, color: C.t2, fontSize: 10, fontFamily: M, letterSpacing: 1.5, cursor: "pointer", textTransform: "uppercase", borderRadius: 3 }}>Cancel · Esc</div>
        </div>
      </div>
    </div>
  );
}
