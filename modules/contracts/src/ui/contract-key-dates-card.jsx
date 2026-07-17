import { useState, useEffect } from "react";
import { C, F, M, SR } from "@aegis/ui";

// ── Contract key dates & renewals (CTR-4) ────────────────────────────
//
// A live Mission Control card: real renewal / expiry / obligation
// alerts from GET /api/contracts/alerts (gated contracts:read_all).
// Replaces the fabricated "12 contracts expire in 60 days" signal with
// the actual key dates, most-urgent first. Silent (renders nothing) if
// the caller can't read contracts, so it never breaks the briefing for
// unprivileged viewers.

const SEV_COLOR = { high: C.rd, medium: C.am, low: C.tl };
const KIND_LABEL = {
  AUTO_RENEW_TRAP: "Auto-renew",
  EXPIRING: "Expiring",
  EXPIRED: "Expired",
  OBLIGATION_OVERDUE: "Overdue",
  OBLIGATION_DUE: "Due",
};
const fmtDays = (d) => (d == null ? "" : d < 0 ? `${-d}d ago` : d === 0 ? "today" : `${d}d`);

export function ContractKeyDatesCard({ onOpenContracts }) {
  const [data, setData] = useState(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/contracts/alerts")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => { if (alive) setData(d); })
      .catch((s) => { if (alive && (s === 401 || s === 403)) setHidden(true); });
    return () => { alive = false; };
  }, []);

  if (hidden) return null;

  const c = data?.counts;
  const alerts = data?.alerts || [];

  return (
    <div style={{ background: C.cd, border: `1px solid ${C.br}`, padding: 14, marginBottom: 16, fontFamily: F }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 10, fontFamily: M, color: C.bl, letterSpacing: 2, textTransform: "uppercase" }}>Contract · Key Dates &amp; Renewals</div>
        {c && (
          <div style={{ display: "flex", gap: 10, fontSize: 9.5, fontFamily: M, flexWrap: "wrap" }}>
            {c.autoRenewTraps > 0 && <span style={{ color: C.rd }}>⟳ {c.autoRenewTraps} renew trap</span>}
            {c.expiring > 0 && <span style={{ color: C.am }}>⏱ {c.expiring} expiring</span>}
            {c.expired > 0 && <span style={{ color: C.rd }}>✕ {c.expired} expired</span>}
            {c.obligationsOverdue > 0 && <span style={{ color: C.rd }}>▲ {c.obligationsOverdue} overdue</span>}
            {c.obligationsDue > 0 && <span style={{ color: C.tl }}>◷ {c.obligationsDue} due soon</span>}
          </div>
        )}
      </div>

      {!data ? (
        <div style={{ fontSize: 10.5, color: C.t4, fontFamily: M }}>Loading key dates…</div>
      ) : alerts.length === 0 ? (
        <div style={{ fontSize: 11, color: C.gn, fontFamily: M }}>✓ No contract renewals, expiries, or obligations need attention in the next 90 days.</div>
      ) : (
        <>
          {alerts.slice(0, 6).map((a) => (
            <div
              key={`${a.kind}-${a.id}`}
              onClick={onOpenContracts}
              title={onOpenContracts ? "Open contracts" : undefined}
              style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "7px 0", borderBottom: `1px solid ${C.br}22`, cursor: onOpenContracts ? "pointer" : "default" }}
            >
              <span style={{ minWidth: 58, fontSize: 8.5, fontFamily: M, letterSpacing: .5, textTransform: "uppercase", color: SEV_COLOR[a.severity] }}>{KIND_LABEL[a.kind]}</span>
              <span style={{ minWidth: 52, fontSize: 10, fontFamily: M, color: a.daysOut != null && a.daysOut < 0 ? C.rd : a.daysOut != null && a.daysOut <= 30 ? C.am : C.t3 }}>{fmtDays(a.daysOut)}</span>
              <span style={{ flex: 1, fontSize: 10.5, color: C.t1, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis" }}>
                <b style={{ color: C.t1 }}>{a.contractTitle}</b>
                {a.counterpartyName ? <span style={{ color: C.t4 }}> · {a.counterpartyName}</span> : null}
                <span style={{ color: C.t3 }}> — {a.detail}</span>
              </span>
            </div>
          ))}
          {alerts.length > 6 && (
            <div onClick={onOpenContracts} style={{ fontSize: 9.5, fontFamily: M, color: C.bl, letterSpacing: .5, marginTop: 8, cursor: onOpenContracts ? "pointer" : "default" }}>
              +{alerts.length - 6} more →
            </div>
          )}
        </>
      )}
    </div>
  );
}
