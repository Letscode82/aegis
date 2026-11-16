/**
 * @aegis/ai — Claude API client + serverless proxy.
 *
 * Browser-safe client functions (`callClaude`, `callClaudeJSON`,
 * `parseJSONLoose`, `friendlyAIError`, `CLAUDE_MODEL`, `CLAUDE_ENDPOINT`)
 * issue requests to `/api/claude` so the API key stays server-side.
 *
 * The server-side handler (`handleClaudeRequest`) lives in `./proxy.js` and
 * is mounted by `apps/web/pages/api/claude.ts`.
 *
 * Regex-based intake classifier (`classifyIntakeRegex`) is a deterministic
 * fallback used when no API key is configured.
 */
export {
  CLAUDE_MODEL,
  CLAUDE_ENDPOINT,
  parseJSONLoose,
  callClaude,
  callClaudeJSON,
  friendlyAIError,
  setClaudeTransport,
  WEB_SEARCH_TOOL_TYPE,
  extractWebSearchResult,
} from "./claude.js";

export { classifyIntakeRegex } from "./classify-regex.js";

// Evaluation harness — EVAL1 (`evaluateClassifier`) scores a classifier against
// labeled cases; EVAL2 is the general version: run any deterministic engine (or
// a real Claude call) over a golden set and guard AI QUALITY in CI with
// pluggable scoring (exact / set-overlap / ordinal-label) + threshold asserts.
export {
  evaluateClassifier,
  runEvalSuite,
  runEvalSuiteAsync,
  exactScore,
  setScore,
  labelScore,
  assertEvalThreshold,
  formatEvalReport,
} from "./eval.js";

// PII guardrails (SEC1) — detect/redact common PII. Usable before an embedding
// or external send; the /api/claude proxy applies redactPII when
// AEGIS_PII_REDACTION is enabled.
export { detectPII, redactPII, redactMessagesBody, isPIIRedactionEnabled, PII_PATTERNS } from "./pii.js";

// Laya — self-hosted System-1 typed-decision engine for intake triage
// (JEV-compatible, Apache-2.0). Degrades to the regex classifier when
// `LAYA_URL` is unset or the service is unavailable.
export { classifyIntakeLaya, isLayaConfigured } from "./laya.js";

// Citation enforcement + grounding guardrails (C-13) — deterministically strip
// hallucinated `[n]` citations from a grounded answer and flag ungrounded ones.
export { enforceCitations } from "./grounding.js";
