/**
 * Pure client-safe helpers for the multi-dimension AI tag set stored on
 * `ReviewSetItem.aiTags`. Kept free of any DB/server import so the reviewer UI
 * can consume it without bundling the persistence layer. Unit-tested.
 */
export interface AiTagView {
  kind: string;
  value: boolean;
  confidence: number;
  citation: string | null;
  rationale: string | null;
}

/** Canonical display order + label for the five review dimensions. */
export const AI_TAG_KINDS: Array<{ kind: string; label: string }> = [
  { kind: "RESPONSIVE", label: "Responsive" },
  { kind: "PRIVILEGED", label: "Privileged" },
  { kind: "PII", label: "PII" },
  { kind: "KEY_DOCUMENT", label: "Key document" },
  { kind: "REDACT", label: "Redact" },
];

/** Coerce the persisted `aiTags` JSON into a typed, sanitized view array. */
export function parseAiTags(raw: unknown): AiTagView[] {
  if (!Array.isArray(raw)) return [];
  const out: AiTagView[] = [];
  for (const t of raw) {
    if (!t || typeof t !== "object" || !("kind" in t)) continue;
    const o = t as Record<string, unknown>;
    out.push({
      kind: String(o.kind),
      value: Boolean(o.value),
      confidence: typeof o.confidence === "number" && Number.isFinite(o.confidence) ? o.confidence : 0,
      citation: o.citation == null || o.citation === "" ? null : String(o.citation),
      rationale: o.rationale == null || o.rationale === "" ? null : String(o.rationale),
    });
  }
  return out;
}

/** Order tags by the canonical dimension order, unknown kinds last. */
export function orderedAiTags(raw: unknown): AiTagView[] {
  const tags = parseAiTags(raw);
  const rank = new Map(AI_TAG_KINDS.map((k, i) => [k.kind, i]));
  return [...tags].sort((a, b) => (rank.get(a.kind) ?? 99) - (rank.get(b.kind) ?? 99));
}

/**
 * True when the AI's RESPONSIVE call is a confident, cited positive — the
 * profile a governed "accept confident AI calls" bulk action targets.
 */
export function isConfidentResponsive(raw: unknown, threshold = 0.7): boolean {
  const r = parseAiTags(raw).find((t) => t.kind === "RESPONSIVE");
  return Boolean(r && r.value && r.confidence >= threshold && r.citation);
}

/** True when any positive tag clears the confidence threshold (for filtering). */
export function hasConfidentCall(raw: unknown, threshold = 0.7): boolean {
  return parseAiTags(raw).some((t) => t.value && t.confidence >= threshold);
}
