/**
 * Executive operations summary — C-14 (exec-analytics depth).
 *
 * The GC-level band at the top of the AI Operations section. It fetches
 * /api/ai-ops/exec-summary (read-only, gated identically to the summary
 * route) and renders four executive dimensions: a headline KPI strip
 * (open / at-risk / breached / 7-day backlog delta), the open-queue
 * status+priority mix, per-attorney open load, and routing-rule reach.
 *
 * Self-contained fetch so it composes next to the existing panels without
 * changing their single-payload contract. Degrades per-panel: a failed
 * panel renders an inline "couldn't load" line, the rest stay live.
 */
import { useEffect, useState } from "react";
import { C, M, SR } from "@aegis/ui";
import { formatCount } from "./format.js";

const ENDPOINT = "/api/ai-ops/exec-summary";

function Kpi({ label, value, accent, hint }) {
  return (
    <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 3, flex: "1 1 0", minWidth: 120, borderRight: `1px solid ${C.br}33` }}>
      <div style={{ fontSize: 24, fontFamily: SR, fontWeight: 400, color: accent || C.t1, lineHeight: 1.05 }}>{value}</div>
      <div style={{ fontSize: 9, fontFamily: M, color: C.t3, letterSpacing: 2, textTransform: "uppercase" }}>{label}</div>
      {hint && <div style={{ fontSize: 9.5, fontFamily: M, color: C.t4, letterSpacing: 0.3 }}>{hint}</div>}
    </div>
  );
}

function PanelShell({ title, subtitle, children }) {
  return (
    <div style={{ background: C.cd, border: `1px solid ${C.br}`, display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "11px 14px", borderBottom: `1px solid ${C.br}` }}>
        <span style={{ fontSize: 10, fontFamily: M, color: C.tl, letterSpacing: 2, textTransform: "uppercase" }}>{title}</span>
        {subtitle && <div style={{ fontSize: 9, fontFamily: M, color: C.t4, letterSpacing: 0.5, marginTop: 2 }}>{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}

function MixRow({ label, value, total, accent }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div style={{ padding: "7px 14px", display: "flex", flexDirection: "column", gap: 4, borderBottom: `1px solid ${C.br}22` }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, fontFamily: M, color: C.t2, letterSpacing: 0.3 }}>
        <span>{label}</span>
        <span style={{ color: C.t3 }}>{formatCount(value)}</span>
      </div>
      <div style={{ height: 4, background: `${C.br}44`, borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: accent || C.em }} />
      </div>
    </div>
  );
}

function PanelError({ name }) {
  return (
    <div style={{ padding: "10px 14px", fontSize: 10, fontFamily: M, color: C.am, letterSpacing: 0.3 }}>
      Couldn’t load {name}.
    </div>
  );
}

export function ExecutiveSummary() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch(ENDPOINT, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => { if (!cancelled) { setData(json); setError(null); } })
      .catch((err) => { if (!cancelled) setError(err); });
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return (
      <div style={{ background: C.cd, border: `1px solid ${C.rd}55`, padding: "10px 14px", fontSize: 10.5, color: C.rd, fontFamily: M, letterSpacing: 0.3, marginBottom: 12 }}>
        Couldn’t load the executive summary. ({String(error.message || error)})
      </div>
    );
  }
  if (!data) {
    return (
      <div style={{ background: C.cd, border: `1px solid ${C.br}`, padding: 14, fontSize: 10.5, color: C.t3, fontFamily: M, letterSpacing: 0.5, marginBottom: 12 }}>
        Loading executive summary…
      </div>
    );
  }

  const failed = new Set(Array.isArray(data.panelErrors) ? data.panelErrors : []);
  const qh = data.queueHealth || {};
  const tp = data.throughput || {};
  const bySla = qh.bySla || { onTrack: 0, atRisk: 0, breached: 0 };
  const byStatus = qh.byStatus || {};
  const byPriority = qh.byPriority || {};
  const delta7 = typeof tp.backlogDelta7 === "number" ? tp.backlogDelta7 : 0;
  const deltaLabel = delta7 > 0 ? `+${delta7}` : String(delta7);
  const deltaAccent = delta7 > 0 ? C.rd : delta7 < 0 ? C.gn : C.t2;

  return (
    <div style={{ marginBottom: 14 }}>
      {/* Headline KPI strip */}
      {failed.has("queueHealth") || failed.has("throughput") ? (
        <PanelShell title="EXECUTIVE · OVERVIEW"><PanelError name="the overview KPIs" /></PanelShell>
      ) : (
        <PanelShell title="EXECUTIVE · OVERVIEW" subtitle="Live queue posture · 7-day flow">
          <div style={{ display: "flex", flexWrap: "wrap" }}>
            <Kpi label="Open queue" value={formatCount(qh.open ?? 0)} accent={C.em} hint={`${formatCount(qh.total ?? 0)} all-time`} />
            <Kpi label="At risk" value={formatCount(bySla.atRisk ?? 0)} accent={C.am} />
            <Kpi label="Breached" value={formatCount(bySla.breached ?? 0)} accent={C.rd} />
            <Kpi label="Created · 7d" value={formatCount(tp.createdLast7 ?? 0)} accent={C.bl} />
            <Kpi label="Resolved · 7d" value={formatCount(tp.resolvedLast7 ?? 0)} accent={C.gn} />
            <Kpi label="Backlog Δ · 7d" value={deltaLabel} accent={deltaAccent} hint={delta7 > 0 ? "queue growing" : delta7 < 0 ? "queue shrinking" : "steady"} />
          </div>
        </PanelShell>
      )}

      {/* Three-up detail row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 12 }}>
        {/* Open-queue mix */}
        <PanelShell title="OPEN QUEUE · MIX" subtitle="By status & priority">
          {failed.has("queueHealth") ? <PanelError name="the queue mix" /> : (
            <>
              <MixRow label="Awaiting triage" value={byStatus.AWAITING_TRIAGE ?? 0} total={qh.open ?? 0} accent={C.bl} />
              <MixRow label="In review" value={byStatus.IN_REVIEW ?? 0} total={qh.open ?? 0} accent={C.tl} />
              <MixRow label="Escalated" value={byStatus.ESCALATED ?? 0} total={qh.open ?? 0} accent={C.rd} />
              <div style={{ height: 8 }} />
              <MixRow label="Critical" value={byPriority.Critical ?? 0} total={qh.open ?? 0} accent={C.rd} />
              <MixRow label="High" value={byPriority.High ?? 0} total={qh.open ?? 0} accent={C.am} />
              <MixRow label="Medium" value={byPriority.Medium ?? 0} total={qh.open ?? 0} accent={C.bl} />
              <MixRow label="Low" value={byPriority.Low ?? 0} total={qh.open ?? 0} accent={C.t3} />
            </>
          )}
        </PanelShell>

        {/* Attorney load */}
        <PanelShell title="ATTORNEY · OPEN LOAD" subtitle="Busiest assignees">
          {failed.has("attorneyLoad") ? <PanelError name="attorney load" /> : (
            (data.attorneyLoad || []).length === 0 ? (
              <div style={{ padding: "12px 14px", fontSize: 10.5, fontFamily: M, color: C.t4, letterSpacing: 0.3 }}>No typed assignees on the open queue yet.</div>
            ) : (
              (data.attorneyLoad || []).map((a) => (
                <div key={a.userId} style={{ padding: "9px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${C.br}22` }}>
                  <div style={{ fontSize: 11, fontFamily: M, color: C.t2, letterSpacing: 0.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "58%" }}>{a.name}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10, fontFamily: M }}>
                    {a.breached > 0 && <span style={{ color: C.rd }}>⚠ {a.breached}</span>}
                    {a.atRisk > 0 && <span style={{ color: C.am }}>◐ {a.atRisk}</span>}
                    <span style={{ fontSize: 14, fontFamily: SR, color: C.t1 }}>{formatCount(a.open)}</span>
                  </div>
                </div>
              ))
            )
          )}
        </PanelShell>

        {/* Routing effectiveness */}
        <PanelShell title="ROUTING · EFFECTIVENESS" subtitle="Rule fire counts">
          {failed.has("routingEffectiveness") ? <PanelError name="routing effectiveness" /> : (
            (data.routingEffectiveness || []).length === 0 ? (
              <div style={{ padding: "12px 14px", fontSize: 10.5, fontFamily: M, color: C.t4, letterSpacing: 0.3 }}>No routing rules configured yet.</div>
            ) : (
              (data.routingEffectiveness || []).map((r) => (
                <div key={r.id} style={{ padding: "9px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${C.br}22` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, overflow: "hidden", maxWidth: "62%" }}>
                    <span style={{ width: 6, height: 6, borderRadius: 3, background: r.enabled ? C.gn : C.t4, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, fontFamily: M, color: C.t2, letterSpacing: 0.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                  </div>
                  <span style={{ fontSize: 14, fontFamily: SR, color: r.timesFired > 0 ? C.t1 : C.t4 }}>{formatCount(r.timesFired)}</span>
                </div>
              ))
            )
          )}
        </PanelShell>
      </div>
    </div>
  );
}
