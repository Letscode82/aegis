/**
 * DSAR statutory-deadline math (pure). Different regimes give different
 * response windows and extension allowances; this is the single source of
 * truth the create path (initial deadline), the extension action, and the SLA
 * breach sweep all read.
 *
 *   GDPR / UK GDPR      — 1 month (30d), extendable +2 months (60d)
 *   CCPA / US state     — 45 days,       extendable +45 days
 *   default             — 30 days,       extendable +30 days
 */

export interface StatutoryWindow {
  regime: "GDPR" | "US_STATE" | "DEFAULT";
  responseDays: number;
  extensionDays: number;
}

const GDPR_REGIONS = new Set([
  "EU", "EEA", "UK", "GB", "IE", "DE", "FR", "ES", "IT", "NL", "BE", "SE", "DK", "FI", "NO", "AT", "PL", "PT", "CH",
]);
const US_REGIONS = new Set(["US", "US-CA", "US-CO", "US-VA", "US-CT", "US-UT", "CA-US"]);

/** Resolve the statutory window for a jurisdiction code (case-insensitive). */
export function statutoryWindow(jurisdiction: string): StatutoryWindow {
  const j = (jurisdiction || "").trim().toUpperCase();
  if (GDPR_REGIONS.has(j)) return { regime: "GDPR", responseDays: 30, extensionDays: 60 };
  if (US_REGIONS.has(j) || j.startsWith("US")) return { regime: "US_STATE", responseDays: 45, extensionDays: 45 };
  return { regime: "DEFAULT", responseDays: 30, extensionDays: 30 };
}

const DAY_MS = 86_400_000;

/** Initial statutory deadline from the submission date. */
export function computeSlaDeadline(submittedAt: Date, jurisdiction: string): Date {
  return new Date(submittedAt.getTime() + statutoryWindow(jurisdiction).responseDays * DAY_MS);
}

/** Extended deadline (original + the regime's extension allowance). */
export function computeExtendedDeadline(currentDeadline: Date, jurisdiction: string): Date {
  return new Date(currentDeadline.getTime() + statutoryWindow(jurisdiction).extensionDays * DAY_MS);
}

export type SlaUrgency = "BREACHED" | "DUE_TODAY" | "DUE_SOON" | "ON_TRACK";

export interface SlaState {
  effectiveDeadline: Date;
  daysRemaining: number;
  urgency: SlaUrgency;
  breached: boolean;
  extended: boolean;
}

const DUE_SOON_DAYS = 7;

/** Classify where a request sits against its (possibly extended) deadline. */
export function slaState(
  input: { slaDeadline: Date; extendedDeadline: Date | null },
  now: Date,
): SlaState {
  const effectiveDeadline = input.extendedDeadline ?? input.slaDeadline;
  const daysRemaining = Math.floor((effectiveDeadline.getTime() - now.getTime()) / DAY_MS);
  let urgency: SlaUrgency;
  if (daysRemaining < 0) urgency = "BREACHED";
  else if (daysRemaining === 0) urgency = "DUE_TODAY";
  else if (daysRemaining <= DUE_SOON_DAYS) urgency = "DUE_SOON";
  else urgency = "ON_TRACK";
  return {
    effectiveDeadline,
    daysRemaining,
    urgency,
    breached: daysRemaining < 0,
    extended: input.extendedDeadline != null,
  };
}
