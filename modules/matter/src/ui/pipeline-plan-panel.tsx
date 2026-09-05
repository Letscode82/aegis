/**
 * PipelinePlanPanel (B3) — the visible "one brain".
 *
 * Shows the org's engine capabilities and the resolved per-stage pipeline plan
 * (Collect / Preserve / Process / Review), with hint toggles (volume /
 * residency / cost / Purview preference) that re-resolve the plan live. Reads
 * GET /api/admin/pipeline/plan. Read-only.
 */
import React, { useCallback, useEffect, useState } from "react";
import { C, F, M } from "@aegis/ui";

type Engine = "native" | "tika" | "purview" | "aegis-ai";
interface PlanStage { stage: string; engine: Engine; reason: string; fallback: Engine | null }
interface Capabilities {
  m365: { connected: boolean; mode: string; tenantIdMasked: string | null };
  ediscovery: { connected: boolean; accountUpn: string | null; expired: boolean };
  processing: { configuredMode: string; effectiveMode: string; tikaReachable: boolean; tikaVersion: string | null };
  engines: Record<string, boolean>;
}
interface PlanResponse { ok: boolean; capabilities?: Capabilities; plan?: { stages: PlanStage[]; summary: string }; error?: { message: string } }

const ENGINE_COLOR: Record<Engine, string> = { purview: C.bl, tika: C.cy, native: C.t3, "aegis-ai": C.gn };
const ENGINE_LABEL: Record<Engine, string> = { purview: "Purview", tika: "Tika", native: "Native", "aegis-ai": "AEGIS AI" };
const STAGE_LABEL: Record<string, string> = { collect: "Collect", preserve: "Preserve", process: "Process", review: "Review" };

export const PipelinePlanPanel: React.FC = () => {
  const [volume, setVolume] = useState<"small" | "large">("small");
  const [residency, setResidency] = useState<"any" | "in-tenant">("any");
  const [cost, setCost] = useState<"max-fidelity" | "min-cost">("max-fidelity");
  const [prefer, setPrefer] = useState(false);
  const [data, setData] = useState<PlanResponse | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setBusy(true);
    const qs = new URLSearchParams({ volume, residency, cost, ...(prefer ? { prefer: "purview" } : {}) }).toString();
    fetch(`/api/admin/pipeline/plan?${qs}`)
      .then((r) => r.json())
      .then((j) => setData(j))
      .catch((e) => setData({ ok: false, error: { message: String(e?.message || e) } }))
      .finally(() => setBusy(false));
  }, [volume, residency, cost, prefer]);

  useEffect(() => { load(); }, [load]);

  const caps = data?.capabilities;
  const chip = (label: string, on: boolean, detail?: string | null) => (
    <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 12px", borderRadius: 8, border: `1px solid ${C.br}`, background: C.s1, fontSize: 12.5, color: C.t2 }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: on ? C.gn : C.t4 }} />
      {label}{detail ? <span style={{ color: C.t4, fontFamily: M, fontSize: 11 }}>· {detail}</span> : null}
    </div>
  );
  const toggle = <T extends string>(label: string, val: T, set: (v: T) => void, opts: Array<{ v: T; l: string }>) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 11.5, color: C.t3, fontFamily: M, minWidth: 74 }}>{label}</span>
      <div style={{ display: "flex", gap: 4 }}>
        {opts.map((o) => (
          <button key={o.v} onClick={() => set(o.v)} style={{ fontSize: 12, fontWeight: 600, padding: "5px 11px", borderRadius: 7, cursor: "pointer", background: val === o.v ? C.bl : "transparent", color: val === o.v ? C.bg : C.t2, border: `1px solid ${val === o.v ? C.bl : C.br}` }}>{o.l}</button>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{ padding: "26px 32px", fontFamily: F, color: C.t1, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ marginBottom: 4, fontFamily: M, fontSize: 10.5, letterSpacing: 1.4, color: C.cy, textTransform: "uppercase" }}>eDiscovery orchestration · one brain</div>
      <div style={{ fontFamily: F, fontSize: 26, fontWeight: 600, marginBottom: 4 }}>Pipeline plan</div>
      <div style={{ fontSize: 13.5, color: C.t3, marginBottom: 20 }}>How AEGIS routes each stage across native, Tika, and Purview — chosen per matter by capability, cost, and residency.</div>

      {/* capabilities */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
        {caps ? (
          <>
            {chip("M365", caps.m365.connected, caps.m365.connected ? caps.m365.mode : "not connected")}
            {chip("Purview eDiscovery", caps.ediscovery.connected, caps.ediscovery.connected ? (caps.ediscovery.accountUpn ?? "connected") : (caps.ediscovery.expired ? "expired" : "not connected"))}
            {chip("Tika sidecar", caps.processing.tikaReachable, caps.processing.tikaReachable ? (caps.processing.tikaVersion ?? "reachable") : "not reachable")}
            {chip("AEGIS AI review", true, "always")}
          </>
        ) : <span style={{ color: C.t4, fontFamily: M, fontSize: 12 }}>{busy ? "Loading capabilities…" : "—"}</span>}
      </div>

      {/* hint toggles */}
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 20, padding: "14px 16px", border: `1px solid ${C.br}`, borderRadius: 12, background: C.s1 }}>
        {toggle("Volume", volume, setVolume, [{ v: "small", l: "Small" }, { v: "large", l: "Large" }])}
        {toggle("Residency", residency, setResidency, [{ v: "any", l: "Any" }, { v: "in-tenant", l: "In-tenant" }])}
        {toggle("Cost", cost, setCost, [{ v: "max-fidelity", l: "Max fidelity" }, { v: "min-cost", l: "Min cost" }])}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11.5, color: C.t3, fontFamily: M, minWidth: 74 }}>Purview</span>
          <button onClick={() => setPrefer((v) => !v)} style={{ fontSize: 12, fontWeight: 600, padding: "5px 11px", borderRadius: 7, cursor: "pointer", background: prefer ? C.bl : "transparent", color: prefer ? C.bg : C.t2, border: `1px solid ${prefer ? C.bl : C.br}` }}>{prefer ? "Client prefers Purview" : "No preference"}</button>
        </div>
      </div>

      {/* plan stages */}
      {data?.plan ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12 }}>
            {data.plan.stages.map((s) => {
              const col = ENGINE_COLOR[s.engine] ?? C.t3;
              return (
                <div key={s.stage} style={{ border: `1px solid ${C.br}`, borderRadius: 12, padding: "16px 18px", background: C.cd }}>
                  <div style={{ fontSize: 11, fontFamily: M, letterSpacing: .6, textTransform: "uppercase", color: C.t3, marginBottom: 10 }}>{STAGE_LABEL[s.stage] ?? s.stage}</div>
                  <div style={{ display: "inline-block", fontSize: 12, fontWeight: 700, color: C.bg, background: col, borderRadius: 6, padding: "3px 10px", marginBottom: 10 }}>{ENGINE_LABEL[s.engine] ?? s.engine}</div>
                  <div style={{ fontSize: 12.5, color: C.t2, lineHeight: 1.45 }}>{s.reason}</div>
                  {s.fallback ? <div style={{ fontSize: 11, color: C.t4, marginTop: 8, fontFamily: M }}>fallback → {ENGINE_LABEL[s.fallback] ?? s.fallback}</div> : null}
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 16, fontSize: 12.5, color: C.t3, fontFamily: M }}>{data.plan.summary}</div>
        </>
      ) : (
        <div style={{ color: C.t4, fontFamily: M, fontSize: 12 }}>{busy ? "Resolving plan…" : (data?.error?.message ?? "No plan.")}</div>
      )}
    </div>
  );
};
