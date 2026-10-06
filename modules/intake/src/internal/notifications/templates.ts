/**
 * W3-2 · Notifications (issue #114) — pure email templates.
 *
 * Plain-text emails (the Graph send path is contentType Text) with a
 * consistent shape: what happened, the ticket, where to look. No DB,
 * no transport — unit-testable string building only.
 */

export const NOTIFICATION_KINDS = [
  "assignment",
  "stage",
  "breach",
  "closure",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export interface NotificationContext {
  ticketId: string;
  /** One-line description snippet. */
  descSnippet: string;
  type: string;
  priority: string;
  /** Kind-specific extras. */
  stage?: string | null;
  status?: string | null;
  assigneeName?: string | null;
  slaHours?: number | null;
  /** Base URL of the deployed app, when known (links in the email). */
  appUrl?: string | null;
}

export interface NotificationEmail {
  subject: string;
  body: string;
}

const SNIPPET_MAX = 90;

export function toSnippet(desc: string): string {
  const oneLine = (desc ?? "").replace(/\s+/g, " ").trim();
  return oneLine.length > SNIPPET_MAX
    ? oneLine.slice(0, SNIPPET_MAX - 1) + "…"
    : oneLine;
}

function footer(ctx: NotificationContext): string {
  const link = ctx.appUrl ? `\nOpen it: ${ctx.appUrl}/?ticket=${ctx.ticketId}` : "";
  return `${link}\n\n— AEGIS Legal Intake (automated notification; manage these in your AEGIS notification settings)`;
}

export function buildNotificationEmail(
  kind: NotificationKind,
  ctx: NotificationContext,
): NotificationEmail {
  const head = `${ctx.ticketId} · ${ctx.descSnippet}`;
  switch (kind) {
    case "assignment":
      return {
        subject: `[AEGIS] Assigned to you: ${head}`,
        body:
          `A legal request was assigned to you.\n\n` +
          `Ticket: ${ctx.ticketId}\n` +
          `Type: ${ctx.type} · Priority: ${ctx.priority}` +
          (ctx.slaHours != null ? ` · SLA ${ctx.slaHours}h` : "") +
          `\nRequest: ${ctx.descSnippet}\n` +
          footer(ctx),
      };
    case "stage":
      return {
        subject: `[AEGIS] Update on your request ${ctx.ticketId}: ${ctx.stage ?? "moved forward"}`,
        body:
          `Your legal request moved forward.\n\n` +
          `Ticket: ${ctx.ticketId}\n` +
          `Now at stage: ${ctx.stage ?? "—"}\n` +
          `Request: ${ctx.descSnippet}\n` +
          footer(ctx),
      };
    case "breach":
      return {
        subject: `[AEGIS] ⚠ SLA breached: ${head}`,
        body:
          `A ticket on your plate has breached its SLA window and was escalated.\n\n` +
          `Ticket: ${ctx.ticketId}\n` +
          `Type: ${ctx.type} · Priority: ${ctx.priority}` +
          (ctx.slaHours != null ? ` · SLA was ${ctx.slaHours}h` : "") +
          `\nRequest: ${ctx.descSnippet}\n` +
          footer(ctx),
      };
    case "closure":
      return {
        subject: `[AEGIS] Resolved: your request ${ctx.ticketId}`,
        body:
          `Your legal request is resolved.\n\n` +
          `Ticket: ${ctx.ticketId}\n` +
          `Final status: ${ctx.status ?? "Closed"}\n` +
          `Request: ${ctx.descSnippet}\n` +
          footer(ctx),
      };
  }
}

/** Per-user notification preferences (UserPreference KV value). */
export interface NotificationPrefs {
  enabled: boolean;
  assignment: boolean;
  stage: boolean;
  breach: boolean;
  closure: boolean;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  enabled: true,
  assignment: true,
  stage: true,
  breach: true,
  closure: true,
};

/** Normalize a stored value into full prefs (missing keys → default). */
export function normalizePrefs(raw: unknown): NotificationPrefs {
  const o = (raw ?? {}) as Partial<Record<keyof NotificationPrefs, unknown>>;
  const bool = (v: unknown, dflt: boolean) =>
    typeof v === "boolean" ? v : dflt;
  return {
    enabled: bool(o.enabled, true),
    assignment: bool(o.assignment, true),
    stage: bool(o.stage, true),
    breach: bool(o.breach, true),
    closure: bool(o.closure, true),
  };
}

export function prefAllows(prefs: NotificationPrefs, kind: NotificationKind): boolean {
  return prefs.enabled && prefs[kind];
}
