import { useState, useEffect, useCallback } from "react";
import { C, F, M, SR } from "@aegis/ui";

// ── Contract drill-in (CTR-1) ────────────────────────────────────────
//
// Reads GET /api/contracts/[id] — the contract, its extracted clauses
// (ContractClause), and its obligations (the SHARED Obligation entity,
// sourceType=CONTRACT). Obligation "Mark met" posts to
// /api/contracts/[id]/obligations/[obligationId] and is chain-sealed
// server-side. Conservative-AI: the UI only requests; the server audits.

const money = (n, ccy) => {
  if (n == null) return "—";
  const v = Number(n) || 0;
  const sym = ccy === "EUR" ? "€" : ccy === "GBP" ? "£" : "$";
  if (Math.abs(v) >= 1_000_000) return `${sym}${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `${sym}${(v / 1_000).toFixed(1)}k`;
  return `${sym}${v.toFixed(0)}`;
};
const fmtDate = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : "—");
const RISK_COLOR = { HIGH: C.rd, MEDIUM: C.am, LOW: C.gn };
const OBL_COLOR = { OPEN: C.bl, IN_PROGRESS: C.am, MET: C.gn, BREACHED: C.rd, WAIVED: C.t3 };

function Pill({ t, c }) {
  return <span style={{ fontSize: 9, fontFamily: M, letterSpacing: .6, padding: "2px 7px", borderRadius: 3, textTransform: "uppercase", color: c, border: `1px solid ${c}55` }}>{t}</span>;
}

export function ContractDetailModal({ contractId, canManage, onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(() => {
    setError(null);
    fetch(`/api/contracts/${contractId}`)
      .then((r) => (r.ok ? r.json() : r.json().then((d) => Promise.reject(d.error || `HTTP ${r.status}`))))
      .then((d) => setData(d.contract))
      .catch((e) => setError(String(e)));
  }, [contractId]);
  useEffect(() => { load(); }, [load]);

  const setObligationStatus = async (obligationId, status) => {
    setBusy(obligationId);
    try {
      const r = await fetch(`/api/contracts/${contractId}/obligations/${obligationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!r.ok) throw new Error((await r.json()).error || `HTTP ${r.status}`);
      load();
      onChanged?.();
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(null);
    }
  };

  const c = data;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(4,7,15,.72)", zIndex: 1000, display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "5vh 16px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ fontFamily: F, background: C.bg, border: `1px solid ${C.br}`, borderRadius: 8, width: "min(860px, 100%)", boxShadow: "0 24px 80px rgba(0,0,0,.5)" }}>
        {error && <div style={{ padding: "10px 18px", color: C.rd, fontFamily: M, fontSize: 11, borderBottom: `1px solid ${C.br}` }}>⚠ {error}</div>}
        {!c ? (
          <div style={{ padding: 48, textAlign: "center", color: C.t3, fontFamily: M, fontSize: 12, letterSpacing: 1 }}>◎ Loading contract…</div>
        ) : (
          <>
            <div style={{ padding: "16px 18px", borderBottom: `1px solid ${C.br}`, borderLeft: `3px solid ${RISK_COLOR[c.risk]}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 5 }}>
                    <Pill t={c.status.replace(/_/g, " ")} c={C.tl} />
                    <Pill t={`${c.risk} RISK`} c={RISK_COLOR[c.risk]} />
                    {c.type && <span style={{ fontSize: 10, fontFamily: M, color: C.t3 }}>{c.type}</span>}
                  </div>
                  <div style={{ fontSize: 19, fontFamily: SR, color: C.t1, lineHeight: 1.2 }}>{c.title}</div>
                  <div style={{ fontSize: 11, color: C.t3, marginTop: 3 }}>
                    {c.counterpartyName || "No counterparty"}{c.matterTitle ? ` · Matter: ${c.matterTitle}` : ""}{c.governingLaw ? ` · ${c.governingLaw}` : ""}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 22, fontFamily: SR, color: C.t1, lineHeight: 1 }}>{money(c.value, c.currency)}</div>
                  <div style={{ fontSize: 9, color: C.t4, fontFamily: M }}>contract value</div>
                  <div onClick={onClose} style={{ marginTop: 8, cursor: "pointer", fontSize: 10, fontFamily: M, color: C.t3, letterSpacing: 1 }}>✕ CLOSE</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap", fontSize: 10.5, fontFamily: M, color: C.t3 }}>
                <span>Effective <span style={{ color: C.t1 }}>{fmtDate(c.effectiveDate)}</span></span>
                <span>Expires <span style={{ color: c.daysToExpiry != null && c.daysToExpiry <= 90 ? C.am : C.t1 }}>{fmtDate(c.expiryDate)}</span>{c.daysToExpiry != null && <span style={{ color: c.daysToExpiry < 0 ? C.rd : c.daysToExpiry <= 90 ? C.am : C.t4 }}> ({c.daysToExpiry < 0 ? `${-c.daysToExpiry}d ago` : `${c.daysToExpiry}d`})</span>}</span>
                {c.autoRenew && <span style={{ color: C.am }}>⟳ Auto-renew{c.noticeWindowDays ? ` · ${c.noticeWindowDays}d notice` : ""}</span>}
              </div>
            </div>

            {/* Clauses */}
            <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.br}` }}>
              <div style={{ fontSize: 10, fontFamily: M, color: C.t3, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 600, marginBottom: 10 }}>
                Clause analysis <span style={{ color: C.t4 }}>· {c.clauses.length} extracted · {c.deviationCount} deviating</span>
              </div>
              {c.clauses.length === 0 ? (
                <div style={{ fontSize: 11, color: C.t4, fontStyle: "italic" }}>No clauses extracted yet. The contract agent populates these on review (CTR-2).</div>
              ) : c.clauses.map((cl) => (
                <div key={cl.id} style={{ padding: "8px 0", borderBottom: `1px solid ${C.br}22` }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 3 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: C.t1 }}>{cl.type.replace(/_/g, " ")}</span>
                    <Pill t={cl.risk} c={RISK_COLOR[cl.risk]} />
                    {cl.deviation && <Pill t="DEVIATES" c={C.rd} />}
                  </div>
                  {cl.summary && <div style={{ fontSize: 10.5, color: C.tl, marginBottom: 2 }}>{cl.summary}</div>}
                  <div style={{ fontSize: 10.5, color: C.t2, lineHeight: 1.5 }}>{cl.text}</div>
                </div>
              ))}
            </div>

            {/* Obligations */}
            <div style={{ padding: "14px 18px" }}>
              <div style={{ fontSize: 10, fontFamily: M, color: C.t3, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 600, marginBottom: 10 }}>
                Obligations &amp; key dates <span style={{ color: C.t4 }}>· {c.obligations.length} · {c.overdueObligationCount} overdue</span>
              </div>
              {c.obligations.length === 0 ? (
                <div style={{ fontSize: 11, color: C.t4, fontStyle: "italic" }}>No obligations tracked yet.</div>
              ) : c.obligations.map((o) => (
                <div key={o.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.br}22` }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11.5, color: C.t1, marginBottom: 2 }}>{o.description}</div>
                    <div style={{ display: "flex", gap: 10, fontSize: 10, color: C.t3, fontFamily: M, flexWrap: "wrap", alignItems: "center" }}>
                      <span>Due <span style={{ color: o.overdue ? C.rd : C.t1 }}>{fmtDate(o.dueDate)}</span></span>
                      {o.recurrence && <span style={{ color: C.tl }}>⟳ {o.recurrence}</span>}
                      {o.ownerName && <span>Owner {o.ownerName}</span>}
                      <Pill t={o.status.replace(/_/g, " ")} c={OBL_COLOR[o.status]} />
                      {o.overdue && <span style={{ color: C.rd }}>⚠ overdue</span>}
                    </div>
                  </div>
                  {canManage && o.status !== "MET" && o.status !== "WAIVED" && (
                    <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                      {o.status === "OPEN" && (
                        <button disabled={busy === o.id} onClick={() => setObligationStatus(o.id, "IN_PROGRESS")} style={btn(C.am)}>Start</button>
                      )}
                      <button disabled={busy === o.id} onClick={() => setObligationStatus(o.id, "MET")} style={btn(C.gn)}>Mark met</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const btn = (c) => ({
  padding: "4px 10px", borderRadius: 4, border: `1px solid ${c}`, background: "transparent",
  color: c, fontSize: 9.5, fontFamily: M, fontWeight: 600, letterSpacing: .5, cursor: "pointer", textTransform: "uppercase",
});
