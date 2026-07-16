import { useState, useEffect } from "react";
import { C, F, M, SR } from "@aegis/ui";

// Outside-Counsel management (SP-4). The panel of law firms with each
// firm's rate card, timekeeper roster, and a data-driven scorecard —
// total billed, how many of its invoices the AI flagged, and the
// short-pay the engine proposes against it. Evidence for panel reviews
// and rate negotiations. Reads GET /api/spend/counsel (spend:read_all).

const money = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(1)}k`;
  return `$${v.toFixed(0)}`;
};

function Metric({ label, value, color }) {
  return (
    <div>
      <div style={{ fontSize: 8.5, fontFamily: M, color: C.t4, letterSpacing: 1, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 15, fontFamily: SR, color: color || C.t1, marginTop: 1 }}>{value}</div>
    </div>
  );
}

function FirmCard({ f }) {
  const [open, setOpen] = useState(false);
  const flagPct = f.scorecard.invoiceCount > 0 ? Math.round((f.scorecard.flaggedInvoiceCount / f.scorecard.invoiceCount) * 100) : 0;
  return (
    <div style={{ background: C.cd, border: `1px solid ${C.br}`, borderRadius: 6, padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div>
          <div style={{ fontSize: 15, fontFamily: SR, color: C.t1 }}>{f.name}</div>
          <div style={{ fontSize: 9.5, fontFamily: M, color: C.t4, marginTop: 2, letterSpacing: .5 }}>{f.type} · {f.timekeepers.length} timekeepers</div>
        </div>
        {f.performanceScore != null && (
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 8.5, fontFamily: M, color: C.t4, letterSpacing: 1, textTransform: "uppercase" }}>Performance</div>
            <div style={{ fontSize: 16, fontFamily: SR, color: f.performanceScore >= 4.3 ? C.gn : C.am }}>★ {f.performanceScore.toFixed(1)}</div>
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginTop: 12 }}>
        <Metric label="Billed" value={money(f.scorecard.totalBilled)} />
        <Metric label="Invoices" value={f.scorecard.invoiceCount} />
        <Metric label="Flagged" value={`${flagPct}%`} color={flagPct >= 50 ? C.rd : flagPct > 0 ? C.am : C.gn} />
        <Metric label="AI savings" value={`${f.scorecard.reductionRatePct}%`} color={C.gn} />
      </div>

      <div onClick={() => setOpen((o) => !o)} style={{ marginTop: 12, fontSize: 9.5, fontFamily: M, color: C.cy, letterSpacing: 1, textTransform: "uppercase", cursor: "pointer" }}>
        {open ? "▾ hide" : "▸ rate card & roster"}
      </div>

      {open && (
        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 14 }}>
          <div>
            <div style={{ fontSize: 9, fontFamily: M, color: C.t3, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Rate card</div>
            {f.rateCard.length === 0 ? <div style={{ fontSize: 10.5, color: C.t4 }}>No rate card on file.</div> : f.rateCard.map((r) => (
              <div key={r.tier} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "3px 0", borderBottom: `1px solid ${C.br}22` }}>
                <span style={{ color: C.t2 }}>{r.tier.replace(/_/g, " ")}</span>
                <span style={{ fontFamily: M, color: C.t1 }}>{money(r.rate)}/hr</span>
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 9, fontFamily: M, color: C.t3, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Timekeepers</div>
            {f.timekeepers.length === 0 ? <div style={{ fontSize: 10.5, color: C.t4 }}>No timekeepers on the roster.</div> : f.timekeepers.map((t) => (
              <div key={t.personId} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "3px 0", borderBottom: `1px solid ${C.br}22` }}>
                <span style={{ color: C.t1 }}>{t.name} <span style={{ color: C.t4, fontFamily: M, fontSize: 9 }}>{t.title}</span></span>
                <span style={{ fontFamily: M, color: C.t2 }}>{money(t.defaultRate)}/hr</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function OutsideCounselView() {
  const [firms, setFirms] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let on = true;
    fetch("/api/spend/counsel")
      .then((r) => (r.ok ? r.json() : r.json().then((d) => Promise.reject(d.error || `HTTP ${r.status}`))))
      .then((d) => { if (on) setFirms(d.firms); })
      .catch((e) => { if (on) setError(String(e)); });
    return () => { on = false; };
  }, []);

  if (error) return <div style={{ padding: 24, color: C.rd, fontFamily: M, fontSize: 12 }}>⚠ {error}</div>;
  if (!firms) return <div style={{ padding: 40, textAlign: "center", color: C.t3, fontFamily: M, fontSize: 12, letterSpacing: 1 }}>◎ Loading panel…</div>;

  const totalBilled = firms.reduce((s, f) => s + f.scorecard.totalBilled, 0);
  const totalSavings = firms.reduce((s, f) => s + f.scorecard.proposedSavings, 0);

  return (
    <div style={{ fontFamily: F, color: C.t1 }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, fontFamily: M, letterSpacing: 2, color: C.am, textTransform: "uppercase" }}>Operations · Legal · Outside Counsel</div>
        <div style={{ fontSize: 24, fontFamily: SR, color: C.t1, lineHeight: 1.2 }}>The panel, <em style={{ color: C.am, fontStyle: "italic" }}>measured</em></div>
        <div style={{ fontSize: 11, color: C.t3, fontFamily: M, marginTop: 4 }}>{firms.length} firms · {money(totalBilled)} billed · {money(totalSavings)} AI-proposed savings</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 14 }}>
        {firms.map((f) => <FirmCard key={f.vendorId} f={f} />)}
      </div>
      <div style={{ fontSize: 9.5, color: C.t4, fontFamily: M, marginTop: 12, letterSpacing: .3 }}>
        Scorecards are derived from each firm's invoices scrubbed by the review engine. Rate-card change approval + panel/RFP management land in a later release.
      </div>
    </div>
  );
}
