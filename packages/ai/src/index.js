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
