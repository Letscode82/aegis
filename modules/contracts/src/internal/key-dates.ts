/**
 * Contract key dates — the calendar feed (Obligations & Renewals, Phase 2).
 *
 * One chronological surface for everything a legal team must not miss:
 *   - CONTRACT_EXPIRY          — a live contract's end date
 *   - RENEWAL_NOTICE_DEADLINE  — last day to give non-renewal notice
 *   - OBLIGATION_DUE           — an open obligation's due date
 *
 * getKeyDates() aggregates them (bounded to a window); buildKeyDatesICS()
 * renders an RFC-5545 iCalendar so a GC can subscribe / import into Outlook or
 * Google Calendar with a 7-day reminder on each. The ICS builder is pure.
 */
import { prisma } from "@aegis/db";

const DAY_MS = 86_400_000;
const LIVE_STATUSES = ["ACTIVE", "EXECUTED"] as const;

export type KeyDateKind = "CONTRACT_EXPIRY" | "RENEWAL_NOTICE_DEADLINE" | "OBLIGATION_DUE";
export type KeyDateSeverity = "high" | "medium" | "low";

export interface KeyDate {
  id: string;
  date: string; // ISO
  kind: KeyDateKind;
  contractId: string;
  contractTitle: string;
  counterpartyName: string | null;
  title: string;
  detail: string;
  severity: KeyDateSeverity;
  daysOut: number;
  obligationId?: string;
}

export interface KeyDatesResult {
  keyDates: KeyDate[];
  counts: Record<KeyDateKind, number>;
  window: { from: string; to: string };
  generatedAt: string;
}

const daysUntil = (from: Date, to: Date): number => Math.floor((to.getTime() - from.getTime()) / DAY_MS);
const severityFor = (daysOut: number): KeyDateSeverity => (daysOut < 0 ? "high" : daysOut <= 30 ? "medium" : "low");

/**
 * Aggregate contract expiries, renewal-notice deadlines, and open-obligation due
 * dates into one chronological list, bounded to [from, to] (default: 60 days
 * back → ~13 months forward, which covers "what's overdue" + "the year ahead").
 */
export async function getKeyDates(
  organizationId: string,
  opts: { from?: Date; to?: Date } = {},
): Promise<KeyDatesResult> {
  const now = new Date();
  const from = opts.from ?? new Date(now.getTime() - 60 * DAY_MS);
  const to = opts.to ?? new Date(now.getTime() + 400 * DAY_MS);
  const inWindow = (d: Date) => d >= from && d <= to;

  const [contracts, obligations] = await Promise.all([
    prisma.contract.findMany({
      where: { organizationId, status: { in: [...LIVE_STATUSES] }, expiryDate: { not: null } },
      include: { counterparty: { select: { name: true } } },
    }),
    prisma.obligation.findMany({
      where: {
        organizationId,
        sourceType: "CONTRACT",
        status: { in: ["OPEN", "IN_PROGRESS"] },
        dueDate: { not: null },
      },
    }),
  ]);

  const titleById = new Map(contracts.map((c) => [c.id, c.title]));
  const cpById = new Map(contracts.map((c) => [c.id, c.counterparty?.name ?? null]));

  const keyDates: KeyDate[] = [];

  for (const c of contracts) {
    if (c.expiryDate && inWindow(c.expiryDate)) {
      const daysOut = daysUntil(now, c.expiryDate);
      keyDates.push({
        id: `exp-${c.id}`,
        date: c.expiryDate.toISOString(),
        kind: "CONTRACT_EXPIRY",
        contractId: c.id,
        contractTitle: c.title,
        counterpartyName: c.counterparty?.name ?? null,
        title: `Expiry — ${c.title}`,
        detail: `${c.type} contract ${c.autoRenew ? "auto-renews" : "expires"} on this date.`,
        severity: severityFor(daysOut),
        daysOut,
      });
    }
    if (c.expiryDate && c.autoRenew && c.noticeWindowDays != null) {
      const deadline = new Date(c.expiryDate.getTime() - c.noticeWindowDays * DAY_MS);
      if (inWindow(deadline)) {
        const daysOut = daysUntil(now, deadline);
        keyDates.push({
          id: `notice-${c.id}`,
          date: deadline.toISOString(),
          kind: "RENEWAL_NOTICE_DEADLINE",
          contractId: c.id,
          contractTitle: c.title,
          counterpartyName: c.counterparty?.name ?? null,
          title: `Non-renewal notice deadline — ${c.title}`,
          detail: `Last day to give non-renewal notice (${c.noticeWindowDays}-day window) before auto-renewal.`,
          severity: severityFor(daysOut),
          daysOut,
        });
      }
    }
  }

  for (const o of obligations) {
    if (!o.dueDate || !inWindow(o.dueDate)) continue;
    const title = titleById.get(o.sourceId) ?? "—";
    const daysOut = daysUntil(now, o.dueDate);
    keyDates.push({
      id: `obl-${o.id}`,
      date: o.dueDate.toISOString(),
      kind: "OBLIGATION_DUE",
      contractId: o.sourceId,
      contractTitle: title,
      counterpartyName: cpById.get(o.sourceId) ?? null,
      title: o.description,
      detail: `${o.type.replace(/_/g, " ").toLowerCase()} obligation due — ${title}.`,
      severity: severityFor(daysOut),
      daysOut,
      obligationId: o.id,
    });
  }

  keyDates.sort((a, b) => a.date.localeCompare(b.date));

  const counts: Record<KeyDateKind, number> = {
    CONTRACT_EXPIRY: 0,
    RENEWAL_NOTICE_DEADLINE: 0,
    OBLIGATION_DUE: 0,
  };
  for (const k of keyDates) counts[k.kind] += 1;

  return { keyDates, counts, window: { from: from.toISOString(), to: to.toISOString() }, generatedAt: now.toISOString() };
}

// ── iCalendar (RFC 5545) — pure ──────────────────────────────────────

/** Escape a text value for an iCalendar property (RFC 5545 §3.3.11). */
export function escapeICSText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

const pad = (n: number) => String(n).padStart(2, "0");
const toICSDate = (iso: string): string => {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
};
const toICSStamp = (d: Date): string =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

/**
 * Render key dates as an iCalendar string. All-day VEVENTs with a 7-day-prior
 * DISPLAY alarm, CRLF line endings. `now` is injected so callers control the
 * DTSTAMP (and tests are deterministic).
 */
export function buildKeyDatesICS(
  keyDates: KeyDate[],
  opts: { now: Date; calendarName?: string },
): string {
  const stamp = toICSStamp(opts.now);
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AEGIS//Contract Key Dates//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeICSText(opts.calendarName ?? "AEGIS Contract Key Dates")}`,
  ];
  for (const k of keyDates) {
    const summary = escapeICSText(`[${k.kind.replace(/_/g, " ")}] ${k.title}`);
    const description = escapeICSText(
      `${k.detail}${k.counterpartyName ? ` Counterparty: ${k.counterpartyName}.` : ""}`,
    );
    lines.push(
      "BEGIN:VEVENT",
      `UID:${k.id}@aegis-clm`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${toICSDate(k.date)}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${description}`,
      "BEGIN:VALARM",
      "TRIGGER:-P7D",
      "ACTION:DISPLAY",
      `DESCRIPTION:${summary}`,
      "END:VALARM",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
