/**
 * NL → KQL/KeyQL collection query drafting (deterministic).
 *
 * The concept's "natural language in, KeyQL out — attorney edits before
 * anything fires" gate, built as a pure transform so it respects the 4d
 * Matter/Legal-Hold AI freeze. It turns a plain-language ask plus structured
 * scope (custodian participants, date range) into a Purview-style query string
 * the attorney reviews and edits before the search runs. (An `@aegis/ai`-drafted
 * variant can layer on when 4d unfreezes; the return shape stays the same.)
 */

export interface DraftCollectionQueryInput {
  /** Plain-language description of what to collect. */
  naturalLanguage: string;
  /** Custodian participant identifiers (emails/UPNs) to scope to. */
  custodianEmails?: string[];
  /** ISO dates (YYYY-MM-DD) to bound the collection. */
  dateFrom?: string | null;
  dateTo?: string | null;
}

export interface DraftedCollectionQuery {
  queryString: string;
  source: "deterministic";
  /** Human-readable note on how the query was built. */
  rationale: string;
}

const STOP = new Set([
  "the", "and", "for", "that", "this", "with", "from", "all", "any", "get", "find", "show", "collect", "search",
  "about", "regarding", "related", "between", "during", "into", "over", "under", "who", "what", "when", "where",
  "emails", "email", "messages", "message", "documents", "document", "files", "file", "everything", "anything",
]);

/** Extract up to `max` significant keyword tokens from free text (pure). */
export function extractKeywords(text: string, max = 6): string[] {
  const quoted = [...(text.match(/"([^"]+)"/g) ?? [])].map((q) => q.replace(/"/g, "").trim()).filter(Boolean);
  const rest = text
    .replace(/"[^"]+"/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9@.\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP.has(t));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of [...quoted, ...rest]) {
    const k = t.toLowerCase();
    if (!seen.has(k)) { seen.add(k); out.push(t); }
    if (out.length >= max) break;
  }
  return out;
}

function isoDate(d: string | null | undefined): string | null {
  if (!d) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(d.trim());
  return m ? m[1]! : null;
}

/** Build a KQL/KeyQL string from keywords + participants + date bounds (pure). */
export function buildKql(input: { keywords: string[]; custodianEmails?: string[]; dateFrom?: string | null; dateTo?: string | null }): string {
  const clauses: string[] = [];

  const parts = (input.custodianEmails ?? []).map((e) => e.trim()).filter(Boolean);
  if (parts.length > 0) {
    clauses.push(`(${parts.map((p) => `participants:"${p}"`).join(" OR ")})`);
  }

  const kws = input.keywords.filter(Boolean);
  if (kws.length > 0) {
    const term = (k: string) => (k.includes(" ") ? `"${k}"` : k);
    clauses.push(`(${kws.map((k) => `${term(k)}`).join(" OR ")})`);
  }

  const from = isoDate(input.dateFrom);
  const to = isoDate(input.dateTo);
  if (from) clauses.push(`date>=${from}`);
  if (to) clauses.push(`date<=${to}`);

  return clauses.length > 0 ? clauses.join(" AND ") : "*";
}

export function draftCollectionQuery(input: DraftCollectionQueryInput): DraftedCollectionQuery {
  const keywords = extractKeywords(input.naturalLanguage || "");
  const queryString = buildKql({
    keywords,
    custodianEmails: input.custodianEmails,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
  });
  const bits: string[] = [];
  if ((input.custodianEmails ?? []).length) bits.push(`${input.custodianEmails!.length} custodian participant(s)`);
  if (keywords.length) bits.push(`keywords: ${keywords.join(", ")}`);
  if (isoDate(input.dateFrom) || isoDate(input.dateTo)) bits.push("date bounds");
  return {
    queryString,
    source: "deterministic",
    rationale: bits.length ? `Drafted from ${bits.join("; ")}. Review and edit before running.` : "No scope terms found — edit the query before running.",
  };
}
