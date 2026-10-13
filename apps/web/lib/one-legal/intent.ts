/**
 * ONE Legal — intent preview.
 *
 * Harvey/Legora show the user what the command bar will DO before they commit.
 * AEGIS's console already made the decision inside `startTurn` / `submitComposer`
 * but never surfaced it, so the fast "quick draft" path was a buried ghost
 * button and "create an NDA" filed-and-tracked silently with no visible fork.
 *
 * `describeIntent` turns the console's own routing signals into a plain-English
 * preview of what Run/Enter will do, and flags the one case that deserves an
 * explicit upfront choice: creating a real contract/NDA (Tracked) vs a throwaway
 * canvas draft (Assistance). It is PURE and driven by the SAME predicates the
 * console routes on (passed in as `signals`), so the preview can never disagree
 * with what actually happens — the correctness guarantee behind the UI.
 */
import type { ContractCreationType } from "./creation-routing";

export type IntentKind = "empty" | "create" | "draft" | "review" | "answer" | "file";

export interface IntentPreview {
  /** Which branch the submit will take. `create` is the one that offers the fork. */
  kind: IntentKind;
  /** Does submitting create a tracked record (a REQ on the Intake ledger)? */
  filed: boolean;
  /** For `create`: the Intake request type it files under. */
  createType?: ContractCreationType | null;
  /** Emphasized phrase — what Run will do (e.g. "File & track", "Answer"). */
  lead: string;
  /** Muted remainder of the sentence. */
  tail: string;
}

/** The routing signals the console has already computed for the current input. */
export interface IntentSignals {
  /** Input has enough typed text to act on (console gate: trim().length >= 3). */
  hasText: boolean;
  /** A document is staged or pinned to the conversation. */
  hasDoc: boolean;
  /** `wantsQuickDraft(input)` — explicit quick/rough/"don't file" phrasing. */
  wantsQuick: boolean;
  /** `looksLikeCanvasDraft(input)` — "draft a memo/email/clause…" (no contract noun). */
  isCanvasDraft: boolean;
  /** `contractCreationType(input)` — the contract/NDA creation type, or null. */
  createType: ContractCreationType | null;
  /** `classifyIntent(input)` — the capability/ask/file verdict for everything else. */
  classified: "capability" | "ask" | "file";
}

/**
 * Describe what submitting the composer will do, mirroring the console's own
 * decision order in `startTurn` + `submitComposer`:
 *   1. empty                         → nothing to preview
 *   2. a document in play            → review it / answer against it (files nothing)
 *   3. explicit quick-draft phrasing → editable canvas (files nothing)
 *   4. a canvas draft (memo/email…)  → editable canvas (files nothing)
 *   5. a contract/NDA creation       → Tracked: file & track (the explicit fork)
 *   6. a capability/question         → answered (files nothing)
 *   7. anything else                 → filed & routed through intake
 */
export function describeIntent(signals: IntentSignals): IntentPreview {
  const { hasText, hasDoc, wantsQuick, isCanvasDraft, createType, classified } = signals;

  if (!hasText && !hasDoc) return { kind: "empty", filed: false, lead: "", tail: "" };

  // A document always drives the action — a staged doc short-circuits the create
  // logic in submitComposer, so the create fork never applies while one is in play.
  if (hasDoc) {
    return hasText
      ? { kind: "review", filed: false, lead: "Answer", tail: "your question against the attached document." }
      : { kind: "review", filed: false, lead: "Review", tail: "the attached document against the matching playbook." };
  }

  // Assistance override + plain canvas drafts both open the ungoverned canvas.
  if (wantsQuick || isCanvasDraft) {
    return { kind: "draft", filed: false, lead: "Open an editable draft", tail: "— nothing filed, no approval trail." };
  }

  // The one case that gets an explicit upfront choice in the UI.
  if (createType) {
    const what = createType === "NDA Request" ? "an NDA request" : "a contract review";
    return {
      kind: "create",
      filed: true,
      createType,
      lead: "File & track",
      tail: `this as ${what} — a REQ number, the approval ladder, and a linked contract.`,
    };
  }

  if (classified === "capability" || classified === "ask") {
    return { kind: "answer", filed: false, lead: "Answer", tail: "this — nothing filed." };
  }

  return { kind: "file", filed: true, lead: "File & route", tail: "this request through intake." };
}
