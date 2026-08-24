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

// Structured prompt shown when no letter is pasted — a fill-in-the-blanks
// template so counsel can frame an investigation even without a formal referral.
const SAMPLE_PLACEHOLDER = `No letter yet? Frame the investigation with a few lines — AEGIS extracts the issues and drafts the plan:

WHAT HAPPENED: <one or two sentences on the alleged conduct>
WHO IS INVOLVED: <names / roles of the subject(s) and any witnesses>
WHEN: <approximate dates or time window>
POTENTIAL ISSUES: <e.g. trade-secret misappropriation, self-dealing, data exfiltration, harassment, FCPA>
WHERE THE EVIDENCE LIVES: <mailboxes, Teams, OneDrive/SharePoint sites, systems>
WHAT WE NEED TO KNOW: <the questions the investigation must answer>

…or paste the full allegation / whistleblower / referral letter here and AEGIS will read it directly.`;

// A worked example that matches the seeded demo mailboxes (vendorx / §8.2 IP dispute).
const SAMPLE_ALLEGATION = `CONFIDENTIAL — INTERNAL INVESTIGATION REFERRAL

WHAT HAPPENED: A whistleblower reports that during the VendorX master-services negotiation, a member of the engineering team shared AEGIS's confidential §8.2 pricing model and proprietary source-code excerpts with the counterparty ahead of contract execution, and that a departing engineer moved key files to a personal drive before resigning to join VendorX.

WHO IS INVOLVED: Marcus Reid (in-house counsel on the deal), Priya Kulkarni (engineering lead), Carlos Mendez (finance). Possible departed custodian on the engineering side.

WHEN: The three months leading up to the VendorX MSA signing.

POTENTIAL ISSUES: Trade-secret misappropriation; breach of the §8.2 confidentiality clause; unauthorized disclosure of pricing to a counterparty; data exfiltration by a departing employee.

WHERE THE EVIDENCE LIVES: The custodians' Exchange mailboxes, the deal Teams channel, and the VendorX SharePoint/OneDrive workspace.

WHAT WE NEED TO KNOW: What confidential material left the company, who sent it, when, and to whom; whether the §8.2 clause was breached; and whether any files were taken by a departing employee.`;

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
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.5fr) 120px minmax(0,0.9fr) 240px", gap: 12, padding: "10px 18px", background: C.cd, borderBottom: `1px solid ${C.br}`, fontSize: 10.5, fontFamily: M, letterSpacing: .8, textTransform: "uppercase", color: C.t3 }}>
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
  const [showCust, setShowCust] = useState(false);
  const [showChron, setShowChron] = useState(false);
  const [showReport, setShowReport] = useState(false);
  return (
    <div style={{ borderBottom: `1px solid ${C.br}44` }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.5fr) 120px minmax(0,0.9fr) 240px", gap: 12, padding: "13px 18px", alignItems: "center" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{inv.matterTitle}</div>
          <div style={{ fontSize: 11, color: C.t4, fontFamily: M, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{inv.sourceText.slice(0, 90)}…</div>
        </div>
        <div style={{ fontFamily: M, fontSize: 12, color: C.t2, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{inv.matterNumber || <span style={{ color: C.t4 }}>—</span>}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, minWidth: 0 }}>{(inv.issues || []).slice(0, 4).map((i) => <span key={i.key} style={badge(C.pp)}>{i.label}</span>)}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "flex-end" }}>
          <button onClick={() => setShowCust((v) => !v)} style={{ fontSize: 11, fontWeight: 600, padding: "5px 9px", borderRadius: 6, cursor: "pointer", background: showCust ? `${C.cy}14` : "transparent", color: C.cy, border: `1px solid ${C.cy}` }}>Custodians</button>
          <button onClick={() => setShowChron((v) => !v)} style={{ fontSize: 11, fontWeight: 600, padding: "5px 9px", borderRadius: 6, cursor: "pointer", background: showChron ? `${C.am}14` : "transparent", color: C.am, border: `1px solid ${C.am}` }}>Chronology</button>
          <button onClick={() => setShowReport(true)} style={{ fontSize: 11, fontWeight: 600, padding: "5px 9px", borderRadius: 6, cursor: "pointer", background: "transparent", color: C.gn, border: `1px solid ${C.gn}` }}>Report</button>
          <button onClick={() => { window.location.href = `/?view=matters&matterId=${inv.matterId}`; }} style={{ fontSize: 11, fontWeight: 600, padding: "5px 9px", borderRadius: 6, cursor: "pointer", background: "transparent", color: C.bl, border: `1px solid ${C.bl}` }}>Matter →</button>
        </div>
      </div>
      {showCust && <div style={{ padding: "0 18px 13px 18px" }}><CustodianPicker matterId={inv.matterId} /></div>}
      {showChron && <div style={{ padding: "0 18px 14px 18px" }}><ChronologyPanel matterId={inv.matterId} /></div>}
      {showReport && <ReportModal matterId={inv.matterId} onClose={() => setShowReport(false)} />}
    </div>
  );
}

function isEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s); }

/**
 * Search-driven custodian picker — type a name (marcus / priya / carlos), pick
 * the real directory match, or paste an exact address. Replaces the old
 * auto-suggest panel that returned 0 and gave no way to select. Selected
 * custodians feed the Preserve & collect workup on the investigation's matter.
 */
function CustodianPicker({ matterId }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [simulated, setSimulated] = useState(false);
  const [selected, setSelected] = useState([]); // {email, name, title}
  const [manual, setManual] = useState("");
  const [workup, setWorkup] = useState(null);
  const [workBusy, setWorkBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [keywords, setKeywords] = useState("");
  const inp = { flex: 1, minWidth: 160, background: C.cd, border: `1px solid ${C.br}`, borderRadius: 7, color: C.t1, fontFamily: F, fontSize: 12.5, padding: "7px 10px", outline: "none" };

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults([]); setSearching(false); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/investigations/${matterId}/custodian-search?q=${encodeURIComponent(term)}`);
        const d = await r.json();
        setResults(d.ok ? d.users : []);
        setSimulated(!!d.simulated);
      } catch { setResults([]); } finally { setSearching(false); }
    }, 280);
    return () => clearTimeout(t);
  }, [q, matterId]);

  const add = (u) => {
    const email = (u.email || "").trim();
    if (!email) return;
    setSelected((prev) => prev.some((s) => s.email.toLowerCase() === email.toLowerCase()) ? prev : [...prev, { email, name: u.name || email, title: u.title || "" }]);
  };
  const addManual = () => {
    const email = manual.trim();
    if (!isEmail(email)) { setMsg("Enter a valid email address."); return; }
    setMsg("");
    add({ email, name: email });
    setManual("");
  };
  const remove = (email) => setSelected((prev) => prev.filter((s) => s.email !== email));

  const runWorkup = async () => {
    setWorkBusy(true); setMsg("");
    try {
      const kws = keywords.split(",").map((s) => s.trim()).filter(Boolean);
      const filters = (startDate || endDate || kws.length > 0) ? { startDate: startDate || null, endDate: endDate || null, keywords: kws } : undefined;
      const r = await fetch(`/api/investigations/${matterId}/workup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ custodianIdentifiers: selected.map((s) => s.email), filters }) });
      const d = await r.json(); if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setWorkup(d.result);
    } catch (e) { setMsg(String(e.message || e)); } finally { setWorkBusy(false); }
  };

  return (
    <div style={{ border: `1px solid ${C.br}`, borderRadius: 8, padding: "12px 14px", background: C.bg }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 10.5, fontFamily: M, letterSpacing: .6, textTransform: "uppercase", color: C.cy }}>Select custodians ({selected.length} selected)</div>
        {simulated && <span style={{ fontSize: 9.5, fontFamily: M, color: C.am, border: `1px solid ${C.am}`, borderRadius: 4, padding: "1px 6px" }}>SIMULATED DIRECTORY — connect M365 for real users</span>}
      </div>

      {!workup && (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the directory — e.g. marcus, priya, carlos" style={inp} />
          </div>
          {searching && <div style={{ fontSize: 11.5, color: C.t4, marginBottom: 6 }}>Searching…</div>}
          {!searching && q.trim().length >= 2 && results.length === 0 && <div style={{ fontSize: 11.5, color: C.t4, marginBottom: 6 }}>No directory matches. Paste the exact address below.</div>}
          {results.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
              {results.map((u) => {
                const on = selected.some((s) => s.email.toLowerCase() === (u.email || "").toLowerCase());
                return (
                  <button key={u.id || u.email} onClick={() => add(u)} disabled={on || !u.email} style={{ textAlign: "left", cursor: on ? "default" : "pointer", border: `1px solid ${on ? C.gn : C.br}`, background: on ? `${C.gn}14` : "transparent", borderRadius: 7, padding: "6px 10px", fontSize: 12, opacity: u.email ? 1 : .5 }}>
                    <span style={{ fontWeight: 600 }}>{on ? "✓ " : "+ "}{u.name || u.email}</span>{u.title ? <span style={{ color: C.t4 }}> · {u.title}</span> : null}
                    <div style={{ fontSize: 10.5, color: C.t4, fontFamily: M }}>{u.email || "no mailbox"}</div>
                  </button>
                );
              })}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: selected.length ? 12 : 0 }}>
            <input value={manual} onChange={(e) => setManual(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addManual(); }} placeholder="…or paste an exact mailbox — name@tenant.onmicrosoft.com" style={inp} />
            <button onClick={addManual} disabled={!manual.trim()} style={{ fontSize: 11.5, fontWeight: 600, padding: "7px 12px", borderRadius: 7, cursor: "pointer", background: "transparent", color: C.cy, border: `1px solid ${C.cy}` }}>+ Add address</button>
          </div>
          {selected.length > 0 && (
            <div style={{ marginBottom: 12, borderTop: `1px solid ${C.br}`, paddingTop: 10 }}>
              <div style={{ fontSize: 10, fontFamily: M, letterSpacing: .5, textTransform: "uppercase", color: C.t4, marginBottom: 6 }}>Collection scope (optional)</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <label style={{ fontSize: 11, color: C.t3, display: "inline-flex", alignItems: "center", gap: 5 }}>From <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ ...inp, flex: "none", minWidth: 0, width: 150 }} /></label>
                <label style={{ fontSize: 11, color: C.t3, display: "inline-flex", alignItems: "center", gap: 5 }}>To <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ ...inp, flex: "none", minWidth: 0, width: 150 }} /></label>
                <input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="keywords (comma-separated) — e.g. pricing, source code" style={{ ...inp, minWidth: 240 }} />
              </div>
              <div style={{ fontSize: 10.5, color: C.t4, marginTop: 5 }}>Filters apply to the collected set before review — date bounds skip undated files; keywords match subject / body / attachments.</div>
            </div>
          )}
        </>
      )}

      {selected.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          {selected.map((s) => (
            <span key={s.email} style={{ display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${C.pp}`, background: `${C.pp}14`, borderRadius: 20, padding: "4px 6px 4px 11px", fontSize: 12 }}>
              <span><b>{s.name}</b> <span style={{ color: C.t4, fontFamily: M, fontSize: 10.5 }}>{s.email}</span></span>
              {!workup && <button onClick={() => remove(s.email)} title="Remove" style={{ fontSize: 11, color: C.t3, background: "transparent", border: "none", cursor: "pointer", lineHeight: 1 }}>✕</button>}
            </span>
          ))}
        </div>
      )}

      {!workup && selected.length > 0 && (
        <button onClick={runWorkup} disabled={workBusy} title="Create a draft legal hold on the matter and collect from the selected custodians" style={{ fontSize: 11.5, fontWeight: 600, padding: "7px 13px", borderRadius: 7, cursor: "pointer", background: C.pp, color: C.bg, border: "none" }}>{workBusy ? "Working…" : "⚖ Preserve & collect →"}</button>
      )}

      {msg && <div style={{ fontSize: 12, color: C.rd, marginTop: 8 }}>{msg}</div>}

      {workup && (
        <div style={{ marginTop: 4, borderTop: `1px solid ${C.br}`, paddingTop: 10, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ ...badge(C.gn), fontSize: 10 }}>PRESERVED &amp; COLLECTED</span>
          <span style={{ fontSize: 12, color: C.t2 }}>Draft hold created · <b>{workup.itemCount}</b> documents collected{workup.simulated ? " (simulated)" : ""}.</span>
          <button onClick={() => { window.location.href = `/review/collections/${workup.reviewSetId}`; }} style={{ fontSize: 11.5, fontWeight: 600, padding: "6px 11px", borderRadius: 7, cursor: "pointer", background: C.cy, color: C.bg, border: "none" }}>Open collection →</button>
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
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 5 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.t3 }}>Source letter / allegation</div>
                <button type="button" onClick={() => setSource(SAMPLE_ALLEGATION)} style={{ fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 6, cursor: "pointer", background: "transparent", color: C.cy, border: `1px solid ${C.cy}` }}>Insert sample allegation</button>
              </div>
              <textarea value={source} onChange={(e) => setSource(e.target.value)} rows={9} placeholder={SAMPLE_PLACEHOLDER} style={{ ...inp, resize: "vertical", fontFamily: M, fontSize: 12.5, lineHeight: 1.55 }} />
              <div style={{ fontSize: 11, color: C.t4, marginTop: 5 }}>No letter yet? Fill the template above, or click <b>Insert sample allegation</b> to load a worked example you can edit.</div>
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

function ChronologyPanel({ matterId }) {
  const [facts, setFacts] = useState(null);
  const [sugg, setSugg] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => fetch(`/api/investigations/${matterId}/chronology`).then((r) => r.json()).then((d) => setFacts(d.ok ? d.facts : [])).catch(() => setFacts([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [matterId]);

  const suggest = async () => {
    setBusy(true);
    try { const r = await fetch(`/api/investigations/${matterId}/chronology/suggest`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ limit: 25 }) }); const d = await r.json(); setSugg(d.ok ? d.suggestions : []); }
    catch { setSugg([]); } finally { setBusy(false); }
  };
  const add = async (s) => {
    await fetch(`/api/investigations/${matterId}/chronology`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reviewSetItemId: s.reviewSetItemId, occurredOn: s.occurredOn, label: s.label, sourceQuote: s.sourceQuote, issueKeys: s.issueKeys }) });
    setSugg((prev) => prev.filter((x) => x.reviewSetItemId !== s.reviewSetItemId));
    load();
  };
  const remove = async (id) => { await fetch(`/api/investigations/${matterId}/chronology/${id}`, { method: "DELETE" }); load(); };
  const fmt = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "undated");

  return (
    <div style={{ border: `1px solid ${C.br}`, borderRadius: 8, padding: "12px 14px", background: C.bg }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 10.5, fontFamily: M, letterSpacing: .6, textTransform: "uppercase", color: C.am }}>Case chronology {facts ? `(${facts.length})` : ""}</div>
        <button onClick={suggest} disabled={busy} style={{ fontSize: 11.5, fontWeight: 600, padding: "6px 11px", borderRadius: 7, cursor: "pointer", background: "transparent", color: C.am, border: `1px solid ${C.am}` }}>{busy ? "…" : "Suggest facts from collection"}</button>
      </div>

      {facts === null && <div style={{ fontSize: 12, color: C.t4 }}>Loading…</div>}
      {facts && facts.length === 0 && !sugg && <div style={{ fontSize: 12, color: C.t4 }}>No facts yet. Code responsive documents, then suggest facts from the collection.</div>}

      {facts && facts.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 0, marginBottom: sugg ? 14 : 0 }}>
          {facts.map((f) => (
            <div key={f.id} style={{ display: "grid", gridTemplateColumns: "110px 1fr auto", gap: 12, padding: "8px 0", borderBottom: `1px solid ${C.br}44`, alignItems: "start" }}>
              <div style={{ fontFamily: M, fontSize: 11.5, color: f.occurredOn ? C.t2 : C.t4, paddingTop: 1 }}>{fmt(f.occurredOn)}</div>
              <div>
                <div style={{ fontSize: 13, color: C.t1 }}>{f.label}</div>
                {f.sourceQuote && <div style={{ fontSize: 11.5, color: C.t4, marginTop: 2, fontStyle: "italic" }}>“{f.sourceQuote.slice(0, 160)}”</div>}
                {f.issueKeys?.length > 0 && <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>{f.issueKeys.map((k) => <span key={k} style={{ fontSize: 9.5, color: C.pp, border: `1px solid ${C.pp}`, borderRadius: 4, padding: "1px 5px" }}>{k}</span>)}</div>}
              </div>
              <button onClick={() => remove(f.id)} title="Remove fact" style={{ fontSize: 11, color: C.t4, background: "transparent", border: "none", cursor: "pointer" }}>✕</button>
            </div>
          ))}
        </div>
      )}

      {sugg && sugg.length > 0 && (
        <div style={{ borderTop: `1px solid ${C.br}`, paddingTop: 10 }}>
          <div style={{ fontSize: 10.5, fontFamily: M, letterSpacing: .6, textTransform: "uppercase", color: C.t3, marginBottom: 8 }}>Suggested facts — confirm to add</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {sugg.map((s) => (
              <div key={s.reviewSetItemId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, border: `1px solid ${C.br}`, borderRadius: 7, padding: "7px 10px" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, color: C.t1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.label}</div>
                  <div style={{ fontSize: 10.5, color: C.t4, fontFamily: M }}>{s.occurredOn ? new Date(s.occurredOn).toLocaleDateString() : "undated"}</div>
                </div>
                <button onClick={() => add(s)} style={{ fontSize: 11, fontWeight: 600, padding: "5px 10px", borderRadius: 6, cursor: "pointer", background: C.gn, color: C.bg, border: "none" }}>+ Add</button>
              </div>
            ))}
          </div>
        </div>
      )}
      {sugg && sugg.length === 0 && <div style={{ fontSize: 12, color: C.t4, marginTop: 8 }}>No responsive documents to draw facts from yet — code some in the collection first.</div>}
    </div>
  );
}

function ReportModal({ matterId, onClose }) {
  const [report, setReport] = useState(null);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    fetch(`/api/investigations/${matterId}/report`).then((r) => r.json()).then((d) => { if (d.ok) setReport(d.report); else setErr(d.error || "Failed"); }).catch((e) => setErr(String(e)));
  }, [matterId]);
  const copy = () => { if (report && navigator?.clipboard) { navigator.clipboard.writeText(report.markdown); setCopied(true); setTimeout(() => setCopied(false), 1800); } };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(4,7,15,.72)", zIndex: 1200, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: F, padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 720, maxWidth: "96%", maxHeight: "90vh", overflow: "auto", background: C.cd, border: `1px solid ${C.brL}`, borderRadius: 14, padding: "24px 26px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <div style={{ fontFamily: SR, fontSize: 19, fontWeight: 600 }}>Findings report</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={copy} disabled={!report} style={{ fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 7, cursor: "pointer", background: "transparent", color: C.cy, border: `1px solid ${C.cy}` }}>{copied ? "Copied ✓" : "Copy Markdown"}</button>
            <button onClick={onClose} style={{ fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 7, cursor: "pointer", background: "transparent", color: C.t3, border: `1px solid ${C.t3}` }}>Close</button>
          </div>
        </div>
        {err && <div style={{ fontSize: 12, color: C.rd }}>{err}</div>}
        {!report && !err && <div style={{ fontSize: 12, color: C.t4, fontFamily: M }}>Assembling report…</div>}
        {report && (
          <div>
            <div style={{ fontSize: 12.5, color: C.t3, marginBottom: 14 }}>{report.matterTitle}{report.matterNumber ? ` · ${report.matterNumber}` : ""} — {report.stats.responsive} responsive / {report.stats.collected} collected · {report.chronology.length} facts</div>
            <pre style={{ whiteSpace: "pre-wrap", fontFamily: M, fontSize: 12.5, lineHeight: 1.6, color: C.t1, background: C.bg, border: `1px solid ${C.br}`, borderRadius: 10, padding: "16px 18px", margin: 0 }}>{report.markdown}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
