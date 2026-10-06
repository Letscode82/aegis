// ── Self-Service knowledge base (derived, not fabricated) ────────────
//
// The Self-Service tab used to read a separate 6-entry list with
// hand-written "847 resolved / 94% deflection" vanity stats that no
// query backed. That made the tab a mock sitting next to real agents.
//
// It now derives from the SAME AGENT_KB (26 entries) the FAQ agent
// answers from — one source of truth. Every article a requester can
// self-serve is an article the FAQ agent can also answer if they file a
// ticket instead, so the "ask before you ticket" promise is honest.
//
// Categories are derived from each entry's `source` (the playbook /
// policy section it cites) rather than re-tagged by hand, so adding a KB
// entry automatically slots it into the right Self-Service category.

import { AGENT_KB } from "./agents/kb";

/** Map a KB entry's cited source to a Self-Service category label. */
export function selfServeCategory(source) {
  const s = (source || "").toLowerCase();
  if (s.includes("privacy")) return "Privacy & Data";
  if (s.includes("ip ")) return "IP & Open Source";
  if (s.includes("trade compliance") || s.includes("sanctions")) return "Compliance";
  if (s.includes("vendor")) return "Vendor & Procurement";
  if (s.includes("brand")) return "Brand & Publicity";
  if (s.includes("intake")) return "Process";
  if (s.includes("contract")) return "Contract Terms";
  return "General";
}

/**
 * The Self-Service article list — derived from AGENT_KB. Each article
 * carries only fields we can stand behind: the question, the answer, the
 * derived category, and the cited source. No fabricated resolution
 * counts or deflection percentages.
 */
export const SELF_SERVE_ARTICLES = AGENT_KB.map((entry) => ({
  q: entry.q,
  answer: entry.answer,
  cat: selfServeCategory(entry.source),
  source: entry.source,
}));

/** Distinct category labels present in the article set, in first-seen order. */
export const SELF_SERVE_CATEGORIES = Array.from(
  new Set(SELF_SERVE_ARTICLES.map((a) => a.cat)),
);
