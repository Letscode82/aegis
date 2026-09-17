import { useState, useEffect } from "react";
import { C, F, M, SR } from "@aegis/ui";

// Read-only cross-link surfaces: DPAs (from Contracts) and privacy-law
// Obligations (from the shared Obligation entity). The "one brain" join —
// no data re-implemented, both read through the privacy API.

async function load(url, setRows, setErr) {
  try {
    const r = await fetch(url);
    const d = await r.json();
    if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
    setRows(d.items);
  } catch (e) { setErr(String(e.message || e)); }
}

function Frame({ title, subtitle, rows, err, empty, children }) {
  return (
    <div style={{ fontFamily: F, color: C.t1 }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 20, fontFamily: SR }}>{title}</div>
        <div style={{ fontSize: 12, color: C.t3, fontFamily: M, marginTop: 2 }}>{subtitle}</div>
      </div>
      {err && <div style={{ color: C.rd, fontFamily: M, fontSize: 12, marginBottom: 10 }}>⚠ {err}</div>}
      {!rows && !err && <div style={{ padding: 30, textAlign: "center", color: C.t3, fontFamily: M, fontSize: 12 }}>◎ Loading…</div>}
      {rows && rows.length === 0 && <div style={{ padding: 30, textAlign: "center", color: C.t4, fontFamily: M, fontSize: 12 }}>{empty}</div>}
      <div style={{ display: "grid", gap: 8 }}>{children}</div>
    </div>
  );
}

const pill = (col, text) => <span style={{ fontSize: 9, fontFamily: M, fontWeight: 700, letterSpacing: .5, textTransform: "uppercase", color: col, border: `1px solid ${col}`, borderRadius: 4, padding: "1px 7px", marginLeft: 8 }}>{text}</span>;
const fmt = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—");

export function DpasView() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { load("/api/privacy/dpas", setRows, setErr); }, []);
  return (
    <Frame title="Data Processing Agreements" err={err} rows={rows}
      subtitle="DPAs from the Contracts module — the processor contracts behind your processing activities."
      empty="No DPAs found. Mark a contract's type “DPA” in Contracts to surface it here.">
      {(rows || []).map((r) => {
        const expiring = r.daysToExpiry !== null && r.daysToExpiry <= 90;
        return (
          <div key={r.id} style={{ background: C.cd, border: `1px solid ${C.br}`, borderRadius: 8, padding: "11px 14px" }}>
            <div style={{ fontSize: 13.5 }}>{r.title}{pill(C.t3, r.status)}{expiring && pill(r.daysToExpiry < 0 ? C.rd : C.am, r.daysToExpiry < 0 ? "expired" : `${r.daysToExpiry}d to expiry`)}</div>
            <div style={{ fontSize: 10.5, color: C.t3, fontFamily: M, marginTop: 3 }}>
              {r.counterpartyName || "—"} · effective {fmt(r.effectiveDate)} · expires {fmt(r.expiryDate)}{r.governingLaw ? ` · ${r.governingLaw}` : ""}
            </div>
          </div>
        );
      })}
    </Frame>
  );
}

const OBLIG_COL = { OPEN: C.am, IN_PROGRESS: C.bl, MET: C.gn, BREACHED: C.rd, WAIVED: C.t3 };

export function ObligationsView() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { load("/api/privacy/obligations", setRows, setErr); }, []);
  return (
    <Frame title="Privacy Obligations" err={err} rows={rows}
      subtitle="Privacy-law obligations from the shared obligations ledger — the platform's one brain, filtered to the privacy slice."
      empty="No privacy-law obligations recorded yet.">
      {(rows || []).map((r) => {
        const overdue = r.dueDate && r.status !== "MET" && r.status !== "WAIVED" && new Date(r.dueDate) < new Date();
        return (
          <div key={r.id} style={{ background: C.cd, border: `1px solid ${C.br}`, borderRadius: 8, padding: "11px 14px" }}>
            <div style={{ fontSize: 13.5 }}>{r.description}{pill(OBLIG_COL[r.status] || C.t3, r.status.replace(/_/g, " "))}{overdue && pill(C.rd, "overdue")}</div>
            <div style={{ fontSize: 10.5, color: C.t3, fontFamily: M, marginTop: 3 }}>{r.type.replace(/_/g, " ").toLowerCase()} · due {fmt(r.dueDate)}</div>
          </div>
        );
      })}
    </Frame>
  );
}
