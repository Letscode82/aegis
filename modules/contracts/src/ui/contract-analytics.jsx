import { useState, useEffect, useCallback } from "react";
import { C, F, M, SR } from "@aegis/ui";

// ── Contract portfolio analytics dashboard (CLM Phase 10) ────────────
//
// The GC's executive read on the whole contract book: value & exposure,
// cycle time, value-at-risk, renewal forecast, obligation compliance,
// clause-deviation frequency, and counterparty concentration. Pure read
// over GET /api/contracts/analytics (gated contracts:read_all) — no
// mutation, no AI.

const money = (n, ccy) => {
  if (n == null) return "—";
  const v = Number(n) || 0;
  const sym = ccy === "EUR" ? "€" : ccy === "GBP" ? "£" : "$";
  const s = Math.abs(v) >= 1_000_000 ? `${(v / 1_000_000).toFixed(2)}M`
    : Math.abs(v) >= 1_000 ? `${(v / 1_000).toFixed(1)}k`
    : `${v.toFixed(0)}`;
  return `${sym}${s}`;
};
const pct = (x) => (x == null ? "—" : `${Math.round(x * 100)}%`);
const RISK_COLOR = { HIGH: C.rd, MEDIUM: C.am, LOW: C.gn };
const STATUS_COLOR = {
  DRAFT: C.t3, IN_REVIEW: C.bl, IN_NEGOTIATION: C.am, APPROVED: C.tl,
  EXECUTED: C.gn, ACTIVE: C.gn, EXPIRED: C.t3, TERMINATED: C.rd,
};
const monthLabel = (m) => {
  const [y, mo] = String(m).split("-");
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[(Number(mo) || 1) - 1]} ${String(y).slice(2)}`;
};

function Tile({ label, value, sub, color = C.t1 }) {
  return (
    <div style={{ flex: "1 1 150px", minWidth: 150, padding: "12px 14px", background: C.cd, border: `1px solid ${C.br}`, borderRadius: 7 }}>
      <div style={{ fontSize: 9, fontFamily: M, letterSpacing: 1.2, color: C.t3, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 22, fontFamily: SR, color, lineHeight: 1.2, marginTop: 3 }}>{value}</div>
      {sub != null && <div style={{ fontSize: 9.5, fontFamily: M, color: C.t4, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Panel({ title, hint, children }) {
  return (
    <div style={{ padding: "13px 15px", background: C.cd, border: `1px solid ${C.br}`, borderRadius: 7 }}>
      <div style={{ fontSize: 10, fontFamily: M, letterSpacing: 1.2, color: C.t2, textTransform: "uppercase", fontWeight: 600 }}>{title}</div>
      {hint && <div style={{ fontSize: 9, fontFamily: M, color: C.t4, marginTop: 2, marginBottom: 8 }}>{hint}</div>}
      <div style={{ marginTop: hint ? 0 : 10 }}>{children}</div>
    </div>
  );
}

// Horizontal labelled bar. `max` normalises width; `right` is the trailing value.
function BarRow({ label, color = C.bl, value, max, right }) {
  const w = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
      <div style={{ width: 118, fontSize: 10, fontFamily: M, color: C.t2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={label}>{label}</div>
      <div style={{ flex: 1, height: 8, background: C.s1, borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: `${w}%`, height: "100%", background: color, borderRadius: 4 }} />
      </div>
      <div style={{ width: 74, textAlign: "right", fontSize: 10, fontFamily: M, color: C.t3 }}>{right}</div>
    </div>
  );
}

const EMPTY = <div style={{ fontSize: 10, fontFamily: M, color: C.t4, fontStyle: "italic", padding: "6px 0" }}>No data yet.</div>;

export function ContractAnalyticsDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [horizon, setHorizon] = useState(180);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    fetch(`/api/contracts/analytics?horizon=${horizon}`)
      .then((r) => (r.ok ? r.json() : r.json().then((d) => Promise.reject(d.error || `HTTP ${r.status}`))))
      .then((d) => setData(d.analytics))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [horizon]);
  useEffect(() => { load(); }, [load]);

  if (loading && !data) return <div style={{ fontSize: 11, fontFamily: M, color: C.t4, padding: "20px 0" }}>Loading analytics…</div>;
  if (error) return <div style={{ fontSize: 11, fontFamily: M, color: C.rd, padding: "16px 0" }}>⚠ {error}</div>;
  if (!data) return null;

  const { totals: t, byStatus, byRisk, byType, cycleTime: ct, valueAtRisk, renewalForecast: rf, obligationCompliance: oc, clauseDeviations, counterpartyConcentration: cc } = data;
  const ccy = t.currency;
  const maxStatus = Math.max(1, ...byStatus.map((b) => b.count));
  const maxType = Math.max(1, ...byType.map((b) => b.count));
  const maxVar = Math.max(1, ...valueAtRisk.map((b) => b.value));
  const maxRenew = Math.max(1, ...rf.buckets.map((b) => b.value));
  const maxCp = Math.max(1, ...cc.map((b) => b.liveValue));
  const complianceColor = oc.complianceRate == null ? C.t3 : oc.complianceRate >= 0.9 ? C.gn : oc.complianceRate >= 0.7 ? C.am : C.rd;

  return (
    <div style={{ fontFamily: F }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ fontSize: 9, fontFamily: M, color: C.t4, letterSpacing: .5 }}>
          Portfolio snapshot · {data.generatedAt ? new Date(data.generatedAt).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "—"}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 9, fontFamily: M, color: C.t3, textTransform: "uppercase", letterSpacing: 1 }}>Renewal horizon</span>
          {[90, 180, 365].map((h) => (
            <span key={h} onClick={() => setHorizon(h)} style={{ cursor: "pointer", fontSize: 10, fontFamily: M, padding: "3px 9px", borderRadius: 4, border: `1px solid ${horizon === h ? C.bl : C.br}`, color: horizon === h ? C.bl : C.t3, fontWeight: horizon === h ? 700 : 400 }}>{h}d</span>
          ))}
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <Tile label="Total value" value={money(t.totalValue, ccy)} sub={`${t.total} contracts`} />
        <Tile label="Live value" value={money(t.liveValue, ccy)} sub={`${t.live} active / executed`} color={C.gn} />
        <Tile label="High-risk exposure" value={money(t.highRiskLiveValue, ccy)} sub="live value in HIGH-risk paper" color={t.highRiskLiveValue > 0 ? C.rd : C.t3} />
        <Tile label="Avg cycle time" value={ct.avgDays == null ? "—" : `${ct.avgDays}d`} sub={ct.medianDays == null ? `${ct.executedCount} executed` : `median ${ct.medianDays}d · ${ct.executedCount} executed`} color={C.bl} />
        <Tile label="Obligation compliance" value={pct(oc.complianceRate)} sub={`${oc.met} met · ${oc.breached} breached · ${oc.overdueOpen} overdue`} color={complianceColor} />
        <Tile label={`$ up for renewal (${rf.horizonDays}d)`} value={money(rf.valueUpForRenewal, ccy)} sub={`${rf.totalUpForRenewal} contracts · ${rf.autoRenewCount} auto`} color={rf.totalUpForRenewal > 0 ? C.am : C.t3} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12 }}>
        {/* Value at risk */}
        <Panel title="Value at risk" hint="Live contract value by risk band">
          {valueAtRisk.every((b) => b.count === 0) ? EMPTY : valueAtRisk.map((b) => (
            <BarRow key={b.band} label={b.band} color={RISK_COLOR[b.band]} value={b.value} max={maxVar} right={`${money(b.value, ccy)} · ${b.count}`} />
          ))}
        </Panel>

        {/* Renewal forecast */}
        <Panel title="Renewal forecast" hint={`Live contracts expiring in the next ${rf.horizonDays} days${rf.expiredUnresolved > 0 ? ` · ${rf.expiredUnresolved} already expired` : ""}`}>
          {rf.buckets.length === 0 ? EMPTY : rf.buckets.map((b) => (
            <BarRow key={b.month} label={monthLabel(b.month)} color={C.am} value={b.value} max={maxRenew} right={`${money(b.value, ccy)} · ${b.count}${b.autoRenewCount ? ` (${b.autoRenewCount}⟳)` : ""}`} />
          ))}
        </Panel>

        {/* By status */}
        <Panel title="By lifecycle status" hint="Contract count per stage">
          {byStatus.length === 0 ? EMPTY : byStatus.map((b) => (
            <BarRow key={b.key} label={b.key.replace(/_/g, " ")} color={STATUS_COLOR[b.key] || C.bl} value={b.count} max={maxStatus} right={`${b.count} · ${money(b.value, ccy)}`} />
          ))}
        </Panel>

        {/* By type */}
        <Panel title="By contract type" hint="Count + value per type">
          {byType.length === 0 ? EMPTY : byType.slice(0, 8).map((b) => (
            <BarRow key={b.key} label={b.key} color={C.tl} value={b.count} max={maxType} right={`${b.count} · ${money(b.value, ccy)}`} />
          ))}
        </Panel>

        {/* Counterparty concentration */}
        <Panel title="Counterparty concentration" hint="Top counterparties by live value & portfolio share">
          {cc.length === 0 ? EMPTY : cc.map((b) => (
            <BarRow key={b.counterpartyId || b.counterpartyName} label={b.counterpartyName} color={C.bl} value={b.liveValue} max={maxCp} right={`${money(b.liveValue, ccy)} · ${pct(b.share)}`} />
          ))}
        </Panel>

        {/* Clause deviation frequency */}
        <Panel title="Clause deviation frequency" hint="How often each clause type deviates from our paper">
          {clauseDeviations.length === 0 ? EMPTY : clauseDeviations.slice(0, 8).map((b) => (
            <BarRow key={b.type} label={b.type} color={b.deviationRate >= 0.5 ? C.rd : b.deviationRate >= 0.25 ? C.am : C.gn} value={b.deviationRate} max={1} right={`${pct(b.deviationRate)} · ${b.deviations}/${b.total}`} />
          ))}
        </Panel>
      </div>

      {/* Cycle-time detail footer */}
      <div style={{ marginTop: 12, padding: "11px 15px", background: C.cd, border: `1px solid ${C.br}`, borderRadius: 7, display: "flex", gap: 22, flexWrap: "wrap", fontSize: 10, fontFamily: M, color: C.t3 }}>
        <span><span style={{ color: C.t4 }}>Cycle time</span> — fastest <b style={{ color: C.gn }}>{ct.fastestDays == null ? "—" : `${ct.fastestDays}d`}</b> · slowest <b style={{ color: C.am }}>{ct.slowestDays == null ? "—" : `${ct.slowestDays}d`}</b></span>
        <span><span style={{ color: C.t4 }}>In flight</span> — <b style={{ color: C.t2 }}>{ct.inFlightCount}</b> open{ct.oldestInFlightDays != null ? <> · oldest <b style={{ color: ct.oldestInFlightDays > 60 ? C.rd : C.t2 }}>{ct.oldestInFlightDays}d</b></> : null}</span>
        <span><span style={{ color: C.t4 }}>Obligations</span> — <b style={{ color: C.t2 }}>{oc.total}</b> total · <b style={{ color: C.gn }}>{oc.met}</b> met · <b style={{ color: C.rd }}>{oc.breached}</b> breached · <b style={{ color: C.am }}>{oc.overdueOpen}</b> overdue · {oc.waived} waived</span>
      </div>
    </div>
  );
}
