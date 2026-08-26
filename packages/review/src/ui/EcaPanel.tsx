/**
 * EcaPanel (ECA-3, + overnight cull-dashboard upgrade) — Early Case Assessment.
 * The "how big / what / how much" lens before review starts: a volume funnel
 * (Collected → dedup → threading → in-scope), a live cost/time tuner with the
 * savings culling bought, a culling-impact card (reduction + per-reason
 * breakdown), coding progress, and breakdowns by source, AI route, and issue.
 * Read-only over the review-set REST base (hold + DSAR both mount it).
 */
import React, { useCallback, useEffect, useState } from "react";
import { C, F, M, SR } from "@aegis/ui";

interface Row { key: string; count: number }
interface Funnel {
  collected: number;
  funnel: Array<{ key: string; label: string; count: number; pctOfCollected: number }>;
  excluded: number; excludedByReason: Row[]; coded: number; responsive: number; privileged: number;
  bySource: Row[]; byRoute: Row[]; byIssue: Row[]; byLanguage: Row[]; byException: Row[];
  cost: { perDocMinutes: number; hourlyRate: number; currency: string };
  estimate: { reviewDocs: number; hours: number; cost: number; culledDocs: number; hoursSaved: number; costSaved: number };
}
export interface EcaPanelProps { apiBase: string; reviewSetId: string; canMutate?: boolean }

const money = (n: number, cur: string) => new Intl.NumberFormat(undefined, { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(n);
const routeColor = (r: string) => (r === "ATTORNEY" ? C.pp : r === "REVIEWER" ? C.bl : r === "AUTO_CULL" ? C.t4 : C.t3);
const reasonLabel = (k: string) => k.replace(/_/g, " ").toLowerCase();

interface Cluster { id: string; label: string; topTerms: string[]; size: number }

export const EcaPanel: React.FC<EcaPanelProps> = ({ apiBase, reviewSetId }) => {
  const [d, setD] = useState<Funnel | null>(null);
  const [err, setErr] = useState("");
  // Cost tuner state (kept local; refetch is debounced).
  const [perDoc, setPerDoc] = useState(2);
  const [rate, setRate] = useState(75);
  const [clusters, setClusters] = useState<{ clusters: Cluster[]; degraded: boolean } | null>(null);
  const [clustersBusy, setClustersBusy] = useState(false);
  const [nearDup, setNearDup] = useState<{ groups: number; docs: number } | null>(null);
  const [nearDupBusy, setNearDupBusy] = useState(false);

  const scanNearDup = useCallback(() => {
    setNearDupBusy(true);
    fetch(`${apiBase}/${reviewSetId}/near-duplicates`).then((r) => r.json()).then((j) => { if (j.ok) setNearDup({ groups: j.groups.length, docs: j.duplicateDocs }); }).catch(() => {}).finally(() => setNearDupBusy(false));
  }, [apiBase, reviewSetId]);

  const loadClusters = useCallback(() => {
    setClustersBusy(true);
    fetch(`${apiBase}/${reviewSetId}/clusters`).then((r) => r.json()).then((j) => { if (j.ok) setClusters({ clusters: j.clusters, degraded: j.degraded }); }).catch(() => {}).finally(() => setClustersBusy(false));
  }, [apiBase, reviewSetId]);

  const load = useCallback(() => {
    const qs = `?perDocMinutes=${perDoc}&hourlyRate=${rate}`;
    fetch(`${apiBase}/${reviewSetId}/eca${qs}`).then((r) => r.json()).then((j) => { if (j.ok) setD(j.eca); else setErr(j.error || "Failed"); }).catch((e) => setErr(String(e)));
  }, [apiBase, reviewSetId, perDoc, rate]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  if (err) return <div style={{ padding: 28, color: C.rd, fontFamily: M, fontSize: 13 }}>{err}</div>;
  if (!d) return <div style={{ padding: 28, color: C.t4, fontFamily: M, fontSize: 13 }}>Loading ECA…</div>;

  const maxBar = Math.max(1, d.collected);
  const reductionPct = d.collected > 0 ? Math.round((d.excluded / d.collected) * 1000) / 10 : 0;
  const codedPct = d.estimate.reviewDocs > 0 ? Math.round((d.coded / d.estimate.reviewDocs) * 100) : 0;

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

  const numInput = (value: number, onChange: (n: number) => void, min: number) => (
    <input
      type="number"
      value={value}
      min={min}
      onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n) && n > 0) onChange(n); }}
      style={{ width: 72, background: C.bg, border: `1px solid ${C.br}`, borderRadius: 6, color: C.t1, fontFamily: M, fontSize: 12.5, padding: "5px 8px", outline: "none" }}
    />
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
              const prev = i > 0 ? d.funnel[i - 1]!.count : s.count;
              const dropped = prev - s.count;
              return (
                <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 120, fontSize: 12.5, color: C.t2, textAlign: "right" }}>{s.label}</div>
                  <div style={{ flex: 1, height: 26, background: C.bg, border: `1px solid ${C.br}`, borderRadius: 6, overflow: "hidden", position: "relative" }}>
                    <div style={{ width: `${w}%`, height: "100%", background: `${col}44`, borderRight: `2px solid ${col}` }} />
                    <div style={{ position: "absolute", left: 10, top: 0, height: "100%", display: "flex", alignItems: "center", fontFamily: M, fontSize: 12.5, color: C.t1 }}>{s.count.toLocaleString()}</div>
                    {i > 0 && dropped > 0 && (
                      <div style={{ position: "absolute", right: 10, top: 0, height: "100%", display: "flex", alignItems: "center", fontFamily: M, fontSize: 11, color: C.am }}>−{dropped.toLocaleString()}</div>
                    )}
                  </div>
                  <div style={{ width: 52, fontFamily: M, fontSize: 12, color: C.t4, textAlign: "right" }}>{s.pctOfCollected}%</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Culling impact */}
        <div style={{ border: `1px solid ${C.br}`, borderRadius: 12, padding: "18px 20px", marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontFamily: M, letterSpacing: .6, textTransform: "uppercase", color: C.t3 }}>Culling impact</div>
            <div style={{ fontSize: 12, color: C.t3 }}>
              <span style={{ fontFamily: SR, fontSize: 20, fontWeight: 600, color: reductionPct > 0 ? C.gn : C.t4 }}>{reductionPct}%</span> of the collection removed before review
            </div>
          </div>
          {d.excluded === 0 ? (
            <div style={{ fontSize: 12.5, color: C.t4 }}>Nothing culled yet. Run dedup + threading (and other cull passes) in the Cull tab to shrink the review set.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {d.excludedByReason.map((r) => {
                const w = Math.round((r.count / Math.max(1, d.excludedByReason[0]?.count ?? 1)) * 100);
                return (
                  <div key={r.key}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 3 }}>
                      <span style={{ color: C.t2, textTransform: "capitalize" }}>{reasonLabel(r.key)}</span>
                      <span style={{ fontFamily: M, color: C.t3 }}>{r.count.toLocaleString()}</span>
                    </div>
                    <div style={{ height: 6, background: C.bg, border: `1px solid ${C.br}`, borderRadius: 4, overflow: "hidden" }}><div style={{ width: `${w}%`, height: "100%", background: C.am }} /></div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Estimate + tuner */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
          {stat("Docs to review", d.estimate.reviewDocs.toLocaleString(), C.bl, `${d.responsive} responsive · ${d.privileged} privileged`)}
          {stat("Est. review time", `${d.estimate.hours} h`, C.cy, `${d.cost.perDocMinutes} min/doc`)}
          {stat("Est. review cost", money(d.estimate.cost, d.cost.currency), C.pp, `@ ${money(d.cost.hourlyRate, d.cost.currency)}/h`)}
          {stat("Saved by culling", money(d.estimate.costSaved, d.cost.currency), C.gn, `${d.estimate.culledDocs} docs · ${d.estimate.hoursSaved} h`)}
        </div>
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", marginBottom: 20, fontSize: 12, color: C.t3, fontFamily: F }}>
          <span style={{ fontFamily: M, fontSize: 10.5, letterSpacing: .5, textTransform: "uppercase", color: C.t4 }}>Tune estimate:</span>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>{numInput(perDoc, setPerDoc, 1)} min/doc</label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>{numInput(rate, setRate, 1)} {d.cost.currency}/hour</label>
        </div>

        {/* Coding progress */}
        <div style={{ border: `1px solid ${C.br}`, borderRadius: 12, padding: "16px 18px", marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontFamily: M, letterSpacing: .6, textTransform: "uppercase", color: C.t3 }}>Review progress</div>
            <div style={{ fontSize: 12.5, color: C.t2 }}><span style={{ fontFamily: M, color: C.t1 }}>{d.coded.toLocaleString()}</span> / {d.estimate.reviewDocs.toLocaleString()} coded · <span style={{ fontFamily: M, color: codedPct >= 100 ? C.gn : C.bl }}>{codedPct}%</span></div>
          </div>
          <div style={{ height: 8, background: C.bg, border: `1px solid ${C.br}`, borderRadius: 5, overflow: "hidden" }}>
            <div style={{ width: `${Math.min(100, codedPct)}%`, height: "100%", background: codedPct >= 100 ? C.gn : C.bl, transition: "width .25s" }} />
          </div>
        </div>

        {/* Breakdowns */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {breakdown("By source", d.bySource)}
          {breakdown("By AI route", d.byRoute, routeColor)}
          {breakdown("By issue", d.byIssue, () => C.tl)}
        </div>

        {/* Processing report (PROC-8/9) */}
        <div style={{ marginTop: 22, border: `1px solid ${C.br}`, borderRadius: 12, padding: "18px 20px" }}>
            <div style={{ fontSize: 11, fontFamily: M, letterSpacing: .6, textTransform: "uppercase", color: C.t3, marginBottom: 14 }}>Processing report</div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {breakdown("Languages", d.byLanguage.length ? d.byLanguage : [{ key: "—", count: 0 }], () => C.tl)}
              {breakdown("Extraction exceptions", d.byException.length ? d.byException : [{ key: "none", count: 0 }], () => C.am)}
              <div style={{ border: `1px solid ${C.br}`, borderRadius: 12, padding: "16px 18px", flex: "1 1 230px", minWidth: 220 }}>
                <div style={{ fontSize: 11, fontFamily: M, letterSpacing: .6, textTransform: "uppercase", color: C.t3, marginBottom: 12 }}>Near-duplicates</div>
                {nearDup === null ? (
                  <button onClick={scanNearDup} disabled={nearDupBusy} style={{ fontSize: 12, fontWeight: 600, padding: "7px 12px", borderRadius: 8, cursor: "pointer", background: "transparent", color: C.cy, border: `1px solid ${C.cy}` }}>{nearDupBusy ? "Scanning…" : "Scan near-duplicates"}</button>
                ) : (
                  <div style={{ fontSize: 13, color: C.t2 }}><span style={{ fontFamily: SR, fontSize: 22, fontWeight: 600, color: nearDup.groups ? C.am : C.gn }}>{nearDup.groups}</span> group(s) · {nearDup.docs} near-dup doc(s)<div style={{ fontSize: 11, color: C.t4, marginTop: 4 }}>Edited/quoted variants beyond exact dedup. Cull exact copies in the Cull tab.</div></div>
                )}
              </div>
            </div>
            <div style={{ fontSize: 11, color: C.t4, marginTop: 10 }}>Language + exceptions are captured at collection. Exceptions (encrypted / unsupported / needs-OCR) keep the filename but aren't full-text searchable.</div>
        </div>

        {/* Themes (ECA-2 concept clustering) */}
        <div style={{ marginTop: 22, border: `1px solid ${C.br}`, borderRadius: 12, padding: "18px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: clusters ? 14 : 0 }}>
            <div style={{ fontSize: 11, fontFamily: M, letterSpacing: .6, textTransform: "uppercase", color: C.t3 }}>Themes {clusters ? `· ${clusters.clusters.length}` : ""}{clusters && !clusters.degraded ? " · AI-named" : ""}</div>
            {!clusters && <button onClick={loadClusters} disabled={clustersBusy} style={{ fontSize: 12, fontWeight: 600, padding: "7px 13px", borderRadius: 8, cursor: "pointer", background: C.cy, color: C.bg, border: "none" }}>{clustersBusy ? "Clustering…" : "✨ Cluster by theme"}</button>}
            {clusters && <button onClick={loadClusters} disabled={clustersBusy} style={{ fontSize: 11.5, fontWeight: 600, padding: "5px 10px", borderRadius: 7, cursor: "pointer", background: "transparent", color: C.t3, border: `1px solid ${C.br}` }}>{clustersBusy ? "…" : "Recompute"}</button>}
          </div>
          {!clusters && !clustersBusy && <div style={{ fontSize: 12, color: C.t4, marginTop: 8 }}>Group the collection into themes from document text — see the shape of the case before reading.</div>}
          {clusters && clusters.clusters.length === 0 && <div style={{ fontSize: 12, color: C.t4 }}>Not enough text to cluster.</div>}
          {clusters && clusters.clusters.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {clusters.clusters.map((c) => {
                const w = Math.round((c.size / Math.max(1, clusters.clusters[0]?.size ?? 1)) * 100);
                return (
                  <div key={c.id}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 3, gap: 10 }}>
                      <span style={{ color: C.t1, fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.label}{c.topTerms.length > 0 && <span style={{ color: C.t4, fontWeight: 400, fontFamily: M, fontSize: 10.5 }}> · {c.topTerms.slice(0, 4).join(", ")}</span>}</span>
                      <span style={{ fontFamily: M, color: C.t3, flex: "none" }}>{c.size}</span>
                    </div>
                    <div style={{ height: 6, background: C.bg, border: `1px solid ${C.br}`, borderRadius: 4, overflow: "hidden" }}><div style={{ width: `${w}%`, height: "100%", background: C.tl }} /></div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
