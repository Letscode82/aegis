import { useState, useEffect } from "react";
import { C, M, SR, F } from "@aegis/ui";

// Invoice review drill-in (SP-3). Opens from the dashboard queue: shows
// every line item with its flags, the AI-proposed short-pay, and the
// governed actions — Approve (accept the deterministic short-pay) or
// Reject. Both hit the chain-sealed decision endpoint. Judgment flags
// are shown but never auto-reduce.

const money = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(1)}k`;
  return `$${v.toFixed(0)}`;
};

const DETERMINISTIC = ["MATH_ERROR", "RATE_OVER_CARD", "UNAPPROVED_TIMEKEEPER", "OUT_OF_PERIOD", "DUPLICATE", "NON_BILLABLE"];
const flagLabel = (c) => c.replace(/_/g, " ").toLowerCase();

export function InvoiceReviewModal({ invoiceId, onClose, onDone }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  const load = () => {
    fetch(`/api/spend/invoices/${encodeURIComponent(invoiceId)}`)
      .then((r) => (r.ok ? r.json() : r.json().then((d) => Promise.reject(d.error || `HTTP ${r.status}`))))
      .then((d) => setDetail(d.invoice))
      .catch((e) => setError(String(e)));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [invoiceId]);

  const decide = async (action, extra = {}) => {
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/spend/invoices/${encodeURIComponent(invoiceId)}/decision`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      onDone && onDone();
      onClose();
    } catch (e) { setError(String(e.message || e)); } finally { setBusy(false); }
  };

  const review = detail?.review;
  const canAct = detail && detail.status !== "APPROVED" && detail.status !== "PAID" && detail.status !== "REJECTED";

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(11,16,32,.9)", zIndex: 120, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.cd, border: `1px solid ${C.br}`, borderRadius: 8, width: "100%", maxWidth: 780, maxHeight: "86vh", overflowY: "auto", fontFamily: F, color: C.t1 }}>
        {!detail && !error && <div style={{ padding: 40, textAlign: "center", color: C.t3, fontFamily: M, fontSize: 12 }}>◎ Loading invoice…</div>}
        {error && <div style={{ padding: 16, color: C.rd, fontFamily: M, fontSize: 12 }}>⚠ {error}</div>}
        {detail && (
          <>
            {/* Header */}
            <div style={{ padding: "16px 18px", borderBottom: `1px solid ${C.br}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 9, fontFamily: M, color: C.t3, letterSpacing: 1.5, textTransform: "uppercase" }}>Invoice review</div>
                  <div style={{ fontSize: 18, fontFamily: SR, color: C.t1 }}>{detail.vendorName} — {money(detail.amount)}</div>
                  <div style={{ fontSize: 11, color: C.t3, fontFamily: M, marginTop: 2 }}>{detail.matterTitle} · {detail.periodStart.slice(0, 10)}–{detail.periodEnd.slice(0, 10)} · {detail.status.replace("_", " ")}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 9, fontFamily: M, color: C.t3, letterSpacing: 1, textTransform: "uppercase" }}>Proposed short-pay</div>
                  <div style={{ fontSize: 22, fontFamily: SR, color: review.proposedShortPay > 0 ? C.gn : C.t3 }}>{money(review.proposedShortPay)}</div>
                  <div style={{ fontSize: 10, color: C.t4, fontFamily: M }}>approve at {money(review.proposedApprovedAmount)}</div>
                </div>
              </div>
            </div>

            {/* Line items */}
            <div style={{ padding: "12px 18px" }}>
              {detail.lines.map((l) => (
                <div key={l.id} style={{ padding: "9px 0", borderBottom: `1px solid ${C.br}33` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 11.5 }}>
                    <span style={{ color: C.t1 }}>{l.timekeeperName || "—"} <span style={{ color: C.t4, fontFamily: M, fontSize: 9.5 }}>{l.hours}h × {money(l.rate)}</span></span>
                    <span style={{ fontFamily: M, color: C.t2 }}>{money(l.amount)}</span>
                  </div>
                  <div style={{ fontSize: 10.5, color: C.t3, marginTop: 2 }}>{l.description}</div>
                  {l.flags.length > 0 && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                      {l.flags.map((c) => {
                        const det = DETERMINISTIC.includes(c);
                        return <span key={c} style={{ fontSize: 8.5, fontFamily: M, letterSpacing: .5, textTransform: "uppercase", padding: "1px 6px", borderRadius: 3, color: det ? C.rd : C.am, border: `1px solid ${det ? C.rd : C.am}55` }}>{det ? "⚑" : "◑"} {flagLabel(c)}</span>;
                      })}
                    </div>
                  )}
                </div>
              ))}
              {review.flags.filter((f) => f.lineId === null).map((f, i) => (
                <div key={i} style={{ marginTop: 8, padding: "7px 9px", background: C.amG, borderLeft: `2px solid ${C.am}`, borderRadius: 3, fontSize: 10.5, color: C.t2 }}>◑ {f.message}</div>
              ))}
            </div>

            {/* Actions */}
            <div style={{ padding: "12px 18px", borderTop: `1px solid ${C.br}`, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {canAct && !rejecting && (
                <>
                  <div onClick={busy ? undefined : () => decide("approve")} style={{ padding: "8px 14px", background: C.gn, color: C.bg, fontSize: 10, fontFamily: M, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700, borderRadius: 3, cursor: busy ? "default" : "pointer", opacity: busy ? .6 : 1 }}>✓ Approve · short-pay {money(review.proposedShortPay)}</div>
                  <div onClick={() => setRejecting(true)} style={{ padding: "8px 14px", border: `1px solid ${C.rd}`, color: C.rd, fontSize: 10, fontFamily: M, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700, borderRadius: 3, cursor: "pointer" }}>✕ Reject</div>
                </>
              )}
              {canAct && rejecting && (
                <div style={{ display: "flex", gap: 8, alignItems: "center", flex: 1, flexWrap: "wrap" }}>
                  <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="reason for rejection" style={{ flex: 1, minWidth: 180, background: C.s1, border: `1px solid ${C.br}`, color: C.t1, fontSize: 11, fontFamily: F, padding: "7px 9px", borderRadius: 3 }} />
                  <div onClick={busy ? undefined : () => decide("reject", { reason })} style={{ padding: "8px 12px", background: C.rd, color: C.bg, fontSize: 10, fontFamily: M, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700, borderRadius: 3, cursor: "pointer" }}>Confirm reject</div>
                  <div onClick={() => setRejecting(false)} style={{ padding: "8px 10px", color: C.t3, fontSize: 10, fontFamily: M, cursor: "pointer" }}>cancel</div>
                </div>
              )}
              {!canAct && <div style={{ fontSize: 11, color: C.t3, fontFamily: M }}>This invoice is {detail.status.replace("_", " ").toLowerCase()} — no further action.</div>}
              <div onClick={onClose} style={{ marginLeft: "auto", padding: "8px 12px", border: `1px solid ${C.br}`, color: C.t2, fontSize: 10, fontFamily: M, letterSpacing: 1, textTransform: "uppercase", borderRadius: 3, cursor: "pointer" }}>Close</div>
            </div>
            <div style={{ padding: "0 18px 14px", fontSize: 9.5, color: C.t4, fontFamily: M }}>Every decision is written to the tamper-evident audit ledger. Deterministic flags (⚑) feed the short-pay; AI-judgment flags (◑) are advisory.</div>
          </>
        )}
      </div>
    </div>
  );
}
