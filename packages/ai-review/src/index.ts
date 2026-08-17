/**
 * @aegis/ai-review — shared multi-dimension AI review engine.
 *
 * Pure (no I/O): build the prompt, run it through `@aegis/ai` yourself, parse
 * the result here, or fall back to the deterministic screen. Produces routed,
 * cited, confidence-scored tags that serve both culling (responsiveness /
 * junk) and production (privilege / PII / issue coding). The human gate and
 * persistence live in the calling module.
 */
export type {
  ReviewTagKind,
  ReviewIssue,
  ReviewInstruction,
  ReviewItem,
  ReviewTag,
  ReviewRoute,
  ReviewItemResult,
  RoutingThresholds,
} from "./types";
export { ALL_DIMENSIONS, DEFAULT_THRESHOLDS } from "./types";

export {
  buildReviewPrompt,
  parseAiReview,
  reviewDeterministic,
  resultFromTags,
} from "./prompt";

export { routeTags, summarizeRoutes, type RouteOptions, type RouteSummary } from "./router";

export { screenDeterministic, tokenize } from "./deterministic";
