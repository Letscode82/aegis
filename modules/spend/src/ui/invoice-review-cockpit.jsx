import { useState, useEffect, useCallback } from "react";
import { C, F, M, SR, ReviewCockpit, useReviewKeyboard } from "@aegis/ui";

// Invoice review cockpit (PR-R1). Replaces the single-invoice modal with a
// Relativity-style 3-pane review surface built on the shared ReviewCockpit:
//   left   — the invoice queue (J/K to move, U to jump to the next undecided)
//   center — the selected invoice: line items, flags, AI billing judgment
//   right  — the decision panel: Approve (short-pay) / Reject / run + resolve
//            the AI judge. Every decision hits the same chain-sealed endpoints.
// You move through the whole queue without leaving the cockpit.

const money = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(1)}k`;
  return `$${v.toFixed(0)}`;
};

const DETERMINISTIC = ["MATH_ERROR", "RATE_OVER_CARD", "UNAPPROVED_TIMEKEEPER", "OUT_OF_PERIOD", "DUPLICATE", "NON_BILLABLE"];
const flagLabel = (c) => c.replace(/_/g, " ").toLowerCase();
const TERMINAL = new Set(["APPROVED", "PAID", "REJECTED"]);
const STATUS_COLOR = { SUBMITTED: C.bl, IN_REVIEW: C.am, APPROVED: C.gn, REJECTED: C.rd, PAID: C.tl };

export function InvoiceReviewCockpit({ invoices, startIndex = 0, onClose, onChanged }) {
  const [list, setList] = useState(invoices || []);
  const [idx, setIdx] = useState(Math.min(Math.max(0, startIndex), Math.max(0, (invoices || []).length - 1)));
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [changed, setChanged] = useState(false);

  const active = list[idx] || null;
  const activeId = active ? active.id : null;

  const loadDetail = useCallback((id) => {
    if (!id) return;
    fetch(`/api/spend/invoices/${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : r.json().then((d) => Promise.reject(d.error || `HTTP ${r.status}`))))
      .then((d) => setDetail(d.invoice))
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    setDetail(null);
    setError(null);
    setRejecting(false);
    setReason("");
    loadDetail(activeId);
  }, [activeId, loadDetail]);

  const close = () => {
    if (changed && onChanged) onChanged();
    onClose();
  };
  const go = (delta) => setIdx((i) => Math.min(list.length - 1, Math.max(0, i + delta)));
  const nextReviewable = () => {
    for (let k = 1; k <= list.length; k++) {
      const j = (idx + k) % list.length;
      if (!TERMINAL.has(list[j].status)) {
        setIdx(j);
        return;
      }
    }
  };
  const markStatus = (id, status) => setList((L) => L.map((v) => (v.id === id ? { ...v, status } : v)));

  const decide = async (action, extra = {}) => {
    if (!activeId) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/spend/invoices/${encodeURIComponent(activeId)}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      markStatus(activeId, action === "approve" ? "APPROVED" : "REJECTED");
      setChanged(true);
      setRejecting(false);
      setReason("");
      loadDetail(activeId);
      setTimeout(nextReviewable, 0);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  const judge = async (action, extra = {}) => {
    if (!activeId) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/spend/invoices/${encodeURIComponent(activeId)}/judgment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      loadDetail(activeId);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  const review = detail && detail.review;
  const canAct = detail && !TERMINAL.has(detail.status);
  const hasJudgmentFlags = review && review.flags.some((f) => f.severity === "judgment" && f.lineId);
  const jd = detail && detail.judgment;

  useReviewKeyboard([
    { keys: ["j", "ArrowDown"], label: "Next", run: () => go(1) },
    { keys: ["k", "ArrowUp"], label: "Prev", run: () => go(-1) },
    { keys: ["u"], label: "Next to review", run: nextReviewable },
    { keys: ["a"], label: "Approve", run: () => { if (canAct && !rejecting && !busy) decide("approve"); } },
    { keys: ["x"], label: "Reject", run: () => { if (canAct && !busy) setRejecting(true); } },
    { keys: ["Escape"], label: "Close", run: () => (rejecting ? setRejecting(false) : close()) },
  ]);

  const doneCount = list.filter((v) => TERMINAL.has(v.status)).length;

  // ── Queue pane ──────────────────────────────────────────────────────
  const queue = (
    <div>
      <div style={{ padding: "10px 12px 8px", fontSize: 9, fontFamily: M, color: C.t4, letterSpacing: 1, textTransform: "uppercase", borderBottom: `1px solid ${C.br}` }}>
        Invoice queue · {list.length}
      </div>
      {list.map((inv, i) => {
        const activeRow = i === idx;
        const terminal = TERMINAL.has(inv.status);
        return (
          <div
            key={inv.id}
            onClick={() => setIdx(i)}
            style={{
              padding: "9px 12px",
              borderBottom: `1px solid ${C.br}33`,
              cursor: "pointer",
              background: activeRow ? C.s1 : "transparent",
              borderLeft: `2px solid ${activeRow ? C.am : "transparent"}`,
              opacity: terminal ? 0.6 : 1,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11.5 }}>
              <span style={{ color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inv.vendorName}</span>
              <span style={{ fontFamily: M, color: C.t2, flexShrink: 0 }}>{money(inv.amount)}</span>
            </div>
            <div style={{ fontSize: 9.5, color: C.t3, fontFamily: M, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inv.matterTitle}</div>
            <div style={{ display: "flex", gap: 8, marginTop: 3, alignItems: "center" }}>
              <span style={{ fontFamily: M, fontSize: 8.5, letterSpacing: 0.5, color: STATUS_COLOR[inv.status] || C.t3 }}>{inv.status.replace("_", " ")}</span>
              {inv.deterministicFlagCount > 0 && <span style={{ fontFamily: M, fontSize: 9, color: C.rd }}>⚑{inv.deterministicFlagCount}</span>}
              {inv.judgmentFlagCount > 0 && <span style={{ fontFamily: M, fontSize: 9, color: C.am }}>◑{inv.judgmentFlagCount}</span>}
              {inv.proposedSavings > 0 && <span style={{ fontFamily: M, fontSize: 9, color: C.gn, marginLeft: "auto" }}>{money(inv.proposedSavings)}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );

  // ── Viewer pane ─────────────────────────────────────────────────────
  const viewer = (
    <div style={{ padding: 16 }}>
      {!detail && !error && <div style={{ padding: 40, textAlign: "center", color: C.t3, fontFamily: M, fontSize: 12 }}>◎ Loading invoice…</div>}
      {error && <div style={{ color: C.rd, fontFamily: M, fontSize: 12, marginBottom: 10 }}>⚠ {error}</div>}
      {detail && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 18, fontFamily: SR, color: C.t1 }}>{detail.vendorName} — {money(detail.amount)}</div>
              <div style={{ fontSize: 11, color: C.t3, fontFamily: M, marginTop: 2 }}>{detail.matterTitle} · {detail.periodStart.slice(0, 10)}–{detail.periodEnd.slice(0, 10)} · {detail.status.replace("_", " ")}</div>
            </div>
            {review && (
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 9, fontFamily: M, color: C.t3, letterSpacing: 1, textTransform: "uppercase" }}>Proposed short-pay</div>
                <div style={{ fontSize: 22, fontFamily: SR, color: review.proposedShortPay > 0 ? C.gn : C.t3 }}>{money(review.proposedShortPay)}</div>
                <div style={{ fontSize: 10, color: C.t4, fontFamily: M }}>approve at {money(review.proposedApprovedAmount)}</div>
              </div>
            )}
          </div>

          <div style={{ marginTop: 12 }}>
            {detail.lines.map((l) => (
              <div key={l.id} style={{ padding: "9px 0", borderBottom: `1px solid ${C.br}33` }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 11.5 }}>
                  <span style={{ color: C.t1, minWidth: 0 }}>{l.timekeeperName || "—"} <span style={{ color: C.t4, fontFamily: M, fontSize: 9.5 }}>{l.hours}h × {money(l.rate)}</span></span>
                  <span style={{ fontFamily: M, color: C.t2, flexShrink: 0 }}>{money(l.amount)}</span>
                </div>
                <div style={{ fontSize: 10.5, color: C.t3, marginTop: 2 }}>{l.description}</div>
                {l.flags.length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                    {l.flags.map((c) => {
                      const det = DETERMINISTIC.includes(c);
                      return <span key={c} style={{ fontSize: 8.5, fontFamily: M, letterSpacing: 0.5, textTransform: "uppercase", padding: "1px 6px", borderRadius: 3, color: det ? C.rd : C.am, border: `1px solid ${det ? C.rd : C.am}55` }}>{det ? "⚑" : "◑"} {flagLabel(c)}</span>;
                    })}
                  </div>
                )}
              </div>
            ))}
            {review && review.flags.filter((f) => f.lineId === null).map((f, i) => (
              <div key={i} style={{ marginTop: 8, padding: "7px 9px", background: C.amG, borderLeft: `2px solid ${C.am}`, borderRadius: 3, fontSize: 10.5, color: C.t2 }}>◑ {f.message}</div>
            ))}
          </div>

          {jd && jd.perLine.length > 0 && (
            <div style={{ marginTop: 12, padding: "10px 12px", background: C.s1, borderRadius: 4 }}>
              <div style={{ fontSize: 9.5, fontFamily: M, color: C.am, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 }}>◑ AI billing judgment{jd.confidence != null ? ` · ${Math.round(jd.confidence * 100)}% conf` : ""}{jd.degraded ? " · fallback" : ""}</div>
              {jd.perLine.map((p) => (
                <div key={p.lineId} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "4px 0", fontSize: 10.5, color: C.t2 }}>
                  <span style={{ flex: 1, minWidth: 0 }}>{p.rationale}</span>
                  <span style={{ fontFamily: M, color: C.gn, whiteSpace: "nowrap" }}>−{money(p.recommendedReduction)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );

  // ── Coding / decision pane ──────────────────────────────────────────
  const coding = (
    <div style={{ padding: 16 }}>
      <div style={{ fontSize: 9, fontFamily: M, color: C.t4, letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>Your decision</div>
      {!detail && <div style={{ fontSize: 11, color: C.t3, fontFamily: M }}>Select an invoice.</div>}
      {detail && !canAct && (
        <div style={{ fontSize: 11.5, color: C.t3, fontFamily: M }}>
          This invoice is {detail.status.replace("_", " ").toLowerCase()} — no further action.
        </div>
      )}
      {detail && canAct && (
        <div style={{ display: "grid", gap: 10 }}>
          {!rejecting ? (
            <>
              <button type="button" disabled={busy} onClick={() => decide("approve")} style={btn(C.gn, C.bg, busy)}>
                ✓ Approve · short-pay {review ? money(review.proposedShortPay) : ""} <kbd style={kbd}>A</kbd>
              </button>
              <button type="button" onClick={() => setRejecting(true)} style={btnOutline(C.rd)}>
                ✕ Reject <kbd style={kbd}>X</kbd>
              </button>
            </>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="reason for rejection" style={{ background: C.s1, border: `1px solid ${C.br}`, color: C.t1, fontSize: 11.5, fontFamily: F, padding: "8px 10px", borderRadius: 4 }} />
              <button type="button" disabled={busy} onClick={() => decide("reject", { reason })} style={btn(C.rd, C.bg, busy)}>Confirm reject</button>
              <button type="button" onClick={() => setRejecting(false)} style={btnOutline(C.t3)}>Cancel</button>
            </div>
          )}

          {(hasJudgmentFlags || jd) && (
            <div style={{ marginTop: 6, paddingTop: 12, borderTop: `1px solid ${C.br}` }}>
              <div style={{ fontSize: 9, fontFamily: M, color: C.am, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>◑ AI billing judgment</div>
              {!jd && hasJudgmentFlags && (
                <button type="button" disabled={busy} onClick={() => judge("propose")} style={btnOutline(C.am)}>✦ Run AI judge</button>
              )}
              {jd && (
                <div style={{ fontSize: 10.5, color: C.t3, fontFamily: M, marginBottom: 8 }}>
                  {jd.status === "PENDING" ? "Recommended" : "Approved"} judgment short-pay {money(jd.approvedTotal != null ? jd.approvedTotal : jd.totalRecommendedReduction)}
                </div>
              )}
              {jd && jd.status === "PENDING" && (
                <div style={{ display: "grid", gap: 8 }}>
                  <button type="button" disabled={busy} onClick={() => judge("approve", { decisionId: jd.id })} style={btn(C.am, C.bg, busy)}>✓ Approve reductions</button>
                  <button type="button" disabled={busy} onClick={() => judge("reject", { decisionId: jd.id })} style={btnOutline(C.t3)}>Decline</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {error && <div style={{ color: C.rd, fontSize: 11, fontFamily: M, marginTop: 10 }}>⚠ {error}</div>}
      <div style={{ fontSize: 9, color: C.t4, fontFamily: M, marginTop: 16, lineHeight: 1.4 }}>
        Deterministic flags (⚑) feed the short-pay; AI-judgment flags (◑) are advisory. Every decision is chain-sealed.
      </div>
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 120, background: C.bg }}>
      <ReviewCockpit
        title="Invoice review"
        subtitle={active ? `${active.vendorName} · ${active.matterTitle}` : undefined}
        onBack={close}
        progress={{ done: doneCount, total: list.length, label: "Decided" }}
        legend={[
          { keys: ["J"], label: "Next" },
          { keys: ["K"], label: "Prev" },
          { keys: ["U"], label: "Next to review" },
          { keys: ["A"], label: "Approve" },
          { keys: ["X"], label: "Reject" },
          { keys: ["Esc"], label: "Close" },
        ]}
        queue={queue}
        viewer={viewer}
        coding={coding}
      />
    </div>
  );
}

const kbd = { marginLeft: 6, background: "rgba(0,0,0,.2)", borderRadius: 3, padding: "0 5px", fontSize: 9, fontFamily: "monospace" };
const btn = (bg, text, busy) => ({
  background: bg, color: text, border: "none", padding: "10px 14px", borderRadius: 4,
  fontFamily: "inherit", fontSize: 11.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase",
  cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1, textAlign: "left",
});
const btnOutline = (col) => ({
  background: "transparent", color: col, border: `1px solid ${col}`, padding: "10px 14px", borderRadius: 4,
  fontFamily: "inherit", fontSize: 11.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase",
  cursor: "pointer", textAlign: "left",
});
