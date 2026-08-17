/**
 * Shared AI review types. One engine, many workflows: DSAR relevance, culling
 * (responsiveness + junk), and production (privilege + PII + issue coding).
 *
 * The unit is a multi-dimension TAG on an item — responsiveness (optionally
 * per issue), privilege, PII/confidential, key-document, redaction — each
 * carrying its own confidence and a citation (the supporting passage). A
 * router turns the tag set into a queue (auto-cull / reviewer / attorney).
 * AI proposes; a human always disposes downstream.
 */

export type ReviewTagKind = "RESPONSIVE" | "PRIVILEGED" | "PII" | "KEY_DOCUMENT" | "REDACT";

export const ALL_DIMENSIONS: ReviewTagKind[] = ["RESPONSIVE", "PRIVILEGED", "PII", "KEY_DOCUMENT", "REDACT"];

/** An issue/topic responsiveness is scored against (investigations, subpoena). */
export interface ReviewIssue {
  key: string;
  description: string;
}

/** The configurable "instructions" — the prompt/criteria the AI reviews to. */
export interface ReviewInstruction {
  /** Plain-language "what is in scope" definition (the prompt). */
  criteria: string;
  /** Optional per-issue responsiveness (each issue gets its own RESPONSIVE tag). */
  issues?: ReviewIssue[];
  /** Which dimensions to score. Defaults to ALL_DIMENSIONS. */
  dimensions?: ReviewTagKind[];
  /** Optional subject identity (DSAR) — boosts responsiveness on identifier hits. */
  subject?: { name?: string | null; email?: string | null } | null;
}

export interface ReviewItem {
  id: string;
  title: string;
  /** Body / excerpt the model + human read. */
  text?: string | null;
  sourceSystem?: string | null;
}

export interface ReviewTag {
  kind: ReviewTagKind;
  /** For per-issue RESPONSIVE; null for the other dimensions. */
  issueKey?: string | null;
  /** The call: responsive / privileged / contains-PII / key / should-redact. */
  value: boolean;
  /** 0..1 confidence in `value`. */
  confidence: number;
  /** The supporting passage from the item (required for high-confidence AI calls). */
  citation: string | null;
  rationale: string;
}

/** Where a coded item is routed after AI review. */
export type ReviewRoute = "AUTO_CULL" | "REVIEWER" | "ATTORNEY";

export interface ReviewItemResult {
  itemId: string;
  tags: ReviewTag[];
  route: ReviewRoute;
  /** True when produced by the deterministic fallback (no model behind it). */
  degraded: boolean;
}

export interface RoutingThresholds {
  /** Below this confidence on any tag → escalate to attorney (uncertain). */
  lowConfidence: number;
  /** At/above this AI confidence with NO citation → fail closed to attorney. */
  citationRequiredAbove: number;
}

export const DEFAULT_THRESHOLDS: RoutingThresholds = { lowConfidence: 0.4, citationRequiredAbove: 0.7 };
