/**
 * POST /api/mcp — OneLegal MCP server endpoint (C-12).
 *
 * JSON-RPC 2.0 over HTTP. An external agent authenticates with a bearer token
 * (an `McpAccessToken`) and calls the read-only tools in lib/mcp/tools.ts.
 *
 * Gating, in order:
 *  1. **Flag.** If AEGIS_MCP_ENABLED is not set, the endpoint returns 404 — it
 *     is invisible, not merely closed. OFF by default.
 *  2. **Bearer token.** The `Authorization: Bearer <token>` value resolves to
 *     an org + scopes, or the request is 401. The org is taken from the token,
 *     never from the request body, so a token can only reach its own tenant.
 *
 * Every tools/call writes a chain-sealed `mcp.tool.called` audit row (AGENT
 * actor) inside the dispatcher.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { withRequestLog } from "@aegis/observability";
import { resolveMcpToken } from "../../../lib/mcp/tokens";
import { handleMcpMessage, isMcpEnabled, type JsonRpcRequest } from "../../../lib/mcp/server";

function extractBearer(req: NextApiRequest): string | null {
  const h = req.headers.authorization;
  if (typeof h === "string" && /^bearer\s+/i.test(h)) return h.replace(/^bearer\s+/i, "").trim();
  return null;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  // 1. Flag gate — invisible when off.
  if (!isMcpEnabled()) {
    return res.status(404).json({ error: "Not found" });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // 2. Bearer-token auth.
  const raw = extractBearer(req);
  if (!raw) {
    res.setHeader("WWW-Authenticate", "Bearer");
    return res.status(401).json({ error: "Missing bearer token" });
  }
  const token = await resolveMcpToken(raw);
  if (!token) {
    res.setHeader("WWW-Authenticate", "Bearer");
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  // Body is parsed by Next for application/json. We handle one JSON-RPC
  // message per request (the 2025-06-18 spec dropped array batching).
  const body = req.body;
  if (Array.isArray(body) || body === null || typeof body !== "object") {
    return res.status(200).json({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32600, message: "Invalid JSON-RPC 2.0 request." },
    });
  }

  const response = await handleMcpMessage(body as JsonRpcRequest, token);
  // A notification (no id) takes no reply.
  if (response === null) return res.status(202).end();
  return res.status(200).json(response);
}

export default withRequestLog(handler, "/api/mcp");
