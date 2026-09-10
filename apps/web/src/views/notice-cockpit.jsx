/**
 * Notice & Obligation cockpit — the unified deadline board over the shared
 * Obligation entity. Every commitment written by Contracts, Regulatory,
 * Governance and Privacy lands in one table; this shows them together with
 * urgency buckets (overdue / due soon / open). Inbound-notice capture and
 * outbound issuance feed the same board in the follow-on PRs.
 */
import { useState, useEffect, useCallback } from "react";
import { C, F, M, SR } from "@aegis/ui";

const TYPE_LABEL = {
  PAYMENT: "Payment", DELIVERABLE: "Deliverable", REPORTING: "Reporting",
  RENEWAL_NOTICE: "Renewal notice", COMPLIANCE: "Compliance", OTHER: "Other",
};
const SOURCE_LABEL = {
  CONTRACT: "Contract", REGULATION: "Regulation", POLICY: "Policy", PRIVACY_LAW: "Privacy law",
};
const STATUS_COL = {
  OPEN: C.bl, IN_PROGRESS: C.cy, MET: C.gn, BREACHED: C.rd, WAIVED: C.t4,
};

function fmtDue(iso, overdue, dueSoon) {
  if (!iso) return { text: "No date", col: C.t4 };
  const d = new Date(iso);
  const days = Math.round((d.getTime() - Date.now()) / 86_400_000);
  const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  if (overdue) return { text: `${label} · ${Math.abs(days)}d overdue`, col: C.rd };
  if (dueSoon) return { text: `${label} · in ${days}d`, col: C.am };
  return { text: label, col: C.t2 };
}

export function NoticeCockpit() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("ALL");
  const [type, setType] = useState("ALL");
  const [source, setSource] = useState("ALL");
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(() => {
    const p = new URLSearchParams();
    if (status !== "ALL") p.set("status", status);
    if (type !== "ALL") p.set("type", type);
    if (source !== "ALL") p.set("source", source);
    setData(null);
    fetch(`/api/notices/cockpit?${p.toString()}`)
      .then((r) => r.json())
      .then((d) => setData(d.ok ? d : { items: [], summary: {} }))
      .catch(() => setData({ items: [], summary: {} }));
  }, [status, type, source]);

  useEffect(() => { load(); }, [load]);

  const s = data?.summary || {};
  const tile = (label, val, col) => (
    <div style={{ background: C.s1, border: `1px solid ${C.br}`, borderRadius: 10, padding: "14px 16px", minWidth: 120 }}>
      <div style={{ fontSize: 26, fontWeight: 700, fontFamily: SR, color: col || C.t1, fontVariantNumeric: "tabular-nums" }}>{val ?? "—"}</div>
      <div style={{ fontSize: 10.5, fontFamily: M, color: C.t3, letterSpacing: .5, textTransform: "uppercase", marginTop: 2 }}>{label}</div>
    </div>
  );
  const sel = (val, setVal, opts) => (
    <select value={val} onChange={(e) => setVal(e.target.value)}
      style={{ padding: "7px 10px", background: C.bg, border: `1px solid ${C.br}`, borderRadius: 7, color: C.t1, fontFamily: F, fontSize: 12.5 }}>
      {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );

  return (
    <div style={{ padding: "26px 32px", fontFamily: F, color: C.t1, maxWidth: 1440, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <div style={{ marginBottom: 6, fontFamily: M, fontSize: 10.5, letterSpacing: 1.4, color: C.tl, textTransform: "uppercase" }}>Notices &amp; obligations · one deadline board</div>
          <div style={{ fontFamily: SR, fontSize: 28, fontWeight: 600, marginBottom: 4 }}>Notice Management</div>
          <div style={{ fontSize: 13.5, color: C.t3, marginBottom: 20, maxWidth: "72ch" }}>
            Every commitment and deadline across the platform — contract renewals, regulatory filings, policy and privacy obligations — in one place, sorted by urgency. Outbound notices you create here are tracked as obligations and appear on the board.
          </div>
        </div>
        <button onClick={() => setShowNew(true)} style={{ flex: "none", padding: "10px 16px", background: C.tl, color: C.bg, border: "none", borderRadius: 8, fontFamily: F, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>+ New notice</button>
      </div>
      {showNew && <NewNoticeModal onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); load(); }} />}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        {tile("Overdue", s.overdue, C.rd)}
        {tile(`Due ≤ ${data?.horizonDays ?? 30}d`, s.dueSoon, C.am)}
        {tile("Open", s.open, C.bl)}
        {tile("Total", s.total, C.t1)}
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14, alignItems: "center" }}>
        {sel(status, setStatus, [["ALL", "All statuses"], ["OPEN", "Open"], ["IN_PROGRESS", "In progress"], ["MET", "Met"], ["BREACHED", "Breached"], ["WAIVED", "Waived"]])}
        {sel(type, setType, [["ALL", "All types"], ...Object.entries(TYPE_LABEL)])}
        {sel(source, setSource, [["ALL", "All sources"], ...Object.entries(SOURCE_LABEL)])}
      </div>

      <div style={{ background: C.s1, border: `1px solid ${C.br}`, borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead>
            <tr style={{ textAlign: "left", color: C.t3, fontFamily: M, fontSize: 10, letterSpacing: .5, textTransform: "uppercase", background: C.bg }}>
              <th style={{ padding: "10px 12px" }}>Obligation</th>
              <th style={{ padding: "10px 12px" }}>Type</th>
              <th style={{ padding: "10px 12px" }}>Source</th>
              <th style={{ padding: "10px 12px" }}>Due</th>
              <th style={{ padding: "10px 12px" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {(data?.items || []).map((o) => {
              const due = fmtDue(o.dueDate, o.overdue, o.dueSoon);
              return (
                <tr key={o.id} style={{ borderTop: `1px solid ${C.br}` }}>
                  <td style={{ padding: "10px 12px", maxWidth: 520 }}>
                    <div style={{ color: C.t1 }}>{o.description}</div>
                    {o.recurrence && <div style={{ fontSize: 10, color: C.t4, fontFamily: M, marginTop: 2 }}>recurring</div>}
                  </td>
                  <td style={{ padding: "10px 12px", color: C.t2 }}>{TYPE_LABEL[o.type] || o.type}</td>
                  <td style={{ padding: "10px 12px", color: C.t3, fontFamily: M, fontSize: 11 }}>{SOURCE_LABEL[o.sourceType] || o.sourceType}</td>
                  <td style={{ padding: "10px 12px", color: due.col, fontWeight: o.overdue || o.dueSoon ? 600 : 400, whiteSpace: "nowrap" }}>{due.text}</td>
                  <td style={{ padding: "10px 12px" }}><span style={{ fontSize: 10, fontWeight: 700, color: STATUS_COL[o.status] || C.t3 }}>{o.status.replace("_", " ")}</span></td>
                </tr>
              );
            })}
            {data && data.items?.length === 0 && (
              <tr><td colSpan={5} style={{ padding: "24px 12px", color: C.t4, textAlign: "center" }}>No obligations match. Contract, regulatory and privacy obligations appear here as they're created.</td></tr>
            )}
            {!data && (
              <tr><td colSpan={5} style={{ padding: "24px 12px", color: C.t4, textAlign: "center" }}>Loading…</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NewNoticeModal({ onClose, onCreated }) {
  const [description, setDescription] = useState("");
  const [type, setType] = useState("RENEWAL_NOTICE");
  const [source, setSource] = useState("CONTRACT");
  const [counterparty, setCounterparty] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [recurrence, setRecurrence] = useState("");
  const [keyPoints, setKeyPoints] = useState("");
  const [body, setBody] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [degraded, setDegraded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function draft() {
    setDrafting(true); setErr("");
    try {
      const r = await fetch("/api/notices/draft", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noticeType: type, subject: description, counterparty, keyPoints }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error?.message || "Draft failed");
      setBody(d.body); setDegraded(!!d.degraded);
    } catch (e) { setErr(String(e?.message || e)); } finally { setDrafting(false); }
  }

  async function create() {
    if (!description.trim()) { setErr("A description is required."); return; }
    setSaving(true); setErr("");
    try {
      const r = await fetch("/api/notices/outbound", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, type, sourceType: source, counterparty, dueDate: dueDate || null, recurrence: recurrence || null, body }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error?.message || "Create failed");
      onCreated();
    } catch (e) { setErr(String(e?.message || e)); setSaving(false); }
  }

  const label = { fontSize: 11, fontFamily: M, color: C.t3, letterSpacing: .5, textTransform: "uppercase", display: "block", marginBottom: 4 };
  const inp = { width: "100%", padding: "8px 10px", background: C.bg, border: `1px solid ${C.br}`, borderRadius: 7, color: C.t1, fontFamily: F, fontSize: 13, marginBottom: 12 };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "6vh 16px", zIndex: 50, overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(720px,100%)", background: C.s1, border: `1px solid ${C.br}`, borderRadius: 12, padding: 22 }}>
        <div style={{ fontFamily: SR, fontSize: 18, fontWeight: 600, marginBottom: 16 }}>New outbound notice</div>
        <label style={label}>Description / title</label>
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Non-renewal notice — Meridian MSA" style={inp} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={label}>Type</label>
            <select value={type} onChange={(e) => setType(e.target.value)} style={inp}>
              {Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label style={label}>Source</label>
            <select value={source} onChange={(e) => setSource(e.target.value)} style={inp}>
              {Object.entries(SOURCE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label style={label}>Due date</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={label}>Recurrence (RRULE, optional)</label>
            <input value={recurrence} onChange={(e) => setRecurrence(e.target.value)} placeholder="e.g. FREQ=YEARLY" style={inp} />
          </div>
        </div>
        <label style={label}>Counterparty (optional)</label>
        <input value={counterparty} onChange={(e) => setCounterparty(e.target.value)} placeholder="e.g. Meridian Components, Inc." style={inp} />
        <label style={label}>Key points for the AI draft (optional)</label>
        <textarea value={keyPoints} onChange={(e) => setKeyPoints(e.target.value)} rows={2} placeholder="One per line" style={{ ...inp, resize: "vertical" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 0 8px" }}>
          <button onClick={draft} disabled={drafting} style={{ padding: "8px 14px", background: "transparent", color: C.tl, border: `1px solid ${C.tl}`, borderRadius: 7, fontFamily: F, fontSize: 12.5, fontWeight: 600, cursor: drafting ? "default" : "pointer", opacity: drafting ? .6 : 1 }}>{drafting ? "Drafting…" : "✦ Draft with AI"}</button>
          {degraded && <span style={{ fontSize: 11, color: C.am, fontFamily: M }}>template fallback (no model key)</span>}
        </div>
        <label style={label}>Notice body</label>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} placeholder="Draft with AI, or write the notice body here." style={{ ...inp, resize: "vertical", fontFamily: M, fontSize: 12 }} />
        {err && <div style={{ color: "#f87171", fontSize: 12.5, marginBottom: 10 }}>{err}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} style={{ padding: "9px 16px", background: "transparent", color: C.t2, border: `1px solid ${C.br}`, borderRadius: 8, fontFamily: F, fontSize: 13, cursor: "pointer" }}>Cancel</button>
          <button onClick={create} disabled={saving || !description.trim()} style={{ padding: "9px 18px", background: C.tl, color: C.bg, border: "none", borderRadius: 8, fontFamily: F, fontSize: 13, fontWeight: 600, cursor: saving || !description.trim() ? "default" : "pointer", opacity: saving || !description.trim() ? .6 : 1 }}>{saving ? "Creating…" : "Create notice"}</button>
        </div>
        <div style={{ marginTop: 12, fontSize: 11, color: C.t4, fontFamily: M }}>Tracked as an obligation on the board. Email delivery is a documented stub — the record + audit are real.</div>
      </div>
    </div>
  );
}
