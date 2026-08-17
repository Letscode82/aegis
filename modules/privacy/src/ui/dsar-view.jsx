import { useState, useEffect, useCallback } from "react";
import { C, F, M, SR } from "@aegis/ui";
import { DsarDetail } from "./dsar-detail.jsx";

// ── DSAR command center (Privacy module) ─────────────────────────────
// Centralized request management + operations dashboard + create. Opens the
// per-request workspace (DsarDetail). Reads /api/privacy/dsar/*.

const TYPE_LABEL = { ACCESS: "Access", CORRECTION: "Correction", ERASURE: "Erasure", PORTABILITY: "Portability", OBJECT: "Objection", RESTRICT_PROCESSING: "Restrict" };
const STATUS_COLOR = { RECEIVED: C.t3, VERIFYING: C.am, IN_PROGRESS: C.bl, AWAITING_REVIEW: C.pp, FULFILLED: C.gn, REJECTED: C.rd, WITHDRAWN: C.t4 };
const URGENCY_COLOR = { BREACHED: C.rd, DUE_TODAY: C.or, DUE_SOON: C.am, ON_TRACK: C.gn };

const btn = (bg, fg) => ({ padding: "6px 13px", background: bg, color: fg || C.bg, border: "none", borderRadius: 5, fontFamily: M, fontSize: 10, letterSpacing: 1, fontWeight: 700, textTransform: "uppercase", cursor: "pointer" });
const ghost = (col) => ({ padding: "6px 13px", background: "transparent", color: col, border: `1px solid ${col}`, borderRadius: 5, fontFamily: M, fontSize: 10, letterSpacing: 1, fontWeight: 600, textTransform: "uppercase", cursor: "pointer" });
const input = { width: "100%", background: C.bg, border: `1px solid ${C.br}`, borderRadius: 5, color: C.t1, fontFamily: F, fontSize: 12, padding: "7px 9px", outline: "none", boxSizing: "border-box" };
const lbl = { fontSize: 8.5, fontFamily: M, letterSpacing: .8, textTransform: "uppercase", color: C.t3, marginBottom: 3 };

function Stat({ label, value, color }) {
  return (
    <div style={{ flex: 1, minWidth: 96, padding: "10px 12px", background: C.cd, border: `1px solid ${C.br}`, borderRadius: 8 }}>
      <div style={{ fontSize: 22, fontFamily: SR, color: color || C.t1, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 9, fontFamily: M, letterSpacing: .8, textTransform: "uppercase", color: C.t3, marginTop: 5 }}>{label}</div>
    </div>
  );
}

function DirectoryPicker({ onPick }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState(null);
  const [sim, setSim] = useState(false);
  const [busy, setBusy] = useState(false);
  const search = async () => {
    if (!q.trim()) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/privacy/dsar/directory?q=${encodeURIComponent(q)}`);
      const d = await r.json();
      if (d.ok) { setRows(d.users); setSim(d.simulated); }
    } catch { /* ignore */ } finally { setBusy(false); }
  };
  return (
    <div style={{ marginBottom: 12, padding: "9px 11px", background: C.s1, borderRadius: 6, border: `1px solid ${C.tl}44` }}>
      <div style={{ ...lbl, color: C.tl }}>🔍 Search your Microsoft 365 directory</div>
      <div style={{ display: "flex", gap: 6 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), search())} placeholder="Name or email…" style={{ ...input, flex: 1 }} />
        <button type="button" disabled={busy} onClick={search} style={btn(C.tl)}>{busy ? "…" : "Search"}</button>
      </div>
      {rows && (
        <div style={{ marginTop: 8, maxHeight: 160, overflowY: "auto" }}>
          {rows.length === 0 ? <div style={{ fontSize: 11, color: C.t4, fontFamily: M }}>No matching users.</div>
            : rows.map((u) => (
              <div key={u.id} onClick={() => onPick(u)} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "6px 8px", borderRadius: 5, cursor: "pointer", alignItems: "center" }} onMouseEnter={(e) => (e.currentTarget.style.background = C.cd)} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                <div style={{ minWidth: 0 }}><div style={{ fontSize: 12, color: C.t1 }}>{u.name}</div><div style={{ fontSize: 9.5, color: C.t4, fontFamily: M }}>{u.email}{u.title ? ` · ${u.title}` : ""}</div></div>
                <span style={{ fontSize: 9, fontFamily: M, color: C.tl }}>Use →</span>
              </div>
            ))}
          {sim && <div style={{ fontSize: 9, color: C.am, fontFamily: M, marginTop: 4 }}>⚠ Simulated — no tenant connected. Connect at /admin/m365 to search live users.</div>}
        </div>
      )}
    </div>
  );
}

function CreateDialog({ onClose, onCreated }) {
  const [f, setF] = useState({ requestType: "ACCESS", jurisdiction: "EU", requesterName: "", requesterEmail: "", relevanceCriteria: "", subjectSummary: "" });
  const [busy, setBusy] = useState(false); const [error, setError] = useState(null);
  const upd = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/privacy/dsar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
      const d = await r.json(); if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      onCreated(d.request);
    } catch (e) { setError(String(e.message || e)); } finally { setBusy(false); }
  };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(4,7,15,.72)", zIndex: 1100, display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "6vh 16px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ fontFamily: F, background: C.bg, border: `1px solid ${C.br}`, borderRadius: 10, width: "min(560px,100%)", padding: "18px 20px" }}>
        <div style={{ fontSize: 10, fontFamily: M, letterSpacing: 2, color: C.tl, textTransform: "uppercase" }}>New DSAR</div>
        <div style={{ fontSize: 18, fontFamily: SR, color: C.t1, marginBottom: 14 }}>File a data subject request</div>
        {error && <div style={{ color: C.rd, fontFamily: M, fontSize: 11, marginBottom: 10 }}>⚠ {error}</div>}
        <DirectoryPicker onPick={(u) => setF((s) => ({ ...s, requesterName: u.name, requesterEmail: u.email }))} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div><div style={lbl}>Request type</div><select value={f.requestType} onChange={upd("requestType")} style={input}>{Object.keys(TYPE_LABEL).map((k) => <option key={k} value={k}>{TYPE_LABEL[k]}</option>)}</select></div>
          <div><div style={lbl}>Jurisdiction</div><input value={f.jurisdiction} onChange={upd("jurisdiction")} placeholder="EU / US-CA / …" style={input} /></div>
          <div><div style={lbl}>Requester name</div><input value={f.requesterName} onChange={upd("requesterName")} style={input} /></div>
          <div><div style={lbl}>Requester email</div><input value={f.requesterEmail} onChange={upd("requesterEmail")} style={input} /></div>
        </div>
        <div style={{ marginBottom: 10 }}><div style={lbl}>Relevance criteria (what is in scope)</div><textarea value={f.relevanceCriteria} onChange={upd("relevanceCriteria")} rows={3} style={{ ...input, resize: "vertical" }} placeholder="Records concerning the processing of the data subject's personal data — categories, purposes, recipients, retention…" /></div>
        <div style={{ marginBottom: 14 }}><div style={lbl}>Case summary (optional)</div><input value={f.subjectSummary} onChange={upd("subjectSummary")} style={input} /></div>
        <div style={{ display: "flex", gap: 8 }}>
          <button disabled={busy || !f.requesterName.trim()} onClick={submit} style={btn(C.gn)}>{busy ? "…" : "Create request"}</button>
          <button onClick={onClose} style={ghost(C.t3)}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

export function DsarView() {
  const [rows, setRows] = useState(null);
  const [dash, setDash] = useState(null);
  const [filter, setFilter] = useState({ status: "", overdue: false, mine: false });
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState(null);

  const seedDemo = async () => {
    setSeeding(true); setError(null);
    try {
      const r = await fetch("/api/privacy/dsar/seed-demo", { method: "POST" });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setOpenId(d.requestId);
    } catch (e) { setError(String(e.message || e)); } finally { setSeeding(false); }
  };

  const load = useCallback(() => {
    const qs = new URLSearchParams();
    if (filter.status) qs.set("status", filter.status);
    if (filter.overdue) qs.set("overdue", "1");
    if (filter.mine) qs.set("mine", "1");
    fetch(`/api/privacy/dsar?${qs}`).then((r) => r.json()).then((d) => d.ok ? setRows(d.requests) : setError(d.error)).catch((e) => setError(String(e)));
    fetch("/api/privacy/dsar/dashboard").then((r) => r.json()).then((d) => d.ok && setDash(d.dashboard)).catch(() => {});
  }, [filter]);
  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ fontFamily: F, color: C.t1, padding: "20px 24px", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 10, fontFamily: M, letterSpacing: 2, color: C.tl, textTransform: "uppercase" }}>Privacy &amp; Compliance Ops</div>
          <div style={{ fontSize: 24, fontFamily: SR, color: C.t1 }}>Data Subject Requests</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={seedDemo} disabled={seeding} style={{ ...ghost(C.tl), opacity: seeding ? .6 : 1 }} title="Create (or reset) a controlled Priya Kulkarni demo request">{seeding ? "Seeding…" : "⚡ Seed demo"}</button>
          <button onClick={() => setCreating(true)} style={btn(C.cy)}>+ New request</button>
        </div>
      </div>

      {dash && (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <Stat label="Open" value={dash.totals.open} color={C.bl} />
            <Stat label="Overdue" value={dash.totals.overdue} color={dash.totals.overdue ? C.rd : C.t2} />
            <Stat label="Due soon" value={dash.queueHealth.dueSoon + dash.queueHealth.dueToday} color={C.am} />
            <Stat label="Fulfilled" value={dash.totals.fulfilled} color={C.gn} />
            <Stat label="All-time" value={dash.totals.all} color={C.t2} />
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
            <div style={{ flex: 2, minWidth: 240, padding: "10px 12px", background: C.cd, border: `1px solid ${C.br}`, borderRadius: 8 }}>
              <div style={lbl}>By request type</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                {Object.entries(dash.byType).map(([t, n]) => <span key={t} style={{ fontSize: 11, fontFamily: M, color: C.t2, padding: "2px 8px", border: `1px solid ${C.br}`, borderRadius: 20 }}>{TYPE_LABEL[t] || t} · <b style={{ color: C.t1 }}>{n}</b></span>)}
              </div>
            </div>
            <div style={{ flex: 2, minWidth: 240, padding: "10px 12px", background: C.cd, border: `1px solid ${C.br}`, borderRadius: 8 }}>
              <div style={lbl}>Handler workload (open)</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                {dash.byHandler.length === 0 ? <span style={{ fontSize: 11, color: C.t4 }}>—</span> : dash.byHandler.map((h) => <span key={h.userId || "none"} style={{ fontSize: 11, fontFamily: M, color: C.t2, padding: "2px 8px", border: `1px solid ${C.br}`, borderRadius: 20 }}>{h.name} · <b style={{ color: C.t1 }}>{h.open}</b></span>)}
              </div>
            </div>
          </div>
        </>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
        <select value={filter.status} onChange={(e) => setFilter((s) => ({ ...s, status: e.target.value }))} style={{ ...input, width: "auto" }}>
          <option value="">All statuses</option>
          {["RECEIVED", "VERIFYING", "IN_PROGRESS", "AWAITING_REVIEW", "FULFILLED", "REJECTED", "WITHDRAWN"].map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
        </select>
        <label style={{ fontSize: 11, fontFamily: M, color: C.t3, cursor: "pointer" }}><input type="checkbox" checked={filter.overdue} onChange={(e) => setFilter((s) => ({ ...s, overdue: e.target.checked }))} /> Overdue</label>
        <label style={{ fontSize: 11, fontFamily: M, color: C.t3, cursor: "pointer" }}><input type="checkbox" checked={filter.mine} onChange={(e) => setFilter((s) => ({ ...s, mine: e.target.checked }))} /> My queue</label>
      </div>

      {error && <div style={{ color: C.rd, fontFamily: M, fontSize: 11, marginBottom: 10 }}>⚠ {error}</div>}

      <div style={{ border: `1px solid ${C.br}`, borderRadius: 8, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr .9fr 1fr 1fr .7fr", gap: 8, padding: "8px 12px", background: C.s1, fontSize: 8.5, fontFamily: M, letterSpacing: 1, textTransform: "uppercase", color: C.t3 }}>
          <div>Subject</div><div>Type</div><div>Status</div><div>Handler</div><div>Deadline</div><div>Items</div>
        </div>
        {!rows ? <div style={{ padding: 16, fontSize: 11, color: C.t4, fontFamily: M }}>Loading…</div>
          : rows.length === 0 ? <div style={{ padding: 16, fontSize: 11, color: C.t4, fontStyle: "italic" }}>No requests.</div>
          : rows.map((r) => (
            <div key={r.id} onClick={() => setOpenId(r.id)} style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr .9fr 1fr 1fr .7fr", gap: 8, padding: "10px 12px", borderTop: `1px solid ${C.br}22`, cursor: "pointer", alignItems: "center" }}>
              <div><div style={{ fontSize: 12.5, color: C.t1 }}>{r.requesterName}</div><div style={{ fontSize: 9.5, color: C.t4, fontFamily: M }}>{r.jurisdiction} · {r.regime}</div></div>
              <div style={{ fontSize: 11, color: C.t2 }}>{TYPE_LABEL[r.requestType] || r.requestType}</div>
              <div><span style={{ fontSize: 8.5, fontFamily: M, letterSpacing: .5, padding: "2px 7px", borderRadius: 4, color: STATUS_COLOR[r.status], border: `1px solid ${STATUS_COLOR[r.status]}55` }}>{r.status.replace(/_/g, " ")}</span></div>
              <div style={{ fontSize: 11, color: r.assignedToName ? C.t2 : C.t4 }}>{r.assignedToName || "Unassigned"}</div>
              <div style={{ fontSize: 11, fontFamily: M, color: URGENCY_COLOR[r.slaUrgency] || C.t2 }}>{r.daysRemaining < 0 ? `${Math.abs(r.daysRemaining)}d overdue` : `${r.daysRemaining}d`}{r.extended ? " ⤴" : ""}</div>
              <div style={{ fontSize: 11, fontFamily: M, color: C.t2 }}>{r.reviewItemCount}{r.holdConflictCount > 0 ? <span title="legal-hold conflict" style={{ color: C.rd }}> ⚠</span> : ""}</div>
            </div>
          ))}
      </div>

      {creating && <CreateDialog onClose={() => setCreating(false)} onCreated={(req) => { setCreating(false); setOpenId(req.id); load(); }} />}
      {openId && <DsarDetail requestId={openId} onClose={() => { setOpenId(null); load(); }} onChanged={load} />}
    </div>
  );
}
