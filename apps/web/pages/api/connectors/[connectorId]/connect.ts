/**
 * Start the OAuth authorization-code flow for a connector.
 *
 *   GET  → 302 redirect to the Microsoft consent page (click-through).
 *   POST → { ok, authorizeUrl } for a UI / add-in dialog to open.
 *
 * Mints a `state` nonce, stores it in a CSRF cookie, and composes the consent
 * URL via the shared framework. Requires a confidential client
 * (M365_CLIENT_SECRET) — the dev PKCE public-client path is a follow-up. Gated
 * on admin:m365:manage.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { buildAuthorizeUrl } from "@aegis/connectors";
import { buildDescriptor, redirectUriFor, isConnectorConfigured } from "../../../../lib/connectors/runtime";
import { makeNonce, encodeState, setStateCookie } from "../../../../lib/connectors/oauth-state";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });

  const connectorId = String(req.query.connectorId || "");
  try {
    assertUserCanDo(user, Permission.AdminM365Manage);
    if (!isConnectorConfigured()) {
      return res.status(503).json({ ok: false, error: "Connector not configured — set M365_CLIENT_ID / M365_TENANT_ID." });
    }
    const redirectUri = redirectUriFor(req, connectorId);
    const descriptor = buildDescriptor(connectorId, redirectUri);
    if (!descriptor) return res.status(404).json({ ok: false, error: `Unknown connector "${connectorId}"` });
    if (!descriptor.oauth.clientSecret) {
      return res.status(503).json({
        ok: false,
        error: "Connector requires a confidential client — set M365_CLIENT_SECRET.",
      });
    }

    const nonce = makeNonce();
    const state = encodeState(connectorId, nonce);
    const authorizeUrl = buildAuthorizeUrl(descriptor.oauth, { state });
    setStateCookie(res, state);

    if (req.method === "GET") {
      res.setHeader("Location", authorizeUrl);
      return res.status(302).end();
    }
    return res.status(200).json({ ok: true, authorizeUrl });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(500).json({ ok: false, error: String((err as Error).message || err) });
  }
}
