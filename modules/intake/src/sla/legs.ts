/**
 * W2-4 · Multi-leg SLA (issue #111) — pure per-leg clock math.
 *
 * One SLA window, partitioned into custody legs: the hand-off ledger
 * (Item 6 + W2-2's auto baton-pass) says who held the ticket when, so
 * the single clock becomes a sequence of leg clocks — time in the
 * intake queue, time with the AI agent, time with each human reviewer.
 * A hand-off can no longer hide a breach: the breach instant lands
 * inside exactly one leg, and every leg reports the share of the SLA
 * window it consumed.
 *
 * Deliberately evidence-not-policy: legs carry elapsed time and
 * window-share, not per-leg budgets (there is no per-stage SLA config
 * yet — inventing implicit budgets would fake precision). No DB, no
 * React; the server module resolves names and feeds rows in.
 */

export interface LegHandoffInput {
  /** "agent" | "human" | "queue" (IntakeTicketHandoff.toHolder). */
  toHolder: string;
  toUserId: string | null;
  /** Resolved display name for toUserId, when the server has it. */
  toUserName?: string | null;
  /** Epoch ms of the pass. */
  atTs: number;
}

export interface SlaLegDTO {
  /** "queue" | "agent" | "human". */
  holder: string;
  holderUserId: string | null;
  holderLabel: string;
  startTs: number;
  /** Exclusive end; equals `now` (or close time) for the final leg. */
  endTs: number;
  elapsedMs: number;
  /** Share of the SLA window this leg consumed, rounded %. */
  pctOfSla: number;
  /** True for the last leg of a still-open ticket. */
  active: boolean;
  /** The SLA expiry instant fell inside this leg. */
  breachedDuringLeg: boolean;
}

export interface SlaLegsDTO {
  legs: SlaLegDTO[];
  slaMs: number;
  /** Epoch ms when the window expires/expired. */
  breachTs: number;
  totalElapsedMs: number;
  breached: boolean;
  closed: boolean;
}

function labelFor(holder: string, userName: string | null | undefined, userId: string | null): string {
  if (holder === "agent") return "AI agent";
  if (holder === "human") return userName || userId || "Assignee";
  return "Intake queue";
}

export function buildSlaLegs(input: {
  /** Epoch ms the ticket was submitted (leg 0 starts here). */
  submittedTs: number;
  slaHours: number;
  /** Hand-off ledger rows, ascending by time. */
  handoffs: LegHandoffInput[];
  /** Epoch ms the ticket closed, when it has. */
  closedTs?: number | null;
  /** Clock reference for open tickets. */
  now: number;
}): SlaLegsDTO {
  const { submittedTs, slaHours, handoffs, closedTs, now } = input;
  const closed = closedTs != null;
  const endOfLife = Math.max(closed ? (closedTs as number) : now, submittedTs);
  const slaMs = Math.max(slaHours, 0) * 3600 * 1000;
  const breachTs = submittedTs + slaMs;

  // Boundaries: submission, then every pass that happened before the
  // end of life (clock skew clamped into the window).
  const passes = handoffs
    .map((h) => ({ ...h, atTs: Math.min(Math.max(h.atTs, submittedTs), endOfLife) }))
    .sort((a, b) => a.atTs - b.atTs);

  type Segment = {
    holder: string;
    holderUserId: string | null;
    holderLabel: string;
    startTs: number;
    endTs: number;
  };
  const segments: Segment[] = [];
  let cursorHolder = "queue";
  let cursorUserId: string | null = null;
  let cursorLabel = labelFor("queue", null, null);
  let cursorStart = submittedTs;
  for (const p of passes) {
    if (p.atTs > cursorStart) {
      segments.push({
        holder: cursorHolder,
        holderUserId: cursorUserId,
        holderLabel: cursorLabel,
        startTs: cursorStart,
        endTs: p.atTs,
      });
      cursorStart = p.atTs;
    }
    // Zero-length passes (the agent's two back-to-back baton rows)
    // simply advance the holder without emitting an empty leg.
    cursorHolder = p.toHolder;
    cursorUserId = p.toHolder === "human" ? p.toUserId : null;
    cursorLabel = labelFor(p.toHolder, p.toUserName, p.toUserId);
  }
  segments.push({
    holder: cursorHolder,
    holderUserId: cursorUserId,
    holderLabel: cursorLabel,
    startTs: cursorStart,
    endTs: endOfLife,
  });

  const legs: SlaLegDTO[] = segments.map((s, i) => {
    const elapsedMs = s.endTs - s.startTs;
    return {
      holder: s.holder,
      holderUserId: s.holderUserId,
      holderLabel: s.holderLabel,
      startTs: s.startTs,
      endTs: s.endTs,
      elapsedMs,
      pctOfSla: slaMs > 0 ? Math.round((elapsedMs / slaMs) * 100) : 0,
      active: !closed && i === segments.length - 1,
      breachedDuringLeg:
        slaMs > 0 && breachTs >= s.startTs && breachTs < s.endTs,
    };
  });

  return {
    legs,
    slaMs,
    breachTs,
    totalElapsedMs: endOfLife - submittedTs,
    breached: slaMs > 0 && endOfLife >= breachTs,
    closed,
  };
}
