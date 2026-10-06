/**
 * Clarify-before-file (CW-1) — the Cowork-style intake interview.
 *
 * Before ONE Legal files a request, it checks whether the key facts for that
 * request category are present in the free text. If some are missing, the
 * console asks for them up front (one compact turn) and files a *complete*
 * ticket — instead of the agent discovering the gaps only after drafting.
 *
 * Pure + deterministic: classification reuses the existing Laya/regex path
 * (`@aegis/ai`); field extraction is regex-only so it never depends on a model
 * and is fully unit-testable. When the category has no required-field catalog
 * (e.g. a general inquiry) it returns no questions and the caller files
 * directly — so this never blocks or degrades an existing flow.
 *
 * This gathers input only; it files nothing. The actual ticket write still
 * goes through the intake chokepoint (routing rules + chain-sealed audit),
 * unchanged — so governance is untouched.
 *
 * Server-only (classification + reads).
 */
import { classifyIntakeRegex, classifyIntakeLaya } from "@aegis/ai";

export type ClarifyFieldKind = "text" | "choice";
export interface ClarifyField {
  key: string;
  label: string;
  question: string;
  kind: ClarifyFieldKind;
  options?: string[];
}
export interface ClarifyResult {
  category: string;
  source: "laya" | "regex" | "default";
  extracted: Record<string, string>;
  missing: ClarifyField[];
  /** CW-3: the governing-law descriptor for the detected jurisdiction, if any —
   *  so the draft starts with the right law up front rather than defaulting. */
  governingLaw?: string | null;
}

type Triage = { cat?: string } | null;

// ── Required-field catalog, keyed by category family ───────────────────────
// Categories arrive as human labels ("NDA — Standard", "Vendor Contract",
// "Privacy — DPIA / GDPR"), so we match on keyword families rather than exact
// strings. A family with no entry (general inquiry, etc.) yields no questions.
const F = {
  counterparty: { key: "counterpartyName", label: "Counterparty", question: "What is the counterparty's full legal entity name?", kind: "text" as const },
  jurisdiction: { key: "jurisdiction", label: "Jurisdiction", question: "Which governing-law jurisdiction should apply?", kind: "choice" as const, options: ["India", "Delaware", "California", "New York", "United Kingdom", "European Union", "Germany", "Singapore", "Other"] },
  purpose: { key: "purpose", label: "Purpose / scope", question: "What is the purpose — what will be shared or done?", kind: "text" as const },
  ndaDirection: { key: "direction", label: "Direction", question: "Is this mutual or one-way?", kind: "choice" as const, options: ["Mutual", "One-way (we disclose)", "One-way (they disclose)", "Not sure"] },
  adverseParty: { key: "counterpartyName", label: "Adverse party", question: "Who is the opposing / adverse party (full legal name)?", kind: "text" as const },
  summary: { key: "summary", label: "Summary", question: "Briefly, what happened / what is the dispute?", kind: "text" as const },
  dataSubject: { key: "dataSubjectName", label: "Data subject", question: "Whose data is the request about (data subject name)?", kind: "text" as const },
  dsarType: { key: "requestType", label: "Request type", question: "What kind of privacy request is this?", kind: "choice" as const, options: ["Access", "Erasure", "Rectification", "Portability", "Objection"] },
  matterName: { key: "matterName", label: "Matter", question: "Which matter is this hold for?", kind: "text" as const },
  custodians: { key: "custodians", label: "Custodians", question: "Who are the custodians to preserve?", kind: "text" as const },
  trigger: { key: "trigger", label: "Trigger", question: "What triggered the hold (the preservation event)?", kind: "text" as const },
};

/** The required fields for a classified category, or [] when none apply. */
export function requiredFieldsForCategory(category: string): ClarifyField[] {
  const c = (category || "").toLowerCase();
  if (/\b(nda|non-disclosure|confidential)\b/.test(c)) return [F.counterparty, F.ndaDirection, F.purpose, F.jurisdiction];
  if (/\b(vendor|contract|msa|saas|commercial|procure|supplier)\b/.test(c)) return [F.counterparty, F.purpose, F.jurisdiction];
  if (/\b(litig|dispute|lawsuit|non-court|claim)\b/.test(c)) return [F.adverseParty, F.jurisdiction, F.summary];
  if (/\b(privacy|dpia|gdpr|dsar|data subject)\b/.test(c)) return [F.dataSubject, F.dsarType, F.jurisdiction];
  if (/\b(hold|preservation)\b/.test(c)) return [F.matterName, F.custodians, F.trigger];
  return [];
}

// ── Deterministic extractors ───────────────────────────────────────────────
const JURISDICTIONS = [
  "India", "Delaware", "California", "New York", "Texas", "Nevada", "Washington",
  "United Kingdom", "UK", "England", "Scotland", "Ireland", "European Union", "EU",
  "Germany", "France", "Spain", "Italy", "Netherlands", "Switzerland", "Sweden",
  "Singapore", "Hong Kong", "China", "Japan", "Australia", "Canada", "Brazil", "UAE",
];

/** First known jurisdiction mentioned, normalized to its canonical label. */
export function extractJurisdiction(text: string): string | undefined {
  const t = text || "";
  for (const j of JURISDICTIONS) {
    if (new RegExp(`\\b${j.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(t)) {
      if (/^uk$/i.test(j)) return "United Kingdom";
      if (/^eu$/i.test(j)) return "European Union";
      return j;
    }
  }
  return undefined;
}

// CW-3: jurisdiction → governing-law descriptor, so a draft starts with the
// right law instead of defaulting (the India-vs-Delaware miss on REQ-5020).
// The descriptor is a hint for the drafting agent and the reviewer, not a
// substitute for counsel confirming the clause.
const GOVERNING_LAW: Record<string, string> = {
  India: "India — Indian Contract Act, 1872; courts at the agreed seat",
  Delaware: "Delaware, USA — Delaware law; Delaware state/federal courts",
  California: "California, USA — California law; California courts",
  "New York": "New York, USA — New York law; New York courts",
  Texas: "Texas, USA — Texas law",
  "United Kingdom": "England & Wales — English law; courts of England and Wales",
  "European Union": "EU member-state law — specify the governing member state",
  Germany: "Germany — German law (BGB); German courts",
  France: "France — French law",
  Netherlands: "Netherlands — Dutch law",
  Switzerland: "Switzerland — Swiss law",
  Singapore: "Singapore — Singapore law; Singapore courts",
  "Hong Kong": "Hong Kong SAR — Hong Kong law",
  China: "PRC — PRC law",
  Japan: "Japan — Japanese law",
  Australia: "Australia — governing state/territory law",
  Canada: "Canada — governing province law",
  Brazil: "Brazil — Brazilian law",
  UAE: "UAE — applicable Emirate / DIFC or ADGM law",
};

/** The governing-law descriptor for a (canonical) jurisdiction, or null. */
export function governingLawForJurisdiction(jurisdiction: string | undefined | null): string | null {
  if (!jurisdiction) return null;
  const key = String(jurisdiction).trim();
  if (GOVERNING_LAW[key]) return GOVERNING_LAW[key];
  // Tolerate common aliases that the picker / free text might produce.
  const norm = extractJurisdiction(key);
  return (norm && GOVERNING_LAW[norm]) || null;
}

// A proper-noun entity: a run of Capitalized words, optionally with a company
// suffix. Prefer a name that carries a suffix (Acme Inc), else the noun after a
// linking preposition ("with Acme", "against Globex").
const ENTITY_SUFFIX_RE = /\b([A-Z][\w&.'-]*(?:\s+[A-Z0-9][\w&.'-]*){0,3})\s+(Inc\.?|LLC|Ltd\.?|Limited|Corp\.?|Corporation|GmbH|PLC|LP|LLP|Co\.?|AG|S\.?A\.?|Pvt\.?)\b/;
const ENTITY_AFTER_PREP_RE = /\b(?:with|for|against|from|between|to|of)\s+([A-Z][\w&.'-]*(?:\s+[A-Z0-9][\w&.'-]*){0,3})\b/;
const PREP_STOP = new Set(["the", "a", "an", "our", "their", "my", "this", "that", "india", "delaware", "us", "them", "it"]);

/** Best-effort counterparty / party / data-subject name from free text. */
export function extractEntityName(text: string): string | undefined {
  const t = text || "";
  const suf = ENTITY_SUFFIX_RE.exec(t);
  if (suf && suf[1]) return `${suf[1]} ${suf[2]}`.replace(/\s+/g, " ").trim();
  const prep = ENTITY_AFTER_PREP_RE.exec(t);
  if (prep && prep[1]) {
    const cand = prep[1].trim();
    if (!PREP_STOP.has(cand.toLowerCase())) return cand;
  }
  return undefined;
}

/** NDA direction if stated. */
export function extractDirection(text: string): string | undefined {
  const t = (text || "").toLowerCase();
  if (/\bmutual\b/.test(t)) return "Mutual";
  if (/\b(one[-\s]?way|unilateral)\b/.test(t)) return "One-way (we disclose)";
  return undefined;
}

/** DSAR request type if stated. */
export function extractDsarType(text: string): string | undefined {
  const t = (text || "").toLowerCase();
  if (/\b(erasure|delete|deletion|forgotten|right to be forgotten)\b/.test(t)) return "Erasure";
  if (/\b(rectif|correct)\b/.test(t)) return "Rectification";
  if (/\b(portab)\b/.test(t)) return "Portability";
  if (/\bobject/.test(t)) return "Objection";
  if (/\baccess\b/.test(t)) return "Access";
  return undefined;
}

// A drafting request produces a *document* (a policy, notice, charter,
// guideline, code of conduct, …) — it is NOT an intake filing, and in
// particular NOT a privacy DSAR. The intake triage classifier has no category
// for "draft a whistleblower policy", so a semantic classifier could land it on
// Privacy — DPIA / GDPR and the console would show the DSAR intake form. This
// deterministic guard recognises policy/notice drafting so clarify never asks
// DSAR questions for it. (The console's primary path already routes drafting
// skills to the canvas; this protects typed free-text too.)
const DRAFTING_VERB_RE = /\b(draft|re-?draft|write|compose|prepare|create|update|revise|author|build|generate|produce)\b/i;
const POLICY_OBJECT_RE = /\b(policy|policies|speak-?up|whistle-?blow(?:er|ing)?|code of conduct|charter|framework|guideline|guidance|handbook|playbook|procedure|standard operating|notice|statement|attestation|resolution|clause|template)\b/i;
// Genuine data-subject-request signals — if present, it really is a DSAR and the
// guard must NOT fire.
const DSAR_SIGNAL_RE = /\b(dsar|data subject|subject access|right to (?:be forgotten|erasure|access|rectification|portability)|erasure request|access request|deletion request|personal data (?:of|about|request)|their (?:personal )?data)\b/i;

/** True when the text is a request to draft a policy/notice-type document. */
export function looksLikePolicyDrafting(text: string): boolean {
  const t = text || "";
  return DRAFTING_VERB_RE.test(t) && POLICY_OBJECT_RE.test(t) && !DSAR_SIGNAL_RE.test(t);
}

/** True when the text hints at an IP transfer/sale/license hiding under "NDA". */
export function detectIpTransferAmbiguity(text: string): boolean {
  const t = (text || "").toLowerCase();
  const transfer = /\b(sell|sale|sold|selling|assign|assignment|transfer|licen[cs]e|licensing)\b/.test(t);
  const ip = /\bip\b|intellectual property|patent|trademark|copyright|source code\b/.test(t);
  return transfer && ip;
}

/** Run the deterministic extractors for exactly the fields we were given. */
export function extractFields(text: string, fields: ClarifyField[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    let v: string | undefined;
    switch (f.key) {
      case "counterpartyName":
      case "dataSubjectName":
      case "matterName":
        v = extractEntityName(text);
        break;
      case "jurisdiction":
        v = extractJurisdiction(text);
        break;
      case "direction":
        v = extractDirection(text);
        break;
      case "requestType":
        v = extractDsarType(text);
        break;
      default:
        v = undefined; // purpose / summary / custodians / trigger — always asked
    }
    if (v) out[f.key] = v;
  }
  return out;
}

/** The required fields with no extracted value — the questions to ask. */
export function computeMissing(fields: ClarifyField[], extracted: Record<string, string>): ClarifyField[] {
  return fields.filter((f) => !extracted[f.key]);
}

const DOC_TYPE_FIELD: ClarifyField = {
  key: "docType",
  label: "Document type",
  question: "This mentions selling/assigning/licensing IP — is it really an NDA, or an IP assignment/license? Picking the right instrument matters.",
  kind: "choice",
  options: ["NDA (confidentiality only)", "IP assignment / sale", "IP license", "Other — not sure"],
};

/**
 * Classify the request and return the fields still needed before filing.
 * `missing: []` means nothing to ask — file directly.
 */
export async function clarifyIntake(input: { text: string; dept?: string }): Promise<ClarifyResult> {
  const text = String(input.text || "");
  const dept = String(input.dept || "");
  const regex = classifyIntakeRegex(text, dept) as Triage;
  let laya: Triage = null;
  try {
    laya = (await classifyIntakeLaya(text, dept)) as Triage;
  } catch {
    laya = null;
  }
  let category = (laya && laya.cat) || (regex && regex.cat) || "General Inquiry";
  let source: ClarifyResult["source"] = laya && laya.cat ? "laya" : regex && regex.cat ? "regex" : "default";

  // Deterministic guard: a policy/notice drafting request is not an intake
  // filing and must never be treated as a privacy DSAR. If the classifier landed
  // on the Privacy family for what is plainly a drafting task, drop it to a
  // general inquiry so no DSAR questions are asked. (Narrow by design — only the
  // Privacy mis-bucket is overridden; NDA/contract/litigation drafting that has
  // its own legitimate intake form is untouched.)
  if (/\b(privacy|dpia|gdpr|dsar|data subject)\b/i.test(category) && looksLikePolicyDrafting(text)) {
    category = "General Inquiry";
    source = "default";
  }

  const fields = requiredFieldsForCategory(category);
  const extracted = extractFields(text, fields);
  const missing = computeMissing(fields, extracted);

  // CW-2: when an NDA request smells like an IP transfer, confirm the
  // instrument up front (always ask — it's a confirmation, not an extraction).
  if (/\b(nda|non-disclosure|confidential)\b/i.test(category) && detectIpTransferAmbiguity(text)) {
    missing.unshift(DOC_TYPE_FIELD);
  }

  const governingLaw = governingLawForJurisdiction(extracted.jurisdiction);
  return { category, source, extracted, missing, governingLaw };
}
