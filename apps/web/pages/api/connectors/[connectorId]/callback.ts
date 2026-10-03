/**
 * OAuth redirect target for a connector.
 *
 * GET with { code, state } (or { error }). Verifies the `state` CSRF cookie,
 * exchanges the code for a token set via the shared framework, persists it
 * encrypted through the DbTokenStore, stamps authorization provenance on the
 * row, and writes a chain-sealed `connector.connected` audit row. Renders a
 * small self-closing HTML page (the add-in/admin opened this in a popup).
 * Gated on admin:m365:manage.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { exchangeCodeForToken } from "@aegis/connectors";
import { logAudit, prisma } from "@aegis/db";
import { buildDescriptor, redirectUriFor, getTokenStore, oauthFetch } from "../../../../lib/connectors/runtime";
import { readStateCookie, clearStateCookie, statesMatch, encodeState } from "../../../../lib/connectors/oauth-state";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] || c);
}

function page(res: NextApiResponse, status: number, title: string, body: string): void {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(status).send(
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>` +
      `<style>body{font:15px -apple-system,sans-serif;background:#f6f5f2;color:#1c1b19;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}` +
      `.card{background:#fff;border:1px solid #e2e0d8;border-radius:12px;padding:28px 32px;max-width:420px;text-align:center}` +
      `h1{font-size:1.1rem;margin:0 0 8px}p{color:#6a675f;margin:0}</style></head>` +
      `<body><div class="card"><h1>${escapeHtml(title)}</h1><p>${body}</p></div>` +
      `<script>try{window.setTimeout(function(){window.close()},2500)}catch(e){}</script></body></html>`,
  );
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });

  const connectorId = String(req.query.connectorId || "");
  const cookieState = readStateCookie(req);
  clearStateCookie(res);

  try {
    assertUserCanDo(user, Permission.AdminM365Manage);

    const oauthError = typeof req.query.error === "string" ? req.query.error : "";
    if (oauthError) {
      return page(res, 400, "Connection failed", "The provider reported an authorization error. You can close this window and try again.");
    }

    const code = typeof req.query.code === "string" ? req.query.code : "";
    const queryState = typeof req.query.state === "string" ? req.query.state : "";
    if (!code) return page(res, 400, "Connection failed", "No authorization code was returned.");
    if (!statesMatch(cookieState, queryState) || queryState !== encodeState(connectorId, (queryState.split(".")[1] ?? ""))) {
      return page(res, 400, "Connection failed", "The authorization state did not match. Please restart the connection.");
    }

    const redirectUri = redirectUriFor(req, connectorId);
    const descriptor = buildDescriptor(connectorId, redirectUri);
    if (!descriptor) return page(res, 404, "Connection failed", "Unknown connector.");

    const token = await exchangeCodeForToken(descriptor.oauth, code, oauthFetch);
    await getTokenStore().put(user.organizationId, connectorId, token);
    await prisma.orgConnectorCredential.updateMany({
      where: { organizationId: user.organizationId, connectorId },
      data: {
        authorizedById: user.id,
        authorizedAt: new Date(),
        accountLabel: user.email ?? user.name ?? null,
      },
    });

    await logAudit({
      organizationId: user.organizationId,
      actorId: user.id,
      actorType: "USER",
      action: "connector.connected",
      resourceType: "OrgConnectorCredential",
      resourceId: connectorId,
      metadata: { connectorId, label: descriptor.label, scope: token.scope ?? null },
    });

    return page(res, 200, `${descriptor.label} connected`, "AEGIS is now connected. You can close this window.");
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    console.error("[connector-callback] token exchange failed:", err);
    return page(res, 500, "Connection failed", "Could not complete the connection. You can close this window and try again.");
  }
}
