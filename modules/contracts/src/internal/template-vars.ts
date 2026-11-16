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
