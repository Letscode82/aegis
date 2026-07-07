/**
 * Pure ladder rules — no DB, no clock injection needed beyond `now`.
 * Everything here is unit-testable without Postgres; the engine
 * (engine.ts) is a thin persistence shell around these functions.
 */

export const MAX_STEPS = 15;

export type SkipOp = "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in";

export interface SkipRule {
  field: string;
  op: SkipOp;
  value: unknown;
}

export interface StepShape {
  stepOrder: number;
  name: string;
  screenKey: string;
  approverRole?: string | null;
  kind: "HUMAN" | "AGENT";
  slaHours?: number | null;
  /** {"skip_if": SkipRule} */
  metadataJson?: unknown;
}

export interface TransitionShape {
  fromStepOrder: number;
  toStepOrder: number | null;
  action: "START" | "APPROVE" | "REJECT" | "SEND_BACK" | "CANCEL";
}

export interface RagEntry {
  stepOrder: number;
  name: string;
  screenKey: string;
  kind: "HUMAN" | "AGENT";
  color: "green" | "amber" | "red" | "grey" | "skipped";
  overdue: boolean;
}

const OPS: Record<SkipOp, (a: unknown, b: unknown) => boolean> = {
  eq: (a, b) => a === b,
  ne: (a, b) => a !== b,
  lt: (a, b) => (a as number) < (b as number),
  lte: (a, b) => (a as number) <= (b as number),
  gt: (a, b) => (a as number) > (b as number),
  gte: (a, b) => (a as number) >= (b as number),
  in: (a, b) => Array.isArray(b) && b.includes(a),
};

function skipRuleOf(step: StepShape): SkipRule | null {
  const meta = step.metadataJson;
  if (!meta || typeof meta !== "object") return null;
  const rule = (meta as Record<string, unknown>)["skip_if"];
  if (!rule || typeof rule !== "object") return null;
  const r = rule as Record<string, unknown>;
  if (typeof r.field !== "string" || typeof r.op !== "string") return null;
  if (!(r.op in OPS)) return null;
  return { field: r.field, op: r.op as SkipOp, value: r.value };
}

/** A malformed rule never blocks the workflow — it just doesn't skip. */
export function shouldSkip(step: StepShape, context: Record<string, unknown>): boolean {
  const rule = skipRuleOf(step);
  if (!rule) return false;
  try {
    const value = context[rule.field];
    return value !== undefined && value !== null && OPS[rule.op](value, rule.value);
  } catch {
    return false;
  }
}

/** First step after `after` that isn't skipped; null when the ladder is done. */
export function nextActionable(
  steps: StepShape[],
  after: number,
  context: Record<string, unknown>,
): number | null {
  for (const s of [...steps].sort((a, b) => a.stepOrder - b.stepOrder)) {
    if (s.stepOrder > after && !shouldSkip(s, context)) return s.stepOrder;
  }
  return null;
}

/**
 * Red / Amber / Green per step for the ladder strip.
 *
 *   green   — step already passed (or workflow completed)
 *   amber   — the step currently awaiting action
 *   red     — source of the latest reject/send-back not yet re-approved,
 *             OR the current step has breached its slaHours
 *   grey    — not reached yet
 *   skipped — excluded by its skip_if condition
 */
export function computeRag(input: {
  steps: StepShape[];
  transitions: TransitionShape[]; // chronological
  currentStepOrder: number;
  status: "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  context: Record<string, unknown>;
  stepEnteredAt: Date;
  now?: Date;
}): RagEntry[] {
  const { steps, transitions, currentStepOrder, status, context, stepEnteredAt } = input;
  const now = input.now ?? new Date();
  const completed = status === "COMPLETED";

  const redSteps = new Set<number>();
  for (const t of transitions) {
    if (t.action === "REJECT" || t.action === "SEND_BACK") redSteps.add(t.fromStepOrder);
    else if (t.action === "APPROVE") redSteps.delete(t.fromStepOrder);
  }

  const out: RagEntry[] = [];
  for (const s of [...steps].sort((a, b) => a.stepOrder - b.stepOrder)) {
    let color: RagEntry["color"];
    let overdue = false;
    if (shouldSkip(s, context)) {
      color = "skipped";
    } else if (completed || s.stepOrder < currentStepOrder) {
      color = "green";
    } else if (s.stepOrder === currentStepOrder) {
      color = "amber";
      if (status === "IN_PROGRESS" && s.slaHours) {
        const waitedHours = (now.getTime() - stepEnteredAt.getTime()) / 3_600_000;
        if (waitedHours > s.slaHours) {
          color = "red";
          overdue = true;
        }
      }
    } else {
      color = "grey";
    }
    if (redSteps.has(s.stepOrder) && !completed && color !== "skipped") color = "red";
    out.push({
      stepOrder: s.stepOrder,
      name: s.name,
      screenKey: s.screenKey,
      kind: s.kind,
      color,
      overdue,
    });
  }
  return out;
}
