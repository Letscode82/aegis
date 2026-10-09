/**
 * C-12 — OneLegal MCP server dispatch (JSON-RPC 2.0 over HTTP).
 *
 * Implements the minimal Model Context Protocol method set an external agent
 * needs to discover and call OneLegal's read-only tools: `initialize`, `ping`,
 * `tools/list`, `tools/call`, and the `notifications/*` no-ops. The HTTP route
 * (pages/api/mcp/index.ts) handles the flag gate + bearer-token auth and hands
 * each parsed message here with the already-resolved token.
 *
 * The whole surface is OFF by default — `isMcpEnabled()` must be explicitly
 * turned on (AEGIS_MCP_ENABLED=1). A valid token does nothing while the flag
 * is off.
 */
import { logAudit } from "@aegis/db";
import type { ResolvedMcpToken } from "./tokens";
import { getMcpTool, scopeAllows, toolsForScopes, McpToolInputError } from "./tools";

export const SERVER_PROTOCOL_VERSION = "2025-06-18";
export const SERVER_INFO = { name: "aegis-mcp", version: "0.1.0" } as const;

// JSON-RPC 2.0 error codes.
export const RPC = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

export interface JsonRpcRequest {
  jsonrpc?: unknown;
  id?: string | number | null;
  method?: unknown;
  params?: unknown;
}
export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}
export type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: string | number | null; result: unknown }
  | { jsonrpc: "2.0"; id: string | number | null; error: JsonRpcError };

/** Is the MCP server turned on? OFF unless AEGIS_MCP_ENABLED is 1/true/on. */
export function isMcpEnabled(): boolean {
  const v = (process.env.AEGIS_MCP_ENABLED ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "on";
}

function ok(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}
function err(id: string | number | null, code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: data === undefined ? { code, message } : { code, message, data } };
}

/**
 * Dispatch one JSON-RPC message. Returns the response object, or `null` for a
 * notification (no `id`) that takes no reply. Never throws — internal failures
 * become a JSON-RPC error response.
 */
export async function handleMcpMessage(
  msg: JsonRpcRequest,
  token: ResolvedMcpToken,
): Promise<JsonRpcResponse | null> {
  const id = (msg.id ?? null) as string | number | null;
  const isNotification = msg.id === undefined;

  if (msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    if (isNotification) return null;
    return err(id, RPC.INVALID_REQUEST, "Invalid JSON-RPC 2.0 request.");
  }
  const method = msg.method;

  // Notifications (e.g. notifications/initialized, notifications/cancelled)
  // are fire-and-forget: acknowledge by sending nothing back.
  if (method.startsWith("notifications/")) return null;

  try {
    switch (method) {
      case "initialize":
        return ok(id, {
          protocolVersion: SERVER_PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions:
            "OneLegal legal-operations read API. All tools are read-only and scoped to your organization.",
        });

      case "ping":
        return ok(id, {});

      case "tools/list":
        return ok(id, {
          tools: toolsForScopes(token.scopes).map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
        });

      case "tools/call": {
        if (isNotification) return null; // a call with no id is malformed; drop it
        const params = (msg.params ?? {}) as Record<string, unknown>;
        const name = typeof params.name === "string" ? params.name : "";
        const args = (params.arguments && typeof params.arguments === "object"
          ? (params.arguments as Record<string, unknown>)
          : {}) as Record<string, unknown>;
        if (!name) return err(id, RPC.INVALID_PARAMS, "Missing tool name.");

        const tool = getMcpTool(name);
        if (!tool || !scopeAllows(token.scopes, tool.scope)) {
          // Don't distinguish "unknown" from "not permitted" — same response.
          return err(id, RPC.INVALID_PARAMS, `Unknown or unavailable tool: ${name}`);
        }

        let isError = false;
        let payload: unknown;
        try {
          const result = await tool.handler(token.organizationId, args);
          payload = {
            content: [{ type: "text", text: safeJson(result) }],
            isError: false,
          };
        } catch (e) {
          isError = true;
          const message = e instanceof McpToolInputError ? e.message : "Tool execution failed.";
          payload = { content: [{ type: "text", text: message }], isError: true };
          if (!(e instanceof McpToolInputError)) {
            console.error(`[mcp] tool ${name} failed:`, e);
          }
        }

        // One chain-sealed audit row per call. AGENT actor (no User behind a
        // machine token); argument *keys* only — never values, which may carry
        // a free-text search query or other sensitive input.
        await logAudit({
          organizationId: token.organizationId,
          actorId: null,
          actorType: "AGENT",
          action: "mcp.tool.called",
          resourceType: "McpAccessToken",
          resourceId: token.id,
          metadata: {
            source: "mcp",
            tool: name,
            tokenLabel: token.label,
            argKeys: Object.keys(args),
            ok: !isError,
          },
        });

        return ok(id, payload);
      }

      default:
        if (isNotification) return null;
        return err(id, RPC.METHOD_NOT_FOUND, `Method not found: ${method}`);
    }
  } catch (e) {
    console.error(`[mcp] dispatch error on ${method}:`, e);
    if (isNotification) return null;
    return err(id, RPC.INTERNAL_ERROR, "Internal error.");
  }
}

/** Serialize a tool result to text, tolerating circular/huge structures. */
function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
