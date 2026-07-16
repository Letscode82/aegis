import { useState, useEffect } from "react";
import { C, F, M, SR } from "@aegis/ui";

// ── Legal Spend & Outside-Counsel dashboard (SP-2) ───────────────────
//
// The GC's spend cockpit: KPI row, AI-proposed savings from the review
// engine, spend-by-firm, budget-vs-actual, the invoice queue (each row
// scrubbed for flags), and the outside-counsel roster. Read-only in
// SP-2 — the review/short-pay actions land in SP-3. Data comes from
// GET /api/spend/overview (gated spend:read_all).

const money = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(1)}k`;
  return `$${v.toFixed(0)}`;
};

const STATUS_COLOR = {
  SUBMITTED: C.bl, IN_REVIEW: C.am, APPROVED: C.gn, REJECTED: C.rd, PAID: C.tl,
};

function Kpi({ label, value, sub, color }) {
  return (
    <div style={{ flex: 1, minWidth: 160, padding: "14px 16px", background: C.cd, border: `1px solid ${C.br}`, borderRadius: 6 }}>
      <div style={{ fontSize: 9, fontFamily: M, color: C.t3, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 26, fontFamily: SR, color: color || C.t1, marginTop: 4, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: C.t3, fontFamily: M, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Bar({ pct, color }) {
  return (
    <div style={{ height: 7, background: C.s1, borderRadius: 4, overflow: "hidden" }}>
      <div style={{ width: `${Math.min(100, pct)}%`, height: "100%", background: color, transition: "width .3s" }} />
    </div>
  );
}

export function SpendDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let on = true;
    fetch("/api/spend/overview")
      .then((r) => (r.ok ? r.json() : r.json().then((d) => Promise.reject(d.error || `HTTP ${r.status}`))))
      .then((d) => { if (on) setData(d.overview); })
      .catch((e) => { if (on) setError(String(e)); });
    return () => { on = false; };
  }, []);

  if (error) return <div style={{ padding: 24, color: C.rd, fontFamily: M, fontSize: 12 }}>⚠ {error}</div>;
  if (!data) return <div style={{ padding: 40, textAlign: "center", color: C.t3, fontFamily: M, fontSize: 12, letterSpacing: 1 }}>◎ Loading spend…</div>;

  const t = data.totals;
  const maxFirm = Math.max(1, ...data.firms.map((f) => f.totalBilled));

  return (
    <div style={{ fontFamily: F, color: C.t1 }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, fontFamily: M, letterSpacing: 2, color: C.am, textTransform: "uppercase" }}>Operations · Legal · Spend &amp; Outside Counsel</div>
        <div style={{ fontSize: 24, fontFamily: SR, color: C.t1, lineHeight: 1.2 }}>Legal spend, <em style={{ color: C.am, fontStyle: "italic" }}>scrubbed &amp; controlled</em></div>
      </div>

      {/* KPI row */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <Kpi label="Total billed" value={money(t.totalBilled)} sub={`${t.invoiceCount} invoices`} />
        <Kpi label="In review" value={t.inReviewCount} sub="awaiting sign-off" color={C.am} />
        <Kpi label="AI-proposed savings" value={money(t.potentialSavings)} sub="deterministic flags · needs approval" color={C.gn} />
        <Kpi label="Budget" value={`${t.budgetAllocated > 0 ? Math.round((t.budgetSpent / t.budgetAllocated) * 100) : 0}%`} sub={`${money(t.budgetSpent)} of ${money(t.budgetAllocated)}`} color={C.tl} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        {/* Spend by firm */}
        <div style={{ background: C.cd, border: `1px solid ${C.br}`, borderRadius: 6, padding: 16 }}>
          <div style={{ fontSize: 11, fontFamily: M, color: C.t3, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 600, marginBottom: 12 }}>Spend by firm</div>
          {data.firms.map((f) => (
            <div key={f.vendorId} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginBottom: 3 }}>
                <span style={{ color: C.t1 }}>{f.name} <span style={{ color: C.t4, fontFamily: M, fontSize: 9 }}>{f.type}</span></span>
                <span style={{ fontFamily: M, color: C.t2 }}>{money(f.totalBilled)}</span>
              </div>
              <Bar pct={(f.totalBilled / maxFirm) * 100} color={C.am} />
            </div>
          ))}
        </div>

        {/* Budget vs actual */}
        <div style={{ background: C.cd, border: `1px solid ${C.br}`, borderRadius: 6, padding: 16 }}>
          <div style={{ fontSize: 11, fontFamily: M, color: C.t3, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 600, marginBottom: 12 }}>Budget vs actual</div>
          {data.budgets.map((b) => {
            const col = b.utilizationPct >= 90 ? C.rd : b.utilizationPct >= 70 ? C.am : C.gn;
            return (
              <div key={b.id} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginBottom: 3 }}>
                  <span style={{ color: C.t1 }}>{b.scopeLabel} <span style={{ color: C.t4, fontFamily: M, fontSize: 9 }}>{b.scope} · {b.period}</span></span>
                  <span style={{ fontFamily: M, color: col }}>{b.utilizationPct}%</span>
                </div>
                <Bar pct={b.utilizationPct} color={col} />
                <div style={{ fontSize: 9.5, color: C.t4, fontFamily: M, marginTop: 2 }}>{money(b.spent)} of {money(b.allocated)} · {money(b.remaining)} left</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Invoice queue */}
      <div style={{ background: C.cd, border: `1px solid ${C.br}`, borderRadius: 6, padding: 16, marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontFamily: M, color: C.t3, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 600, marginBottom: 12 }}>Invoice queue · AI-scrubbed</div>
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1.6fr 90px 90px 80px 1fr", gap: 8, fontSize: 9, fontFamily: M, color: C.t4, letterSpacing: 1, textTransform: "uppercase", padding: "0 4px 8px", borderBottom: `1px solid ${C.br}` }}>
          <span>Firm</span><span>Matter</span><span>Amount</span><span>Status</span><span>Flags</span><span>Proposed savings</span>
        </div>
        {data.invoices.map((inv) => (
          <div key={inv.id} style={{ display: "grid", gridTemplateColumns: "1.4fr 1.6fr 90px 90px 80px 1fr", gap: 8, fontSize: 11, alignItems: "center", padding: "9px 4px", borderBottom: `1px solid ${C.br}33` }}>
            <span style={{ color: C.t1 }}>{inv.vendorName}</span>
            <span style={{ color: C.t2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inv.matterTitle}</span>
            <span style={{ fontFamily: M, color: C.t1 }}>{money(inv.amount)}</span>
            <span style={{ fontFamily: M, fontSize: 9, letterSpacing: .5, color: STATUS_COLOR[inv.status] || C.t3 }}>{inv.status.replace("_", " ")}</span>
            <span style={{ fontFamily: M }}>
              {inv.flagCount === 0 ? <span style={{ color: C.gn }}>✓ clean</span> : (
                <>
                  {inv.deterministicFlagCount > 0 && <span style={{ color: C.rd }} title="deterministic flags">⚑{inv.deterministicFlagCount}</span>}
                  {inv.judgmentFlagCount > 0 && <span style={{ color: C.am, marginLeft: 4 }} title="AI-judgment flags (need approval)">◑{inv.judgmentFlagCount}</span>}
                </>
              )}
            </span>
            <span style={{ fontFamily: M, color: inv.proposedSavings > 0 ? C.gn : C.t4 }}>{inv.proposedSavings > 0 ? money(inv.proposedSavings) : "—"}</span>
          </div>
        ))}
      </div>

      {/* Outside counsel roster */}
      <div style={{ background: C.cd, border: `1px solid ${C.br}`, borderRadius: 6, padding: 16 }}>
        <div style={{ fontSize: 11, fontFamily: M, color: C.t3, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 600, marginBottom: 12 }}>Outside counsel · panel</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
          {data.firms.map((f) => (
            <div key={f.vendorId} style={{ padding: "11px 13px", background: C.s1, border: `1px solid ${C.br}`, borderRadius: 5 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12.5, color: C.t1, fontWeight: 600 }}>{f.name}</span>
                {f.performanceScore != null && <span style={{ fontSize: 11, fontFamily: M, color: f.performanceScore >= 4.3 ? C.gn : C.am }}>★ {f.performanceScore.toFixed(1)}</span>}
              </div>
              <div style={{ fontSize: 9.5, fontFamily: M, color: C.t4, marginTop: 3, letterSpacing: .5 }}>{f.type} · {f.timekeeperCount} timekeepers · {f.invoiceCount} invoices</div>
              <div style={{ fontSize: 11, fontFamily: M, color: C.t2, marginTop: 6 }}>{money(f.totalBilled)} billed</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ fontSize: 9.5, color: C.t4, fontFamily: M, marginTop: 12, letterSpacing: .3 }}>
        Flags are advisory. Deterministic flags (⚑) propose a short-pay; AI-judgment flags (◑) need reviewer approval. Review &amp; short-pay actions land in the next release.
      </div>
    </div>
  );
}
