import { useState, useEffect } from "react";
import { C, F, M, SR } from "@aegis/ui";

// ── Public data-subject portal ───────────────────────────────────────
// Login-less: DsarPortalStatus resolves a tracking/delivery token;
// DsarPortalIntake lets a member of the public file a request.

const wrap = { minHeight: "100vh", background: C.bg, display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "8vh 16px", fontFamily: F };
const panel = { background: C.cd, border: `1px solid ${C.br}`, borderRadius: 12, width: "min(520px,100%)", padding: "26px 28px" };
const lbl = { fontSize: 9, fontFamily: M, letterSpacing: .8, textTransform: "uppercase", color: C.t3, marginBottom: 4 };
const input = { width: "100%", background: C.bg, border: `1px solid ${C.br}`, borderRadius: 6, color: C.t1, fontFamily: F, fontSize: 13, padding: "9px 11px", outline: "none", boxSizing: "border-box", marginBottom: 12 };
const btn = { padding: "10px 18px", background: C.cy, color: C.bg, border: "none", borderRadius: 6, fontFamily: M, fontSize: 11, letterSpacing: 1, fontWeight: 700, textTransform: "uppercase", cursor: "pointer" };
const STAGE_LABELS = ["Intake", "Identity", "Collect", "Review", "Deliver"];

export function DsarPortalStatus({ token }) {
  const [view, setView] = useState(undefined);
  useEffect(() => {
    fetch(`/api/portal/dsar/${encodeURIComponent(token)}`).then((r) => r.json()).then((d) => setView(d.ok ? d.view : null)).catch(() => setView(null));
  }, [token]);

  return (
    <div style={wrap}>
      <div style={panel}>
        <div style={{ fontSize: 10, fontFamily: M, letterSpacing: 2, color: C.tl, textTransform: "uppercase" }}>AEGIS · Privacy</div>
        <div style={{ fontSize: 22, fontFamily: SR, color: C.t1, marginBottom: 18 }}>Your data request</div>
        {view === undefined ? <div style={{ color: C.t4, fontFamily: M, fontSize: 12 }}>Loading…</div>
          : view === null ? <div style={{ color: C.rd, fontFamily: M, fontSize: 12 }}>This link is invalid or has expired.</div>
          : (
            <>
              <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
                {STAGE_LABELS.map((s, i) => {
                  const done = i < view.stage.index, cur = i === view.stage.index;
                  return <div key={s} style={{ flex: 1, textAlign: "center" }}><div style={{ height: 5, borderRadius: 3, background: done ? C.gn : cur ? C.cy : C.br }} /><div style={{ fontSize: 8.5, fontFamily: M, textTransform: "uppercase", color: cur ? C.cy : done ? C.gn : C.t4, marginTop: 4 }}>{s}</div></div>;
                })}
              </div>
              <div style={{ fontSize: 13, color: C.t1 }}>Status: <b>{view.status.replace(/_/g, " ")}</b></div>
              <div style={{ fontSize: 12, color: C.t3, marginTop: 4 }}>Type: {view.requestType} · Filed {new Date(view.submittedAt).toLocaleDateString()}</div>
              <div style={{ fontSize: 12, color: view.daysRemaining < 0 ? C.rd : C.t3, marginTop: 4 }}>Statutory deadline: {new Date(view.effectiveDeadline).toLocaleDateString()} ({view.daysRemaining < 0 ? `${Math.abs(view.daysRemaining)} days overdue` : `${view.daysRemaining} days remaining`})</div>
              {view.response && (
                <div style={{ marginTop: 16, padding: "12px 14px", background: C.bg, border: `1px solid ${C.br}`, borderRadius: 8 }}>
                  <div style={lbl}>Your response is ready</div>
                  <div style={{ fontSize: 12, color: C.t2 }}>{view.response.includedCount} record(s) disclosed{view.response.redactedCount ? `, ${view.response.redactedCount} partially redacted` : ""}. Contact the privacy team to receive the full package securely.</div>
                </div>
              )}
            </>
          )}
      </div>
    </div>
  );
}

const TYPES = [["ACCESS", "Access my data"], ["CORRECTION", "Correct my data"], ["ERASURE", "Erase my data"], ["PORTABILITY", "Port my data"], ["OBJECT", "Object to processing"], ["RESTRICT_PROCESSING", "Restrict processing"]];

export function DsarPortalIntake() {
  const [f, setF] = useState({ requestType: "ACCESS", jurisdiction: "EU", requesterName: "", requesterEmail: "", description: "" });
  const [state, setState] = useState({ busy: false, error: null, done: null });
  const upd = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const submit = async () => {
    setState({ busy: true, error: null, done: null });
    try {
      const r = await fetch("/api/portal/dsar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
      const d = await r.json(); if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setState({ busy: false, error: null, done: d });
    } catch (e) { setState({ busy: false, error: String(e.message || e), done: null }); }
  };

  if (state.done) return (
    <div style={wrap}><div style={panel}>
      <div style={{ fontSize: 22, fontFamily: SR, color: C.gn, marginBottom: 10 }}>Request received</div>
      <div style={{ fontSize: 13, color: C.t2, marginBottom: 12 }}>We've logged your request and will verify your identity before processing it.</div>
      <div style={lbl}>Track your request</div>
      <div style={{ fontSize: 12, fontFamily: M, color: C.cy, wordBreak: "break-all" }}>{state.done.trackingUrl}</div>
    </div></div>
  );

  return (
    <div style={wrap}>
      <div style={panel}>
        <div style={{ fontSize: 10, fontFamily: M, letterSpacing: 2, color: C.tl, textTransform: "uppercase" }}>AEGIS · Privacy</div>
        <div style={{ fontSize: 22, fontFamily: SR, color: C.t1, marginBottom: 6 }}>Submit a data request</div>
        <div style={{ fontSize: 12, color: C.t3, marginBottom: 18 }}>Exercise your rights over your personal data. No account required.</div>
        {state.error && <div style={{ color: C.rd, fontFamily: M, fontSize: 12, marginBottom: 10 }}>⚠ {state.error}</div>}
        <div style={lbl}>Request type</div>
        <select value={f.requestType} onChange={upd("requestType")} style={input}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <div style={lbl}>Your full name</div>
        <input value={f.requesterName} onChange={upd("requesterName")} style={input} />
        <div style={lbl}>Your email</div>
        <input value={f.requesterEmail} onChange={upd("requesterEmail")} style={input} />
        <div style={lbl}>Jurisdiction</div>
        <input value={f.jurisdiction} onChange={upd("jurisdiction")} placeholder="EU / UK / US-CA" style={input} />
        <div style={lbl}>Details (optional)</div>
        <textarea value={f.description} onChange={upd("description")} rows={3} style={{ ...input, resize: "vertical" }} />
        <button disabled={state.busy || !f.requesterName.trim()} onClick={submit} style={{ ...btn, opacity: state.busy ? .6 : 1 }}>{state.busy ? "Submitting…" : "Submit request"}</button>
      </div>
    </div>
  );
}
