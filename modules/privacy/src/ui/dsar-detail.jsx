import { useState, useEffect, useCallback } from "react";
import { C, F, M, SR } from "@aegis/ui";

// ── DSAR workspace (per-request) ─────────────────────────────────────
// The end-to-end case-handling surface: lifecycle stepper + tabs for
// Identity, Data inventory, AI relevance review, and Delivery.

const STAGES = [
  { status: "RECEIVED", label: "Intake" },
  { status: "VERIFYING", label: "Identity" },
  { status: "IN_PROGRESS", label: "Collect" },
  { status: "AWAITING_REVIEW", label: "Review" },
  { status: "FULFILLED", label: "Deliver" },
];
const NEXT = {
  RECEIVED: ["VERIFYING", "IN_PROGRESS", "REJECTED", "WITHDRAWN"],
  VERIFYING: ["IN_PROGRESS", "REJECTED", "WITHDRAWN"],
  IN_PROGRESS: ["AWAITING_REVIEW", "REJECTED", "WITHDRAWN"],
  AWAITING_REVIEW: ["IN_PROGRESS", "REJECTED", "WITHDRAWN"],
  FULFILLED: [], REJECTED: [], WITHDRAWN: [],
};
const STATUS_COLOR = { RECEIVED: C.t3, VERIFYING: C.am, IN_PROGRESS: C.bl, AWAITING_REVIEW: C.pp, FULFILLED: C.gn, REJECTED: C.rd, WITHDRAWN: C.t4 };
const VERDICT_COLOR = { RELEVANT: C.gn, NOT_RELEVANT: C.t4, UNCLEAR: C.am };

const btn = (bg, fg) => ({ padding: "6px 12px", background: bg, color: fg || C.bg, border: "none", borderRadius: 5, fontFamily: M, fontSize: 9.5, letterSpacing: .8, fontWeight: 700, textTransform: "uppercase", cursor: "pointer" });
const ghost = (col) => ({ padding: "6px 12px", background: "transparent", color: col, border: `1px solid ${col}`, borderRadius: 5, fontFamily: M, fontSize: 9.5, letterSpacing: .8, fontWeight: 600, textTransform: "uppercase", cursor: "pointer" });
const input = { width: "100%", background: C.bg, border: `1px solid ${C.br}`, borderRadius: 5, color: C.t1, fontFamily: F, fontSize: 12, padding: "7px 9px", outline: "none", boxSizing: "border-box" };
const lbl = { fontSize: 8.5, fontFamily: M, letterSpacing: .8, textTransform: "uppercase", color: C.t3, marginBottom: 3 };
const card = { padding: "12px 14px", background: C.cd, border: `1px solid ${C.br}`, borderRadius: 8, marginBottom: 10 };

async function api(url, opts) {
  const r = await fetch(url, opts);
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.ok === false) throw new Error(d.error || `HTTP ${r.status}`);
  return d;
}

// ONE navigation row that is both progress and tabs. Each phase maps 1:1 to
// the lifecycle stage AND the work tab, so there's a single row (no redundant
// stepper + tab-strip). The bar shows case progress; the label is the tab.
const PHASES = [
  { tab: "overview", label: "Overview", stageIdx: 0 },
  { tab: "identity", label: "Identity", stageIdx: 1 },
  { tab: "inventory", label: "Data inventory", stageIdx: 2 },
  { tab: "review", label: "Review", stageIdx: 3 },
  { tab: "delivery", label: "Delivery", stageIdx: 4 },
];

function PhaseNav({ status, activeTab, onTab }) {
  const caseIdx = STAGES.findIndex((s) => s.status === status);
  const terminal = ["REJECTED", "WITHDRAWN"].includes(status);
  return (
    <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
      {PHASES.map((p) => {
        const done = !terminal && caseIdx >= 0 && p.stageIdx < caseIdx;
        const cur = !terminal && p.stageIdx === caseIdx;
        const barCol = terminal ? C.t4 : done ? C.gn : cur ? C.cy : C.br;
        const active = activeTab === p.tab;
        return (
          <div key={p.tab} onClick={() => onTab(p.tab)} style={{ flex: 1, textAlign: "center", cursor: "pointer", paddingBottom: 5, borderBottom: `2px solid ${active ? C.cy : "transparent"}` }}>
            <div style={{ height: 4, background: barCol, borderRadius: 2 }} />
            <div style={{ fontSize: 9.5, fontFamily: M, letterSpacing: .4, marginTop: 5, color: active ? C.cy : cur ? C.t1 : C.t3 }}>
              {done ? "✓ " : ""}{p.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function OverviewTab({ req, me, reload, toast }) {
  const [crit, setCrit] = useState(req.relevanceCriteria || "");
  const [summary, setSummary] = useState(req.subjectSummary || "");
  const patch = async (body, msg) => { try { await api(`/api/privacy/dsar/${req.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); toast(msg); reload(); } catch (e) { toast(String(e.message || e), true); } };
  const transition = async (toStatus) => { try { await api(`/api/privacy/dsar/${req.id}/transition`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ toStatus }) }); toast(`Moved to ${toStatus.replace(/_/g, " ")}`); reload(); } catch (e) { toast(String(e.message || e), true); } };
  const extend = async () => { try { await api(`/api/privacy/dsar/${req.id}/extend`, { method: "POST" }); toast("Deadline extended"); reload(); } catch (e) { toast(String(e.message || e), true); } };
  return (
    <div>
      <div style={card}>
        <div style={lbl}>Handler (DPO)</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: req.assignedToName ? C.t1 : C.t4 }}>{req.assignedToName || "Unassigned"}</span>
          {me && req.assignedToUserId !== me.id && <button onClick={() => patch({ assignedToUserId: me.id }, "Assigned to you")} style={ghost(C.bl)}>Assign to me</button>}
          {req.assignedToUserId && <button onClick={() => patch({ assignedToUserId: "" }, "Unassigned")} style={ghost(C.t3)}>Unassign</button>}
        </div>
      </div>
      <div style={card}>
        <div style={lbl}>Relevance criteria (drives AI review)</div>
        <textarea value={crit} onChange={(e) => setCrit(e.target.value)} rows={3} style={{ ...input, resize: "vertical" }} />
        <div style={{ marginTop: 6 }}><button onClick={() => patch({ relevanceCriteria: crit }, "Criteria saved")} style={btn(C.gn)}>Save criteria</button></div>
      </div>
      <div style={card}>
        <div style={lbl}>Case summary</div>
        <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} style={{ ...input, resize: "vertical" }} />
        <div style={{ marginTop: 6 }}><button onClick={() => patch({ subjectSummary: summary }, "Summary saved")} style={btn(C.gn)}>Save summary</button></div>
      </div>
      <div style={card}>
        <div style={lbl}>Lifecycle</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
          {(NEXT[req.status] || []).map((s) => <button key={s} onClick={() => transition(s)} style={ghost(STATUS_COLOR[s] || C.t2)}>{s === "IN_PROGRESS" && req.status === "AWAITING_REVIEW" ? "← Back to collect" : "→ " + s.replace(/_/g, " ")}</button>)}
          {!req.extended && !["FULFILLED", "REJECTED", "WITHDRAWN"].includes(req.status) && <button onClick={extend} style={ghost(C.am)}>Extend deadline</button>}
          {(NEXT[req.status] || []).length === 0 && <span style={{ fontSize: 11, color: C.t4, fontStyle: "italic" }}>Terminal — no further transitions.</span>}
        </div>
        <div style={{ fontSize: 10, color: C.t4, fontFamily: M, marginTop: 8 }}>Fulfilment happens on the Delivery tab (assembles + delivers the package).</div>
      </div>
    </div>
  );
}

function IdentityTab({ req, reload, toast }) {
  const [method, setMethod] = useState(req.verificationMethod || "");
  const record = async (outcome) => { try { await api(`/api/privacy/dsar/${req.id}/verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ outcome, method }) }); toast(`Identity ${outcome.toLowerCase()}`); reload(); } catch (e) { toast(String(e.message || e), true); } };
  return (
    <div style={card}>
      <div style={lbl}>Verification status</div>
      <div style={{ fontSize: 14, color: req.verificationStatus === "VERIFIED" ? C.gn : req.verificationStatus === "FAILED" ? C.rd : C.am, marginBottom: 10 }}>{req.verificationStatus}{req.verifiedAt ? ` · ${new Date(req.verifiedAt).toLocaleDateString()}` : ""}</div>
      <div style={lbl}>Method</div>
      <input value={method} onChange={(e) => setMethod(e.target.value)} placeholder="passport / knowledge-based / portal-login" style={{ ...input, marginBottom: 10 }} />
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => record("VERIFIED")} style={btn(C.gn)}>Mark verified</button>
        <button onClick={() => record("IN_PROGRESS")} style={ghost(C.am)}>In progress</button>
        <button onClick={() => record("FAILED")} style={ghost(C.rd)}>Failed</button>
      </div>
      <div style={{ fontSize: 10, color: C.t4, fontFamily: M, marginTop: 8 }}>Identity must be VERIFIED before collection can start — the request cannot leave the Identity stage otherwise.</div>
    </div>
  );
}

function InventoryTab({ req, reload, toast }) {
  const [locs, setLocs] = useState(null);
  const [add, setAdd] = useState({ system: "", dataType: "" });
  const load = useCallback(() => { fetch(`/api/privacy/dsar/${req.id}/inventory`).then((r) => r.json()).then((d) => d.ok && setLocs(d.locations)).catch(() => {}); }, [req.id]);
  useEffect(() => { load(); }, [load]);
  const seed = async () => { try { const d = await api(`/api/privacy/dsar/${req.id}/inventory`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ seed: true }) }); toast(`Seeded ${d.seeded.created} location(s) from ROPA`); setLocs(d.locations); } catch (e) { toast(String(e.message || e), true); } };
  const discover = async () => { try { const d = await api(`/api/privacy/dsar/${req.id}/inventory`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ discover: true }) }); toast(`Discovered ${d.discovered.created} M365 source(s)${d.discovered.simulated ? " (simulated — no tenant)" : " from Microsoft 365"}`); setLocs(d.locations); } catch (e) { toast(String(e.message || e), true); } };
  const addLoc = async () => { try { await api(`/api/privacy/dsar/${req.id}/inventory`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(add) }); setAdd({ system: "", dataType: "" }); load(); } catch (e) { toast(String(e.message || e), true); } };
  const upd = async (locationId, body) => { try { await api(`/api/privacy/dsar/${req.id}/inventory`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locationId, ...body }) }); load(); } catch (e) { toast(String(e.message || e), true); } };
  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <button onClick={discover} style={btn(C.tl)}>⚡ Discover from Microsoft 365</button>
        <button onClick={seed} style={ghost(C.tl)}>⤵ Seed from ROPA</button>
      </div>
      <div style={{ ...card, padding: "10px 12px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "end" }}>
          <div><div style={lbl}>System</div><input value={add.system} onChange={(e) => setAdd((s) => ({ ...s, system: e.target.value }))} style={input} /></div>
          <div><div style={lbl}>Data type</div><input value={add.dataType} onChange={(e) => setAdd((s) => ({ ...s, dataType: e.target.value }))} style={input} /></div>
          <button disabled={!add.system.trim() || !add.dataType.trim()} onClick={addLoc} style={btn(C.cy)}>Add</button>
        </div>
      </div>
      {!locs ? <div style={{ fontSize: 11, color: C.t4, fontFamily: M }}>Loading…</div>
        : locs.length === 0 ? <div style={{ fontSize: 11, color: C.t4, fontStyle: "italic" }}>No data locations mapped. Seed from ROPA or add one.</div>
        : locs.map((l) => (
          <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: `1px solid ${C.br}22` }}>
            <div style={{ flex: 1 }}><span style={{ fontSize: 12, color: C.t1 }}>{l.system}</span> <span style={{ fontSize: 10, color: C.t4, fontFamily: M }}>· {l.dataType}</span></div>
            <button onClick={() => upd(l.id, { found: !l.found })} style={ghost(l.found ? C.gn : C.t4)}>{l.found ? "✓ Found" : "Found?"}</button>
            <button onClick={() => upd(l.id, { redactionsRequired: !l.redactionsRequired })} style={ghost(l.redactionsRequired ? C.am : C.t4)}>{l.redactionsRequired ? "Redact" : "No redact"}</button>
            <button onClick={() => upd(l.id, { retrieved: !l.retrievedAt })} style={ghost(l.retrievedAt ? C.bl : C.t4)}>{l.retrievedAt ? "Retrieved" : "Retrieve"}</button>
          </div>
        ))}
    </div>
  );
}

const SOURCE_LABEL = { MAILBOX: "Mailbox", ONEDRIVE: "OneDrive", TEAMS: "Teams", SHAREPOINT: "SharePoint" };

function M365CollectPanel({ req, onCollected, toast }) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sources, setSources] = useState({ MAILBOX: true, ONEDRIVE: true, TEAMS: true, SHAREPOINT: false });
  const [preview, setPreview] = useState(null);
  const [adv, setAdv] = useState(false);
  const [nl, setNl] = useState("");
  const [kql, setKql] = useState("");
  useEffect(() => { fetch(`/api/privacy/dsar/${req.id}/collect`).then((r) => r.json()).then((d) => d.ok && setStatus(d.status)).catch(() => {}); }, [req.id]);
  const selected = Object.keys(sources).filter((k) => sources[k]);
  const toggle = (k) => setSources((s) => ({ ...s, [k]: !s[k] }));
  const queryString = adv && kql.trim() ? kql.trim() : undefined;

  const draft = async () => {
    if (!nl.trim()) return;
    setBusy(true);
    try {
      const d = await api(`/api/privacy/dsar/${req.id}/collect`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draft: true, naturalLanguage: nl }) });
      setKql(d.queryString); toast(d.rationale);
    } catch (e) { toast(String(e.message || e), true); } finally { setBusy(false); }
  };
  const runPreview = async () => {
    setBusy(true); setPreview(null);
    try {
      const d = await api(`/api/privacy/dsar/${req.id}/collect`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ preview: true, sources: selected, queryString }) });
      setPreview(d.preview);
    } catch (e) { toast(String(e.message || e), true); } finally { setBusy(false); }
  };
  const collect = async () => {
    setBusy(true);
    try {
      const d = await api(`/api/privacy/dsar/${req.id}/collect`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sources: selected, queryString }) });
      toast(`Collected ${d.added} record(s)${d.duplicates ? `, ${d.duplicates} already present` : ""}${d.simulated ? " (simulated)" : " from Microsoft 365"}`);
      setPreview(null); onCollected();
    } catch (e) { toast(String(e.message || e), true); } finally { setBusy(false); }
  };
  const connected = status?.mode === "real" && status?.configured;
  return (
    <div style={{ ...card, borderLeft: `3px solid ${connected ? C.gn : C.am}` }}>
      <div style={{ fontSize: 12.5, color: C.t1, fontWeight: 600 }}>⚡ Search Microsoft 365 (E5 / Purview)</div>
      <div style={{ fontSize: 10.5, fontFamily: M, color: connected ? C.gn : C.am, marginTop: 3, marginBottom: 8 }}>
        {status == null ? "Checking connection…" : connected ? `Connected · tenant ${status.tenantIdMasked || "—"}` : "No tenant connected — search runs in simulation. Connect at /admin/m365."}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8, alignItems: "center" }}>
        {Object.keys(SOURCE_LABEL).map((k) => (
          <button key={k} onClick={() => toggle(k)} style={sources[k] ? btn(C.tl) : ghost(C.t3)}>{SOURCE_LABEL[k]}</button>
        ))}
        <span onClick={() => setAdv((a) => !a)} style={{ marginLeft: "auto", cursor: "pointer", fontSize: 10, fontFamily: M, color: adv ? C.cy : C.t3 }}>{adv ? "▾" : "▸"} Advanced (KQL)</span>
      </div>
      {adv && (
        <div style={{ marginBottom: 8, padding: "9px 11px", background: C.bg, borderRadius: 6, border: `1px solid ${C.br}` }}>
          <div style={{ ...lbl, color: C.pp }}>Natural language → KeyQL (attorney edits before running)</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            <input value={nl} onChange={(e) => setNl(e.target.value)} placeholder='e.g. invoices and approvals mentioning "vendorx" since Jan 2026' style={{ ...input, flex: 1 }} />
            <button disabled={busy || !nl.trim()} onClick={draft} style={btn(C.pp)}>Draft</button>
          </div>
          <textarea value={kql} onChange={(e) => setKql(e.target.value)} rows={2} placeholder="KeyQL query — leave blank to search by the subject's identity" style={{ ...input, resize: "vertical", fontFamily: M, fontSize: 11 }} />
          <div style={{ fontSize: 9.5, color: C.t4, fontFamily: M, marginTop: 4 }}>When set, Preview/Collect run this scoped query instead of the identity search.</div>
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button disabled={busy || selected.length === 0} onClick={runPreview} style={ghost(C.bl)}>{busy && !preview ? "Searching…" : "Preview"}</button>
        <button disabled={busy || selected.length === 0} onClick={collect} style={btn(C.tl)}>{busy ? "…" : "Search & collect"}</button>
      </div>
      {preview && (
        <div style={{ marginTop: 10, padding: "10px 12px", background: C.bg, border: `1px solid ${C.br}`, borderRadius: 6 }}>
          <div style={{ fontSize: 11, fontFamily: M, color: C.t2 }}>{preview.total} hit(s) · <b style={{ color: C.gn }}>{preview.fresh} new</b>{preview.duplicates ? ` · ${preview.duplicates} already in queue` : ""}{preview.simulated ? " · simulated" : ""}</div>
          <div style={{ marginTop: 6 }}>
            {preview.bySource.length === 0 ? <div style={{ fontSize: 11, color: C.t4 }}>No hits for the selected sources.{connected && !preview.simulated ? " Connected, but Graph returned nothing — confirm the app registration has Mail.Read + Files.Read.All application permissions with admin consent, and that the data subject's mailbox/OneDrive has content." : ""}</div>
              : preview.bySource.map((b) => (
                <div key={b.sourceType} style={{ padding: "5px 0", borderTop: `1px solid ${C.br}22` }}>
                  <div style={{ fontSize: 11, color: C.t1 }}><b>{SOURCE_LABEL[b.sourceType]}</b> — {b.total} hit(s), {b.fresh} new</div>
                  {b.samples.map((s, i) => <div key={i} style={{ fontSize: 10, color: C.t4, fontFamily: M, paddingLeft: 8 }}>· {s}</div>)}
                </div>
              ))}
          </div>
          {preview.fresh > 0 && <button disabled={busy} onClick={collect} style={{ ...btn(C.gn), marginTop: 8 }}>Collect {preview.fresh} new →</button>}
        </div>
      )}
      <div style={{ fontSize: 10, color: C.t4, fontFamily: M, marginTop: 8 }}>Sweeps the data subject's identifiers across the selected sources; hits land in the review queue below for AI relevance + human validation.</div>
    </div>
  );
}

function ValidationStrip({ requestId, refreshKey }) {
  const [v, setV] = useState(null);
  useEffect(() => { fetch(`/api/privacy/dsar/${requestId}/validation`).then((r) => r.json()).then((d) => d.ok && setV(d.validation)).catch(() => {}); }, [requestId, refreshKey]);
  if (!v || v.coded === 0) return null;
  const pct = (x) => (x == null ? "—" : `${Math.round(x * 100)}%`);
  const m = v.metrics;
  const cell = (label, val, ci) => (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 16, fontFamily: SR, color: C.t1 }}>{val}</div>
      <div style={{ fontSize: 8.5, fontFamily: M, letterSpacing: .8, textTransform: "uppercase", color: C.t3 }}>{label}</div>
      {ci && <div style={{ fontSize: 8.5, fontFamily: M, color: C.t4 }}>95% {pct(ci.low)}–{pct(ci.high)}</div>}
    </div>
  );
  return (
    <div style={{ ...card, display: "flex", gap: 14, alignItems: "flex-start" }}>
      <div style={{ flex: "0 0 auto", paddingRight: 8 }}>
        <div style={{ fontSize: 12.5, color: C.t1, fontWeight: 600 }}>Review validation</div>
        <div style={{ fontSize: 9.5, color: C.t4, fontFamily: M, marginTop: 2 }}>AI vs human · {v.coded} coded</div>
      </div>
      {cell("Recall", pct(m.recall), m.recallCI)}
      {cell("Precision", pct(m.precision), m.precisionCI)}
      {cell("F1", pct(m.f1))}
      {cell("Overturn", pct(v.overturn.rate))}
    </div>
  );
}

function ReviewTab({ req, reload, toast, goTab }) {
  const [items, setItems] = useState(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { fetch(`/api/privacy/dsar/${req.id}/review`).then((r) => r.json()).then((d) => d.ok && setItems(d.items)).catch(() => {}); }, [req.id]);
  useEffect(() => { load(); }, [load]);
  const addItems = async () => {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return;
    const parsed = lines.map((l) => { const [system, ...rest] = l.split("|"); return rest.length ? { sourceSystem: system.trim(), title: rest.join("|").trim() } : { sourceSystem: "manual", title: l }; });
    try { await api(`/api/privacy/dsar/${req.id}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: parsed }) }); setText(""); load(); } catch (e) { toast(String(e.message || e), true); }
  };
  const runAI = async () => { setBusy(true); try { const d = await api(`/api/privacy/dsar/${req.id}/review/run`, { method: "POST" }); toast(`AI scored ${d.scored} item(s) · ${d.relevant} relevant${d.degraded ? " (deterministic)" : " (AI)"}`); load(); } catch (e) { toast(String(e.message || e), true); } finally { setBusy(false); } };
  const acceptAll = async () => { setBusy(true); try { const d = await api(`/api/privacy/dsar/${req.id}/review/accept-all`, { method: "POST" }); toast(`Accepted ${d.accepted} AI verdict(s) · ${d.relevant} relevant`); load(); } catch (e) { toast(String(e.message || e), true); } finally { setBusy(false); } };
  const validate = async (itemId, body) => { try { await api(`/api/privacy/dsar/${req.id}/review/${itemId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); load(); } catch (e) { toast(String(e.message || e), true); } };
  const all = items || [];
  const total = all.length;
  const pending = all.filter((i) => i.reviewDecision === "PENDING").length;
  const aiScored = all.filter((i) => i.aiVerdict).length;
  const aiPending = all.filter((i) => i.reviewDecision === "PENDING" && i.aiVerdict).length;
  const validated = total - pending;
  const validatedCount = all.filter((i) => i.reviewDecision !== "PENDING" && i.aiVerdict).length;
  const step = (n, label, done, active) => (
    <div style={{ flex: 1, textAlign: "center" }}>
      <div style={{ width: 20, height: 20, margin: "0 auto", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontFamily: M, fontWeight: 700, color: done || active ? C.bg : C.t3, background: done ? C.gn : active ? C.pp : "transparent", border: `1px solid ${done ? C.gn : active ? C.pp : C.br}` }}>{done ? "✓" : n}</div>
      <div style={{ fontSize: 8.5, fontFamily: M, letterSpacing: .4, textTransform: "uppercase", color: active ? C.pp : done ? C.gn : C.t4, marginTop: 4 }}>{label}</div>
    </div>
  );
  return (
    <div>
      <M365CollectPanel req={req} onCollected={load} toast={toast} />

      {/* Full reviewer — shared @aegis/review engine (AI tags, threading, families, coding, production) */}
      <div style={{ ...card, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12.5, color: C.t1, fontWeight: 600 }}>Collect &amp; Review workspace</div>
          <div style={{ fontSize: 10, color: C.t4, fontFamily: M, marginTop: 2 }}>Work the subject&apos;s data in the full reviewer — the same engine legal hold uses: AI tags + routing, email threading / near-dup / families, multi-dimension coding, and a delivery-ready production.</div>
        </div>
        <button onClick={() => { window.location.href = `/privacy/dsar/${req.id}/review`; }} style={{ ...btn(C.bl), whiteSpace: "nowrap" }}>Open workspace →</button>
      </div>

      {/* AI-assisted relevance review — the aiR flow, human-gated */}
      <div style={{ ...card }}>
        <div style={{ fontSize: 12.5, color: C.t1, fontWeight: 600, marginBottom: 2 }}>AI-assisted relevance review</div>
        <div style={{ fontSize: 10, color: C.t4, fontFamily: M, marginBottom: 10 }}>AI proposes a verdict for every record; a human confirms or overrides. The AI never finalises.</div>
        <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
          {step(1, "Collect", total > 0, total === 0)}
          {step(2, "Run AI", aiScored > 0 && pending === 0 ? false : aiScored >= total && total > 0, total > 0 && aiScored < total)}
          {step(3, "Validate", validated > 0, aiScored > 0 && pending > 0)}
          {step(4, "Scale", pending === 0 && total > 0, false)}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button disabled={busy || pending === 0} onClick={runAI} style={btn(C.pp)}>{busy ? "Scoring…" : `✨ Run AI review (${pending})`}</button>
          <button disabled={busy || aiPending === 0} onClick={acceptAll} title="Confirm every pending item at the AI verdict — the reviewer applies the model at scale after validating a sample." style={aiPending > 0 ? btn(C.gn) : ghost(C.t4)}>✓ Accept all AI ({aiPending})</button>
          {total > 0 && pending === 0 && <button onClick={() => goTab && goTab("delivery")} style={btn(C.cy)}>Proceed to delivery →</button>}
          <span style={{ marginLeft: "auto", fontSize: 10, fontFamily: M, color: C.t3, alignSelf: "center" }}>{validated}/{total} coded</span>
        </div>
      </div>

      <ValidationStrip requestId={req.id} refreshKey={validatedCount} />

      <div style={{ ...card, padding: "10px 12px" }}>
        <div style={lbl}>Or add records manually (one per line — optionally "System | Title")</div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} style={{ ...input, resize: "vertical", fontFamily: M, fontSize: 11 }} placeholder={"Salesforce CRM | Account note mentioning the data subject"} />
        <div style={{ marginTop: 6 }}><button onClick={addItems} style={ghost(C.cy)}>Add to queue</button></div>
      </div>
      {!items ? <div style={{ fontSize: 11, color: C.t4, fontFamily: M }}>Loading…</div>
        : items.length === 0 ? <div style={{ fontSize: 11, color: C.t4, fontStyle: "italic" }}>No records collected yet.</div>
        : items.map((it) => (
          <div key={it.id} style={{ ...card, marginBottom: 8, borderLeft: `3px solid ${it.reviewDecision !== "PENDING" ? (it.finalRelevant ? C.gn : C.t4) : (VERDICT_COLOR[it.aiVerdict] || C.br)}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, color: C.t1 }}>{it.title}</div>
                <div style={{ fontSize: 9.5, color: C.t4, fontFamily: M }}>{it.sourceSystem}</div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                {it.aiVerdict && <div style={{ fontSize: 10, fontFamily: M, color: VERDICT_COLOR[it.aiVerdict] }} title="AI verdict and its relevance confidence">{it.aiVerdict.replace(/_/g, " ")}{it.aiScore != null ? ` · ${Math.round(it.aiScore * 100)}% rel.` : ""}</div>}
                <div style={{ fontSize: 9, fontFamily: M, color: it.reviewDecision === "PENDING" ? C.am : it.finalRelevant ? C.gn : C.t4 }}>{it.reviewDecision === "PENDING" ? "PENDING" : it.reviewDecision === "CONFIRMED" ? "✓ CONFIRMED" : "OVERRIDDEN"}{it.reviewDecision !== "PENDING" ? (it.finalRelevant ? " · relevant" : " · excluded") : ""}</div>
              </div>
            </div>
            {it.excerpt && <div style={{ fontSize: 11, color: C.t2, marginTop: 6, padding: "8px 10px", background: C.bg, border: `1px solid ${C.br}`, borderRadius: 5, lineHeight: 1.5, maxHeight: 88, overflow: "auto" }}>{it.excerpt}</div>}
            {it.aiRationale && <div style={{ fontSize: 10.5, color: C.t3, marginTop: 5, fontStyle: "italic" }}>🤖 {it.aiRationale}</div>}
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              <button onClick={() => validate(it.id, { decision: "CONFIRMED" })} style={ghost(C.gn)}>✓ Confirm</button>
              <button onClick={() => validate(it.id, { decision: "OVERRIDDEN", finalRelevant: true })} style={ghost(C.bl)}>Mark relevant</button>
              <button onClick={() => validate(it.id, { decision: "OVERRIDDEN", finalRelevant: false })} style={ghost(C.t3)}>Exclude</button>
              <button onClick={() => validate(it.id, { decision: it.reviewDecision === "PENDING" ? "CONFIRMED" : it.reviewDecision, redact: !it.redact })} style={ghost(it.redact ? C.am : C.t4)}>{it.redact ? "Redacted" : "Redact"}</button>
            </div>
          </div>
        ))}
    </div>
  );
}

function DeliveryTab({ req, reload, toast }) {
  const [pkg, setPkg] = useState(null);
  const [conflict, setConflict] = useState(null);
  const [result, setResult] = useState(null);
  const isErasure = req.requestType === "ERASURE";
  const loadPkg = useCallback(() => { fetch(`/api/privacy/dsar/${req.id}/deliver`).then((r) => r.json()).then((d) => d.ok && setPkg(d.package)).catch(() => {}); if (isErasure) fetch(`/api/privacy/dsar/${req.id}/hold-conflict`).then((r) => r.json()).then((d) => d.ok && setConflict(d.conflict)).catch(() => {}); }, [req.id, isErasure]);
  useEffect(() => { loadPkg(); }, [loadPkg]);
  const override = async () => { const reason = window.prompt("Reason for overriding the legal-hold conflict:"); if (!reason) return; try { const d = await api(`/api/privacy/dsar/${req.id}/hold-conflict`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) }); setConflict(d.conflict); toast("Override recorded"); } catch (e) { toast(String(e.message || e), true); } };
  const deliver = async () => { try { const d = await api(`/api/privacy/dsar/${req.id}/deliver`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel: "portal" }) }); setResult(d); toast(d.emailDelivered ? "Delivered — email sent" : "Delivered (email not configured)"); reload(); } catch (e) { toast(String(e.message || e), true); } };
  return (
    <div>
      {isErasure && conflict && (
        <div style={{ ...card, borderLeft: `3px solid ${conflict.count > 0 && !conflict.overridden ? C.rd : C.gn}` }}>
          <div style={lbl}>Legal-hold conflict (erasure)</div>
          {conflict.count === 0 ? <div style={{ fontSize: 12, color: C.gn }}>✓ No active legal hold preserves this data subject's data.</div>
            : <div>
                <div style={{ fontSize: 12, color: conflict.overridden ? C.am : C.rd }}>{conflict.count} active hold(s) preserve this data — erasure {conflict.overridden ? "overridden" : "blocked"}.</div>
                {conflict.holds.map((h) => <div key={h.holdId} style={{ fontSize: 10.5, color: C.t3, fontFamily: M, marginTop: 3 }}>· {h.title} ({h.holdNumber || h.holdId.slice(0, 8)}) — {h.status}</div>)}
                {conflict.overridden ? <div style={{ fontSize: 10.5, color: C.am, marginTop: 5 }}>Override: {conflict.overrideReason}</div> : <button onClick={override} style={{ ...ghost(C.rd), marginTop: 8 }}>Override with reason</button>}
              </div>}
        </div>
      )}
      <div style={card}>
        <div style={lbl}>Response package (from validated, relevant records)</div>
        {!pkg ? <div style={{ fontSize: 11, color: C.t4 }}>Loading…</div>
          : <div style={{ display: "flex", gap: 14, marginTop: 4 }}>
              <div><div style={{ fontSize: 20, fontFamily: SR, color: C.gn }}>{pkg.includedCount}</div><div style={lbl}>Included</div></div>
              <div><div style={{ fontSize: 20, fontFamily: SR, color: C.am }}>{pkg.redactedCount}</div><div style={lbl}>Redacted</div></div>
              <div><div style={{ fontSize: 20, fontFamily: SR, color: C.t3 }}>{pkg.excludedCount}</div><div style={lbl}>Excluded</div></div>
              <div><div style={{ fontSize: 20, fontFamily: SR, color: C.bl }}>{pkg.dataLocationsWithData}</div><div style={lbl}>Systems w/ data</div></div>
            </div>}
      </div>
      {req.status === "FULFILLED" || result ? (
        <div style={{ ...card, borderLeft: `3px solid ${C.gn}` }}>
          <div style={{ fontSize: 13, color: C.gn }}>✓ Fulfilled{req.deliveredAt ? ` · ${new Date(req.deliveredAt).toLocaleDateString()}` : ""}</div>
          {result?.portalUrl && <div style={{ fontSize: 10.5, color: C.t3, fontFamily: M, marginTop: 6, wordBreak: "break-all" }}>Secure link: {result.portalUrl}</div>}
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={deliver} style={btn(C.gn)}>Assemble &amp; deliver</button>
          <a href={`/api/privacy/dsar/${req.id}/export?download=1`} target="_blank" rel="noreferrer" style={{ ...ghost(C.bl), textDecoration: "none", display: "inline-block" }}>⬇ Defensibility export</a>
        </div>
      )}
    </div>
  );
}


export function DsarDetail({ requestId, onClose, onChanged }) {
  const [req, setReq] = useState(null);
  const [tab, setTab] = useState("overview");
  const [me, setMe] = useState(null);
  const [toast, setToast] = useState(null);

  const reload = useCallback(() => {
    fetch(`/api/privacy/dsar/${requestId}`).then((r) => r.json()).then((d) => d.ok && setReq(d.request)).catch(() => {});
    onChanged && onChanged();
  }, [requestId, onChanged]);
  useEffect(() => { reload(); fetch("/api/auth/current-user").then((r) => r.json()).then((d) => setMe(d.user || d)).catch(() => {}); }, [reload]);

  const showToast = (msg, err) => { setToast({ msg, err }); setTimeout(() => setToast(null), 3500); };

  const resetReq = async () => {
    if (!window.confirm("Reset this request? Collected records, data locations, verification and delivery are cleared; the subject stays so you can re-run the demo.")) return;
    try { const r = await fetch(`/api/privacy/dsar/${requestId}/reset`, { method: "POST" }); const d = await r.json(); if (!r.ok || !d.ok) throw new Error(d.error); setTab("overview"); reload(); showToast("Request reset to intake"); }
    catch (e) { showToast(String(e.message || e), true); }
  };
  const deleteReq = async () => {
    if (!window.confirm("Delete this DSAR permanently? This removes the request and all its records.")) return;
    try { const r = await fetch(`/api/privacy/dsar/${requestId}`, { method: "DELETE" }); const d = await r.json(); if (!r.ok || !d.ok) throw new Error(d.error); onChanged && onChanged(); onClose(); }
    catch (e) { showToast(String(e.message || e), true); }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(4,7,15,.72)", zIndex: 1100, display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "4vh 16px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ fontFamily: F, background: C.bg, border: `1px solid ${C.br}`, borderRadius: 10, width: "min(760px,100%)" }}>
        {!req ? <div style={{ padding: 30, color: C.t4, fontFamily: M }}>Loading…</div> : (
          <>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.br}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 9.5, fontFamily: M, letterSpacing: 1.5, color: C.tl, textTransform: "uppercase" }}>{req.requestType} · {req.jurisdiction} · {req.regime}</div>
                  <div style={{ fontSize: 19, fontFamily: SR, color: C.t1 }}>{req.requesterName}</div>
                  {req.requesterEmail && <div style={{ fontSize: 11, color: C.t4, fontFamily: M }}>{req.requesterEmail}</div>}
                </div>
                <div style={{ textAlign: "right" }}>
                  <span style={{ fontSize: 9, fontFamily: M, padding: "2px 8px", borderRadius: 4, color: STATUS_COLOR[req.status], border: `1px solid ${STATUS_COLOR[req.status]}55` }}>{req.status.replace(/_/g, " ")}</span>
                  <div style={{ fontSize: 11, fontFamily: M, marginTop: 6, color: req.daysRemaining < 0 ? C.rd : C.t2 }}>{req.daysRemaining < 0 ? `${Math.abs(req.daysRemaining)}d overdue` : `${req.daysRemaining}d left`}{req.extended ? " ⤴" : ""}</div>
                  <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
                    <span onClick={resetReq} title="Reset for a fresh demo run" style={{ cursor: "pointer", fontSize: 10, fontFamily: M, color: C.am }}>↺ RESET</span>
                    <span onClick={deleteReq} title="Delete this request" style={{ cursor: "pointer", fontSize: 10, fontFamily: M, color: C.rd }}>🗑 DELETE</span>
                    <span onClick={onClose} style={{ cursor: "pointer", fontSize: 10, fontFamily: M, color: C.t3 }}>✕ CLOSE</span>
                  </div>
                </div>
              </div>
              <PhaseNav status={req.status} activeTab={tab} onTab={setTab} />
            </div>
            <div style={{ padding: "16px 20px" }}>
              {toast && <div style={{ marginBottom: 10, fontSize: 11, fontFamily: M, color: toast.err ? C.rd : C.gn }}>{toast.err ? "⚠ " : "✓ "}{toast.msg}</div>}
              {tab === "overview" && <OverviewTab req={req} me={me} reload={reload} toast={showToast} />}
              {tab === "identity" && <IdentityTab req={req} reload={reload} toast={showToast} />}
              {tab === "inventory" && <InventoryTab req={req} reload={reload} toast={showToast} />}
              {tab === "review" && <ReviewTab req={req} reload={reload} toast={showToast} goTab={setTab} />}
              {tab === "delivery" && <DeliveryTab req={req} reload={reload} toast={showToast} />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
