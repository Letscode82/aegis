/**
 * Confidence-based routing (pure). Turns a coded item's tag set into a queue:
 *   - ATTORNEY : anything privileged, any low-confidence call, or a
 *                high-confidence AI call with no citation (fail closed).
 *   - AUTO_CULL: nothing responsive (safe to set aside — still human-reviewable).
 *   - REVIEWER : responsive, confident, non-privileged.
 * "AI proposes, humans dispose" — routing decides WHICH human, never withholds.
 */
import type { ReviewRoute, ReviewTag, RoutingThresholds } from "./types";
import { DEFAULT_THRESHOLDS } from "./types";

export interface RouteOptions extends RoutingThresholds {
  /** true when the tags came from the model (citation rules apply). */
  fromModel: boolean;
}

export function routeTags(tags: ReviewTag[], opts: Partial<RouteOptions> = {}): ReviewRoute {
  const o: RouteOptions = { ...DEFAULT_THRESHOLDS, fromModel: false, ...opts };

  const privileged = tags.some((t) => t.kind === "PRIVILEGED" && t.value);
  if (privileged) return "ATTORNEY";

  // Uncertain on any dimension → attorney.
  if (tags.some((t) => t.confidence < o.lowConfidence)) return "ATTORNEY";

  // Fail closed: a confident model call with no citation is not trustworthy.
  if (o.fromModel && tags.some((t) => t.value && t.confidence >= o.citationRequiredAbove && !t.citation)) {
    return "ATTORNEY";
  }

  const anyResponsive = tags.some((t) => t.kind === "RESPONSIVE" && t.value);
  if (!anyResponsive) return "AUTO_CULL";

  return "REVIEWER";
}

export interface RouteSummary {
  total: number;
  attorney: number;
  reviewer: number;
  autoCull: number;
}

export function summarizeRoutes(routes: ReviewRoute[]): RouteSummary {
  const s: RouteSummary = { total: routes.length, attorney: 0, reviewer: 0, autoCull: 0 };
  for (const r of routes) {
    if (r === "ATTORNEY") s.attorney += 1;
    else if (r === "REVIEWER") s.reviewer += 1;
    else s.autoCull += 1;
  }
  return s;
}
