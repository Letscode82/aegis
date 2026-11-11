/**
 * Deterministic template skeleton — the never-falter fallback for AI drafting.
 *
 * When the AI draft can't complete within a tight serverless function budget
 * (e.g. Vercel Hobby's 60s cap on a long regulated agreement), the generate
 * route returns this instead of a timeout error, so the user always gets a
 * usable, placeholdered starting point. Pure — no AI, no I/O — and
 * regulatory-aware: when the brief names a known regime it seeds that regime's
 * mandatory clause headings so the reviewer sees what must be covered.
 */
export interface TemplateSkeletonInput {
  kind?: string | null;
  name?: string | null;
  instructions?: string | null;
}

const BASE_SECTIONS = [
  "1. Parties. This {{documentType}} is entered into between {{company}} and {{counterparty}} (each a \"Party\").",
  "2. Effective Date & Term. Effective {{effectiveDate}} for {{term}}, unless earlier terminated under this agreement.",
  "3. Scope / Purpose. {{scope}}",
  "4. Obligations of the Parties. {{obligations}}",
  "5. Fees & Payment. {{fees}} Payment terms: {{paymentTerms}}.",
  "6. Confidentiality. Each Party shall protect the other's Confidential Information and use it only for this agreement.",
  "7. Data Protection & Privacy. The Parties shall comply with applicable data-protection law; {{dataProtection}}.",
  "8. Compliance with Law. Each Party shall comply with all laws and regulations applicable to its performance.",
  "9. Representations & Warranties. {{warranties}}",
  "10. Indemnity. Each Party indemnifies the other for third-party claims arising from its breach or negligence.",
  "11. Limitation of Liability. Aggregate liability is capped at {{liabilityCap}}; no indirect or consequential damages.",
  "12. Term & Termination. Either Party may terminate for uncured material breach on {{terminationNotice}} notice.",
  "13. Governing Law & Dispute Resolution. Governed by {{governingLaw}}; disputes resolved by {{disputeForum}}.",
  "14. Notices. Notices to the addresses in the signature block.",
  "15. Miscellaneous. Assignment, severability, entire agreement, amendments in writing.",
];

/** Mandatory clause headings keyed to a regime the brief mentions. */
const REGIME_RULES: { test: RegExp; label: string; clauses: string[] }[] = [
  {
    test: /digital lending|lending service provider|\blsp\b|rbi\b|reserve bank/i,
    label: "RBI Digital Lending Guidelines — mandatory items (verify against the current official RBI source)",
    clauses: [
      "Key Fact Statement (KFS) and all-inclusive Annual Percentage Rate (APR) disclosure to the borrower before execution.",
      "Direct disbursal and repayment between the borrower and the Regulated Entity (no pass-through / pooling via the LSP's account).",
      "No automatic increase in credit limit without the borrower's explicit prior consent.",
      "Cooling-off / look-up period during which the borrower may exit without penalty (proportionate fee only).",
      "Grievance redressal mechanism and designated Nodal Grievance Redressal Officer, with timelines.",
      "Data privacy: explicit borrower consent, purpose limitation, need-based collection, storage localisation, and no access to phone resources beyond what is required.",
      "Clear disclosure of the LSP and the Regulated Entity (lender) to the borrower.",
      "Prohibited practices (no harassment in recovery; no undisclosed charges).",
      "Regulated Entity's due diligence, oversight and audit rights over the LSP.",
    ],
  },
  {
    test: /gdpr|data processing agreement|\bdpa\b|personal data/i,
    label: "Data-processing (GDPR Art. 28) — mandatory items",
    clauses: [
      "Subject-matter, duration, nature and purpose of processing; categories of data and data subjects.",
      "Process only on documented instructions; confidentiality of personnel.",
      "Article 32 security measures; sub-processor authorisation + flow-down.",
      "Assistance with data-subject rights and Articles 32–36; breach notification.",
      "Deletion/return on termination; audit and information rights.",
    ],
  },
];

/** Build a placeholdered template skeleton. Pure. */
export function buildTemplateSkeleton(input: TemplateSkeletonInput): string {
  const kind = String(input.kind || "OTHER").toUpperCase();
  const instr = String(input.instructions || "");
  const docType =
    kind === "NDA" ? "Mutual Non-Disclosure Agreement"
    : kind === "NOTICE" ? "Notice"
    : kind === "CONTRACT" ? "Agreement"
    : "Agreement";
  const title = (input.name || `${docType}`).trim();

  const parts: string[] = [
    `${title.toUpperCase()}`,
    "",
    "> ⚠ STRUCTURED SKELETON — the AI draft did not complete within the time limit, so this is a deterministic starting point, not a finished draft. Fill the {{placeholders}}, complete each section, and have a qualified lawyer confirm it (especially any regulatory requirements) before use.",
    "",
    ...BASE_SECTIONS,
  ];

  const regime = REGIME_RULES.find((r) => r.test.test(instr));
  if (regime) {
    parts.push("", `## ${regime.label}`);
    regime.clauses.forEach((c, i) => parts.push(`${i + 1}. ${c}`));
  }

  if (instr.trim()) {
    parts.push("", "## Drafter's instructions (to incorporate)", instr.trim());
  }

  parts.push("", "SIGNATURES. {{company}} — {{signatoryCompany}}   |   {{counterparty}} — {{signatoryCounterparty}}   |   Date: {{date}}");
  return parts.join("\n");
}
