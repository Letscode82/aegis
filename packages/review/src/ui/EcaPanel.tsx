/**
 * EcaPanel (ECA-3) — Early Case Assessment. The "how big / what / how much"
 * lens before review starts: a volume funnel (Collected → dedup → threading →
 * in-scope), a review cost/time estimate with the savings culling bought, and
 * breakdowns by source, AI route, and issue. Read-only over the review-set REST
 * base (hold + DSAR both mount it).
 */
import React, { useCallback, useEffect, useState } from "react";
import { C, M, SR } from "@aegis/ui";

interface Row { key: string; count: number }
interface Funnel {
  collected: number;
  funnel: Array<{ key: string; label: string; count: number; pctOfCollected: number }>;
  excluded: number; excludedByReason: Row[]; coded: number; responsive: number; privileged: number;
  bySource: Row[]; byRoute: Row[]; byIssue: Row[];
  cost: { perDocMinutes: number; hourlyRate: number; currency: string };
  estimate: { reviewDocs: number; hours: number; cost: number; culledDocs: number; hoursSaved: number; costSaved: number };
}
export interface EcaPanelProps { apiBase: string; reviewSetId: string; canMutate?: boolean }

const money = (n: number, cur: string) => new Intl.NumberFormat(undefined, { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(n);
const routeColor = (r: string) => (r === "ATTORNEY" ? C.pp : r === "REVIEWER" ? C.bl : r === "AUTO_CULL" ? C.t4 : C.t3);

export const EcaPanel: React.FC<EcaPanelProps> = ({ apiBase, reviewSetId }) => {
  const [d, setD] = useState<Funnel | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(() => {
    fetch(`${apiBase}/${reviewSetId}/eca`).then((r) => r.json()).then((j) => { if (j.ok) setD(j.eca); else setErr(j.error || "Failed"); }).catch((e) => setErr(String(e)));
  }, [apiBase, reviewSetId]);
  useEffect(() => { load(); }, [load]);

  if (err) return <div style={{ padding: 28, color: C.rd, fontFamily: M, fontSize: 13 }}>{err}</div>;
  if (!d) return <div style={{ padding: 28, color: C.t4, fontFamily: M, fontSize: 13 }}>Loading ECA…</div>;

  const maxBar = Math.max(1, d.collected);
  const stat = (label: string, value: string, col: string, sub?: string) => (
    <div style={{ border: `1px solid ${C.br}`, borderRadius: 10, padding: "14px 16px", background: C.bg, flex: "1 1 150px" }}>
      <div style={{ fontFamily: SR, fontSize: 26, fontWeight: 600, color: col }}>{value}</div>
      <div style={{ fontSize: 10.5, color: C.t3, fontFamily: M, letterSpacing: .4, textTransform: "uppercase", marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: C.t4, marginTop: 3 }}>{sub}</div>}
    </div>
  );
  const breakdown = (title: string, rows: Row[], colorFn?: (k: string) => string) => (
    <div style={{ border: `1px solid ${C.br}`, borderRadius: 12, padding: "16px 18px", flex: "1 1 230px", minWidth: 220 }}>
      <div style={{ fontSize: 11, fontFamily: M, letterSpacing: .6, textTransform: "uppercase", color: C.t3, marginBottom: 12 }}>{title}</div>
      {rows.length === 0 && <div style={{ fontSize: 12, color: C.t4 }}>None</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.slice(0, 6).map((r) => {
          const w = Math.round((r.count / Math.max(1, rows[0]?.count ?? 1)) * 100);
          const col = colorFn ? colorFn(r.key) : C.bl;
          return (
            <div key={r.key}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                <span style={{ color: C.t2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 160 }}>{r.key}</span>
                <span style={{ fontFamily: M, color: C.t3 }}>{r.count}</span>
              </div>
              <div style={{ height: 5, background: C.bg, border: `1px solid ${C.br}`, borderRadius: 4, overflow: "hidden" }}><div style={{ width: `${w}%`, height: "100%", background: col }} /></div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "24px 28px" }}>
      <div style={{ maxWidth: 940, margin: "0 auto" }}>
        <div style={{ fontFamily: M, fontSize: 10.5, letterSpacing: 1.4, color: C.cy, textTransform: "uppercase" }}>Early Case Assessment</div>
        <div style={{ fontFamily: SR, fontSize: 22, fontWeight: 600, marginBottom: 4 }}>How big is this, and what will it cost?</div>
        <div style={{ fontSize: 13, color: C.t3, marginBottom: 22 }}>The scope-and-cost lens before review starts — what culling removed, what's left to review, and the estimated effort.</div>

        {/* Funnel */}
        <div style={{ border: `1px solid ${C.br}`, borderRadius: 12, padding: "18px 20px", marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontFamily: M, letterSpacing: .6, textTransform: "uppercase", color: C.t3, marginBottom: 14 }}>Volume funnel</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {d.funnel.map((s, i) => {
              const w = Math.round((s.count / maxBar) * 100);
              const col = [C.t3, C.tl, C.bl, C.gn][i] || C.bl;
              return (
                <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 120, fontSize: 12.5, color: C.t2, textAlign: "right" }}>{s.label}</div>
                  <div style={{ flex: 1, height: 26, background: C.bg, border: `1px solid ${C.br}`, borderRadius: 6, overflow: "hidden", position: "relative" }}>
                    <div style={{ width: `${w}%`, height: "100%", background: `${col}44`, borderRight: `2px solid ${col}` }} />
                    <div style={{ position: "absolute", left: 10, top: 0, height: "100%", display: "flex", alignItems: "center", fontFamily: M, fontSize: 12.5, color: C.t1 }}>{s.count.toLocaleString()}</div>
                  </div>
                  <div style={{ width: 52, fontFamily: M, fontSize: 12, color: C.t4, textAlign: "right" }}>{s.pctOfCollected}%</div>
                </div>
              );
            })}
          </div>
          {d.excluded > 0 && (
            <div style={{ marginTop: 12, fontSize: 12, color: C.t3 }}>
              <span style={{ color: C.am, fontWeight: 600 }}>{d.excluded.toLocaleString()}</span> culled ({d.excludedByReason.map((r) => `${r.count} ${r.key.replace(/_/g, " ").toLowerCase()}`).join(" · ")})
            </div>
          )}
        </div>

        {/* Estimate */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
          {stat("Docs to review", d.estimate.reviewDocs.toLocaleString(), C.bl, `${d.responsive} responsive · ${d.privileged} privileged`)}
          {stat("Est. review time", `${d.estimate.hours} h`, C.cy, `${d.cost.perDocMinutes} min/doc`)}
          {stat("Est. review cost", money(d.estimate.cost, d.cost.currency), C.pp, `@ ${money(d.cost.hourlyRate, d.cost.currency)}/h`)}
          {stat("Saved by culling", money(d.estimate.costSaved, d.cost.currency), C.gn, `${d.estimate.culledDocs} docs · ${d.estimate.hoursSaved} h`)}
        </div>
        <div style={{ fontSize: 11, color: C.t4, marginBottom: 20 }}>Estimate assumes {d.cost.perDocMinutes} min/doc at {money(d.cost.hourlyRate, d.cost.currency)}/hour — adjust with <span style={{ fontFamily: M }}>?perDocMinutes=</span> / <span style={{ fontFamily: M }}>?hourlyRate=</span>.</div>

        {/* Breakdowns */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {breakdown("By source", d.bySource)}
          {breakdown("By AI route", d.byRoute, routeColor)}
          {breakdown("By issue", d.byIssue, () => C.tl)}
        </div>
      </div>
    </div>
  );
};
