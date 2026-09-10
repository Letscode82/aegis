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
      <div style={{ marginBottom: 6, fontFamily: M, fontSize: 10.5, letterSpacing: 1.4, color: C.tl, textTransform: "uppercase" }}>Notices &amp; obligations · one deadline board</div>
      <div style={{ fontFamily: SR, fontSize: 28, fontWeight: 600, marginBottom: 4 }}>Notice Management</div>
      <div style={{ fontSize: 13.5, color: C.t3, marginBottom: 20, maxWidth: "72ch" }}>
        Every commitment and deadline across the platform — contract renewals, regulatory filings, policy and privacy obligations — in one place, sorted by urgency. Inbound notice capture and outbound issuance write here too.
      </div>

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
