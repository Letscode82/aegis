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
} from "./claude.js";

export { classifyIntakeRegex } from "./classify-regex.js";

// Evaluation harness (EVAL1) — score a classifier against labeled cases.
export { evaluateClassifier } from "./eval.js";

// PII guardrails (SEC1) — detect/redact common PII. Usable before an embedding
// or external send; the /api/claude proxy applies redactPII when
// AEGIS_PII_REDACTION is enabled.
export { detectPII, redactPII, redactMessagesBody, isPIIRedactionEnabled, PII_PATTERNS } from "./pii.js";

// Laya — self-hosted System-1 typed-decision engine for intake triage
// (JEV-compatible, Apache-2.0). Degrades to the regex classifier when
// `LAYA_URL` is unset or the service is unavailable.
export { classifyIntakeLaya, isLayaConfigured } from "./laya.js";
