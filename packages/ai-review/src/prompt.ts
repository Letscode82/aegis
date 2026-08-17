/**
 * Prompt construction + response parsing for the AI review. The caller runs
 * the built prompt through `@aegis/ai` (callClaudeJSON) and passes the raw
 * result here; parsing coerces every field, clamps confidence, and routes each
 * item. Callers never depend on `@aegis/ai` shapes — this package is pure.
 */
import type { ReviewInstruction, ReviewItem, ReviewItemResult, ReviewTag, ReviewTagKind, RoutingThresholds } from "./types";
import { ALL_DIMENSIONS, DEFAULT_THRESHOLDS } from "./types";
import { routeTags } from "./router";
import { screenDeterministic } from "./deterministic";

const VALID_KINDS = new Set<ReviewTagKind>(ALL_DIMENSIONS);

/** Build the strict-JSON review prompt for a batch of items. */
export function buildReviewPrompt(instruction: ReviewInstruction, items: ReviewItem[]): string {
  const dims = instruction.dimensions ?? ALL_DIMENSIONS;
  const lines: string[] = [
    "You are a legal document reviewer. For each item, tag it across the requested dimensions.",
    "AI proposes; a human confirms every decision, so be precise and cite your evidence.",
    "",
    "Relevance / scope criteria:",
    instruction.criteria || "(none provided)",
  ];
  if (instruction.subject?.name || instruction.subject?.email) {
    lines.push(`Data subject: ${instruction.subject?.name ?? ""}${instruction.subject?.email ? ` <${instruction.subject.email}>` : ""}.`);
  }
  if (instruction.issues?.length) {
    lines.push("", "Issues (score RESPONSIVE per issue by key):");
    for (const i of instruction.issues) lines.push(`- ${i.key}: ${i.description}`);
  }
  lines.push(
    "",
    `Dimensions to tag: ${dims.join(", ")}.`,
    "  RESPONSIVE = in scope / relevant (per issue if issues are listed).",
    "  PRIVILEGED = attorney-client privilege or work product.",
    "  PII = contains a person's personal data (email, phone, ID, address).",
    "  KEY_DOCUMENT = a hot / decisional document.",
    "  REDACT = should be redacted before disclosure.",
    "",
    "Respond with STRICT JSON only:",
    '{"results":[{"itemId":"<id>","tags":[{"kind":"RESPONSIVE","issueKey":"<key or null>","value":true,"confidence":0.0-1.0,"citation":"<verbatim supporting passage or null>","rationale":"<one sentence>"}]}]}',
    "Every tag with value=true and confidence>=0.7 MUST include a verbatim citation from the item.",
    "",
    "Items:",
    ...items.map((it) => `#${it.id} [${it.sourceSystem ?? "src"}] ${it.title}${it.text ? ` -- ${String(it.text).slice(0, 500)}` : ""}`),
  );
  return lines.join("\n");
}

function clampConf(x: unknown): number {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, Math.round(n * 100) / 100));
}

function coerceTag(raw: Record<string, unknown>): ReviewTag | null {
  const kind = String(raw.kind ?? "").toUpperCase() as ReviewTagKind;
  if (!VALID_KINDS.has(kind)) return null;
  const citationRaw = raw.citation;
  const citation = citationRaw == null || citationRaw === "" ? null : String(citationRaw).slice(0, 300);
  return {
    kind,
    issueKey: raw.issueKey == null || raw.issueKey === "" ? null : String(raw.issueKey),
    value: raw.value === true || raw.value === "true",
    confidence: clampConf(raw.confidence),
    citation,
    rationale: String(raw.rationale ?? "").slice(0, 400),
  };
}

/** Build a routed result from a tag set. */
export function resultFromTags(itemId: string, tags: ReviewTag[], fromModel: boolean, thresholds?: Partial<RoutingThresholds>): ReviewItemResult {
  return { itemId, tags, route: routeTags(tags, { ...thresholds, fromModel }), degraded: !fromModel };
}

/** Deterministic review of a batch (no model). */
export function reviewDeterministic(instruction: ReviewInstruction, items: ReviewItem[]): ReviewItemResult[] {
  return items.map((it) => resultFromTags(it.id, screenDeterministic(instruction, it), false));
}

/**
 * Parse the model's raw JSON into routed results, filling any item the model
 * omitted (or that produced no valid tags) from the deterministic screen so the
 * batch is always complete.
 */
export function parseAiReview(raw: unknown, instruction: ReviewInstruction, items: ReviewItem[], thresholds?: Partial<RoutingThresholds>): ReviewItemResult[] {
  const parsed = (typeof raw === "string" ? safeParse(raw) : raw) as { results?: unknown } | null;
  const rows = Array.isArray(parsed?.results) ? (parsed!.results as Record<string, unknown>[]) : [];
  const byId = new Map<string, ReviewTag[]>();
  for (const r of rows) {
    const id = String(r.itemId ?? r.id ?? "");
    if (!id) continue;
    const tags = (Array.isArray(r.tags) ? r.tags : []).map((t) => coerceTag(t as Record<string, unknown>)).filter((t): t is ReviewTag => !!t);
    if (tags.length > 0) byId.set(id, tags);
  }
  return items.map((it) => {
    const tags = byId.get(it.id);
    if (tags && tags.length > 0) return resultFromTags(it.id, tags, true, thresholds);
    // Model skipped this item → deterministic screen keeps the batch complete.
    return resultFromTags(it.id, screenDeterministic(instruction, it), false, thresholds);
  });
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    const m = /\{[\s\S]*\}/.exec(s);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

export { DEFAULT_THRESHOLDS };
