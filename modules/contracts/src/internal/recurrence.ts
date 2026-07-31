/**
 * Recurrence math for recurring obligations (pure, no DB).
 *
 * The shared Obligation entity stores `recurrence` as an RRULE-ish string.
 * Historically it was inert — a `⟳` glyph and nothing more. This computes the
 * NEXT occurrence so completing a recurring obligation spawns its next cycle
 * (quarterly reports, monthly payments, annual audits). We support the subset
 * of RRULE that legal-ops obligations actually use — FREQ + INTERVAL — plus a
 * friendly `QUARTERLY` alias (RRULE has no quarterly frequency; it's
 * MONTHLY;INTERVAL=3, but people write QUARTERLY).
 */

export type RecurrenceFreq = "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";

export interface ParsedRecurrence {
  freq: RecurrenceFreq;
  interval: number; // ≥ 1
}

const FREQS: RecurrenceFreq[] = ["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"];

/**
 * Parse an RRULE-ish string. Accepts `FREQ=MONTHLY;INTERVAL=2`, a bare
 * `QUARTERLY`, lowercase, and extra whitespace. Returns null for anything we
 * don't understand (the obligation is then treated as one-shot).
 */
export function parseRecurrence(recurrence: string | null | undefined): ParsedRecurrence | null {
  if (!recurrence) return null;
  const text = recurrence.trim().toUpperCase();
  if (!text) return null;

  let freq: RecurrenceFreq | null = null;
  let interval = 1;

  // Bare keyword form, e.g. "MONTHLY" or "QUARTERLY".
  if (FREQS.includes(text as RecurrenceFreq)) {
    freq = text as RecurrenceFreq;
  } else {
    for (const part of text.split(";")) {
      const [rawKey, rawVal] = part.split("=");
      const key = rawKey?.trim();
      const val = rawVal?.trim();
      if (key === "FREQ" && val && FREQS.includes(val as RecurrenceFreq)) freq = val as RecurrenceFreq;
      else if (key === "INTERVAL" && val) {
        const n = Number(val);
        if (Number.isFinite(n) && n >= 1) interval = Math.floor(n);
      }
    }
  }

  return freq ? { freq, interval } : null;
}

/** Add whole months to a date, clamping the day to the target month's length
 *  (Jan 31 + 1 month → Feb 28/29, never March 3). */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const targetMonth = d.getMonth() + months;
  const targetYear = d.getFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const day = d.getDate();
  // Last day of the target month.
  const lastDay = new Date(targetYear, normalizedMonth + 1, 0).getDate();
  d.setFullYear(targetYear, normalizedMonth, Math.min(day, lastDay));
  return d;
}

/** Add whole days to a date. */
export function addDays(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * The next occurrence after `from` given a recurrence string, or null when the
 * obligation is one-shot / unparseable. `from` is normally the obligation's
 * current dueDate — so the next cycle is anchored to the schedule, not to when
 * it happened to be completed.
 */
export function nextOccurrence(recurrence: string | null | undefined, from: Date): Date | null {
  const parsed = parseRecurrence(recurrence);
  if (!parsed) return null;
  const { freq, interval } = parsed;
  switch (freq) {
    case "DAILY":
      return addDays(from, interval);
    case "WEEKLY":
      return addDays(from, 7 * interval);
    case "MONTHLY":
      return addMonths(from, interval);
    case "QUARTERLY":
      return addMonths(from, 3 * interval);
    case "YEARLY":
      return addMonths(from, 12 * interval);
    default:
      return null;
  }
}

/** Human label for a recurrence, e.g. "Every 2 months". Null when one-shot. */
export function recurrenceLabel(recurrence: string | null | undefined): string | null {
  const parsed = parseRecurrence(recurrence);
  if (!parsed) return null;
  const unit = { DAILY: "day", WEEKLY: "week", MONTHLY: "month", QUARTERLY: "quarter", YEARLY: "year" }[parsed.freq];
  return parsed.interval === 1 ? `Every ${unit}` : `Every ${parsed.interval} ${unit}s`;
}
