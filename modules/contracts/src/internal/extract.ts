/**
 * Contract knowledge extraction — the shared contract agent's structured
 * output (pure, no DB, no network).
 *
 * This is the deterministic playbook pass: it reads the contract text
 * (an intake request description, a pasted draft, a renewal note) and
 * surfaces the commercial clauses it can identify, compares each to the
 * OneLegal contract playbook, and derives the obligations a reviewer must
 * track. It runs the SAME way whether invoked from intake (first-pass on
 * spawn) or from inside the Contracts module (renewal / amendment) — one
 * implementation, so "the contract agent works in CLM and both are the
 * same" is literally true.
 *
 * Deterministic on purpose: it never calls Claude, so a spawned contract
 * is never empty and the flow can't be blocked by an AI outage — the same
 * posture as the regex intake classifier fallback. A richer Claude-driven
 * extraction can layer on top later without moving callers (it would
 * augment these rows, gated by AgentDecision).
 */
export type ContractRiskLevel = "LOW" | "MEDIUM" | "HIGH";

export interface ExtractedClause {
  type: string;
  text: string;
  summary: string;
  risk: ContractRiskLevel;
  deviation: boolean;
}

export interface ExtractedObligation {
  description: string;
  /** days from extraction until due; null = no fixed date. */
  dueInDays: number | null;
  recurrence: string | null;
}

export interface ExtractedKnowledge {
  clauses: ExtractedClause[];
  obligations: ExtractedObligation[];
}

interface TopicRule {
  type: string;
  match: RegExp;
  /** playbook-sensitive topics carry more inherent risk. */
  baseRisk: ContractRiskLevel;
  /** phrases that mean the term deviates from the playbook. */
  deviation: RegExp;
  playbook: string;
}

// One rule per commercial clause the OneLegal playbook cares about. Order is
// the surfacing order (worst-risk topics first).
const TOPIC_RULES: TopicRule[] = [
  { type: "LIABILITY_CAP", match: /liabilit|limitation of liability|\bcap\b/i, baseRisk: "MEDIUM", deviation: /unlimited|uncapped|no cap|without limit/i, playbook: "Cap at 12 months' fees; uncapped carve-outs only for IP / confidentiality / indemnity." },
  { type: "INDEMNITY", match: /indemnif|indemnit|hold harmless/i, baseRisk: "MEDIUM", deviation: /unlimited|first.?party|one.?sided|sole/i, playbook: "Mutual, third-party claims only. Reject unlimited or first-party indemnities." },
  { type: "IP", match: /intellectual property|\bip\b|ownership|derivative work|work product/i, baseRisk: "MEDIUM", deviation: /ambigu|unclear|undefined|dispute|joint(ly)? (own|develop)|assigned to (the )?(disclosing|receiving|other|counterpart) party|assign(s|ment)? (of )?(all )?(its |the )?(intellectual property|ip|rights|inventions|work product)|sole(ly)? (own|vest)|vest(s|ing)? (in|with) (the )?(disclosing|receiving|other) party/i, playbook: "Present-tense assignment of deliverables; license-back for background IP. Reject one-sided assignment of all IP to a single party in a mutual deal." },
  { type: "RESIDUALS", match: /residual|unaided memory|retained in .{0,24}memory|general (knowledge|learning) retained|ideas .{0,24}retained in/i, baseRisk: "MEDIUM", deviation: /residual|unaided memory|retained in .{0,24}memory|general (knowledge|learning) retained/i, playbook: "Reject residuals clauses — they let the counterparty reuse concepts retained in memory." },
  { type: "PAYMENT", match: /payment|net ?\d+|invoic|fees? due/i, baseRisk: "LOW", deviation: /net ?30|net ?15|advance|upfront|prepay/i, playbook: "Net 45 (Net 30 only with a prompt-pay discount)." },
  { type: "AUTO_RENEWAL", match: /auto.?renew|automatic renewal|evergreen|renewal term/i, baseRisk: "MEDIUM", deviation: /perpetual|no notice|automatic(ally)? renew|uplift/i, playbook: "Only if non-renewal notice ≤ 60 days AND uplift capped." },
  { type: "TERMINATION", match: /terminat|termination for convenience|exit right/i, baseRisk: "LOW", deviation: /no termination|term.?lock|cannot terminate|only for cause/i, playbook: "30 days' notice for convenience; pure term-lock is a flag." },
  { type: "GOVERNING_LAW", match: /governing law|choice of law|jurisdiction|venue|laws of/i, baseRisk: "LOW", deviation: /foreign|counterparty'?s jurisdiction|outside (the )?us|\b(german(y)?|france|french|england|english|wales|welsh|united kingdom|\buk\b|britain|british|india|indian|china|chinese|\bprc\b|singapore|switzerland|swiss|ireland|irish|netherlands|dutch|dubai|\buae\b|hong kong|japan|japanese|australia|australian|canad(a|ian)|brazil|brazilian|mexico|mexican|spain|spanish|italy|italian|sweden|swedish|poland|polish|korea|korean)\b/i, playbook: "Delaware preferred; NY / CA acceptable. A foreign or non-preferred governing law is a flag." },
  { type: "CONFIDENTIALITY", match: /confidential|non.?disclosure|\bnda\b|proprietary information/i, baseRisk: "LOW", deviation: /one.?way|indefinite|perpetu|surviv\w* (in )?perpetuit|no expir|without expir|no time limit|forever/i, playbook: "Mutual, defined term with reasonable survival (no perpetual / indefinite confidentiality)." },
  { type: "ASSIGNMENT", match: /assign|change of control|successor/i, baseRisk: "LOW", deviation: /freely assign|without consent|any (third )?party/i, playbook: "No assignment without consent (affiliate / M&A successor OK)." },
  { type: "WARRANTY", match: /warrant|as.?is|acceptance/i, baseRisk: "LOW", deviation: /as.?is|no warrant|disclaim/i, playbook: "90-day warranty + 30-day acceptance; avoid AS-IS for paid deliverables." },
];

const bump = (r: ContractRiskLevel): ContractRiskLevel => (r === "LOW" ? "MEDIUM" : "HIGH");

/** Find the sentence containing the first match, so the clause text is real. */
function sentenceFor(text: string, re: RegExp): string {
  const sentences = text.split(/(?<=[.!?\n])\s+/);
  for (const s of sentences) {
    if (re.test(s)) {
      const trimmed = s.trim();
      return trimmed.length > 240 ? `${trimmed.slice(0, 237)}...` : trimmed;
    }
  }
  return "";
}

/**
 * Extract clauses + obligations from contract text. `contractType` seeds
 * type-specific baselines (e.g. an NDA always tracks a return/destroy
 * obligation) so even a terse request yields a useful skeleton.
 */
export function extractContractKnowledge(sourceText: string, contractType: string): ExtractedKnowledge {
  const text = (sourceText || "").trim();
  const type = (contractType || "").toLowerCase();
  const clauses: ExtractedClause[] = [];
  const seen = new Set<string>();

  for (const rule of TOPIC_RULES) {
    if (seen.has(rule.type)) continue;
    if (!rule.match.test(text)) continue;
    seen.add(rule.type);
    const deviates = rule.deviation.test(text);
    const risk = deviates ? bump(rule.baseRisk) : rule.baseRisk;
    const sentence = sentenceFor(text, rule.match);
    clauses.push({
      type: rule.type,
      text: sentence || `${rule.type.replace(/_/g, " ")} referenced in the request — confirm the exact language against the full document.`,
      summary: deviates
        ? `Possible deviation from playbook — ${rule.playbook}`
        : `Within playbook expectations — ${rule.playbook}`,
      risk,
      deviation: deviates,
    });
  }

  const obligations: ExtractedObligation[] = [];
  // Conservative-AI: every spawned contract must get attorney sign-off
  // before it can execute. This is the human gate made trackable.
  obligations.push({
    description: "Attorney sign-off required before execution (first-pass review only)",
    dueInDays: 7,
    recurrence: null,
  });
  if (seen.has("AUTO_RENEWAL")) {
    obligations.push({
      description: "Serve or waive non-renewal notice before the renewal deadline",
      dueInDays: 30,
      recurrence: null,
    });
  }
  if (type.includes("nda") || seen.has("CONFIDENTIALITY")) {
    obligations.push({
      description: "Return or destroy confidential materials on termination",
      dueInDays: null,
      recurrence: null,
    });
  }

  return { clauses, obligations };
}
