/**
 * Pipeline planner (B2) — resolve a per-matter engine plan.
 *
 * Pure decision function: given an org's capabilities (B1) and optional matter
 * hints (volume, residency, cost, client preference), pick the best engine for
 * each lifecycle stage — Collect / Preserve / Process / Review — with a reason
 * and a fallback. This is the "one brain" that routes across native, Tika, and
 * Purview so AEGIS uses Purview where it helps and does the rest itself.
 */
import type { OrgProcessingCapabilities } from "./pipeline-capabilities";

export type PipelineStageKey = "collect" | "preserve" | "process" | "review";
export type PipelineEngineChoice = "native" | "tika" | "purview" | "aegis-ai";

export interface EngineEconomics {
  /** Rough cost posture of the chosen engine. */
  cost: string;
  /** Rough throughput posture. */
  speed: string;
}

export interface PlanStage {
  stage: PipelineStageKey;
  engine: PipelineEngineChoice;
  reason: string;
  fallback: PipelineEngineChoice | null;
  economics: EngineEconomics;
}

/** Rough per-engine cost + throughput posture (B6) — feeds the "why AEGIS
 *  beats Purview" story. Indicative, not a quote. */
export const ENGINE_ECONOMICS: Record<PipelineEngineChoice, EngineEconomics> = {
  native: { cost: "Included — no license", speed: "Instant, in-process" },
  tika: { cost: "Sidecar compute only — no E5", speed: "Fast, parallel (OCR slower)" },
  purview: { cost: "Requires E5 + eDiscovery Premium", speed: "Async — minutes to hours" },
  "aegis-ai": { cost: "LLM usage per document", speed: "Batched, concurrent" },
};

export interface PipelinePlanHints {
  estimatedVolume?: "small" | "large";
  residency?: "in-tenant" | "any";
  costPreference?: "min-cost" | "max-fidelity";
  clientPrefersPurview?: boolean;
}

export interface MatterPipelinePlan {
  stages: PlanStage[];
  summary: string;
}

export function resolveMatterPipelinePlan(
  caps: OrgProcessingCapabilities,
  hints: PipelinePlanHints = {},
): MatterPipelinePlan {
  const e = caps.engines;
  const large = hints.estimatedVolume === "large";
  const inTenant = hints.residency === "in-tenant";
  const minCost = hints.costPreference === "min-cost";
  const preferPurview = !!hints.clientPrefersPurview;

  // Collect — targeted native by default; Purview collection scales tenant-wide.
  const collect: Omit<PlanStage, "economics"> = large && e.purviewPreserve
    ? { stage: "collect", engine: "purview", reason: "Large volume — Purview eDiscovery collection scales tenant-wide.", fallback: "native" }
    : { stage: "collect", engine: "native", reason: "Targeted per-custodian Microsoft Graph collection.", fallback: e.purviewPreserve ? "purview" : null };

  // Preserve — Purview in-place hold when available (defensible, data stays in tenant).
  const preserve: Omit<PlanStage, "economics"> = e.purviewPreserve
    ? { stage: "preserve", engine: "purview", reason: "In-place hold via Purview eDiscovery — defensible, data stays in the tenant.", fallback: "native" }
    : { stage: "preserve", engine: "native", reason: "eDiscovery not connected — AEGIS preservation (copy-to-vault / third-party).", fallback: null };

  // Process — prefer native/Tika (fast, no E5) unless residency/client demands Purview.
  let process: Omit<PlanStage, "economics">;
  if ((inTenant || preferPurview) && e.purviewProcess && !minCost) {
    process = {
      stage: "process",
      engine: "purview",
      reason: inTenant
        ? "Residency: keep processing in-tenant via Purview. Note: processed content read-back is portal-only (PROC-7b)."
        : "Client prefers Purview processing. Note: read-back into AEGIS is portal-only (PROC-7b).",
      fallback: e.tikaExtract ? "tika" : "native",
    };
  } else if (e.tikaExtract) {
    process = { stage: "process", engine: "tika", reason: "Tika: broad-format + OCR, faster and no eDiscovery Premium dependency.", fallback: "native" };
  } else {
    process = { stage: "process", engine: "native", reason: "In-process extraction (email bodies + common formats).", fallback: null };
  }

  // Review — always AEGIS AI; Purview has no equivalent.
  const review: Omit<PlanStage, "economics"> = {
    stage: "review",
    engine: "aegis-ai",
    reason: "AEGIS AI review (LLM coding, ECA, near-dup, Copilot/AutoPilot) — no Purview equivalent.",
    fallback: null,
  };

  const raw: Array<Omit<PlanStage, "economics">> = [collect, preserve, process, review];
  const stages: PlanStage[] = raw.map((s) => ({ ...s, economics: ENGINE_ECONOMICS[s.engine] }));
  const label = (c: PipelineEngineChoice) =>
    c === "aegis-ai" ? "AEGIS AI" : c === "purview" ? "Purview" : c === "tika" ? "Tika" : "native";
  const summary = `Collect: ${label(collect.engine)} · Preserve: ${label(preserve.engine)} · Process: ${label(process.engine)} · Review: ${label(review.engine)}`;

  return { stages, summary };
}
