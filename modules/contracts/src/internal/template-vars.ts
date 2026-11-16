/**
 * Template placeholder helpers (CLM authoring — guided fill).
 *
 * Pure, dependency-free (safe to import from the UI). A template body carries
 * `{{variable}}` placeholders that `renderTemplateBody` substitutes at author
 * time; this extracts the ones a human should fill in a guided form — the
 * industry-standard "fill the deal fields → the draft assembles itself" flow —
 * so a drafted contract doesn't ship with literal `{{jioEntityName}}` left in.
 *
 * Excluded from the human field list:
 *  - the tokens the author form + backend already fill (title, type,
 *    counterparty name, governing law),
 *  - `{{clauses}}` (the clause-insertion marker),
 *  - `{{clause:CODE}}` markers — their colon means the `[\w.]+` token regex
 *    never matches them anyway.
 */

/** Tokens the author modal / backend resolve on their own — never shown as fields. */
export const AUTO_FILLED_PLACEHOLDERS: ReadonlySet<string> = new Set([
  "contract.title",
  "contract.type",
  "counterparty.name",
  "contract.governingLaw",
  "clauses",
]);

const TOKEN_RE = /\{\{\s*([\w.]+)\s*\}\}/g;

/**
 * Unique fillable `{{token}}` placeholders in a template body, in first-seen
 * order, excluding the auto-filled set. Pure.
 */
export function extractTemplatePlaceholders(body: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  let m: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(String(body || ""))) !== null) {
    const token = m[1];
    if (!token || AUTO_FILLED_PLACEHOLDERS.has(token) || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

/** Turn a placeholder token into a human field label.
 *  `jioRegisteredAddress` → "Jio Registered Address"; `org.address` → "Org Address". */
export function humanizePlaceholder(token: string): string {
  return String(token || "")
    .replace(/\./g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

// ── Typed guided fill (CLM authoring) ────────────────────────────────
//
// Without a per-template field schema (that lands next), the author form
// infers a sensible input TYPE and whether a field is required from the
// placeholder name — so dates get a date picker, amounts/counts get a number
// input, currency gets a dropdown, and the template's fields block creation
// until the required ones are filled (matching Conga/SpotDraft field behavior).

export type TemplateFieldType = "text" | "date" | "number" | "currency" | "email";

export interface TemplateFieldSpec {
  token: string;
  label: string;
  type: TemplateFieldType;
  required: boolean;
}

/** Currency codes offered when a field is inferred as a currency selector. */
export const CURRENCY_OPTIONS = ["USD", "EUR", "GBP", "INR", "AUD", "CAD", "SGD", "JPY", "CHF"];

const OPTIONAL_RE = /optional|notes?|comment|memo|internal|remark/i;
const DATE_RE = /date|deadline|expiry|expiration|effective|commencement|execution|renewaldate/i;
const NUMBER_RE = /days|months|years|count|number|qty|quantity|amount|value|fee|price|rate|\bapr\b|percent|percentage|\bcap\b|limit|threshold|principal|tenor/i;
const CURRENCY_RE = /currency|\bccy\b/i;
const EMAIL_RE = /email|e-?mail/i;

/** Infer an input type + required flag for a single placeholder. Pure. */
export function inferTemplateFieldSpec(token: string): TemplateFieldSpec {
  const t = String(token || "");
  const leaf = t.split(".").pop() || t; // judge on the last path segment
  // Normalize camelCase / snake into spaced words so word-boundary matches
  // (e.g. \bcap\b) fire inside "liabilityCap".
  const norm = leaf.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
  const type: TemplateFieldType = CURRENCY_RE.test(norm)
    ? "currency"
    : EMAIL_RE.test(norm)
    ? "email"
    : DATE_RE.test(norm)
    ? "date"
    : NUMBER_RE.test(norm)
    ? "number"
    : "text";
  return { token: t, label: humanizePlaceholder(t), type, required: !OPTIONAL_RE.test(norm) };
}

/** Infer field specs for a list of placeholder tokens, in order. Pure. */
export function inferTemplateFields(tokens: string[]): TemplateFieldSpec[] {
  return (Array.isArray(tokens) ? tokens : []).map(inferTemplateFieldSpec);
}
