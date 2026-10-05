/**
 * GET  /api/admin/mcp/tokens — list the org's MCP access tokens (no secrets).
 * POST /api/admin/mcp/tokens — mint a token. Body: { label, scopes[], expiresInDays? }.
 *
 * C-12 admin surface. Gated `admin:manage_users` (platform administration —
 * minting an inbound machine credential that can read org-wide data is an
 * owner/GC action). The raw token is returned ONCE in the POST response; only
 * its hash is stored. Mint / revoke write chain-sealed `mcp.token.*` audit rows.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { withRequestLog } from "@aegis/observability";
import { requireActor } from "../../../../lib/matter-actor";
import { listMcpTokens, mintMcpToken, McpTokenValidationError } from "../../../../lib/mcp/tokens";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const actor = await requireActor(req, res, Permission.AdminManageUsers);
    if (!actor) return;
    const tokens = await listMcpTokens(actor.organizationId);
    return res.status(200).json({ ok: true, tokens });
  }

  if (req.method === "POST") {
    const actor = await requireActor(req, res, Permission.AdminManageUsers);
    if (!actor) return;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const label = typeof body.label === "string" ? body.label : "";
    const scopes = Array.isArray(body.scopes) ? body.scopes.filter((s): s is string => typeof s === "string") : [];
    const expiresInDays = typeof body.expiresInDays === "number" ? body.expiresInDays : undefined;
    try {
      const minted = await mintMcpToken(actor.organizationId, { label, scopes, expiresInDays }, actor);
      return res.status(200).json({ ok: true, minted });
    } catch (err) {
      if (err instanceof McpTokenValidationError) return res.status(400).json({ ok: false, error: err.message });
      console.error("[/api/admin/mcp/tokens] mint failed:", err);
      return res.status(500).json({ ok: false, error: "Internal error" });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, error: "Method not allowed" });
}

export default withRequestLog(handler, "/api/admin/mcp/tokens");
