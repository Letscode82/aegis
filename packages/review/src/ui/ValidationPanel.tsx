/**
 * ValidationPanel (AIR-4) — the pilot → validate → scale surface. Draw a
 * stratified sample of the AI-scored documents, code them in Review to create a
 * ground truth, then measure the AI's recall / precision / overturn against it.
 * If the numbers hold, apply the AI's confident, cited calls to the rest of the
 * set — while uncited-high-confidence and low-confidence items fail closed to a
 * human. Reuses the review-set REST base (hold + DSAR both mount it).
 */
import React, { useCallback, useEffect, useState } from "react";
import { C, F, M, SR, useToast } from "@aegis/ui";

interface Metrics {
  n: number; recall: number | null; precision: number | null; f1: number | null; overturn: number | null;
  recallCI: { low: number; high: number } | null; precisionCI: { low: number; high: number } | null;
  matrix: { tp: number; fp: number; fn: number; tn: number }; codedInSample: number;
}
interface Run {
  id: string; dimension: string; status: string; sampleSize: number; codedInSample: number;
  metrics: Metrics | null; scaledAt: string | null; appliedCount: number | null; failClosedCount: number | null; createdAt: string;
}
export interface ValidationPanelProps { apiBase: string; reviewSetId: string; canMutate: boolean }

const pct = (x: number | null) => (x == null ? "—" : `${Math.round(x * 100)}%`);
const btn = (bg: string): React.CSSProperties => ({ padding: "10px 16px", background: bg, color: C.bg, border: "none", borderRadius: 8, fontFamily: F, fontSize: 13, fontWeight: 600, cursor: "pointer" });
const ghost = (col: string): React.CSSProperties => ({ padding: "10px 16px", background: "transparent", color: col, border: `1px solid ${col}`, borderRadius: 8, fontFamily: F, fontSize: 13, fontWeight: 600, cursor: "pointer" });

export const ValidationPanel: React.FC<ValidationPanelProps> = ({ apiBase, reviewSetId, canMutate }) => {
  const toast = useToast();
  const [runs, setRuns] = useState<Run[]>([]);
  const [sampleSize, setSampleSize] = useState(25);
  const [dimension, setDimension] = useState<"RESPONSIVE" | "PRIVILEGED">("RESPONSIVE");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch(`${apiBase}/${reviewSetId}/validation`).then((r) => r.json()).then((d) => { if (d.ok) setRuns(d.runs || []); }).catch(() => {});
  }, [apiBase, reviewSetId]);
  useEffect(() => { load(); }, [load]);

  const start = async () => {
    setBusy(true);
    try {
      const r = await fetch(`${apiBase}/${reviewSetId}/validation`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sampleSize, dimension }) });
      const d = await r.json(); if (!r.ok || !d.ok) throw new Error(d.error);
      toast.success(`Pilot started — ${d.run.sampleSize} documents sampled. Code them in Review, then compute metrics.`);
      load();
    } catch (e) { toast.error(String((e as Error).message || e)); } finally { setBusy(false); }
  };
  const compute = async (runId: string) => {
    setBusy(true);
    try {
      const r = await fetch(`${apiBase}/${reviewSetId}/validation/${runId}/compute`, { method: "POST" });
      const d = await r.json(); if (!r.ok || !d.ok) throw new Error(d.error);
      toast.success("Metrics computed against the coded sample.");
      load();
    } catch (e) { toast.error(String((e as Error).message || e)); } finally { setBusy(false); }
  };
  const scale = async (runId: string) => {
    if (typeof window !== "undefined" && !window.confirm("Apply the AI's confident, cited decisions to the rest of the set? Uncited-high-confidence, low-confidence, and privileged documents will stay pending for a human.")) return;
    setBusy(true);
    try {
      const r = await fetch(`${apiBase}/${reviewSetId}/validation/${runId}/scale`, { method: "POST" });
      const d = await r.json(); if (!r.ok || !d.ok) throw new Error(d.error);
      const res = d.run.result;
      toast.success(`Applied ${res.applied} document(s) at scale · ${res.failClosed} failed closed to human review.`);
      load();
    } catch (e) { toast.error(String((e as Error).message || e)); } finally { setBusy(false); }
  };

  const stat = (label: string, value: string, col: string, sub?: string) => (
    <div style={{ border: `1px solid ${C.br}`, borderRadius: 10, padding: "12px 14px", background: C.bg, flex: "1 1 120px" }}>
      <div style={{ fontFamily: SR, fontSize: 24, fontWeight: 600, color: col }}>{value}</div>
      <div style={{ fontSize: 10.5, color: C.t3, fontFamily: M, letterSpacing: .4, textTransform: "uppercase", marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 10.5, color: C.t4, marginTop: 3 }}>{sub}</div>}
    </div>
  );

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "24px 28px" }}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <div style={{ fontFamily: M, fontSize: 10.5, letterSpacing: 1.4, color: C.cy, textTransform: "uppercase" }}>AIR — pilot · validate · scale</div>
        <div style={{ fontFamily: SR, fontSize: 22, fontWeight: 600, marginBottom: 4 }}>Validate the AI review before trusting it</div>
        <div style={{ fontSize: 13, color: C.t3, marginBottom: 20 }}>Sample the AI-scored documents, code the sample in <b>Review</b> to build a ground truth, then measure recall / precision / overturn. If the numbers hold, apply the confident, cited decisions to the rest — uncertain documents fail closed to a human.</div>

        {/* Start a pilot */}
        <div style={{ border: `1px solid ${C.br}`, borderRadius: 12, padding: "16px 18px", marginBottom: 20, display: "flex", alignItems: "flex-end", gap: 14, flexWrap: "wrap", background: C.cd }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.t3, marginBottom: 5 }}>Sample size</div>
            <input type="number" min={1} max={500} value={sampleSize} onChange={(e) => setSampleSize(Math.max(1, Math.min(500, Number(e.target.value) || 1)))} style={{ width: 90, background: C.bg, border: `1px solid ${C.br}`, borderRadius: 8, color: C.t1, fontFamily: M, fontSize: 14, padding: "9px 11px", outline: "none" }} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.t3, marginBottom: 5 }}>Dimension</div>
            <select value={dimension} onChange={(e) => setDimension(e.target.value as "RESPONSIVE" | "PRIVILEGED")} style={{ background: C.bg, border: `1px solid ${C.br}`, borderRadius: 8, color: C.t1, fontFamily: F, fontSize: 13.5, padding: "9px 11px", outline: "none" }}>
              <option value="RESPONSIVE">Responsiveness</option>
              <option value="PRIVILEGED">Privilege</option>
            </select>
          </div>
          <button disabled={!canMutate || busy} onClick={start} style={btn(C.bl)}>Start validation pilot</button>
        </div>

        {/* Runs */}
        {runs.length === 0 && <div style={{ padding: 22, color: C.t4, fontFamily: M, fontSize: 12.5, textAlign: "center", border: `1px dashed ${C.br}`, borderRadius: 12 }}>No validation runs yet. Run the AI review first, then start a pilot.</div>}
        {runs.map((run) => {
          const m = run.metrics;
          return (
            <div key={run.id} style={{ border: `1px solid ${C.br}`, borderRadius: 12, padding: "16px 18px", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: C.pp, border: `1px solid ${C.pp}`, borderRadius: 5, padding: "2px 8px" }}>{run.dimension}</span>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Sample of {run.sampleSize}</span>
                  <span style={{ fontSize: 11, color: C.t4, fontFamily: M }}>· coded {run.codedInSample}/{run.sampleSize}</span>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, color: run.status === "SCALED" ? C.gn : run.status === "COMPUTED" ? C.cy : C.am, border: `1px solid ${run.status === "SCALED" ? C.gn : run.status === "COMPUTED" ? C.cy : C.am}`, borderRadius: 5, padding: "2px 8px" }}>{run.status.replace(/_/g, " ")}</span>
              </div>

              {run.status === "AWAITING_CODING" && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 12.5, color: C.t3 }}>Code the {run.sampleSize} sampled documents in the <b>Review</b> tab (they are the ground truth), then compute metrics. {run.codedInSample} coded so far.</div>
                  <button disabled={!canMutate || busy || run.codedInSample === 0} onClick={() => compute(run.id)} style={ghost(C.cy)}>Compute metrics</button>
                </div>
              )}

              {m && (run.status === "COMPUTED" || run.status === "SCALED") && (
                <>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                    {stat("Recall", pct(m.recall), C.gn, m.recallCI ? `95% CI ${pct(m.recallCI.low)}–${pct(m.recallCI.high)}` : undefined)}
                    {stat("Precision", pct(m.precision), C.bl, m.precisionCI ? `95% CI ${pct(m.precisionCI.low)}–${pct(m.precisionCI.high)}` : undefined)}
                    {stat("F1", pct(m.f1), C.cy)}
                    {stat("Overturn", pct(m.overturn), (m.overturn ?? 0) > 0.2 ? C.rd : C.am, `${m.codedInSample} coded`)}
                  </div>
                  <div style={{ fontSize: 11, color: C.t4, fontFamily: M, marginBottom: 12 }}>Confusion: TP {m.matrix.tp} · FP {m.matrix.fp} · FN {m.matrix.fn} · TN {m.matrix.tn} (AI vs human on the sample)</div>
                  {run.status === "COMPUTED" && (
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      <button disabled={!canMutate || busy} onClick={() => scale(run.id)} style={btn(C.gn)}>Apply at scale →</button>
                      <span style={{ fontSize: 11.5, color: C.t4 }}>Accepts the AI's confident, cited calls on the rest of the set. Uncertain / uncited / privileged → stays pending for a human.</span>
                    </div>
                  )}
                  {run.status === "SCALED" && (
                    <div style={{ fontSize: 12.5, color: C.t2 }}>✓ Applied <b style={{ color: C.gn }}>{run.appliedCount}</b> at scale · <b style={{ color: C.am }}>{run.failClosedCount}</b> failed closed to human review.</div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
