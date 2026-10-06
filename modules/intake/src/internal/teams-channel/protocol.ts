/**
 * W3-1 · Microsoft Teams intake channel (issue #113) — protocol layer.
 *
 * Teams "outgoing webhooks" POST a Bot Framework Activity to a URL and
 * expect a JSON Activity reply within ~5s. Authentication is HMAC-SHA256
 * over the RAW request body using the base64-decoded security token
 * Teams issued at webhook creation, carried as `Authorization: HMAC
 * <base64 digest>`.
 *
 * This module is transport-free and DB-free: signature verification,
 * mention stripping, command parsing, and reply building — all
 * unit-testable in isolation. The server module (./server.ts) owns the
 * dispatch; the API route owns raw-body handling.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** The subset of the Bot Framework Activity shape the channel reads. */
export interface TeamsActivity {
  type?: string;
  /** Stable message id — idempotency key for Teams retries. */
  id?: string;
  /** "<at>WebhookName</at> actual text" — mention prefix included. */
  text?: string;
  from?: { id?: string; name?: string; aadObjectId?: string };
  conversation?: { id?: string };
  channelData?: { team?: { name?: string }; channel?: { name?: string } };
}

/** Verify the Teams outgoing-webhook HMAC over the raw body. */
export function verifyTeamsHmac(input: {
  /** Raw request body bytes, exactly as received. */
  rawBody: Buffer | string;
  /** The Authorization header value ("HMAC <base64>"). */
  authHeader: string | null | undefined;
  /** The base64 security token Teams issued at webhook creation. */
  secretBase64: string;
}): boolean {
  const { rawBody, authHeader, secretBase64 } = input;
  if (!authHeader || !authHeader.startsWith("HMAC ")) return false;
  let provided: Buffer;
  let key: Buffer;
  try {
    provided = Buffer.from(authHeader.slice(5).trim(), "base64");
    key = Buffer.from(secretBase64, "base64");
  } catch {
    return false;
  }
  if (key.length === 0 || provided.length === 0) return false;
  const expected = createHmac("sha256", key)
    .update(typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody)
    .digest();
  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
}

/** Strip the webhook's own <at>…</at> mention tags + any HTML tags. */
export function stripMentions(text: string): string {
  return text
    .replace(/<at>[^<]*<\/at>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export type TeamsCommand =
  | { kind: "help" }
  | { kind: "status"; ticketId: string | null }
  | { kind: "file"; text: string };

/**
 * Command grammar after mention stripping:
 *   "help"                  → usage reply
 *   "status <ticket-id>"    → one ticket's status
 *   "status"                → the sender's recent tickets
 *   anything else           → file a new request with that text
 */
export function parseTeamsCommand(raw: string): TeamsCommand {
  const text = stripMentions(raw ?? "");
  const lower = text.toLowerCase();
  if (!text || lower === "help" || lower === "?") return { kind: "help" };
  const statusMatch = /^status\b\s*(\S+)?\s*$/i.exec(text);
  if (statusMatch) {
    return { kind: "status", ticketId: statusMatch[1] ?? null };
  }
  return { kind: "file", text };
}

/** First line of the filed text, clipped, as the subject. */
export function subjectFromText(text: string, max = 80): string {
  const firstLine = (text.split(/\r?\n/)[0] ?? "").trim();
  return firstLine.length > max ? firstLine.slice(0, max - 1) + "…" : firstLine;
}

/** Teams reply Activity — `text` renders as markdown in the channel. */
export interface TeamsReply {
  type: "message";
  text: string;
}

export function buildHelpReply(): TeamsReply {
  return {
    type: "message",
    text: [
      "**AEGIS Legal Intake** — file and track legal requests without leaving Teams.",
      "",
      "- **File a request:** mention me and describe what you need, e.g. `@AEGIS We need a mutual NDA with Acme Robotics before the pilot.`",
      "- **Check a ticket:** `@AEGIS status <ticket-id>`",
      "- **Your recent tickets:** `@AEGIS status`",
    ].join("\n"),
  };
}

export function buildFiledReply(t: {
  ticketId: string;
  type: string;
  priority: string;
  slaHours: number;
  assignedTo: string | null;
  deduped?: boolean;
}): TeamsReply {
  if (t.deduped) {
    return {
      type: "message",
      text: `This message is already filed as **${t.ticketId}** — no duplicate created. Ask \`status ${t.ticketId}\` for the latest.`,
    };
  }
  return {
    type: "message",
    text: [
      `✅ Filed as **${t.ticketId}** — Legal has it.`,
      "",
      `- Type: **${t.type}**`,
      `- Priority: **${t.priority}** · SLA **${t.slaHours}h**`,
      `- Assigned: **${t.assignedTo ?? "Triage queue"}**`,
      "",
      `Track it anytime with \`status ${t.ticketId}\`.`,
    ].join("\n"),
  };
}

export interface TicketStatusLine {
  id: string;
  status: string;
  stage: string;
  priority: string;
  assignedTo: string | null;
  slaStatus: string | null;
  descSnippet: string;
}

export function buildStatusReply(t: TicketStatusLine): TeamsReply {
  return {
    type: "message",
    text: [
      `**${t.id}** — ${t.descSnippet}`,
      "",
      `- Status: **${t.status}** · Stage: **${t.stage}**`,
      `- Priority: **${t.priority}** · SLA: **${t.slaStatus ?? "—"}**`,
      `- Assigned: **${t.assignedTo ?? "Triage queue"}**`,
    ].join("\n"),
  };
}

export function buildStatusListReply(
  requesterName: string,
  rows: TicketStatusLine[],
): TeamsReply {
  if (rows.length === 0) {
    return {
      type: "message",
      text: `No tickets found for **${requesterName}** yet. Mention me with a description to file one.`,
    };
  }
  return {
    type: "message",
    text: [
      `Recent tickets for **${requesterName}**:`,
      "",
      ...rows.map(
        (t) =>
          `- **${t.id}** · ${t.status} · ${t.priority} · ${t.descSnippet}`,
      ),
      "",
      "Ask `status <ticket-id>` for detail.",
    ].join("\n"),
  };
}

export function buildNotFoundReply(ticketId: string): TeamsReply {
  return {
    type: "message",
    text: `I couldn't find a ticket **${ticketId}** in this organization. Check the id, or ask \`status\` for your recent tickets.`,
  };
}

export function buildErrorReply(): TeamsReply {
  return {
    type: "message",
    text: "Something went wrong filing that request — please try again, or use the AEGIS New Request form.",
  };
}
