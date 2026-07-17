import { useState, useEffect, useCallback, useMemo } from "react";
import { C, F, M, SR } from "@aegis/ui";
import { ContractDetailModal } from "./contract-detail-modal.jsx";

// ── Contract repository (CTR-1) ──────────────────────────────────────
//
// The ContractsView mock made real: a searchable registry over persisted
// Contract rows with risk + lifecycle badges, expiry/obligation posture,
// and a drill-in that shows extracted clauses + the shared Obligation
// entity. Data comes from GET /api/contracts/overview (gated
// contracts:read_all). Replaces apps/web/src/views/v72.jsx ContractsView.

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
const STATUS_COLOR = {
  DRAFT: C.t3, IN_REVIEW: C.bl, IN_NEGOTIATION: C.am, APPROVED: C.tl,
  EXECUTED: C.gn, ACTIVE: C.gn, EXPIRED: C.t3, TERMINATED: C.rd,
};

function Kpi({ label, value, sub, color }) {
  return (
    <div style={{ flex: 1, minWidth: 140, padding: "13px 15px", background: C.cd, border: `1px solid ${C.br}`, borderRadius: 6 }}>
      <div style={{ fontSize: 9, fontFamily: M, color: C.t3, letterSpacing: 1.4, textTransform: "uppercase", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 24, fontFamily: SR, color: color || C.t1, marginTop: 4, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 9.5, color: C.t3, fontFamily: M, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

const STATUS_FILTERS = ["ALL", "DRAFT", "IN_REVIEW", "IN_NEGOTIATION", "APPROVED", "EXECUTED", "ACTIVE", "EXPIRED", "TERMINATED"];

export function ContractsRepository() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [canManage, setCanManage] = useState(false);

  const load = useCallback(() => {
    fetch("/api/contracts/overview")
      .then((r) => (r.ok ? r.json() : r.json().then((d) => Promise.reject(d.error || `HTTP ${r.status}`))))
      .then((d) => setData(d.overview))
      .catch((e) => setError(String(e)));
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch("/api/auth/current-user")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const perms = d?.user?.permissions || [];
        setCanManage(perms.includes("contracts:create") || perms.includes("contracts:approve"));
      })
      .catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    return data.contracts.filter((c) => {
      if (statusFilter !== "ALL" && c.status !== statusFilter) return false;
      if (!needle) return true;
      return (
        c.title.toLowerCase().includes(needle) ||
        (c.counterpartyName || "").toLowerCase().includes(needle) ||
        (c.type || "").toLowerCase().includes(needle)
      );
    });
  }, [data, q, statusFilter]);

  if (error) return <div style={{ padding: 24, color: C.rd, fontFamily: M, fontSize: 12 }}>⚠ {error}</div>;
  if (!data) return <div style={{ padding: 40, textAlign: "center", color: C.t3, fontFamily: M, fontSize: 12, letterSpacing: 1 }}>◎ Loading contracts…</div>;

  const t = data.totals;

  return (
    <div style={{ fontFamily: F, color: C.t1 }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, fontFamily: M, letterSpacing: 2, color: C.bl, textTransform: "uppercase" }}>Legal · Contract Lifecycle Management</div>
        <div style={{ fontSize: 24, fontFamily: SR, color: C.t1, lineHeight: 1.2 }}>The contract <em style={{ color: C.bl, fontStyle: "italic" }}>system of record</em></div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <Kpi label="Total" value={t.total} sub={`${money(t.totalValue)} value`} />
        <Kpi label="Active" value={t.active} sub="executed / live" color={C.gn} />
        <Kpi label="In flight" value={t.inFlight} sub="draft → approval" color={C.am} />
        <Kpi label="High risk" value={t.highRisk} sub="needs attention" color={t.highRisk > 0 ? C.rd : C.t3} />
        <Kpi label="Expiring 90d" value={t.expiringSoon} sub="renewal window" color={t.expiringSoon > 0 ? C.am : C.t3} />
        <Kpi label="Obligations" value={t.openObligations} sub={t.overdueObligations > 0 ? `${t.overdueObligations} overdue` : "on track"} color={t.overdueObligations > 0 ? C.rd : C.tl} />
      </div>

      {/* Search + status filter */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title / counterparty / type…"
          style={{ flex: 1, minWidth: 200, padding: "8px 12px", background: C.cd, border: `1px solid ${C.br}`, borderRadius: 5, color: C.t1, fontFamily: F, fontSize: 12, outline: "none" }} />
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {STATUS_FILTERS.map((s) => {
            const n = s === "ALL" ? data.contracts.length : (data.byStatus[s] || 0);
            const active = statusFilter === s;
            return (
              <span key={s} onClick={() => setStatusFilter(s)} style={{ cursor: "pointer", fontSize: 9.5, fontFamily: M, letterSpacing: .5, padding: "5px 9px", borderRadius: 4, textTransform: "uppercase", color: active ? C.bg : (STATUS_COLOR[s] || C.t2), background: active ? (STATUS_COLOR[s] || C.t2) : "transparent", border: `1px solid ${active ? (STATUS_COLOR[s] || C.t2) : C.br}`, opacity: n === 0 && s !== "ALL" ? .4 : 1 }}>
                {s.replace(/_/g, " ")} {n}
              </span>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <div style={{ background: C.cd, border: `1px solid ${C.br}`, borderRadius: 6, padding: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.8fr 1.2fr 100px 90px 95px 90px 1fr", gap: 8, fontSize: 9, fontFamily: M, color: C.t4, letterSpacing: 1, textTransform: "uppercase", padding: "0 4px 8px", borderBottom: `1px solid ${C.br}` }}>
          <span>Contract</span><span>Counterparty</span><span>Value</span><span>Status</span><span>Risk</span><span>Expiry</span><span>Signals</span>
        </div>
        {filtered.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: C.t4, fontFamily: M, fontSize: 11 }}>No contracts match.</div>
        ) : filtered.map((c) => (
          <div key={c.id} onClick={() => setOpen(c.id)} style={{ display: "grid", gridTemplateColumns: "1.8fr 1.2fr 100px 90px 95px 90px 1fr", gap: 8, fontSize: 11, alignItems: "center", padding: "10px 4px", borderBottom: `1px solid ${C.br}33`, cursor: "pointer" }} onMouseEnter={(e) => (e.currentTarget.style.background = C.s1)} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
            <span style={{ color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {c.title}
              <span style={{ color: C.t4, fontFamily: M, fontSize: 9, marginLeft: 6 }}>{c.type}</span>
            </span>
            <span style={{ color: C.t2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.counterpartyName || "—"}</span>
            <span style={{ fontFamily: M, color: C.t1 }}>{money(c.value, c.currency)}</span>
            <span style={{ fontFamily: M, fontSize: 9, letterSpacing: .5, color: STATUS_COLOR[c.status] || C.t3 }}>{c.status.replace(/_/g, " ")}</span>
            <span style={{ fontFamily: M, fontSize: 9.5, fontWeight: 700, color: RISK_COLOR[c.risk] }}>{c.risk}</span>
            <span style={{ fontFamily: M, fontSize: 10, color: c.daysToExpiry != null && c.daysToExpiry < 0 ? C.rd : c.daysToExpiry != null && c.daysToExpiry <= 90 ? C.am : C.t3 }}>{fmtDate(c.expiryDate)}</span>
            <span style={{ fontFamily: M, fontSize: 9.5, color: C.t3, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {c.clauseCount > 0 && <span title="clauses">📋 {c.clauseCount}{c.deviationCount > 0 && <span style={{ color: C.rd }}> ⚠{c.deviationCount}</span>}</span>}
              {c.obligationCount > 0 && <span title="obligations" style={{ color: c.overdueObligationCount > 0 ? C.rd : C.tl }}>◷ {c.openObligationCount}/{c.obligationCount}</span>}
              {c.autoRenew && <span title="auto-renew" style={{ color: C.am }}>⟳</span>}
            </span>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 9.5, color: C.t4, fontFamily: M, marginTop: 12, letterSpacing: .3 }}>
        Click a contract to see extracted clauses and obligations. Obligations are the shared entity — the same rows Company Brain, Regulatory, and Governance query. Every obligation transition is chain-sealed.
      </div>

      {open && (
        <ContractDetailModal
          contractId={open}
          canManage={canManage}
          onClose={() => setOpen(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
