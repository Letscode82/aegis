/**
 * Investigations hub (INV-1) — the internal-investigations landing. Open an
 * investigation from a source letter: AEGIS extracts the issues and drafts a
 * plan (workstream steps, custodian hints, collection scope), then creates the
 * backing Matter of type INVESTIGATION. From there the hold + collection flow
 * (eDiscovery) and the review pipeline take over — the whole spine in one place.
 */
import { useState, useEffect } from "react";
import { C, F, M, SR } from "@aegis/ui";

const badge = (col) => ({ fontSize: 10, fontWeight: 700, letterSpacing: .4, color: col, border: `1px solid ${col}`, borderRadius: 5, padding: "2px 8px", whiteSpace: "nowrap" });

export function InvestigationsHub() {
  const [rows, setRows] = useState(null);
  const [showNew, setShowNew] = useState(false);

  const load = () => fetch("/api/investigations").then((r) => r.json()).then((d) => setRows(d.ok ? d.investigations : [])).catch(() => setRows([]));
  useEffect(() => { load(); }, []);

  return (
    <div style={{ padding: "26px 32px", fontFamily: F, color: C.t1, maxWidth: 1240, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <div style={{ marginBottom: 6, fontFamily: M, fontSize: 10.5, letterSpacing: 1.4, color: C.pp, textTransform: "uppercase" }}>Investigations · one spine from allegation to findings</div>
          <div style={{ fontFamily: SR, fontSize: 28, fontWeight: 600, marginBottom: 4 }}>Internal Investigations</div>
          <div style={{ fontSize: 13.5, color: C.t3, marginBottom: 20 }}>Open from a source letter — AEGIS drafts the issues, the plan, and the custodian list, then hands off to preservation, collection, and issue-coded review.</div>
        </div>
        <button onClick={() => setShowNew(true)} style={{ flex: "none", padding: "10px 16px", background: C.pp, color: C.bg, border: "none", borderRadius: 8, fontFamily: F, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>+ New investigation</button>
      </div>
      {showNew && <NewInvestigationModal onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); load(); }} />}

      <div style={{ border: `1px solid ${C.br}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 150px 1fr 120px", gap: 0, padding: "10px 18px", background: C.cd, borderBottom: `1px solid ${C.br}`, fontSize: 10.5, fontFamily: M, letterSpacing: .8, textTransform: "uppercase", color: C.t3 }}>
          <div>Investigation</div><div>Matter</div><div>Issues</div><div style={{ textAlign: "right" }}>Actions</div>
        </div>
        {rows === null && <div style={{ padding: 22, color: C.t4, fontFamily: M, fontSize: 12.5 }}>Loading…</div>}
        {rows !== null && rows.length === 0 && <div style={{ padding: 22, color: C.t4, fontFamily: M, fontSize: 12.5 }}>No investigations yet. Start one from a source letter.</div>}
        {(rows || []).map((inv) => <InvestigationRow key={inv.id} inv={inv} />)}
      </div>
    </div>
  );
}

function InvestigationRow({ inv }) {
  const [custodians, setCustodians] = useState(null);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState(() => new Set());
  const [workup, setWorkup] = useState(null);
  const [workBusy, setWorkBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const suggest = async () => {
    setBusy(true);
    try {
      const r = await fetch(`/api/investigations/${inv.matterId}/suggest-custodians`, { method: "POST" });
      const d = await r.json();
      const list = d.ok ? d.custodians : [];
      setCustodians(list);
      setPicked(new Set(list.map((c) => c.email).filter(Boolean)));
    } catch { setCustodians([]); } finally { setBusy(false); }
  };
  const toggle = (email) => setPicked((p) => { const n = new Set(p); if (n.has(email)) n.delete(email); else n.add(email); return n; });
  const runWorkup = async () => {
    setWorkBusy(true); setMsg("");
    try {
      const r = await fetch(`/api/investigations/${inv.matterId}/workup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ custodianIdentifiers: [...picked] }) });
      const d = await r.json(); if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setWorkup(d.result);
    } catch (e) { setMsg(String(e.message || e)); } finally { setWorkBusy(false); }
  };
  return (
    <div style={{ borderBottom: `1px solid ${C.br}44` }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 150px 1fr 120px", gap: 0, padding: "13px 18px", alignItems: "center" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{inv.matterTitle}</div>
          <div style={{ fontSize: 11, color: C.t4, fontFamily: M, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{inv.sourceText.slice(0, 90)}…</div>
        </div>
        <div style={{ fontFamily: M, fontSize: 12, color: C.t2 }}>{inv.matterNumber || <span style={{ color: C.t4 }}>—</span>}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>{(inv.issues || []).slice(0, 4).map((i) => <span key={i.key} style={badge(C.pp)}>{i.label}</span>)}</div>
        <div style={{ textAlign: "right", display: "flex", gap: 6, justifyContent: "flex-end" }}>
          <button onClick={suggest} disabled={busy} style={{ fontSize: 11, fontWeight: 600, padding: "5px 9px", borderRadius: 6, cursor: "pointer", background: "transparent", color: C.cy, border: `1px solid ${C.cy}` }}>{busy ? "…" : "Custodians"}</button>
          <button onClick={() => { window.location.href = `/?view=matters&matterId=${inv.matterId}`; }} style={{ fontSize: 11, fontWeight: 600, padding: "5px 9px", borderRadius: 6, cursor: "pointer", background: "transparent", color: C.bl, border: `1px solid ${C.bl}` }}>Matter →</button>
        </div>
      </div>
      {custodians && (
        <div style={{ padding: "0 18px 13px 18px" }}>
          <div style={{ border: `1px solid ${C.br}`, borderRadius: 8, padding: "10px 12px", background: C.bg }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontSize: 10.5, fontFamily: M, letterSpacing: .6, textTransform: "uppercase", color: C.cy }}>Custodians ({picked.size}/{custodians.length} selected)</div>
              {custodians.length > 0 && !workup && (
                <button onClick={runWorkup} disabled={workBusy || picked.size === 0} title="Create a draft legal hold on the matter and collect from the selected custodians" style={{ fontSize: 11.5, fontWeight: 600, padding: "6px 11px", borderRadius: 7, cursor: "pointer", background: C.pp, color: C.bg, border: "none" }}>{workBusy ? "Working…" : "⚖ Preserve & collect →"}</button>
              )}
            </div>
            {custodians.length === 0 && <div style={{ fontSize: 12, color: C.t4 }}>No candidates found.</div>}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {custodians.map((c) => {
                const on = c.email && picked.has(c.email);
                return (
                  <button key={c.id} onClick={() => c.email && toggle(c.email)} style={{ textAlign: "left", cursor: "pointer", border: `1px solid ${on ? C.pp : C.br}`, background: on ? `${C.pp}14` : "transparent", borderRadius: 7, padding: "6px 10px", fontSize: 12 }}>
                    <span style={{ fontWeight: 600 }}>{on ? "✓ " : ""}{c.name}</span>{c.title ? <span style={{ color: C.t4 }}> · {c.title}</span> : null}
                    <div style={{ fontSize: 10.5, color: C.t4, fontFamily: M }}>{c.email}</div>
                  </button>
                );
              })}
            </div>
            {msg && <div style={{ fontSize: 12, color: C.rd, marginTop: 8 }}>{msg}</div>}
            {workup && (
              <div style={{ marginTop: 10, borderTop: `1px solid ${C.br}`, paddingTop: 10, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ ...badge(C.gn), fontSize: 10 }}>PRESERVED &amp; COLLECTED</span>
                <span style={{ fontSize: 12, color: C.t2 }}>Draft hold created · <b>{workup.itemCount}</b> documents collected{workup.simulated ? " (simulated)" : ""}.</span>
                <button onClick={() => { window.location.href = `/review/collections/${workup.reviewSetId}`; }} style={{ fontSize: 11.5, fontWeight: 600, padding: "6px 11px", borderRadius: 7, cursor: "pointer", background: C.cy, color: C.bg, border: "none" }}>Open collection →</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NewInvestigationModal({ onClose, onCreated }) {
  const [title, setTitle] = useState("");
  const [source, setSource] = useState("");
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [created, setCreated] = useState(null);
  const inp = { width: "100%", background: C.bg, border: `1px solid ${C.br}`, borderRadius: 8, color: C.t1, fontFamily: F, fontSize: 13.5, padding: "10px 12px", outline: "none", boxSizing: "border-box" };

  const preview = async () => {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/investigations/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, sourceText: source }) });
      const d = await r.json(); if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setDraft(d.draft);
    } catch (e) { setErr(String(e.message || e)); } finally { setBusy(false); }
  };
  const create = async () => {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/investigations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, sourceText: source }) });
      const d = await r.json(); if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setCreated(d.investigation);
    } catch (e) { setErr(String(e.message || e)); setBusy(false); }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(4,7,15,.72)", zIndex: 1200, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: F, padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 640, maxWidth: "96%", maxHeight: "90vh", overflow: "auto", background: C.cd, border: `1px solid ${C.brL}`, borderRadius: 14, padding: "24px 26px" }}>
        <div style={{ fontFamily: SR, fontSize: 19, fontWeight: 600, marginBottom: 4 }}>New investigation</div>
        <div style={{ fontSize: 12.5, color: C.t3, marginBottom: 18 }}>Paste the source — an allegation letter, whistleblower complaint, or referral. AEGIS drafts the issues and plan; you edit, then open it as a matter.</div>

        {!created && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.t3, marginBottom: 5 }}>Title</div>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Project Falcon — trade-secret misappropriation" style={inp} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.t3, marginBottom: 5 }}>Source letter / allegation</div>
              <textarea value={source} onChange={(e) => setSource(e.target.value)} rows={6} placeholder="A departing VP of Engineering is alleged to have downloaded trade-secret source code and pricing models to a personal drive before joining a competitor…" style={{ ...inp, resize: "vertical" }} />
            </div>
            <div><button disabled={busy || !source.trim()} onClick={preview} style={{ padding: "9px 15px", background: "transparent", color: C.pp, border: `1px solid ${C.pp}`, borderRadius: 8, fontFamily: F, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{busy ? "Analyzing…" : "✨ Extract issues & draft plan"}</button></div>

            {draft && (
              <div style={{ border: `1px solid ${C.pp}44`, borderRadius: 10, padding: "14px 16px", background: `${C.pp}0d`, display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 10.5, fontFamily: M, letterSpacing: .6, textTransform: "uppercase", color: C.pp, marginBottom: 6 }}>Issues</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{draft.issues.map((i) => <span key={i.key} style={badge(C.pp)}>{i.label}</span>)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10.5, fontFamily: M, letterSpacing: .6, textTransform: "uppercase", color: C.pp, marginBottom: 6 }}>Draft plan</div>
                  <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: C.t2, lineHeight: 1.7 }}>{draft.plan.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
                </div>
                <div>
                  <div style={{ fontSize: 10.5, fontFamily: M, letterSpacing: .6, textTransform: "uppercase", color: C.pp, marginBottom: 6 }}>Custodian hints</div>
                  {draft.plan.custodianHints.map((h, i) => <div key={i} style={{ fontSize: 12.5, color: C.t2, marginBottom: 3 }}><b>{h.name}</b> — <span style={{ color: C.t3 }}>{h.rationale}</span></div>)}
                </div>
                <div style={{ fontSize: 11.5, color: C.t3 }}><b>Scope:</b> {draft.plan.scopeSuggestion}</div>
              </div>
            )}
            {err && <div style={{ fontSize: 12, color: C.rd }}>{err}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={onClose} style={{ padding: "10px 16px", background: "transparent", color: C.t3, border: `1px solid ${C.t3}`, borderRadius: 8, fontFamily: F, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
              <button disabled={busy || !source.trim()} onClick={create} style={{ padding: "10px 18px", background: C.pp, color: C.bg, border: "none", borderRadius: 8, fontFamily: F, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{busy ? "Opening…" : "Open investigation →"}</button>
            </div>
          </div>
        )}

        {created && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "flex-start" }}>
            <div style={{ ...badge(C.gn), fontSize: 11 }}>INVESTIGATION OPENED</div>
            <div style={{ fontSize: 14 }}><b>{created.matterTitle}</b> — matter <span style={{ fontFamily: M }}>{created.matterNumber || "(draft)"}</span></div>
            <div style={{ fontSize: 12.5, color: C.t3 }}>Next: issue a legal hold on the custodians, then collect and review in eDiscovery.</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { window.location.href = `/?view=matters&matterId=${created.matterId}`; }} style={{ padding: "10px 16px", background: C.bl, color: C.bg, border: "none", borderRadius: 8, fontFamily: F, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Go to matter →</button>
              <button onClick={() => { window.location.href = "/?view=ediscovery"; }} style={{ padding: "10px 16px", background: "transparent", color: C.cy, border: `1px solid ${C.cy}`, borderRadius: 8, fontFamily: F, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>eDiscovery →</button>
              <button onClick={onCreated} style={{ padding: "10px 16px", background: "transparent", color: C.t3, border: `1px solid ${C.t3}`, borderRadius: 8, fontFamily: F, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
