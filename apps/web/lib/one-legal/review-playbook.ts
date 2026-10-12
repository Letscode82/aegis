/**
 * Playbook-first deep review.
 *
 * Incumbents (Ironclad, Icertis, Harvey, Legora) review a contract against a
 * named, authoritative playbook and return a clause-by-clause verdict — never a
 * hedge that "no playbook was provided." AEGIS's review already carries real
 * standard positions inside each skill (e.g. the NDA position-checks table), but
 * it (a) sometimes routed an NDA to the generic commercial-contract playbook and
 * (b) let the model add a "confirm against your actual playbook" disclaimer.
 *
 * This module makes the review playbook-first:
 *   - `preferredReviewSkill` picks the right playbook from the document's type
 *     (an NDA goes to `contracts/nda-triage`, not `contracts/contract-review`).
 *   - `playbookLabelFor` names the applied playbook.
 *   - `playbookDirective` tells the model to treat the skill's positions AS the
 *     organization's standard playbook, score each clause against it, and NOT
 *     claim a playbook is missing.
 *
 * Pure + dependency-light so both review routes (buffered + streamed) share one
 * source of truth. The org's *editable* playbook (the `contract-clauses`
 * knowledge pack) is wired in a follow-up; this is the framing layer that makes
 * the built-in positions behave like a configured playbook today.
 */

/** Signals that a document is a stand-alone NDA rather than a full agreement. */
const NDA_SIGNALS =
  /\b(n\.?d\.?a\.?|non[-\s]?disclosure|nondisclosure|confidential(?:ity)?\s+(?:agreement|undertaking)|mutual\s+confidential|secrecy\s+agreement)\b/i;

/**
 * Prefer a specific review playbook from the document itself, so the review
 * compares against the right standard. Returns a registry skill id, or null to
 * let normal text routing decide. The caller still confirms the id resolves to
 * a built skill before using it.
 *
 * Only the NDA ↔ generic-contract split is decided here — the highest-frequency
 * mis-route (an NDA scored against commercial-contract norms). Other types fall
 * through to the registry router.
 */
export function preferredReviewSkill(
  docName: string | undefined | null,
  docText: string | undefined | null,
  taskText: string | undefined | null,
): string | null {
  const name = String(docName || "");
  // Only the head of the body — the title/preamble carries the document type,
  // and scanning the whole text would let a stray mention flip the decision.
  const head = String(docText || "").slice(0, 2000);
  const task = String(taskText || "");
  if (NDA_SIGNALS.test(name) || NDA_SIGNALS.test(head) || NDA_SIGNALS.test(task)) {
    return "contracts/nda-triage";
  }
  return null;
}

/** Human-readable name of the playbook a review is applying. */
export function playbookLabelFor(skillId: string, skillTitle?: string | null): string {
  if (skillId === "contracts/nda-triage") return "AEGIS Standard NDA Playbook";
  if (skillId === "contracts/contract-review") return "AEGIS Standard Contract Playbook";
  return skillTitle ? `AEGIS ${skillTitle} Playbook` : "AEGIS Standard Playbook";
}

/**
 * The output directive that makes a review playbook-first. Appended to the task
 * so the model treats the skill's standard positions as the authoritative
 * playbook, scores each clause against it, and never hedges that one is missing.
 */
export function playbookDirective(playbookLabel: string): string {
  return (
    `You are reviewing against the ${playbookLabel} — the organization's standard positions are the ` +
    `position checks in the skill above. Treat them as the AUTHORITATIVE playbook: for each reviewed ` +
    `clause, state whether it is Within standard or a Deviation, and name the standard position it is ` +
    `measured against. Do NOT say that a playbook or standard was not provided, and do NOT ask for one — ` +
    `the ${playbookLabel} above IS the playbook. A single closing line that a qualified lawyer should ` +
    `confirm before signature is fine; a disclaimer that no playbook was supplied is not.`
  );
}
