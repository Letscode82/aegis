/**
 * DELETE /api/admin/mcp/tokens/[tokenId] — revoke an MCP access token.
 *
 * C-12. Gated `admin:manage_users`; writes a chain-sealed `mcp.token.revoked`
 * audit row. Revoking a non-ACTIVE token is a no-op.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { withRequestLog } from "@aegis/observability";
import { requireActor } from "../../../../../lib/matter-actor";
import { revokeMcpToken, McpTokenNotFoundError } from "../../../../../lib/mcp/tokens";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "DELETE") {
    res.setHeader("Allow", "DELETE");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const actor = await requireActor(req, res, Permission.AdminManageUsers);
  if (!actor) return;

  const tokenId = typeof req.query.tokenId === "string" ? req.query.tokenId : "";
  if (!tokenId) return res.status(400).json({ ok: false, error: "Missing token id" });

  try {
    await revokeMcpToken(actor.organizationId, tokenId, actor);
    return res.status(200).json({ ok: true });
  } catch (err) {
    if (err instanceof McpTokenNotFoundError) return res.status(404).json({ ok: false, error: err.message });
    console.error("[/api/admin/mcp/tokens/[tokenId]] revoke failed:", err);
    return res.status(500).json({ ok: false, error: "Internal error" });
  }
}

export default withRequestLog(handler, "/api/admin/mcp/tokens/[tokenId]");
