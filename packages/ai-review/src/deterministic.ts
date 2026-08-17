/**
 * Deterministic fallback scorer — the always-available floor under the AI
 * review, per dimension. When `@aegis/ai` is unconfigured or a call fails, this
 * keeps the queue moving with explainable, defensible calls: keyword/identity
 * overlap for responsiveness, marker detection for privilege, regex for PII,
 * and simple heuristics for key-document + redaction. Pure.
 */
import type { ReviewInstruction, ReviewItem, ReviewTag, ReviewTagKind } from "./types";
import { ALL_DIMENSIONS } from "./types";

const STOP = new Set([
  "the", "and", "for", "that", "this", "with", "from", "including", "data", "personal", "information",
  "documents", "document", "relevant", "under", "processing", "which", "their", "have", "been", "such",
  "into", "any", "all", "not", "are", "was", "were", "records", "record", "about", "concerning",
]);

export function tokenize(text: string): string[] {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9@.\s]/g, " ")
    .split(/\s+/)
    // Keep internal dots (emails like a.b@x.com) but trim leading/trailing
    // punctuation so "data." matches the stopword "data".
    .map((t) => t.replace(/^\.+|\.+$/g, ""))
    .filter((t) => t.length > 3 && !STOP.has(t));
}

const PRIVILEGE_MARKERS = [
  "attorney-client", "attorney client", "privileged", "work product", "work-product",
  "legal advice", "counsel", "outside counsel", "general counsel", "litigation strategy",
];
const PII_PATTERNS: RegExp[] = [
  /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i, // email
  /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/, // SSN-like
  /\b(?:\+?\d[\s-]?){9,}\d\b/, // phone-ish
  /\b\d{1,5}\s+[a-z].*\b(street|st|avenue|ave|road|rd|lane|ln|drive|dr)\b/i, // address
];
const KEY_MARKERS = ["approved", "agreement", "decision", "authorized", "signed", "executed", "confidential settlement"];

function clamp(x: number): number {
  return Math.max(0, Math.min(1, Math.round(x * 100) / 100));
}

function firstMatch(haystack: string, patterns: RegExp[]): string | null {
  for (const p of patterns) {
    const m = p.exec(haystack);
    if (m) return m[0].slice(0, 120);
  }
  return null;
}

function responsivenessTag(instruction: ReviewInstruction, hay: string, tokens: Set<string>, issue?: { key: string; description: string }): ReviewTag {
  const criteria = issue ? issue.description : instruction.criteria;
  const critTokens = new Set(tokenize(criteria));
  let overlap = 0;
  for (const t of critTokens) if (tokens.has(t)) overlap += 1;
  let score = critTokens.size > 0 ? overlap / critTokens.size : 0;

  const name = instruction.subject?.name?.trim().toLowerCase();
  const email = instruction.subject?.email?.trim().toLowerCase();
  const nameHit = !!name && name.length > 1 && hay.includes(name);
  const emailHit = !!email && hay.includes(email);
  if (nameHit || emailHit) score = Math.min(1, score + 0.5);

  score = clamp(score);
  const value = score >= 0.45;
  // Confidence is certainty of the BINARY call, not the raw relevance score:
  // a very low score is confidently NOT responsive; the middle band is genuinely
  // uncertain (routes to attorney).
  let confidence: number;
  if (score >= 0.45) confidence = clamp(0.55 + score / 2);
  else if (score < 0.15) confidence = 0.85;
  else confidence = 0.3;
  const cite = emailHit ? email! : nameHit ? name! : null;
  const reason = value
    ? `matched ${overlap}/${critTokens.size} scope terms${emailHit ? " + subject email" : nameHit ? " + subject name" : ""}`
    : `only ${overlap}/${critTokens.size} scope terms matched`;
  return { kind: "RESPONSIVE", issueKey: issue?.key ?? null, value, confidence, citation: cite, rationale: `Deterministic responsiveness: ${reason}.` };
}

export function screenDeterministic(instruction: ReviewInstruction, item: ReviewItem): ReviewTag[] {
  const hay = `${item.title} ${item.text ?? ""}`.toLowerCase();
  const tokens = new Set(tokenize(`${item.title} ${item.text ?? ""}`));
  const dims: ReviewTagKind[] = instruction.dimensions ?? ALL_DIMENSIONS;
  const tags: ReviewTag[] = [];

  if (dims.includes("RESPONSIVE")) {
    if (instruction.issues && instruction.issues.length > 0) {
      for (const issue of instruction.issues) tags.push(responsivenessTag(instruction, hay, tokens, issue));
    } else {
      tags.push(responsivenessTag(instruction, hay, tokens));
    }
  }

  if (dims.includes("PRIVILEGED")) {
    const marker = PRIVILEGE_MARKERS.find((m) => hay.includes(m));
    tags.push({ kind: "PRIVILEGED", value: !!marker, confidence: marker ? 0.8 : 0.9, citation: marker ?? null, rationale: marker ? `Contains privilege marker "${marker}".` : "No privilege markers found." });
  }

  const piiMatch = dims.includes("PII") || dims.includes("REDACT") ? firstMatch(hay, PII_PATTERNS) : null;
  if (dims.includes("PII")) {
    tags.push({ kind: "PII", value: !!piiMatch, confidence: piiMatch ? 0.75 : 0.8, citation: piiMatch, rationale: piiMatch ? "Contains a personal-data pattern (email/phone/ID/address)." : "No obvious PII patterns." });
  }

  if (dims.includes("KEY_DOCUMENT")) {
    const km = KEY_MARKERS.find((m) => hay.includes(m));
    const responsive = tags.some((t) => t.kind === "RESPONSIVE" && t.value);
    tags.push({ kind: "KEY_DOCUMENT", value: !!km && responsive, confidence: km ? 0.55 : 0.6, citation: km ?? null, rationale: km ? `Decision/approval language ("${km}").` : "No hot-document signals." });
  }

  if (dims.includes("REDACT")) {
    const responsive = tags.some((t) => t.kind === "RESPONSIVE" && t.value);
    const shouldRedact = !!piiMatch && responsive;
    tags.push({ kind: "REDACT", value: shouldRedact, confidence: 0.6, citation: shouldRedact ? piiMatch : null, rationale: shouldRedact ? "Responsive but contains third-party PII to mask." : "No redaction indicated." });
  }

  return tags;
}
