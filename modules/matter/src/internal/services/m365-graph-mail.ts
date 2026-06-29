/**
 * Microsoft Graph mail access (Intake P4b).
 *
 * The matter module owns ALL Microsoft Graph access (factory, audit,
 * delegated auth). Intake's mailbox poller therefore reaches Graph
 * through this service rather than constructing its own client — same
 * rule as the eDiscovery surface.
 *
 * Uses the delegated eDiscovery service account (sub-PR 4c.1) — the same
 * account already connected at /admin/m365. Mailbox read/send needs the
 * Mail.Read / Mail.Send delegated scopes, which were added to
 * DELEGATED_SCOPES; a tenant connected before that change must
 * re-authorize (Device Code) to pick them up.
 *
 * Every call is wrapped in `withGraphAudit` (records authMode:"delegated"
 * + the mailbox), so the chain shows exactly which messages AEGIS read or
 * sent on whose behalf.
 */
import { getFreshDelegatedAccessToken } from "./m365-graph-delegated-auth";
import { withGraphAudit } from "./m365-graph-audit";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

/** Normalized inbound message shape consumed by intake's poller. */
export interface InboundGraphMessage {
  /** Graph message id. */
  id: string;
  /** RFC-2822 Message-ID — stable across stores; used for reply threading. */
  internetMessageId: string | null;
  /** Conversation/thread id. */
  conversationId: string | null;
  fromName: string | null;
  fromEmail: string | null;
  subject: string;
  /** Plain-text body (HTML stripped when the message is HTML). */
  bodyText: string;
  /** ISO timestamp Graph assigned on receipt. */
  receivedDateTime: string;
  hasAttachments: boolean;
}

export interface SendMailInput {
  /** Mailbox to send AS (the connected service account / shared mailbox). */
  mailbox: string;
  to: string;
  subject: string;
  /** Plain-text body. */
  body: string;
  /** Internet Message-ID to thread the reply against (sets In-Reply-To). */
  inReplyToInternetMessageId?: string | null;
}

/** Injectable HTTP for tests. Returns parsed JSON + status. */
export interface GraphHttpResponse {
  status: number;
  json: unknown;
  retryAfterSeconds?: number;
}
export type GraphHttp = (req: {
  method: string;
  url: string;
  accessToken: string;
  body?: unknown;
}) => Promise<GraphHttpResponse>;

export interface MailCallOptions {
  http?: GraphHttp;
  actor?: { id: string } | null;
}

/** Default fetch-based Graph HTTP with one 429 retry honoring Retry-After. */
const defaultHttp: GraphHttp = async ({ method, url, accessToken, body }) => {
  const doFetch = async (): Promise<Response> =>
    fetch(url, {
      method,
      headers: {
        authorization: `Bearer ${accessToken}`,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

  let resp = await doFetch();
  if (resp.status === 429) {
    const ra = Number(resp.headers.get("retry-after") || "2");
    await new Promise((r) => setTimeout(r, Math.min(ra, 10) * 1000));
    resp = await doFetch();
  }
  const text = await resp.text();
  let json: unknown = null;
  if (text) {
    try { json = JSON.parse(text); } catch { json = { raw: text }; }
  }
  return { status: resp.status, json };
};

/** Strip HTML tags + decode the few entities that matter for legal text. */
function htmlToText(html: string): string {
  return html
    .replace(/<\s*(br|\/p|\/div|\/li|\/tr)\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

interface GraphMessageRow {
  id?: string;
  internetMessageId?: string;
  conversationId?: string;
  subject?: string;
  receivedDateTime?: string;
  hasAttachments?: boolean;
  bodyPreview?: string;
  body?: { contentType?: string; content?: string };
  from?: { emailAddress?: { name?: string; address?: string } };
}

function mapMessage(m: GraphMessageRow): InboundGraphMessage {
  const isHtml = (m.body?.contentType || "").toLowerCase() === "html";
  const rawBody = m.body?.content ?? "";
  const bodyText = (isHtml ? htmlToText(rawBody) : rawBody.trim()) || (m.bodyPreview ?? "").trim();
  return {
    id: m.id ?? "",
    internetMessageId: m.internetMessageId ?? null,
    conversationId: m.conversationId ?? null,
    fromName: m.from?.emailAddress?.name ?? null,
    fromEmail: m.from?.emailAddress?.address ?? null,
    subject: m.subject ?? "",
    bodyText,
    receivedDateTime: m.receivedDateTime ?? new Date(0).toISOString(),
    hasAttachments: !!m.hasAttachments,
  };
}

export interface PollMailboxOptions extends MailCallOptions {
  /** Only messages with receivedDateTime strictly greater than this. */
  sinceIso?: string | null;
  /** Page size (Graph caps at 1000; default 25). */
  top?: number;
}

/**
 * Read inbound messages from a mailbox, oldest-first, newer than
 * `sinceIso`. Delegated auth + audited. Throws the typed delegated-auth
 * errors when the service account isn't connected / is expired, and a
 * plain Error carrying the status on other Graph failures.
 */
export async function pollDelegatedMailbox(
  organizationId: string,
  mailbox: string,
  opts: PollMailboxOptions = {},
): Promise<InboundGraphMessage[]> {
  const http = opts.http ?? defaultHttp;
  const top = Math.min(Math.max(opts.top ?? 25, 1), 100);
  const { accessToken } = await getFreshDelegatedAccessToken(organizationId);

  const params = new URLSearchParams();
  params.set(
    "$select",
    "id,internetMessageId,conversationId,subject,from,receivedDateTime,bodyPreview,body,hasAttachments",
  );
  params.set("$orderby", "receivedDateTime asc");
  params.set("$top", String(top));
  if (opts.sinceIso) params.set("$filter", `receivedDateTime gt ${opts.sinceIso}`);
  const endpoint = `/users/${encodeURIComponent(mailbox)}/messages`;
  const url = `${GRAPH_BASE}${endpoint}?${params.toString()}`;

  return withGraphAudit(
    {
      organizationId,
      endpoint,
      method: "GET",
      tenantId: null,
      actor: opts.actor ?? null,
      metadata: { authMode: "delegated", mailbox },
    },
    async () => {
      const resp = await http({ method: "GET", url, accessToken });
      if (resp.status < 200 || resp.status >= 300) {
        const err = new Error(
          `Graph mailbox read failed (HTTP ${resp.status}) for ${mailbox}`,
        ) as Error & { statusCode?: number };
        err.statusCode = resp.status;
        throw err;
      }
      const value = ((resp.json as { value?: GraphMessageRow[] })?.value) ?? [];
      return value.map(mapMessage);
    },
  );
}

/**
 * Send a plain-text mail as the connected mailbox, optionally threaded
 * as a reply (In-Reply-To header). Delegated auth + audited.
 */
export async function sendDelegatedMail(
  organizationId: string,
  input: SendMailInput,
  opts: MailCallOptions = {},
): Promise<void> {
  const http = opts.http ?? defaultHttp;
  const { accessToken } = await getFreshDelegatedAccessToken(organizationId);
  const endpoint = `/users/${encodeURIComponent(input.mailbox)}/sendMail`;
  const url = `${GRAPH_BASE}${endpoint}`;

  const message: Record<string, unknown> = {
    subject: input.subject,
    body: { contentType: "Text", content: input.body },
    toRecipients: [{ emailAddress: { address: input.to } }],
  };
  if (input.inReplyToInternetMessageId) {
    message.internetMessageHeaders = [
      { name: "In-Reply-To", value: input.inReplyToInternetMessageId },
      { name: "References", value: input.inReplyToInternetMessageId },
    ];
  }

  await withGraphAudit(
    {
      organizationId,
      endpoint,
      method: "POST",
      tenantId: null,
      actor: opts.actor ?? null,
      metadata: { authMode: "delegated", mailbox: input.mailbox, to: input.to },
    },
    async () => {
      const resp = await http({
        method: "POST",
        url,
        accessToken,
        body: { message, saveToSentItems: true },
      });
      if (resp.status < 200 || resp.status >= 300) {
        const err = new Error(
          `Graph sendMail failed (HTTP ${resp.status}) for ${input.mailbox}`,
        ) as Error & { statusCode?: number };
        err.statusCode = resp.status;
        throw err;
      }
      return undefined;
    },
  );
}
