/**
 * @aegis/intake — public API surface (Step 5).
 *
 * This is the module's public entry (`import … from "@aegis/intake"`).
 * Everything else now lives under `src/internal/**`, which the
 * module-isolation ESLint rule treats as private: other modules may
 * import from this file (and the named subpath entries declared in
 * `package.json#exports`) — never from `src/internal/**` directly.
 *
 * What this entry exposes: the Intake module's React UI surface, which
 * the composition root (apps/web) embeds across the v8 demo views
 * (Mission Control briefing, Cockpit/Inbox, the "Ask Aurora" panel,
 * AI-insight building blocks). These are re-exported verbatim from the
 * internal UI barrel so existing `@aegis/intake` consumers are
 * byte-identical across the Step 5 split.
 *
 * Server/logic surfaces (storage, routing, SLA, agents, ai-ops, …) are
 * reached through the narrow subpath entries in `package.json#exports`
 * (e.g. `@aegis/intake/server`, `@aegis/intake/ai-ops`). They stay on
 * dedicated entries — rather than being aggregated here — so a consumer
 * (and the dev-only `packages/db/prisma/seed.ts`, which reads a few
 * narrow leaf modules by relative path) pulls only the slice it needs
 * and the `@aegis/db` ⇄ `@aegis/intake` import graph stays acyclic.
 */

export {
  IntakeView,
  MissionControlBriefing,
  TicketSummaryButton,
  AskAuroraChat,
  MatterRiskBadge,
  buildBriefingContext,
  AICopilot,
  AIInsight,
  useAIInsight,
} from "./src/internal/index.js";
