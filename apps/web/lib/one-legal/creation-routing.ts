/**
 * ONE Legal creation routing — Assistance vs Tracked (Phase 7).
 *
 * The console offers two ways to create something:
 *  • Assistance — a quick, editable canvas draft that files NOTHING (no REQ
 *    number, no approval trail). The fast, ungoverned surface.
 *  • Tracked — a real contract/NDA creation files through Intake under its
 *    request TYPE, so it gets a REQ id, rides the approval ladder in the
 *    Cockpit, and spawns the linked Contract on approval.
 *
 * These two pure helpers are the routing decision. They live here (not inline
 * in CommandConsole) so the decision is unit-tested — a mis-route sends a real
 * contract to the ungoverned path, or a throwaway draft onto the record.
 */

// Assistance override: explicit "quick/rough/throwaway/scratch draft",
// "don't file", "no ticket", "just a draft" phrasing sends even a contract to
// the ungoverned canvas.
const QUICK_DRAFT_RE =
  /\b(quick|rough|throwaway|scratch)[ -]?draft\b|\bdon'?t\s+file\b|\bno\s+ticket\b|\bjust\s+a\s+draft\b/i;

/** True when the user explicitly asked for a quick / un-filed draft. */
export function wantsQuickDraft(text: string | null | undefined): boolean {
  return QUICK_DRAFT_RE.test(String(text || ""));
}

/** The Intake request type a contract/NDA creation files under. */
export type ContractCreationType = "NDA Request" | "Contract Review";

// A creation verb — the request has to ask to *make* something, not merely
// mention a contract noun ("what's our NDA policy?" is a question, not a draft).
const CREATE_VERB_RE =
  /\b(draft|create|prepare|author|generate|write|new|set\s*up|put\s+together|build)\b/i;
const NDA_NOUN_RE =
  /\bnda\b|non[-\s]?disclosure|nondisclosure|confidential(?:ity)?\s+(?:agreement|undertaking)/i;
const CONTRACT_NOUN_RE =
  /\b(msa|sow|dpa|contract|agreement|licen[cs]e|master\s+services|statement\s+of\s+work|data\s+processing)\b/i;

/**
 * Map a contract/NDA *creation* request to the Intake request type it files
 * under — so it gets a REQ id, rides the approval ladder, and (on approval)
 * spawns the linked Contract. Returns null when it is not a creation request
 * (normal routing decides). Mirrors the server spawn types in
 * `modules/intake/src/internal/contract-spawn`: "NDA Request" | "Contract Review".
 */
export function contractCreationType(text: string | null | undefined): ContractCreationType | null {
  const t = String(text || "");
  if (!CREATE_VERB_RE.test(t)) return null;
  if (NDA_NOUN_RE.test(t)) return "NDA Request";
  if (CONTRACT_NOUN_RE.test(t)) return "Contract Review";
  return null;
}
