// The AEGIS severity scale (_shared/severity-scale.md) and the JSON output
// contract (_shared/output-contract.md) as code — one vocabulary for every
// surface: the skills package, the oKF intake agents, and the Risk Graph.
// Zero dependencies and no filesystem access, so this is safe to import from
// anywhere (including code that may be bundled for the browser).

export const OUTPUT_CONTRACT_VERSION = 1;

// S1 (Critical) → Info (Note). `rank` orders them; `blocking` marks the
// severities that must stop or formally gate an action.
export const SEVERITY = {
  S1: { level: "S1", label: "Critical", rank: 4, blocking: true, handling: "Stop. Escalate to a named lawyer. Do not sign / proceed." },
  S2: { level: "S2", label: "High", rank: 3, blocking: true, handling: "Must be fixed or formally accepted by an approver with authority." },
  S3: { level: "S3", label: "Medium", rank: 2, blocking: false, handling: "Negotiate; acceptable with documented rationale." },
  S4: { level: "S4", label: "Low", rank: 1, blocking: false, handling: "Fix if cheap; otherwise note." },
  Info: { level: "Info", label: "Note", rank: 0, blocking: false, handling: "None." },
};

export const SEVERITY_LEVELS = ["S1", "S2", "S3", "S4", "Info"];

export const severityMeta = (level) => SEVERITY[level] || SEVERITY.Info;
export const isBlocking = (level) => !!(SEVERITY[level] && SEVERITY[level].blocking);

/** Highest severity across a list of levels (S1 > S2 > S3 > S4 > Info). Null when empty/unknown. */
export function overallSeverity(levels) {
  let top = null;
  for (const l of levels || []) {
    const m = SEVERITY[l];
    if (!m) continue;
    if (!top || m.rank > SEVERITY[top].rank) top = m.level;
  }
  return top;
}

// Deterministic severity inference from a finding's free text, so an existing
// finding can be placed on the scale without a model. Conservative by design:
// only strong, specific signals reach S1; pure drafting points land at S4;
// everything unclassified is S3. Callers that already know the severity should
// pass it rather than infer.
const S1_RE = /\buncapped\b|\bunlimited (liability|indemnit)|\bwithout limit(ation)?\b|\bcriminal\b|\bregulatory breach\b|\bnon-?extendable\b|\bspoliat|\bexistential\b|\bmust not (sign|proceed)\b|\bstatute of limitations\b/i;
const S2_RE = /\bdeviation\b|\bmandatory\b|\bmaterial\b|\bauto-?renew|\bnon-?complian|\bbreach\b|\bpenalt|\bliabilit|\bindemnif|\btermination\b|\bdata (breach|loss|protection)\b|\bescalat|\bsanction|\bconflict\b|\bmissed? deadline\b/i;
const S4_RE = /\btypo\b|\bclarity\b|\bwording\b|\bdrafting\b|\bformatting\b|\bstyle\b|\bgrammar\b|\bcross-?reference\b/i;
const INFO_RE = /\bfyi\b|\bobservation\b|\bfor information\b|\bno action needed\b/i;

export function inferSeverity(text) {
  const t = String(text || "");
  if (!t.trim()) return "Info";
  if (S1_RE.test(t)) return "S1";
  if (S4_RE.test(t) && !S2_RE.test(t) && !S1_RE.test(t)) return "S4";
  if (S2_RE.test(t)) return "S2";
  if (INFO_RE.test(t)) return "Info";
  return "S3";
}

/** Map a 0..1 numeric confidence to the output contract's confidence label. */
export function confidenceLabel(c) {
  if (typeof c !== "number" || Number.isNaN(c)) return "low";
  if (c >= 0.75) return "high";
  if (c >= 0.5) return "medium";
  return "low";
}

/**
 * Assemble the AEGIS JSON output contract from already-structured parts.
 * Normalises + sorts findings (highest severity first), fills `overall` from
 * the findings when not given, and defaults `escalation` to required whenever a
 * blocking (S1/S2) finding is present. Pure — no I/O, safe to call anywhere.
 */
export function buildOutputContract({
  skill = null,
  skillVersion = null,
  matterId = null,
  bottomLine = "",
  findings = [],
  actions = [],
  assumptions = [],
  gaps = [],
  sources = [],
  escalation,
  review,
} = {}) {
  const norm = (findings || []).map((f, i) => ({
    id: f.id || `F${i + 1}`,
    severity: SEVERITY[f.severity] ? f.severity : inferSeverity(f.title || f.analysis || ""),
    likelihood: f.likelihood ?? null,
    category: f.category || "general",
    title: f.title || "",
    location: f.location ?? null,
    evidence: f.evidence ?? null,
    analysis: f.analysis || "",
    recommendation: f.recommendation || "",
    proposed_text: f.proposed_text ?? null,
    authority: Array.isArray(f.authority) ? f.authority : [],
    confidence: f.confidence || "medium",
  }));
  norm.sort((a, b) => severityMeta(b.severity).rank - severityMeta(a.severity).rank);
  const overall = overallSeverity(norm.map((f) => f.severity));
  const blocking = norm.some((f) => isBlocking(f.severity));
  return {
    $schema: `aegis.output-contract.v${OUTPUT_CONTRACT_VERSION}`,
    skill,
    skill_version: skillVersion,
    matter_id: matterId,
    bottom_line: bottomLine,
    overall,
    findings: norm,
    actions: actions || [],
    assumptions: assumptions || [],
    gaps: gaps || [],
    sources: sources || [],
    escalation: escalation || { required: blocking, to: blocking ? "Reviewing attorney" : null, reason: blocking ? `${overall} finding` : null },
    review: review || { risk_tier: "review-required", status: "draft" },
  };
}
