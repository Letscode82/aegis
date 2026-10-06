/**
 * C-12 — MCP tool registry.
 *
 * The read-only surface the AEGIS MCP server exposes to authenticated external
 * agents. Each tool wraps a module's public `api.ts` read function (or a shared
 * package read). apps/web is the composition root, so importing across modules
 * here is allowed; the same pattern as apps/web/lib/one-legal/tools.ts.
 *
 * Two hard invariants:
 *  - **Org comes from the token, never from arguments.** Every handler takes
 *    the resolved `organizationId` as its first parameter and the caller's raw
 *    args second. No handler reads an org/tenant id out of `args`, so a token
 *    scoped to org A can never reach org B's data.
 *  - **Read-only.** Every function here is a pure read — no mutations, no audit
 *    rows of its own (the transport writes one `mcp.tool.called` audit row per
 *    call). Adding a tool that mutates requires the human-approval harness, not
 *    this registry.
 */
import {
  listMattersByOrganization,
  getMatterDashboardStats,
  getWorkloadReport,
  type MatterFilter,
} from "@aegis/matter";
import {
  listDsarRequests,
  getDsarDashboard,
  getPrivacyProgramSummary,
  type ListDsarFilters,
} from "@aegis/privacy";
import { getExecutiveOperationsSummary } from "@aegis/intake/ai-ops/exec-summary";
import { semanticSearch } from "@aegis/search";

export type JsonSchema = Record<string, unknown>;

export interface McpToolDef {
  /** Tool name as advertised over the wire (snake_case per MCP convention). */
  name: string;
  /** One-line human description shown in tools/list. */
  description: string;
  /** Scope a token must hold (or "*") to list and call this tool. */
  scope: string;
  /** JSON Schema for the tool's arguments (MCP `inputSchema`). */
  inputSchema: JsonSchema;
  /** Run the tool. `organizationId` is from the resolved token, never args. */
  handler: (organizationId: string, args: Record<string, unknown>) => Promise<unknown>;
}

// ---- small defensive coercers (args arrive untyped from JSON-RPC) ----
function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}
function bool(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return undefined;
}
function int(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}

export const MCP_TOOLS: McpToolDef[] = [
  {
    name: "list_matters",
    description: "List matters in the organization, optionally filtered by status, type, or a search query.",
    scope: "matter:read",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", description: "Matter status, e.g. OPEN, ACTIVE, CLOSED." },
        type: { type: "string", description: "Matter type, e.g. LITIGATION, CONTRACT." },
        searchQuery: { type: "string", description: "Free-text match on matter title/number." },
        pageSize: { type: "integer", description: "Max rows (default module default)." },
      },
      additionalProperties: false,
    },
    handler: (orgId, args) => {
      const filter: MatterFilter = {};
      const status = str(args.status);
      const type = str(args.type);
      const searchQuery = str(args.searchQuery);
      const pageSize = int(args.pageSize);
      if (status) filter.status = status as MatterFilter["status"];
      if (type) filter.type = type as MatterFilter["type"];
      if (searchQuery) filter.searchQuery = searchQuery;
      if (pageSize && pageSize > 0) filter.pageSize = Math.min(pageSize, 200);
      return listMattersByOrganization(orgId, filter);
    },
  },
  {
    name: "matter_dashboard",
    description: "Matter portfolio dashboard stats for the organization (counts by status, type, and recent activity).",
    scope: "matter:read",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: (orgId) => getMatterDashboardStats(orgId),
  },
  {
    name: "attorney_workload",
    description: "Per-attorney matter workload report for the organization.",
    scope: "matter:read",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: (orgId) => getWorkloadReport(orgId),
  },
  {
    name: "list_dsar_requests",
    description: "List data-subject access requests (DSARs) in the organization, optionally filtered by status or overdue-only.",
    scope: "privacy:read",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", description: "DSAR status, e.g. RECEIVED, IN_PROGRESS, FULFILLED." },
        overdueOnly: { type: "boolean", description: "Only requests past their statutory SLA." },
      },
      additionalProperties: false,
    },
    handler: (orgId, args) => {
      const filters: ListDsarFilters = {};
      const status = str(args.status);
      const overdueOnly = bool(args.overdueOnly);
      if (status) filters.status = status as ListDsarFilters["status"];
      if (overdueOnly !== undefined) filters.overdueOnly = overdueOnly;
      return listDsarRequests(orgId, filters);
    },
  },
  {
    name: "dsar_dashboard",
    description: "DSAR operations dashboard for the organization (volume by type/status/handler, queue health, trend).",
    scope: "privacy:read",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: (orgId) => getDsarDashboard(orgId),
  },
  {
    name: "privacy_program_summary",
    description: "Privacy program posture summary for the organization (ROPA, consent, incidents, assessments).",
    scope: "privacy:read",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: (orgId) => getPrivacyProgramSummary(orgId),
  },
  {
    name: "intake_exec_summary",
    description: "Executive intake-operations summary (queue health, throughput, attorney load, routing effectiveness).",
    scope: "intake:read",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: (orgId) => getExecutiveOperationsSummary(orgId),
  },
  {
    name: "semantic_search",
    description: "Semantic search across the organization's indexed documents and records. Returns ranked snippets.",
    scope: "search",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "The natural-language search query." },
        limit: { type: "integer", description: "Max hits (default 8, capped 50)." },
      },
      required: ["query"],
      additionalProperties: false,
    },
    handler: (orgId, args) => {
      const query = str(args.query);
      if (!query) throw new McpToolInputError("`query` is required.");
      const limit = int(args.limit);
      return semanticSearch({
        organizationId: orgId,
        query,
        ...(limit && limit > 0 ? { limit: Math.min(limit, 50) } : {}),
      });
    },
  },
];

export class McpToolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpToolInputError";
  }
}

const TOOLS_BY_NAME = new Map(MCP_TOOLS.map((t) => [t.name, t]));

export function getMcpTool(name: string): McpToolDef | undefined {
  return TOOLS_BY_NAME.get(name);
}

/** True when a token's scope list permits a tool. ["*"] permits everything. */
export function scopeAllows(tokenScopes: string[], toolScope: string): boolean {
  return tokenScopes.includes("*") || tokenScopes.includes(toolScope);
}

/** The tools a given scope list may see/call, as advertised in tools/list. */
export function toolsForScopes(tokenScopes: string[]): McpToolDef[] {
  return MCP_TOOLS.filter((t) => scopeAllows(tokenScopes, t.scope));
}
