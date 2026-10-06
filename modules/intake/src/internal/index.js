/**
 * @aegis/intake — Legal Intake module (bulk-moved in Step 1).
 *
 * Step 1 ships this as a single mass: every export the v8 demo needed,
 * surfaced from one entry point. Step 5 (PR #5) splits this into a proper
 * api.ts (public) + internal/ (private) layout. Until then, callers use
 * the named exports below; the surface will narrow in Step 5.
 *
 * apps/web is the composition root and may import anything from here. Other
 * modules (Matter, Spend, …) MUST go through this package's eventual api.ts
 * — and in Step 1, since api.ts does not exist yet, no other module imports
 * from @aegis/intake. ESLint will enforce that once a second module exists.
 */

// Cockpit / Copilot / Inbox — the Intake module's React UI.
export { IntakeView } from "./intake/index.jsx";

// AI feature components used by the v8 demo across views.
export {
  MissionControlBriefing,
  TicketSummaryButton,
  AskAuroraChat,
  MatterRiskBadge,
  buildBriefingContext,
} from "./ai-features.jsx";

// "Ask Aurora" floating panel (pre-existing demo affordance).
export { AICopilot } from "./shell/ai-copilot.jsx";

// AI insight building blocks — exposed for now because non-Intake views in
// apps/web embed them. In Step 5 these will likely move to packages/ui or
// stay private to Intake.
export { AIInsight, useAIInsight } from "./ai-insight.jsx";
