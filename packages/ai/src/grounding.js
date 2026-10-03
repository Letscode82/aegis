/**
 * Citation enforcement + grounding guardrails (C-13).
 *
 * A grounded answer is composed by asking Claude to cite its retrieved sources
 * inline as `[n]`. The prompt *asks* for this; nothing checks that the model
 * complied. This module is the deterministic check that runs after the model
 * returns, so a hallucinated citation never reaches the reader:
 *
 *   - every `[n]` the answer emits is matched against the real source set;
 *   - a citation to a source that was never retrieved is stripped from the text
 *     and counted, rather than shown as if it were real evidence;
 *   - an answer that cites nothing (while sources were available) is flagged so
 *     the surface can warn that the claims are not traceable.
 *
 * Pure and dependency-free — the same helper backs `/api/one-legal/ask`,
 * `/api/one-legal/skill-review`, and any future orchestrator answer. It never
 * calls a model and never throws; it only inspects text.
 */

const CITATION_RE = /\[(\d+(?:\s*,\s*\d+)*)\]/g;

/** Parse the numbers inside one bracket token like "[1]" or "[2, 4]". */
function parseGroup(inner) {
  return inner
    .split(",")
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isInteger(n));
}

/**
 * Enforce inline `[n]` citations against the sources that were actually retrieved.
 *
 * @param {string} answer - the model's answer text.
 * @param {Array<unknown>} sources - the retrieved sources, in the order the
 *   prompt numbered them (index 0 → `[1]`). Only `.length` is used.
 * @param {object} [opts]
 * @param {boolean} [opts.requireCitation=true] - when sources exist but the
 *   answer cites none, emit a "no-citations" warning.
 * @returns {{
 *   text: string,            // answer with hallucinated citations removed
 *   grounded: boolean,       // sources existed AND at least one valid citation remains
 *   citedIndices: number[],  // 1-based source numbers actually cited (unique, sorted)
 *   droppedCitations: number,// count of citation numbers that referenced no real source
 *   warnings: string[],      // "no-citations" | "dropped-citations"
 * }}
 */
export function enforceCitations(answer, sources, opts = {}) {
  const { requireCitation = true } = opts;
  const text0 = typeof answer === "string" ? answer : "";
  const sourceCount = Array.isArray(sources) ? sources.length : 0;

  // No sources to enforce against — leave an ungrounded answer untouched.
  if (sourceCount === 0) {
    return { text: text0, grounded: false, citedIndices: [], droppedCitations: 0, warnings: [] };
  }

  const cited = new Set();
  let dropped = 0;

  const text = text0.replace(CITATION_RE, (match, inner) => {
    const nums = parseGroup(inner);
    const kept = [];
    for (const n of nums) {
      if (n >= 1 && n <= sourceCount) {
        cited.add(n);
        kept.push(n);
      } else {
        dropped += 1;
      }
    }
    // Rebuild the bracket from the surviving numbers; drop it entirely if none survive.
    return kept.length ? `[${kept.join(", ")}]` : "";
  });

  // Collapse any double spaces a removed citation left behind (e.g. "foo  bar" / "foo .").
  const cleaned = text.replace(/ {2,}/g, " ").replace(/ +([.,;:])/g, "$1");

  const citedIndices = Array.from(cited).sort((a, b) => a - b);
  const warnings = [];
  if (requireCitation && citedIndices.length === 0) warnings.push("no-citations");
  if (dropped > 0) warnings.push("dropped-citations");

  return {
    text: cleaned,
    grounded: citedIndices.length > 0,
    citedIndices,
    droppedCitations: dropped,
    warnings,
  };
}
