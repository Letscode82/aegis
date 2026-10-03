/**
 * ONE Legal cross-module demo spine (OL-7).
 *
 * The litigation-response showcase: one request — *"Acme served us"* — fans
 * out into the ordered, cross-module governed task graph that proves "every
 * task runs through ONE Legal":
 *
 *   open the matter → issue a legal hold on it → start document review
 *   → issue the hold notice
 *
 * Each step is a governed tool proposal (every mutation still writes a
 * PENDING → APPROVED `AgentDecision` via the OL-3 gate), so nothing runs
 * without a human Approve. Steps carry a `dependsOn` index: the console feeds
 * the referenced step's produced resource id in as this step's target, so the
 * hold targets the matter just opened and the notice targets the hold just
 * created — no manual picker, no autonomous mutation.
 *
 * Detection is conservative: only a clear litigation-service trigger spins up
 * the spine, so ordinary requests fall through to the normal planner.
 */

export interface SpineStep {
  toolId: string;
  title: string;
  request: string;
  /** Index of the earlier step whose produced resource is this step's target. */
  dependsOn: number | null;
}

// A litigation-service trigger: we've been served / sued / a complaint landed.
const SERVED_TRIGGER =
  /\b(served|sued|lawsuit|law suit|complaint|summons|subpoena|litigation|demand letter|notice of claim|we(?:'ve| have) been named)\b/i;

/**
 * Returns the governed spine for a litigation-service request, or null when the
 * request isn't one (so the caller uses the normal task planner).
 */
export function detectSpine(text: string): SpineStep[] | null {
  const t = (text || "").replace(/\s+/g, " ").trim();
  if (t.length < 3 || !SERVED_TRIGGER.test(t)) return null;
  return [
    { toolId: "matter.create", title: "Open the litigation matter", request: t, dependsOn: null },
    { toolId: "matter.legalhold.create", title: "Issue a legal hold", request: `Preserve all documents and data relevant to: ${t}`, dependsOn: 0 },
    { toolId: "matter.review.start", title: "Start document review", request: t, dependsOn: 0 },
    { toolId: "matter.legalhold.notice", title: "Issue the hold notice", request: t, dependsOn: 1 },
  ];
}
