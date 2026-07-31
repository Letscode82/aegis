import { useState, useEffect, useCallback } from "react";
import { C, F, M, SR } from "@aegis/ui";

// ── Renewals command center (Obligations & Renewals, Phase 1) ─────────
//
// Auto-renewal-trap prevention: every live contract bucketed by renewal
// urgency, each with the EXACT act-by date (expiry − notice window). The
// differentiator legal teams buy — never let a contract silently auto-renew
// because nobody tracked the notice deadline. Reads GET /api/contracts/renewals;
// decisions POST /api/contracts/[id]/renewal/{decision,notice-sent} (guarded +
// chain-sealed server-side).

const fmtDate = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : "—");
const money = (v, ccy) => (v == null ? "—" : `${ccy || "USD"} ${Number(v).toLocaleString()}`);

const URGENCY = {
  EXPIRED:               { label: "Expired",              c: C.rd, glyph: "⨯" },
  NOTICE_WINDOW_MISSED:  { label: "Notice window missed", c: C.rd, glyph: "⚠" },
  NOTICE_WINDOW_CLOSING: { label: "Notice closing",       c: C.rd, glyph: "🚨" },
  EXPIRING_SOON:         { label: "Expiring soon",        c: C.am, glyph: "◷" },
  UPCOMING:              { label: "Upcoming",             c: C.tl, glyph: "→" },
};
const DECISION_CHIP = {
  RENEW:        { label: "Renew",        c: C.gn },
  RENEGOTIATE:  { label: "Renegotiate",  c: C.am },
  NON_RENEWAL:  { label: "Non-renewal",  c: C.rd },
};

function Kpi({ label, value, color, sub }) {
  return (
    <div style={{ flex: 1, minWidth: 130, padding: "12px 14px", background: C.cd, border: `1px solid ${C.br}`, borderRadius: 6 }}>
      <div style={{ fontSize: 9, fontFamily: M, color: C.t3, letterSpacing: 1.4, textTransform: "uppercase", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 23, fontFamily: SR, color: color || C.t1, marginTop: 4, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 9, fontFamily: M, color: C.t4, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

const btn = (c) => ({
  padding: "4px 9px", borderRadius: 4, border: `1px solid ${c}`, background: "transparent",
  color: c, fontSize: 9, fontFamily: M, fontWeight: 600, letterSpacing: .4, cursor: "pointer", textTransform: "uppercase",
});

export function RenewalsCommandCenter({ canManage, onOpenContract }) {
  const [pipeline, setPipeline] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(() => {
    setError(null);
    fetch("/api/contracts/renewals")
      .then((r) => (r.ok ? r.json() : r.json().then((d) => Promise.reject(d.error || `HTTP ${r.status}`))))
      .then((d) => setPipeline(d.pipeline))
      .catch((e) => setError(String(e)));
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (row, kind, body) => {
    setBusy(row.contractId + kind);
    try {
      const url =
        kind === "notice"
          ? `/api/contracts/${row.contractId}/renewal/notice-sent`
          : `/api/contracts/${row.contractId}/renewal/decision`;
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {}),
      });
      if (!r.ok) throw new Error((await r.json()).error || `HTTP ${r.status}`);
      load();
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(null);
    }
  };

  const decide = (row, decision) => {
    if (decision === "NON_RENEWAL" && !window.confirm(`Record NON-RENEWAL for "${row.title}"? It will be allowed to expire on ${fmtDate(row.expiryDate)}.`)) return;
    act(row, "decision", { decision });
  };

  if (error && !pipeline) return <div style={{ padding: 24, color: C.rd, fontFamily: M, fontSize: 12 }}>⚠ {error}</div>;
  if (!pipeline) return <div style={{ padding: 40, textAlign: "center", color: C.t3, fontFamily: M, fontSize: 12, letterSpacing: 1 }}>◎ Loading renewals…</div>;

  const { rows, totals } = pipeline;

  return (
    <div>
      {error && <div style={{ color: C.rd, fontFamily: M, fontSize: 11, marginBottom: 10 }}>⚠ {error}</div>}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <Kpi label="In pipeline" value={totals.inPipeline} sub={`≤ ${pipeline.horizonDays}d horizon`} />
        <Kpi label="Auto-renewal traps" value={totals.autoRenewTraps} color={totals.autoRenewTraps > 0 ? C.rd : C.gn} sub="act now" />
        <Kpi label="Expiring soon" value={totals.expiringSoon} color={totals.expiringSoon > 0 ? C.am : C.t3} />
        <Kpi label="Expired" value={totals.expired} color={totals.expired > 0 ? C.rd : C.t3} />
      </div>

      {totals.autoRenewTraps > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", marginBottom: 14, background: C.rd + "14", border: `1px solid ${C.rd}55`, borderLeft: `3px solid ${C.rd}`, borderRadius: 5 }}>
          <span style={{ fontSize: 15 }}>🚨</span>
          <div style={{ fontSize: 11.5, fontFamily: F, color: C.t1, lineHeight: 1.4 }}>
            <b style={{ color: C.rd }}>{totals.autoRenewTraps} contract{totals.autoRenewTraps === 1 ? "" : "s"}</b> will silently auto-renew unless you decide before the notice deadline. Record a decision or mark the non-renewal notice sent below.
          </div>
        </div>
      )}

      <div style={{ background: C.cd, border: `1px solid ${C.br}`, borderRadius: 6, padding: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1.3fr 110px 130px 130px 1.7fr", gap: 8, fontSize: 9, fontFamily: M, color: C.t4, letterSpacing: 1, textTransform: "uppercase", padding: "0 4px 8px", borderBottom: `1px solid ${C.br}` }}>
          <span>Contract</span><span>Counterparty</span><span>Expiry</span><span>Act by (notice)</span><span>Status</span><span>Decision</span>
        </div>
        {rows.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: C.t4, fontFamily: M, fontSize: 11 }}>No contracts approaching renewal. Nothing to act on.</div>
        ) : rows.map((row) => {
          const u = URGENCY[row.urgency] || URGENCY.UPCOMING;
          const noticeUrgent = row.daysToNoticeDeadline != null && row.daysToNoticeDeadline <= 30;
          const decided = row.renewalDecision !== "UNDECIDED";
          const chip = DECISION_CHIP[row.renewalDecision];
          return (
            <div key={row.contractId} style={{ display: "grid", gridTemplateColumns: "2fr 1.3fr 110px 130px 130px 1.7fr", gap: 8, fontSize: 11, alignItems: "center", padding: "10px 4px", borderBottom: `1px solid ${C.br}33` }}>
              <span onClick={() => onOpenContract?.(row.contractId)} title={row.title} style={{ color: C.bl, cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {row.title}
                {row.autoRenew && <span title="Auto-renews" style={{ color: C.am, fontFamily: M, fontSize: 8.5, marginLeft: 6 }}>⟳ AUTO</span>}
                {row.renewalCount > 0 && <span title={`Renewed ${row.renewalCount}×`} style={{ color: C.t4, fontFamily: M, fontSize: 8.5, marginLeft: 6 }}>·{row.renewalCount}×</span>}
              </span>
              <span style={{ color: C.t2, fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.counterpartyName || "—"}<span style={{ color: C.t4, marginLeft: 6 }}>{money(row.value, row.currency)}</span></span>
              <span style={{ fontFamily: M, fontSize: 10, color: row.daysToExpiry != null && row.daysToExpiry < 0 ? C.rd : C.t2 }}>
                {fmtDate(row.expiryDate)}{row.daysToExpiry != null && <span style={{ color: C.t4 }}> · {row.daysToExpiry < 0 ? `${-row.daysToExpiry}d ago` : `${row.daysToExpiry}d`}</span>}
              </span>
              <span style={{ fontFamily: M, fontSize: 10, color: row.noticeDeadline ? (noticeUrgent ? C.rd : C.am) : C.t4, fontWeight: row.noticeDeadline ? 700 : 400 }}>
                {row.noticeDeadline ? <>{fmtDate(row.noticeDeadline)}{row.daysToNoticeDeadline != null && <span style={{ fontWeight: 400 }}> · {row.daysToNoticeDeadline < 0 ? `${-row.daysToNoticeDeadline}d past` : `${row.daysToNoticeDeadline}d`}</span>}</> : "—"}
              </span>
              <span style={{ fontFamily: M, fontSize: 9, letterSpacing: .3, color: u.c }}>{u.glyph} {u.label}</span>
              <span style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
                {row.renewalNoticeSentAt && <span title={`Notice sent ${fmtDate(row.renewalNoticeSentAt)}`} style={{ fontSize: 8.5, fontFamily: M, color: C.gn, border: `1px solid ${C.gn}55`, borderRadius: 3, padding: "1px 5px" }}>✓ NOTICE SENT</span>}
                {decided && chip && <span style={{ fontSize: 8.5, fontFamily: M, color: chip.c, border: `1px solid ${chip.c}55`, borderRadius: 3, padding: "1px 5px" }}>{chip.label.toUpperCase()}</span>}
                {canManage ? (
                  <>
                    <button disabled={busy} onClick={() => act(row, "decision", { decision: "RENEW" })} style={btn(C.gn)}>Renew</button>
                    <button disabled={busy} onClick={() => decide(row, "RENEGOTIATE")} style={btn(C.am)}>Renegotiate</button>
                    <button disabled={busy} onClick={() => decide(row, "NON_RENEWAL")} style={btn(C.rd)}>Non-renewal</button>
                    {row.autoRenew && !row.renewalNoticeSentAt && <button disabled={busy} onClick={() => act(row, "notice")} style={btn(C.bl)} title="Record that the (non-)renewal notice was issued">Notice sent</button>}
                  </>
                ) : <span style={{ color: C.t4, fontFamily: M, fontSize: 9 }}>read-only</span>}
              </span>
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 9.5, color: C.t4, fontFamily: M, marginTop: 12, letterSpacing: .3, lineHeight: 1.5 }}>
        <b style={{ color: C.t3 }}>Act by</b> is the last day to give non-renewal notice (expiry − notice window). <b style={{ color: C.gn }}>Renew</b> rolls the expiry forward one term and re-arms the next cycle; every decision is chain-sealed. The admin <span style={{ fontFamily: M, color: C.t3 }}>renewal-notice sweep</span> also drops a RENEWAL_NOTICE obligation into the ledger for each approaching deadline.
      </div>
    </div>
  );
}
