/**
 * C-12 — AEGIS MCP server unit tests.
 *
 * Covers the JSON-RPC dispatch (initialize / ping / tools.list / tools.call /
 * notifications / errors), the scope model, the flag gate, and the token
 * store (resolve / mint / revoke). The underlying module reads are mocked so
 * these stay pure unit tests — no DB, no Next runtime.
 *
 * The load-bearing security assertions:
 *  - a tools/call runs the handler with the TOKEN's org, never an org id from
 *    the caller's arguments;
 *  - a tool outside the token's scopes is unreachable;
 *  - every call writes an AGENT audit row carrying argument KEYS, not values.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

// ---- mocks (tools.ts imports these module reads; server.ts imports logAudit) ----
const logAuditMock = vi.fn();
const findUniqueMock = vi.fn();
const findFirstMock = vi.fn();
const findManyMock = vi.fn();
const createMock = vi.fn();
const updateMock = vi.fn();

const listMattersMock = vi.fn();
const matterDashboardMock = vi.fn();
const workloadMock = vi.fn();
const listDsarMock = vi.fn();
const dsarDashboardMock = vi.fn();
const privacyProgramMock = vi.fn();
const execSummaryMock = vi.fn();
const semanticSearchMock = vi.fn();

vi.mock("@aegis/db", () => ({
  logAudit: logAuditMock,
  sha256Hex: (raw: string) => createHash("sha256").update(raw, "utf8").digest("hex"),
  prisma: {
    mcpAccessToken: {
      findUnique: findUniqueMock,
      findFirst: findFirstMock,
      findMany: findManyMock,
      create: createMock,
      update: updateMock,
    },
  },
}));
vi.mock("@aegis/matter", () => ({
  listMattersByOrganization: listMattersMock,
  getMatterDashboardStats: matterDashboardMock,
  getWorkloadReport: workloadMock,
}));
vi.mock("@aegis/privacy", () => ({
  listDsarRequests: listDsarMock,
  getDsarDashboard: dsarDashboardMock,
  getPrivacyProgramSummary: privacyProgramMock,
}));
vi.mock("@aegis/intake/ai-ops/exec-summary", () => ({
  getExecutiveOperationsSummary: execSummaryMock,
}));
vi.mock("@aegis/search", () => ({
  semanticSearch: semanticSearchMock,
}));

const {
  handleMcpMessage,
  isMcpEnabled,
  SERVER_PROTOCOL_VERSION,
  RPC,
} = await import("../lib/mcp/server");
const { scopeAllows, toolsForScopes, MCP_TOOLS } = await import("../lib/mcp/tools");
const {
  mintMcpToken,
  resolveMcpToken,
  revokeMcpToken,
  normalizeScopes,
  McpTokenValidationError,
  McpTokenNotFoundError,
} = await import("../lib/mcp/tokens");

const WILDCARD = { id: "tok1", organizationId: "org1", label: "all", scopes: ["*"] };
const MATTER_ONLY = { id: "tok2", organizationId: "org1", label: "matter", scopes: ["matter:read"] };

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.AEGIS_MCP_ENABLED;
});
afterEach(() => {
  delete process.env.AEGIS_MCP_ENABLED;
});

describe("isMcpEnabled", () => {
  it("is off by default and on only for 1/true/on", () => {
    expect(isMcpEnabled()).toBe(false);
    for (const v of ["1", "true", "TRUE", "on"]) { process.env.AEGIS_MCP_ENABLED = v; expect(isMcpEnabled()).toBe(true); }
    for (const v of ["0", "false", "no", ""]) { process.env.AEGIS_MCP_ENABLED = v; expect(isMcpEnabled()).toBe(false); }
  });
});

describe("scope model", () => {
  it("wildcard allows every tool; a narrow scope allows only its own", () => {
    expect(scopeAllows(["*"], "privacy:read")).toBe(true);
    expect(scopeAllows(["matter:read"], "privacy:read")).toBe(false);
    expect(scopeAllows(["matter:read"], "matter:read")).toBe(true);
    expect(toolsForScopes(["*"]).length).toBe(MCP_TOOLS.length);
    const matterTools = toolsForScopes(["matter:read"]);
    expect(matterTools.every((t) => t.scope === "matter:read")).toBe(true);
    expect(matterTools.length).toBe(3); // list_matters, matter_dashboard, attorney_workload
  });

  it("normalizeScopes trims, de-dupes, and collapses a wildcard", () => {
    expect(normalizeScopes([" matter:read ", "matter:read", "search"])).toEqual(["matter:read", "search"]);
    expect(normalizeScopes(["matter:read", "*"])).toEqual(["*"]);
    expect(normalizeScopes([" ", ""])).toEqual([]);
    expect(normalizeScopes(undefined)).toEqual([]);
  });
});

describe("handleMcpMessage — protocol", () => {
  it("initialize returns the protocol version + serverInfo", async () => {
    const r = await handleMcpMessage({ jsonrpc: "2.0", id: 1, method: "initialize" }, WILDCARD);
    expect(r).toMatchObject({ id: 1, result: { protocolVersion: SERVER_PROTOCOL_VERSION, serverInfo: { name: "aegis-mcp" } } });
  });

  it("ping returns an empty result", async () => {
    const r = await handleMcpMessage({ jsonrpc: "2.0", id: "p", method: "ping" }, WILDCARD);
    expect(r).toEqual({ jsonrpc: "2.0", id: "p", result: {} });
  });

  it("a notification (no id) gets no response", async () => {
    const r = await handleMcpMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, WILDCARD);
    expect(r).toBeNull();
  });

  it("a malformed request is INVALID_REQUEST", async () => {
    const r = await handleMcpMessage({ jsonrpc: "1.0", id: 9, method: "ping" } as never, WILDCARD);
    expect(r).toMatchObject({ id: 9, error: { code: RPC.INVALID_REQUEST } });
  });

  it("an unknown method is METHOD_NOT_FOUND", async () => {
    const r = await handleMcpMessage({ jsonrpc: "2.0", id: 2, method: "resources/list" }, WILDCARD);
    expect(r).toMatchObject({ id: 2, error: { code: RPC.METHOD_NOT_FOUND } });
  });

  it("tools/list is filtered to the token's scopes", async () => {
    const r = await handleMcpMessage({ jsonrpc: "2.0", id: 3, method: "tools/list" }, MATTER_ONLY);
    const tools = (r as { result: { tools: { name: string }[] } }).result.tools;
    expect(tools.length).toBe(3);
    expect(tools.map((t) => t.name).sort()).toEqual(["attorney_workload", "list_matters", "matter_dashboard"]);
  });
});

describe("handleMcpMessage — tools/call", () => {
  it("rejects an unknown tool without running or auditing", async () => {
    const r = await handleMcpMessage({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "nope" } }, WILDCARD);
    expect(r).toMatchObject({ id: 4, error: { code: RPC.INVALID_PARAMS } });
    expect(logAuditMock).not.toHaveBeenCalled();
  });

  it("rejects a tool outside the token's scopes (same response as unknown)", async () => {
    const r = await handleMcpMessage({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "dsar_dashboard" } }, MATTER_ONLY);
    expect(r).toMatchObject({ id: 5, error: { code: RPC.INVALID_PARAMS } });
    expect(dsarDashboardMock).not.toHaveBeenCalled();
    expect(logAuditMock).not.toHaveBeenCalled();
  });

  it("runs a permitted tool with the TOKEN's org (never an org from args) and audits keys-not-values", async () => {
    listMattersMock.mockResolvedValueOnce({ rows: [{ id: "m1" }], page: 1, pageSize: 50, total: 1 });
    const r = await handleMcpMessage(
      { jsonrpc: "2.0", id: 6, method: "tools/call",
        params: { name: "list_matters", arguments: { status: "ACTIVE", organizationId: "EVIL-ORG" } } },
      MATTER_ONLY,
    );
    // org-binding: handler called with the token org, not the injected one
    expect(listMattersMock).toHaveBeenCalledTimes(1);
    const mattersCall = listMattersMock.mock.calls[0]!;
    expect(mattersCall[0]).toBe("org1");
    expect(mattersCall[1]).toMatchObject({ status: "ACTIVE" });
    // result wrapped as MCP content
    const result = (r as { result: { content: { type: string; text: string }[]; isError: boolean } }).result;
    expect(result.isError).toBe(false);
    expect(result.content[0]!.type).toBe("text");
    expect(result.content[0]!.text).toContain("m1");
    // audit: AGENT actor, arg KEYS only (no "ACTIVE"/"EVIL-ORG" values leaked)
    expect(logAuditMock).toHaveBeenCalledTimes(1);
    const audit = logAuditMock.mock.calls[0]![0];
    expect(audit).toMatchObject({ actorType: "AGENT", actorId: null, action: "mcp.tool.called", resourceId: "tok2" });
    expect(audit.metadata.tool).toBe("list_matters");
    expect(audit.metadata.argKeys.sort()).toEqual(["organizationId", "status"]);
    expect(JSON.stringify(audit.metadata)).not.toContain("EVIL-ORG");
    expect(audit.metadata.ok).toBe(true);
  });

  it("a handler failure becomes an isError result and audits ok:false", async () => {
    workloadMock.mockRejectedValueOnce(new Error("boom"));
    const r = await handleMcpMessage(
      { jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "attorney_workload" } },
      MATTER_ONLY,
    );
    const result = (r as { result: { isError: boolean } }).result;
    expect(result.isError).toBe(true);
    expect(logAuditMock.mock.calls[0]![0].metadata.ok).toBe(false);
  });

  it("missing tool name is INVALID_PARAMS", async () => {
    const r = await handleMcpMessage({ jsonrpc: "2.0", id: 8, method: "tools/call", params: {} }, WILDCARD);
    expect(r).toMatchObject({ id: 8, error: { code: RPC.INVALID_PARAMS } });
  });

  it("semantic_search requires a query (tool-level isError, not a crash)", async () => {
    const r = await handleMcpMessage({ jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "semantic_search", arguments: {} } }, WILDCARD);
    const result = (r as { result: { isError: boolean; content: { text: string }[] } }).result;
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("query");
    expect(semanticSearchMock).not.toHaveBeenCalled();
  });
});

describe("token store", () => {
  it("mint rejects a missing label or empty scopes", async () => {
    await expect(mintMcpToken("org1", { label: "", scopes: ["matter:read"] }, { id: "u1", organizationId: "org1" }))
      .rejects.toBeInstanceOf(McpTokenValidationError);
    await expect(mintMcpToken("org1", { label: "x", scopes: [] }, { id: "u1", organizationId: "org1" }))
      .rejects.toBeInstanceOf(McpTokenValidationError);
  });

  it("mint stores the hash, returns a prefixed raw token once, and audits", async () => {
    createMock.mockResolvedValueOnce({ id: "tokN" });
    const minted = await mintMcpToken("org1", { label: " Acme agent ", scopes: ["matter:read", "matter:read"] }, { id: "u1", organizationId: "org1" });
    expect(minted.rawToken.startsWith("aegis_mcp_")).toBe(true);
    expect(minted.scopes).toEqual(["matter:read"]); // de-duped
    const createArgs = createMock.mock.calls[0]![0].data;
    expect(createArgs.label).toBe("Acme agent");
    expect(createArgs.tokenHash).toBe(createHash("sha256").update(minted.rawToken, "utf8").digest("hex"));
    expect(createArgs.tokenHash).not.toContain("aegis_mcp_"); // hash, not the raw value
    expect(logAuditMock).toHaveBeenCalledWith(expect.objectContaining({ action: "mcp.token.minted", actorType: "USER" }));
  });

  it("resolve rejects a non-prefixed token without hitting the DB", async () => {
    expect(await resolveMcpToken("not-a-token")).toBeNull();
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it("resolve returns null for unknown / revoked, and lazily expires an overdue ACTIVE token", async () => {
    findUniqueMock.mockResolvedValueOnce(null);
    expect(await resolveMcpToken("aegis_mcp_x")).toBeNull();

    findUniqueMock.mockResolvedValueOnce({ id: "t", organizationId: "org1", status: "REVOKED", expiresAt: new Date(Date.now() + 1e6), label: "l", scopes: [] });
    expect(await resolveMcpToken("aegis_mcp_y")).toBeNull();

    findUniqueMock.mockResolvedValueOnce({ id: "t", organizationId: "org1", status: "ACTIVE", expiresAt: new Date(Date.now() - 1000), label: "l", scopes: [] });
    expect(await resolveMcpToken("aegis_mcp_z")).toBeNull();
    expect(updateMock).toHaveBeenCalledWith({ where: { id: "t" }, data: { status: "EXPIRED" } });
  });

  it("resolve returns org + scopes for a valid token and stamps lastUsedAt", async () => {
    findUniqueMock.mockResolvedValueOnce({ id: "t", organizationId: "org9", status: "ACTIVE", expiresAt: new Date(Date.now() + 1e6), label: "agent", scopes: ["matter:read"] });
    const res = await resolveMcpToken("aegis_mcp_valid");
    expect(res).toEqual({ id: "t", organizationId: "org9", label: "agent", scopes: ["matter:read"] });
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "t" } }));
  });

  it("revoke throws when missing, no-ops a non-ACTIVE token, and audits an ACTIVE one", async () => {
    findFirstMock.mockResolvedValueOnce(null);
    await expect(revokeMcpToken("org1", "x", { id: "u1", organizationId: "org1" })).rejects.toBeInstanceOf(McpTokenNotFoundError);

    findFirstMock.mockResolvedValueOnce({ id: "t", status: "REVOKED", label: "l" });
    await revokeMcpToken("org1", "t", { id: "u1", organizationId: "org1" });
    expect(updateMock).not.toHaveBeenCalled();
    expect(logAuditMock).not.toHaveBeenCalled();

    findFirstMock.mockResolvedValueOnce({ id: "t", status: "ACTIVE", label: "l" });
    await revokeMcpToken("org1", "t", { id: "u1", organizationId: "org1" });
    expect(updateMock).toHaveBeenCalledWith({ where: { id: "t" }, data: { status: "REVOKED" } });
    expect(logAuditMock).toHaveBeenCalledWith(expect.objectContaining({ action: "mcp.token.revoked" }));
  });
});
