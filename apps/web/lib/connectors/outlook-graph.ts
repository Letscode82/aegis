/**
 * Outlook email triage over the shared connector token store (C-2).
 *
 * The matter module already ships a delegated-Graph mailbox poller backed by
 * `OrganizationM365Credential`. C-2 adds the connector-framework-native path:
 * the org connects Outlook through the shared OAuth routes (token persisted in
 * `OrgConnectorCredential` via `DbTokenStore`), and this poller reads the
 * mailbox using that token — refreshed on demand through `getValidAccessToken`
 * — then hands each message to the SAME `ingestInboundEmail` pipeline via the
 * `MailPoller` seam `pollMailboxForIntake` already exposes. No new ingest path,
 * no matter-module M365 dependency.
 */
import { getValidAccessToken, refreshAccessToken, needsRefresh, OUTLOOK_CONNECTOR_ID } from "@aegis/connectors";
import type { InboundGraphMessage } from "@aegis/matter";
import { getTokenStore, buildDescriptor, oauthFetch } from "./runtime";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export class OutlookConnectorNotConnectedError extends Error {
  constructor() {
    super("Outlook is not connected for this organization. Connect it under Connectors first.");
    this.name = "OutlookConnectorNotConnectedError";
  }
}

/**
 * A valid Outlook access token for the org, refreshed through the connector
 * store when near expiry. Returns null when the org has not connected Outlook.
 */
export async function getOutlookAccessToken(organizationId: string): Promise<string | null> {
  // The refresh grant does not use the redirect URI, so a placeholder is fine.
  const descriptor = buildDescriptor(OUTLOOK_CONNECTOR_ID, "about:blank");
  if (!descriptor) return null;
  return getValidAccessToken({
    organizationId,
    connectorId: OUTLOOK_CONNECTOR_ID,
    store: getTokenStore(),
    refresh: (refreshToken) => refreshAccessToken(descriptor.oauth, refreshToken, oauthFetch),
    needsRefresh: (token) => needsRefresh(token),
  });
}

interface GraphEmailAddress {
  name?: unknown;
  address?: unknown;
}
interface GraphMessage {
  id?: unknown;
  internetMessageId?: unknown;
  conversationId?: unknown;
  from?: { emailAddress?: GraphEmailAddress } | null;
  subject?: unknown;
  body?: { content?: unknown; contentType?: unknown } | null;
  bodyPreview?: unknown;
  receivedDateTime?: unknown;
  hasAttachments?: unknown;
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** Map a Graph `/messages` collection to the intake pipeline's message shape. Pure. */
export function mapGraphMessages(value: unknown): InboundGraphMessage[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw): InboundGraphMessage => {
    const m = (raw ?? {}) as GraphMessage;
    const addr = m.from?.emailAddress ?? {};
    const bodyText = str(m.body?.content) || str(m.bodyPreview);
    return {
      id: str(m.id),
      internetMessageId: strOrNull(m.internetMessageId),
      conversationId: strOrNull(m.conversationId),
      fromName: strOrNull(addr.name),
      fromEmail: strOrNull(addr.address),
      subject: str(m.subject),
      bodyText,
      receivedDateTime: str(m.receivedDateTime) || new Date(0).toISOString(),
      hasAttachments: m.hasAttachments === true,
    };
  });
}

function buildMessagesUrl(mailbox: string, sinceIso: string | null | undefined): string {
  const url = new URL(`${GRAPH_BASE}/users/${encodeURIComponent(mailbox)}/messages`);
  url.searchParams.set(
    "$select",
    "id,internetMessageId,conversationId,from,subject,body,bodyPreview,receivedDateTime,hasAttachments",
  );
  url.searchParams.set("$top", "25");
  url.searchParams.set("$orderby", "receivedDateTime desc");
  if (sinceIso) url.searchParams.set("$filter", `receivedDateTime gt ${sinceIso}`);
  return url.toString();
}

/**
 * `MailPoller` backed by the Outlook connector token. Throws
 * `OutlookConnectorNotConnectedError` when the org hasn't connected Outlook so
 * `pollMailboxForIntake` records it on the mailbox row.
 */
export async function connectorOutlookPoller(
  organizationId: string,
  mailbox: string,
  opts?: { sinceIso?: string | null },
): Promise<InboundGraphMessage[]> {
  const token = await getOutlookAccessToken(organizationId);
  if (!token) throw new OutlookConnectorNotConnectedError();

  const res = await fetch(buildMessagesUrl(mailbox, opts?.sinceIso), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      // Ask Graph to return the body as plain text.
      Prefer: 'outlook.body-content-type="text"',
    },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Graph /messages returned ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }
  const json = (await res.json()) as { value?: unknown };
  return mapGraphMessages(json.value);
}
