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

export interface PlanStage {
  stage: PipelineStageKey;
  engine: PipelineEngineChoice;
  reason: string;
  fallback: PipelineEngineChoice | null;
}

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
  const collect: PlanStage = large && e.purviewPreserve
    ? { stage: "collect", engine: "purview", reason: "Large volume — Purview eDiscovery collection scales tenant-wide.", fallback: "native" }
    : { stage: "collect", engine: "native", reason: "Targeted per-custodian Microsoft Graph collection.", fallback: e.purviewPreserve ? "purview" : null };

  // Preserve — Purview in-place hold when available (defensible, data stays in tenant).
  const preserve: PlanStage = e.purviewPreserve
    ? { stage: "preserve", engine: "purview", reason: "In-place hold via Purview eDiscovery — defensible, data stays in the tenant.", fallback: "native" }
    : { stage: "preserve", engine: "native", reason: "eDiscovery not connected — AEGIS preservation (copy-to-vault / third-party).", fallback: null };

  // Process — prefer native/Tika (fast, no E5) unless residency/client demands Purview.
  let process: PlanStage;
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
  const review: PlanStage = {
    stage: "review",
    engine: "aegis-ai",
    reason: "AEGIS AI review (LLM coding, ECA, near-dup, Copilot/AutoPilot) — no Purview equivalent.",
    fallback: null,
  };

  const stages = [collect, preserve, process, review];
  const label = (c: PipelineEngineChoice) =>
    c === "aegis-ai" ? "AEGIS AI" : c === "purview" ? "Purview" : c === "tika" ? "Tika" : "native";
  const summary = `Collect: ${label(collect.engine)} · Preserve: ${label(preserve.engine)} · Process: ${label(process.engine)} · Review: ${label(review.engine)}`;

  return { stages, summary };
}
