/**
 * Dynamic clause insertion (CLM C-7 — contract authoring depth).
 *
 * Assembles a contract draft body from a template + the org clause library.
 * Two mechanisms, both deterministic:
 *
 *   1. Insertion markers in the template body —
 *        {{clause:LIABILITY_CAP}}            → the library clause's standard text
 *        {{clause:LIABILITY_CAP|fallback}}   → its acceptable-fallback text
 *      resolve to the matching clause-library entry (by clauseType). An
 *      unknown code is left verbatim (same discipline as {{variable}}s —
 *      a reviewer sees what still needs a position rather than a silent gap)
 *      and reported in `unresolved`.
 *
 *   2. Author-selected clauses appended beyond what the template references.
 *      Each selection names a clauseType + variant. A selection whose type a
 *      marker already inserted is skipped (no double-insertion). Appended
 *      clauses land at a lone {{clauses}} marker when the template has one,
 *      otherwise at the end of the body.
 *
 * Pure — no DB, no @aegis/db types. author.ts fetches the clause library and
 * projects it into the `LibraryClause` map this module consumes, then flows
 * the assembled body through the SAME create+extract path as a plain
 * template author, so an assembled contract is a first-class citizen
 * (clauses + obligations + v1 snapshot, chain-sealed) the moment it exists.
 */

export type ClauseVariant = "standard" | "fallback";

/** Minimal projection of a clause-library entry (keyed by clauseType). */
export interface LibraryClause {
  clauseType: string;
  title: string;
  standardText: string;
  fallbackText: string | null;
}

/** An author's explicit pick to append a library clause the template didn't reference. */
export interface ClauseSelection {
  clauseType: string;
  variant?: ClauseVariant;
}

export interface InsertedClause {
  clauseType: string;
  title: string;
  /** The variant actually applied (a requested fallback with no fallback text falls back to standard). */
  variant: ClauseVariant;
  source: "placeholder" | "appended";
}

export interface AssembleResult {
  body: string;
  inserted: InsertedClause[];
  /** Codes referenced by a {{clause:CODE}} marker with no matching library entry. */
  unresolved: string[];
}

/** {{clause:CODE}} or {{clause:CODE|fallback}} — CODE is [\w.-]+, variant optional. */
const CLAUSE_MARKER = /\{\{\s*clause:\s*([\w.-]+)\s*(?:\|\s*(standard|fallback)\s*)?\}\}/gi;
/** A lone {{clauses}} marker = the designated insertion point for appended clauses. */
const CLAUSES_SLOT = /\{\{\s*clauses\s*\}\}/i;

const norm = (code: string): string => code.trim().toUpperCase();

/** Resolve the text for a variant, honestly falling back to standard when a
 *  fallback was asked for but the entry has none. Returns the text applied
 *  and the variant actually used. */
function resolveText(entry: LibraryClause, requested: ClauseVariant): { text: string; variant: ClauseVariant } {
  if (requested === "fallback" && entry.fallbackText && entry.fallbackText.trim()) {
    return { text: entry.fallbackText, variant: "fallback" };
  }
  return { text: entry.standardText, variant: "standard" };
}

/** Render an appended clause as its own short section (title line + text).
 *  Appended clauses have no surrounding template context, so they carry a
 *  heading; marker replacements keep the template's own structure. */
function appendedBlock(title: string, text: string): string {
  return `${title}\n${text}`;
}

/**
 * Assemble a draft body from a template + the clause library. Pure.
 *
 * Marker replacement runs first (so the inserted type set is known), then any
 * author selections not already satisfied by a marker are appended. Variable
 * substitution is the caller's next step, so inserted clause text may itself
 * carry {{variable}} placeholders.
 */
export function assembleContractBody(
  templateBody: string,
  library: Record<string, LibraryClause>,
  selections?: ClauseSelection[],
): AssembleResult {
  const inserted: InsertedClause[] = [];
  const unresolved: string[] = [];
  const insertedTypes = new Set<string>();

  // 1. Resolve {{clause:CODE}} markers in place.
  let body = (templateBody || "").replace(CLAUSE_MARKER, (whole, rawCode: string, rawVariant?: string) => {
    const code = norm(rawCode);
    const entry = library[code];
    if (!entry) {
      if (!unresolved.includes(code)) unresolved.push(code);
      return whole; // leave verbatim — never silently blank a missing position
    }
    const { text, variant } = resolveText(entry, (rawVariant?.toLowerCase() as ClauseVariant) || "standard");
    inserted.push({ clauseType: code, title: entry.title, variant, source: "placeholder" });
    insertedTypes.add(code);
    return text;
  });

  // 2. Append author-selected clauses the template did not already reference.
  const appended: string[] = [];
  for (const sel of selections ?? []) {
    const code = norm(sel.clauseType);
    if (!code || insertedTypes.has(code)) continue; // dedup against markers + earlier selections
    const entry = library[code];
    if (!entry) {
      if (!unresolved.includes(code)) unresolved.push(code);
      continue;
    }
    const { text, variant } = resolveText(entry, sel.variant || "standard");
    inserted.push({ clauseType: code, title: entry.title, variant, source: "appended" });
    insertedTypes.add(code);
    appended.push(appendedBlock(entry.title, text));
  }

  if (appended.length) {
    const block = appended.join("\n\n");
    if (CLAUSES_SLOT.test(body)) {
      body = body.replace(CLAUSES_SLOT, block);
    } else {
      body = body.trimEnd() + (body.trim() ? "\n\n" : "") + block + "\n";
    }
  } else {
    // No appended clauses — drop an empty {{clauses}} slot so it doesn't leak into the draft.
    body = body.replace(CLAUSES_SLOT, "");
  }

  return { body, inserted, unresolved };
}
