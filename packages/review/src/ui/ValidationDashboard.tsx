/**
 * ValidationDashboard (AIR-6 read half) — the org-wide "is the AI review any
 * good, and is it drifting?" view. Reads /api/review/validation/dashboard:
 * overall recall/precision/F1/overturn, the same grouped by the profile each
 * run used, and a chronological drift sparkline per profile. Pure read — no
 * mutations, gated like the other review reads.
 */
import React, { useEffect, useState } from "react";
import { C, F, M, SR, Sparkline } from "@aegis/ui";

interface TrendPoint { date: string; recall: number | null; precision: number | null; f1: number | null; overturn: number | null }
interface Group { profileLabel: string; runs: number; latest: TrendPoint | null; avg: { recall: number | null; precision: number | null; f1: number | null; overturn: number | null }; trend: TrendPoint[] }
interface Row { id: string; reviewSetName: string; profileLabel: string; dimension: string; createdAt: string; recall: number | null; precision: number | null; f1: number | null; overturn: number | null; n: number }
interface Dashboard { totalRuns: number; scoredRuns: number; overall: { recall: number | null; precision: number | null; f1: number | null; overturn: number | null }; groups: Group[]; rows: Row[] }

export interface ValidationDashboardProps { apiBase?: string }

const pctOrDash = (v: number | null): string => (v == null ? "—" : `${Math.round(v * 100)}%`);
const metricColor = (v: number | null, invert = false): string => {
  if (v == null) return C.t4;
  const good = invert ? v <= 0.1 : v >= 0.8;
  const mid = invert ? v <= 0.25 : v >= 0.6;
  return good ? C.gn : mid ? C.am : C.rd;
};

export const ValidationDashboard: React.FC<ValidationDashboardProps> = ({ apiBase = "/api/review/validation/dashboard" }) => {
  const [d, setD] = useState<Dashboard | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    fetch(apiBase).then((r) => r.json()).then((j) => { if (j.ok) setD(j.dashboard); else setErr(j.error || "Failed"); }).catch((e) => setErr(String(e)));
  }, [apiBase]);

  if (err) return <div style={{ padding: 40, color: C.rd, fontFamily: M, fontSize: 13 }}>{err}</div>;
  if (!d) return <div style={{ padding: 40, color: C.t4, fontFamily: M, fontSize: 13 }}>Loading validation dashboard…</div>;

  const tile = (label: string, v: number | null, invert = false) => (
    <div style={{ border: `1px solid ${C.br}`, borderRadius: 12, padding: "16px 18px", flex: "1 1 150px", background: C.bg }}>
      <div style={{ fontFamily: SR, fontSize: 30, fontWeight: 600, color: metricColor(v, invert) }}>{pctOrDash(v)}</div>
      <div style={{ fontSize: 10.5, color: C.t3, fontFamily: M, letterSpacing: .4, textTransform: "uppercase", marginTop: 2 }}>{label}</div>
    </div>
  );

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "26px 32px", fontFamily: F, color: C.t1, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ fontFamily: M, fontSize: 10.5, letterSpacing: 1.4, color: C.cy, textTransform: "uppercase" }}>AI review · quality &amp; drift</div>
      <div style={{ fontFamily: SR, fontSize: 26, fontWeight: 600, marginBottom: 4 }}>AI Validation dashboard</div>
      <div style={{ fontSize: 13, color: C.t3, marginBottom: 22 }}>How the AI review is performing against human ground truth across the org — {d.scoredRuns} scored pilot{d.scoredRuns === 1 ? "" : "s"} of {d.totalRuns}.</div>

      {d.totalRuns === 0 ? (
        <div style={{ fontSize: 13, color: C.t4, fontFamily: M }}>No validation pilots yet. Run a pilot from a collection's Validate tab, code the sample, and Compute metrics — results land here.</div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            {tile("Avg recall", d.overall.recall)}
            {tile("Avg precision", d.overall.precision)}
            {tile("Avg F1", d.overall.f1)}
            {tile("Avg overturn", d.overall.overturn, true)}
          </div>
          <div style={{ fontSize: 11, color: C.t4, marginBottom: 24 }}>Averages across every scored pilot. Overturn is the human-override rate — lower is better.</div>

          {/* Per-profile groups */}
          <div style={{ fontSize: 11, fontFamily: M, letterSpacing: .6, textTransform: "uppercase", color: C.t3, marginBottom: 12 }}>By review profile</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 28 }}>
            {d.groups.map((g) => {
              const recallTrend = g.trend.map((t, i) => ({ label: String(i), value: t.recall ?? 0 }));
              return (
                <div key={g.profileLabel} style={{ border: `1px solid ${C.br}`, borderRadius: 12, padding: "16px 18px", display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ flex: "1 1 220px", minWidth: 180 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 600 }}>{g.profileLabel}</div>
                    <div style={{ fontSize: 11.5, color: C.t4, fontFamily: M, marginTop: 2 }}>{g.runs} pilot{g.runs === 1 ? "" : "s"}</div>
                  </div>
                  <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
                    <Metric label="Recall" v={g.latest?.recall ?? null} />
                    <Metric label="Precision" v={g.latest?.precision ?? null} />
                    <Metric label="F1" v={g.latest?.f1 ?? null} />
                    <Metric label="Overturn" v={g.latest?.overturn ?? null} invert />
                  </div>
                  {recallTrend.length > 1 && (
                    <div style={{ flex: "0 0 auto" }}>
                      <div style={{ fontSize: 9.5, color: C.t4, fontFamily: M, marginBottom: 2 }}>recall drift</div>
                      <Sparkline points={recallTrend} width={120} height={30} min={0} max={1} color={C.bl} ariaLabel={`Recall trend for ${g.profileLabel}`} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Recent runs */}
          <div style={{ fontSize: 11, fontFamily: M, letterSpacing: .6, textTransform: "uppercase", color: C.t3, marginBottom: 10 }}>Recent pilots</div>
          <div style={{ border: `1px solid ${C.br}`, borderRadius: 12, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 80px 70px 70px 70px 70px", gap: 8, padding: "9px 14px", background: C.cd, borderBottom: `1px solid ${C.br}`, fontSize: 10, fontFamily: M, letterSpacing: .5, textTransform: "uppercase", color: C.t3 }}>
              <div>Collection</div><div>Profile</div><div>Dim</div><div style={{ textAlign: "right" }}>Recall</div><div style={{ textAlign: "right" }}>Prec.</div><div style={{ textAlign: "right" }}>F1</div><div style={{ textAlign: "right" }}>Overturn</div>
            </div>
            {d.rows.slice(0, 30).map((r) => (
              <div key={r.id} style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 80px 70px 70px 70px 70px", gap: 8, padding: "9px 14px", borderBottom: `1px solid ${C.br}44`, fontSize: 12.5, alignItems: "center" }}>
                <div style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.reviewSetName}</div>
                <div style={{ color: C.t3, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.profileLabel}</div>
                <div style={{ fontFamily: M, fontSize: 10.5, color: C.t4 }}>{r.dimension === "PRIVILEGED" ? "PRIV" : "RESP"}</div>
                <div style={{ textAlign: "right", fontFamily: M, color: metricColor(r.recall) }}>{pctOrDash(r.recall)}</div>
                <div style={{ textAlign: "right", fontFamily: M, color: metricColor(r.precision) }}>{pctOrDash(r.precision)}</div>
                <div style={{ textAlign: "right", fontFamily: M, color: metricColor(r.f1) }}>{pctOrDash(r.f1)}</div>
                <div style={{ textAlign: "right", fontFamily: M, color: metricColor(r.overturn, true) }}>{pctOrDash(r.overturn)}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

const Metric: React.FC<{ label: string; v: number | null; invert?: boolean }> = ({ label, v, invert }) => (
  <div style={{ textAlign: "center", minWidth: 54 }}>
    <div style={{ fontFamily: SR, fontSize: 18, fontWeight: 600, color: metricColor(v, invert) }}>{pctOrDash(v)}</div>
    <div style={{ fontSize: 9.5, color: C.t4, fontFamily: M, textTransform: "uppercase", letterSpacing: .3 }}>{label}</div>
  </div>
);
