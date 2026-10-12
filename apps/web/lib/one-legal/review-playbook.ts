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
export function playbookDirective(playbookLabel: string, opts?: { orgConfigured?: boolean }): string {
  // When the org has configured its own Contracts Playbook, the authoritative
  // positions live in the injected "Organization Contract Playbook" block, with
  // the skill's built-in checks as backup where the org playbook is silent.
  const positionsSource = opts?.orgConfigured
    ? `the Organization Contract Playbook included above (fall back to the skill's position checks only ` +
      `where the org playbook is silent)`
    : `the position checks in the skill above`;
  return (
    `You are reviewing against the ${playbookLabel} — the organization's standard positions are ` +
    `${positionsSource}. Treat them as the AUTHORITATIVE playbook: for each reviewed ` +
    `clause, state whether it is Within standard or a Deviation, and name the standard position it is ` +
    `measured against. Do NOT say that a playbook or standard was not provided, and do NOT ask for one — ` +
    `the ${playbookLabel} above IS the playbook. A single closing line that a qualified lawyer should ` +
    `confirm before signature is fine; a disclaimer that no playbook was supplied is not.`
  );
}

/** Label for a review scored against the org's own configured playbook. */
export const ORG_PLAYBOOK_LABEL = "your organization's configured Contracts Playbook";

/**
 * Wrap the org's configured Contracts Playbook (from the editable
 * `contract-clauses` knowledge pack, via `@aegis/contracts.getContractPlaybookText`)
 * as an authoritative block for the system prompt. Returns "" when the org has
 * configured nothing, so the caller falls back to the skill's built-in
 * positions. This is what makes an admin's edits to the Contracts Playbook
 * screen actually change the review.
 */
export function orgPlaybookPromptBlock(orgPlaybookText: string | undefined | null): string {
  const t = String(orgPlaybookText || "").trim();
  if (!t) return "";
  return (
    `\n\n# Organization Contract Playbook (AUTHORITATIVE — overrides the skill's default positions)\n` +
    `These are the organization's own configured standard positions. Score every reviewed clause ` +
    `against them first.\n\n${t}`
  );
}

/**
 * US-first jurisdiction support.
 *
 * The built-in skills are tagged `[global, IN]` (India-anchored) — a holdover
 * from AEGIS's first market. A US in-house legal team expects a US baseline:
 * governing law read as a US state (Delaware / New York unless the document
 * says otherwise), US contract norms, and US *state* privacy deadlines (CCPA /
 * CPRA and the state-law family) rather than GDPR's 30-day clock. This block
 * anchors the review to a selected jurisdiction without rewriting every
 * SKILL.md: the model is told to read the playbook's standard positions through
 * the jurisdiction's lens and to flag where a position is jurisdiction-specific.
 *
 * `US` is the default. The per-jurisdiction toggle in the console sets it.
 */
export const DEFAULT_JURISDICTION = "US";

/** Jurisdictions the console offers in its toggle, US first. */
export const REVIEW_JURISDICTIONS: Array<{ code: string; label: string }> = [
  { code: "US", label: "United States" },
  { code: "EU", label: "European Union" },
  { code: "UK", label: "United Kingdom" },
  { code: "IN", label: "India" },
  { code: "GLOBAL", label: "Jurisdiction-neutral" },
];

/** Normalize an incoming jurisdiction string to a known code, defaulting to US. */
export function normalizeJurisdiction(input: string | undefined | null): string {
  const raw = String(input || "").trim().toUpperCase();
  if (!raw) return DEFAULT_JURISDICTION;
  const hit = REVIEW_JURISDICTIONS.find((j) => j.code === raw);
  return hit ? hit.code : raw;
}

/** Human label for a jurisdiction code. */
export function jurisdictionLabel(code: string): string {
  const hit = REVIEW_JURISDICTIONS.find((j) => j.code === normalizeJurisdiction(code));
  return hit ? hit.label : code;
}

/**
 * Jurisdiction anchor appended to the review task. Encodes the US baseline a
 * US GC expects (and the EU/UK/IN equivalents) so the output reads native to
 * the selected market rather than to the skill's India-anchored defaults.
 */
export function jurisdictionDirective(input: string | undefined | null): string {
  const code = normalizeJurisdiction(input);
  const label = jurisdictionLabel(code);
  const base =
    `Jurisdiction: ${label}. Read the playbook's standard positions through ${label} law and market ` +
    `practice. Where the document is silent on governing law, assume the ${label} baseline below. Flag any ` +
    `clause whose enforceability or standard turns on a different jurisdiction, and name which.`;
  switch (code) {
    case "US":
      return (
        base +
        ` ${label} baseline: governing law defaults to a US state (Delaware or New York unless the document ` +
        `says otherwise); use US contract norms (e.g. mutual indemnities, carve-outs to liability caps for ` +
        `IP/confidentiality/willful misconduct, at-will where employment is in scope). For any personal-data ` +
        `or privacy obligation, measure response deadlines against the US state-privacy family, NOT GDPR: ` +
        `CCPA/CPRA (California) 45 days with a one-time 45-day extension, and the aligned state laws ` +
        `(Virginia VCDPA, Colorado CPA, Connecticut CTDPA 45+45; Texas, Utah, Oregon, etc.). Call out ` +
        `sector regimes (HIPAA, GLBA, state breach-notification clocks) where the subject matter triggers them.`
      );
    case "EU":
      return (
        base +
        ` ${label} baseline: GDPR controls personal-data obligations — DSAR response within one month, ` +
        `extendable by two further months for complex requests; measure data-processing clauses against ` +
        `Art. 28 DPA requirements. Governing law reads as an EU member state unless stated.`
      );
    case "UK":
      return (
        base +
        ` ${label} baseline: UK GDPR + Data Protection Act 2018 — DSAR response within one month, ` +
        `extendable by two months. English law governing-law and jurisdiction defaults unless stated.`
      );
    case "IN":
      return (
        base +
        ` ${label} baseline: Indian Contract Act norms; measure privacy obligations against the DPDP Act 2023.`
      );
    default:
      return base + ` Keep the review jurisdiction-neutral and flag where an answer depends on local law.`;
  }
}
