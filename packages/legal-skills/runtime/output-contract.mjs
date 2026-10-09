// OneLegal output contract — the executable, single source of truth for the
// SHAPE every OneLegal skill and intake agent returns.
//
// `_shared/severity-scale.md` and `_shared/output-contract.md` are the human
// spec; this module is the machine mirror the code depends on, so the intake
// agents (modules/intake) and the skill surfaces (apps/web) converge on ONE
// severity scale and ONE finding shape instead of each inventing their own.
// A test (`runtime/test/runtime.test.mjs`) asserts the levels + labels here
// stay in lock-step with the markdown table, so the two never drift.
//
// Zero dependencies, pure, ESM — safe to import in the browser, on the server,
// and under any test runner.

/** The severity ladder, most-severe first. `Info` is a note with no action. */
export const SEVERITY_LEVELS = ["S1", "S2", "S3", "S4", "Info"];

/** Canonical label + one-line meaning per level (mirrors severity-scale.md). */
export const SEVERITY_META = {
  S1: { label: "Critical", meaning: "Regulatory breach, uncapped or existential liability, loss of a key right, criminal exposure, or a missed non-extendable deadline." },
  S2: { label: "High", meaning: "Material financial, operational or reputational exposure; clear departure from mandatory policy." },
  S3: { label: "Medium", meaning: "Departure from preferred position with a manageable downside." },
  S4: { label: "Low", meaning: "Drafting, clarity or minor commercial point." },
  Info: { label: "Note", meaning: "Observation with no action needed." },
};

/** Likelihood band for risk-register / disputes / compliance findings. */
export const LIKELIHOODS = ["likely", "possible", "remote"];

/** Confidence band for a finding. */
export const CONFIDENCE_LEVELS = ["high", "medium", "low"];

// The legacy intake triage risk labels (classify-regex.js / aiTriage.risk and
// the profile risk words) → the shared severity scale. This is the bridge that
// lets the eleven intake agents speak S-levels without re-labelling upstream.
const RISK_WORD_TO_SEVERITY = {
  critical: "S1",
  severe: "S1",
  high: "S2",
  elevated: "S2",
  medium: "S3",
  moderate: "S3",
  low: "S4",
  minor: "S4",
  none: "Info",
  informational: "Info",
  info: "Info",
};

/**
 * Coerce any reasonable severity input to a canonical level, else `fallback`.
 * Accepts `"S1"`, `"s1"`, `"1"`, `1`, and the legacy risk words
 * (`"Critical"`, `"High"`, …). Returns `fallback` (default `null`) for
 * anything unrecognised — callers decide whether an unknown severity means
 * "not assessed" (null) or a conservative default.
 */
export function normalizeSeverity(input, fallback = null) {
  if (input == null) return fallback;
  const s = String(input).trim().toLowerCase();
  if (!s) return fallback;
  const sMatch = /^s?([1-4])$/.exec(s);
  if (sMatch) return `S${sMatch[1]}`;
  if (s === "info" || s === "informational" || s === "note" || s === "none") return "Info";
  if (RISK_WORD_TO_SEVERITY[s]) return RISK_WORD_TO_SEVERITY[s];
  return fallback;
}

/** Legacy risk label (`"Critical"`/`"High"`/…) → severity, else `fallback`. */
export function severityFromRisk(risk, fallback = null) {
  return normalizeSeverity(risk, fallback);
}

/** A sort rank where lower = more severe (S1=1 … Info=5; unknown=99). */
export function severityRank(sev) {
  const i = SEVERITY_LEVELS.indexOf(normalizeSeverity(sev));
  return i === -1 ? 99 : i + 1;
}

/** True when `x` is exactly one of the canonical severity levels. */
export function isSeverity(x) {
  return SEVERITY_LEVELS.includes(x);
}

/**
 * Roll a set of findings up to a single overall severity, per the
 * calibration rule in severity-scale.md: the overall is the highest finding
 * severity, EXCEPT that three or more S2 findings sharing the same `category`
 * ("risk area") roll that area — and therefore the overall — up to S1.
 * Returns `null` when there are no severity-bearing findings.
 */
export function rollUpOverall(findings) {
  const list = Array.isArray(findings) ? findings : [];
  let best = null; // most-severe seen
  const s2ByArea = new Map();
  for (const f of list) {
    const sev = normalizeSeverity(f && f.severity);
    if (!sev) continue;
    if (best === null || severityRank(sev) < severityRank(best)) best = sev;
    if (sev === "S2") {
      const area = String((f && f.category) || "").trim().toLowerCase() || "_uncategorised";
      s2ByArea.set(area, (s2ByArea.get(area) || 0) + 1);
    }
  }
  for (const count of s2ByArea.values()) {
    if (count >= 3) return "S1";
  }
  return best;
}

/** The top-level field names of the JSON output contract (output-contract.md). */
export const OUTPUT_CONTRACT_FIELDS = [
  "skill",
  "skill_version",
  "matter_id",
  "bottom_line",
  "overall",
  "findings",
  "actions",
  "assumptions",
  "gaps",
  "sources",
  "escalation",
  "review",
];

/** The field names of a single `findings[]` entry. */
export const FINDING_FIELDS = [
  "id",
  "severity",
  "likelihood",
  "category",
  "title",
  "location",
  "evidence",
  "analysis",
  "recommendation",
  "proposed_text",
  "authority",
  "confidence",
];

/**
 * Normalise one raw finding (model output or agent concern) to the contract
 * shape, dropping unknown keys and canonicalising `severity` / `likelihood` /
 * `confidence`. `i` seeds a stable `id` when the finding has none.
 */
export function coerceFinding(raw, i = 0) {
  const r = raw && typeof raw === "object" ? raw : {};
  const likelihood = r.likelihood != null && LIKELIHOODS.includes(String(r.likelihood).toLowerCase())
    ? String(r.likelihood).toLowerCase()
    : null;
  const confidence = r.confidence != null && CONFIDENCE_LEVELS.includes(String(r.confidence).toLowerCase())
    ? String(r.confidence).toLowerCase()
    : null;
  return {
    id: String(r.id || `F${i + 1}`),
    severity: normalizeSeverity(r.severity),
    likelihood,
    category: r.category != null ? String(r.category) : null,
    title: r.title != null ? String(r.title) : "",
    location: r.location != null ? String(r.location) : null,
    evidence: r.evidence != null ? String(r.evidence) : null,
    analysis: r.analysis != null ? String(r.analysis) : null,
    recommendation: r.recommendation != null ? String(r.recommendation) : null,
    proposed_text: r.proposed_text != null ? String(r.proposed_text) : null,
    authority: Array.isArray(r.authority) ? r.authority : [],
    confidence,
  };
}

/** Normalise an array of raw findings, dropping non-objects. */
export function coerceFindings(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((f) => f && typeof f === "object").map((f, i) => coerceFinding(f, i));
}
