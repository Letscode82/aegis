import { useState, useEffect, useCallback } from "react";
import { C, F, M, SR } from "@aegis/ui";

// Outside-Counsel management (SP-4/SP-5). The panel of law firms with each
// firm's rate card, timekeeper roster, and a data-driven scorecard —
// total billed, how many of its invoices the AI flagged, and the
// short-pay the engine proposes against it. SP-5 adds editing: rate-card
// maintenance and timekeeper-roster CRUD, each chain-sealed.
// Reads GET /api/spend/counsel; writes POST /api/spend/counsel/*.

const money = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(1)}k`;
  return `$${v.toFixed(0)}`;
};

const inputStyle = { background: C.s1, border: `1px solid ${C.br}`, color: C.t1, fontFamily: F, fontSize: 11, padding: "5px 7px", borderRadius: 3, width: "100%" };

function Metric({ label, value, color }) {
  return (
    <div>
      <div style={{ fontSize: 8.5, fontFamily: M, color: C.t4, letterSpacing: 1, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 15, fontFamily: SR, color: color || C.t1, marginTop: 1 }}>{value}</div>
    </div>
  );
}

async function post(url, body) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json();
  if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
  return d;
}

function RateCardEditor({ vendorId, rateCard, onDone }) {
  const [rows, setRows] = useState(rateCard.map((r) => ({ tier: r.tier, rate: String(r.rate) })));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const setRow = (i, k, v) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const ratesCard = {};
      for (const r of rows) { const t = r.tier.trim(); const n = Math.round(Number(r.rate)); if (t && n > 0) ratesCard[t] = n; }
      await post("/api/spend/counsel/rate-card", { vendorId, ratesCard });
      onDone();
    } catch (e) { setErr(String(e.message || e)); setBusy(false); }
  };
  return (
    <div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "flex", gap: 6, marginBottom: 5 }}>
          <input value={r.tier} onChange={(e) => setRow(i, "tier", e.target.value)} placeholder="tier" style={{ ...inputStyle, flex: 1 }} />
          <input value={r.rate} onChange={(e) => setRow(i, "rate", e.target.value)} placeholder="rate/hr" style={{ ...inputStyle, width: 80 }} />
          <button onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} style={{ background: "none", border: `1px solid ${C.br}`, color: C.rd, borderRadius: 3, cursor: "pointer", fontSize: 11, padding: "0 8px" }}>×</button>
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        <button onClick={() => setRows((rs) => [...rs, { tier: "", rate: "" }])} style={{ background: "none", border: `1px dashed ${C.br}`, color: C.t3, borderRadius: 3, cursor: "pointer", fontSize: 10, fontFamily: M, padding: "5px 9px" }}>+ tier</button>
        <button onClick={busy ? undefined : save} style={{ background: C.am, border: "none", color: C.bg, borderRadius: 3, cursor: busy ? "default" : "pointer", fontSize: 10, fontFamily: M, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", padding: "5px 12px", opacity: busy ? .6 : 1 }}>Save rate card</button>
      </div>
      {err && <div style={{ color: C.rd, fontSize: 10, marginTop: 5 }}>⚠ {err}</div>}
    </div>
  );
}

function TimekeeperEditor({ vendorId, timekeepers, onDone }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [add, setAdd] = useState({ name: "", title: "", defaultRate: "" });
  const act = async (body) => {
    setBusy(true); setErr(null);
    try { await post("/api/spend/counsel/timekeepers", body); onDone(); }
    catch (e) { setErr(String(e.message || e)); setBusy(false); }
  };
  return (
    <div>
      {timekeepers.map((t) => (
        <div key={t.id} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 5, fontSize: 11 }}>
          <span style={{ flex: 1, color: C.t1 }}>{t.name} <span style={{ color: C.t4, fontFamily: M, fontSize: 9 }}>{t.title}</span></span>
          <input defaultValue={t.defaultRate} onBlur={(e) => { const r = Math.round(Number(e.target.value)); if (r > 0 && r !== t.defaultRate) act({ action: "update", timekeeperId: t.id, defaultRate: r }); }} style={{ ...inputStyle, width: 70 }} />
          <button onClick={busy ? undefined : () => act({ action: "remove", timekeeperId: t.id })} style={{ background: "none", border: `1px solid ${C.br}`, color: C.rd, borderRadius: 3, cursor: "pointer", fontSize: 11, padding: "0 8px" }}>×</button>
        </div>
      ))}
      <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
        <input value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} placeholder="name" style={{ ...inputStyle, flex: 1, minWidth: 90 }} />
        <input value={add.title} onChange={(e) => setAdd({ ...add, title: e.target.value })} placeholder="title" style={{ ...inputStyle, width: 90 }} />
        <input value={add.defaultRate} onChange={(e) => setAdd({ ...add, defaultRate: e.target.value })} placeholder="rate" style={{ ...inputStyle, width: 60 }} />
        <button
          onClick={busy || !add.name.trim() || !(Number(add.defaultRate) > 0) ? undefined : () => { act({ action: "add", vendorId, name: add.name, title: add.title, defaultRate: Number(add.defaultRate) }); setAdd({ name: "", title: "", defaultRate: "" }); }}
          style={{ background: C.cy, border: "none", color: C.bg, borderRadius: 3, cursor: "pointer", fontSize: 10, fontFamily: M, fontWeight: 700, padding: "5px 10px", opacity: busy || !add.name.trim() || !(Number(add.defaultRate) > 0) ? .5 : 1 }}>+ add</button>
      </div>
      {err && <div style={{ color: C.rd, fontSize: 10, marginTop: 5 }}>⚠ {err}</div>}
    </div>
  );
}

function FirmCard({ f, reload }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const flagPct = f.scorecard.invoiceCount > 0 ? Math.round((f.scorecard.flaggedInvoiceCount / f.scorecard.invoiceCount) * 100) : 0;
  const done = () => { setEditing(false); reload(); };
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

      <div style={{ marginTop: 12, display: "flex", gap: 14 }}>
        <span onClick={() => setOpen((o) => !o)} style={{ fontSize: 9.5, fontFamily: M, color: C.cy, letterSpacing: 1, textTransform: "uppercase", cursor: "pointer" }}>{open ? "▾ hide" : "▸ rate card & roster"}</span>
        {open && <span onClick={() => setEditing((e) => !e)} style={{ fontSize: 9.5, fontFamily: M, color: editing ? C.t3 : C.am, letterSpacing: 1, textTransform: "uppercase", cursor: "pointer" }}>{editing ? "done" : "✎ manage"}</span>}
      </div>

      {open && (
        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 14 }}>
          <div>
            <div style={{ fontSize: 9, fontFamily: M, color: C.t3, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Rate card</div>
            {editing ? <RateCardEditor vendorId={f.vendorId} rateCard={f.rateCard} onDone={done} /> : (
              f.rateCard.length === 0 ? <div style={{ fontSize: 10.5, color: C.t4 }}>No rate card on file.</div> : f.rateCard.map((r) => (
                <div key={r.tier} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "3px 0", borderBottom: `1px solid ${C.br}22` }}>
                  <span style={{ color: C.t2 }}>{r.tier.replace(/_/g, " ")}</span>
                  <span style={{ fontFamily: M, color: C.t1 }}>{money(r.rate)}/hr</span>
                </div>
              ))
            )}
          </div>
          <div>
            <div style={{ fontSize: 9, fontFamily: M, color: C.t3, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Timekeepers</div>
            {editing ? <TimekeeperEditor vendorId={f.vendorId} timekeepers={f.timekeepers} onDone={reload} /> : (
              f.timekeepers.length === 0 ? <div style={{ fontSize: 10.5, color: C.t4 }}>No timekeepers on the roster.</div> : f.timekeepers.map((t) => (
                <div key={t.personId} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "3px 0", borderBottom: `1px solid ${C.br}22` }}>
                  <span style={{ color: C.t1 }}>{t.name} <span style={{ color: C.t4, fontFamily: M, fontSize: 9 }}>{t.title}</span></span>
                  <span style={{ fontFamily: M, color: C.t2 }}>{money(t.defaultRate)}/hr</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function OutsideCounselView() {
  const [firms, setFirms] = useState(null);
  const [error, setError] = useState(null);

  const reload = useCallback(() => {
    fetch("/api/spend/counsel")
      .then((r) => (r.ok ? r.json() : r.json().then((d) => Promise.reject(d.error || `HTTP ${r.status}`))))
      .then((d) => setFirms(d.firms))
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => { reload(); }, [reload]);

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
        {firms.map((f) => <FirmCard key={f.vendorId} f={f} reload={reload} />)}
      </div>
      <div style={{ fontSize: 9.5, color: C.t4, fontFamily: M, marginTop: 12, letterSpacing: .3 }}>
        Scorecards are derived from each firm's invoices scrubbed by the review engine. Rate-card and roster edits are chain-sealed; rate increases are flagged in the audit trail.
      </div>
    </div>
  );
}
