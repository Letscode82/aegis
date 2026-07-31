import { useState, useEffect, useCallback, useMemo } from "react";
import { C, F, M, SR } from "@aegis/ui";

// ── Obligation ledger (CLM Phase 2b) ─────────────────────────────────
//
// The portfolio-wide contract-obligation queue — every commitment across
// every contract in one list, by owner / due / status / overdue. Reads
// GET /api/contracts/obligations (contracts:read_all); per-row transitions
// POST /api/contracts/[contractId]/obligations/[id] (guarded + chain-sealed
// server-side, gated contracts:create). This is what turns the repository
// into a living obligation ledger.

const fmtDate = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : "—");
const OBL_COLOR = { OPEN: C.bl, IN_PROGRESS: C.am, MET: C.gn, BREACHED: C.rd, WAIVED: C.t3 };
const ACTION = {
  IN_PROGRESS: { label: "Start", c: C.am },
  MET: { label: "Satisfy", c: C.gn },
  BREACHED: { label: "Breach", c: C.rd },
  WAIVED: { label: "Waive", c: C.t3 },
  OPEN: { label: "Reopen", c: C.bl },
};
const STATUS_FILTERS = ["ALL", "OVERDUE", "DUE_SOON", "OPEN", "IN_PROGRESS", "MET", "BREACHED", "WAIVED"];
const TYPE_META = {
  PAYMENT:        { label: "Payment",  c: C.gn },
  DELIVERABLE:    { label: "Deliver",  c: C.bl },
  REPORTING:      { label: "Report",   c: C.tl },
  RENEWAL_NOTICE: { label: "Renewal",  c: C.am },
  COMPLIANCE:     { label: "Comply",   c: C.rd },
  OTHER:          { label: "Other",    c: C.t4 },
};

function Kpi({ label, value, color }) {
  return (
    <div style={{ flex: 1, minWidth: 120, padding: "12px 14px", background: C.cd, border: `1px solid ${C.br}`, borderRadius: 6 }}>
      <div style={{ fontSize: 9, fontFamily: M, color: C.t3, letterSpacing: 1.4, textTransform: "uppercase", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 23, fontFamily: SR, color: color || C.t1, marginTop: 4, lineHeight: 1 }}>{value}</div>
    </div>
  );
}

const btn = (c) => ({
  padding: "4px 9px", borderRadius: 4, border: `1px solid ${c}`, background: "transparent",
  color: c, fontSize: 9, fontFamily: M, fontWeight: 600, letterSpacing: .4, cursor: "pointer", textTransform: "uppercase",
});

export function ObligationsDashboard({ canManage }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("ALL");
  const [owner, setOwner] = useState("");
  const [busy, setBusy] = useState(null);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (filter === "OVERDUE") p.set("overdue", "1");
    else if (filter === "DUE_SOON") p.set("dueWithinDays", "30");
    else if (filter !== "ALL") p.set("status", filter);
    if (owner) p.set("ownerId", owner);
    const s = p.toString();
    return s ? `?${s}` : "";
  }, [filter, owner]);

  const load = useCallback(() => {
    setError(null);
    fetch(`/api/contracts/obligations${query}`)
      .then((r) => (r.ok ? r.json() : r.json().then((d) => Promise.reject(d.error || `HTTP ${r.status}`))))
      .then((d) => setData(d))
      .catch((e) => setError(String(e)));
  }, [query]);
  useEffect(() => { load(); }, [load]);

  const transition = async (row, status) => {
    setBusy(row.id);
    try {
      const r = await fetch(`/api/contracts/${row.contractId}/obligations/${row.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!r.ok) throw new Error((await r.json()).error || `HTTP ${r.status}`);
      load();
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(null);
    }
  };

  // Owner options (from the current, unfiltered-by-owner rows would need a
  // second fetch; derive from whatever's loaded — good enough for the demo).
  const ownerOptions = useMemo(() => {
    if (!data) return [];
    const seen = new Map();
    for (const r of data.rows) if (r.ownerId && !seen.has(r.ownerId)) seen.set(r.ownerId, r.ownerName || r.ownerId);
    return [...seen.entries()];
  }, [data]);

  if (error && !data) return <div style={{ padding: 24, color: C.rd, fontFamily: M, fontSize: 12 }}>⚠ {error}</div>;
  if (!data) return <div style={{ padding: 40, textAlign: "center", color: C.t3, fontFamily: M, fontSize: 12, letterSpacing: 1 }}>◎ Loading obligations…</div>;

  const tt = data.totals;

  return (
    <div>
      {error && <div style={{ color: C.rd, fontFamily: M, fontSize: 11, marginBottom: 10 }}>⚠ {error}</div>}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <Kpi label="Obligations" value={tt.total} />
        <Kpi label="Open" value={tt.open} color={C.tl} />
        <Kpi label="Overdue" value={tt.overdue} color={tt.overdue > 0 ? C.rd : C.t3} />
        <Kpi label="Due ≤30d" value={tt.dueSoon} color={tt.dueSoon > 0 ? C.am : C.t3} />
        <Kpi label="Met" value={tt.met} color={C.gn} />
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {STATUS_FILTERS.map((s) => {
            const active = filter === s;
            const col = s === "OVERDUE" ? C.rd : s === "DUE_SOON" ? C.am : OBL_COLOR[s] || C.t2;
            return (
              <span key={s} onClick={() => setFilter(s)} style={{ cursor: "pointer", fontSize: 9.5, fontFamily: M, letterSpacing: .5, padding: "5px 9px", borderRadius: 4, textTransform: "uppercase", color: active ? C.bg : col, background: active ? col : "transparent", border: `1px solid ${active ? col : C.br}` }}>
                {s.replace(/_/g, " ")}
              </span>
            );
          })}
        </div>
        {ownerOptions.length > 0 && (
          <select value={owner} onChange={(e) => setOwner(e.target.value)} style={{ background: C.cd, border: `1px solid ${C.br}`, borderRadius: 5, color: C.t1, fontFamily: F, fontSize: 11, padding: "6px 8px" }}>
            <option value="">All owners</option>
            {ownerOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        )}
      </div>

      {/* Table */}
      <div style={{ background: C.cd, border: `1px solid ${C.br}`, borderRadius: 6, padding: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 2fr 120px 120px 95px 1.4fr", gap: 8, fontSize: 9, fontFamily: M, color: C.t4, letterSpacing: 1, textTransform: "uppercase", padding: "0 4px 8px", borderBottom: `1px solid ${C.br}` }}>
          <span>Contract</span><span>Obligation</span><span>Owner</span><span>Due</span><span>Status</span><span>Actions</span>
        </div>
        {data.rows.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: C.t4, fontFamily: M, fontSize: 11 }}>No obligations match this filter.</div>
        ) : data.rows.map((o) => (
          <div key={o.id} style={{ display: "grid", gridTemplateColumns: "1.4fr 2fr 120px 120px 95px 1.4fr", gap: 8, fontSize: 11, alignItems: "center", padding: "9px 4px", borderBottom: `1px solid ${C.br}33` }}>
            <span style={{ color: C.t2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.contractTitle}</span>
            <span style={{ color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}>
              {(() => { const tm = TYPE_META[o.obligationType] || TYPE_META.OTHER; return <span title={`Type: ${tm.label}`} style={{ flexShrink: 0, fontSize: 8, fontFamily: M, letterSpacing: .4, color: tm.c, border: `1px solid ${tm.c}55`, borderRadius: 3, padding: "1px 4px", textTransform: "uppercase" }}>{tm.label}</span>; })()}
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.description}</span>
              {o.recurrence && <span title={o.recurrenceLabel || "Recurring"} style={{ flexShrink: 0, color: C.tl, fontFamily: M, fontSize: 9 }}>⟳</span>}
            </span>
            <span style={{ color: C.t2, fontFamily: M, fontSize: 10 }}>{o.ownerName || "—"}</span>
            <span style={{ fontFamily: M, fontSize: 10, color: o.overdue ? C.rd : C.t2 }}>
              {fmtDate(o.dueDate)}{o.daysToDue != null && <span style={{ color: o.overdue ? C.rd : o.daysToDue <= 30 ? C.am : C.t4 }}> ({o.daysToDue < 0 ? `${-o.daysToDue}d ago` : `${o.daysToDue}d`})</span>}
            </span>
            <span style={{ fontFamily: M, fontSize: 9, letterSpacing: .5, color: OBL_COLOR[o.status] }}>{o.status.replace(/_/g, " ")}</span>
            <span style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {canManage
                ? o.allowedTransitions.filter((s) => ACTION[s]).map((s) => (
                    <button key={s} disabled={busy === o.id} onClick={() => transition(o, s)} style={btn(ACTION[s].c)}>{ACTION[s].label}</button>
                  ))
                : <span style={{ color: C.t4, fontFamily: M, fontSize: 9 }}>read-only</span>}
            </span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 9.5, color: C.t4, fontFamily: M, marginTop: 12, letterSpacing: .3 }}>
        Every obligation is the shared entity (sourceType = CONTRACT) — the same rows Company Brain, Regulatory and Governance query. Each transition is guarded by the obligation state machine and chain-sealed.
      </div>
    </div>
  );
}
