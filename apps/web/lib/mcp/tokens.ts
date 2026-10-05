/**
 * C-12 — MCP access-token store.
 *
 * Inbound machine credentials for the AEGIS MCP server. Same hashed-token
 * posture as the login-less portals (DSAR / contract-review / client-portal):
 * only the SHA-256 hash of the raw bearer token is stored, the raw value is
 * returned exactly once at mint time, and validity + org + scopes are
 * re-derived from the row on every request — never trusted from caller input.
 *
 * The token binds every MCP request to exactly one organization. The MCP
 * tools read that org id from the resolved token, so an external caller can
 * never reach another tenant's data by passing a different id in arguments.
 *
 * Lives in apps/web (the composition root) because it's a platform concern,
 * not a product module — it uses the shared @aegis/db singleton directly, the
 * same way apps/web/lib/one-legal/* already does.
 */
import { randomBytes } from "node:crypto";
import { prisma, logAudit, sha256Hex } from "@aegis/db";

const DEFAULT_EXPIRY_DAYS = 90;
const TOKEN_PREFIX = "aegis_mcp_";

/** Raw bearer token: a recognizable prefix + 32 base64url chars of entropy.
 *  The prefix lets a leaked token be spotted and scanned for; it is part of
 *  the value that gets hashed, so it doesn't weaken anything. */
function generateRawToken(): string {
  return TOKEN_PREFIX + randomBytes(24).toString("base64url");
}
function hashToken(raw: string): string {
  return sha256Hex(raw);
}

export interface McpTokenActor {
  id: string;
  organizationId: string;
}

export interface MintedMcpToken {
  id: string;
  rawToken: string;
  label: string;
  scopes: string[];
  expiresAt: string;
}

export interface McpTokenSummary {
  id: string;
  label: string;
  scopes: string[];
  status: string;
  expiresAt: string;
  lastUsedAt: string | null;
  createdAt: string;
}

/** The resolved identity behind an authenticated MCP request. No User row —
 *  the token is a machine credential — so downstream audit uses an AGENT
 *  actor carrying this token's id + label. */
export interface ResolvedMcpToken {
  id: string;
  organizationId: string;
  label: string;
  scopes: string[];
}

export class McpTokenNotFoundError extends Error {
  constructor(id: string) {
    super(`MCP token ${id} not found`);
    this.name = "McpTokenNotFoundError";
  }
}
export class McpTokenValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpTokenValidationError";
  }
}

/** Mint a token for an org. Returns the raw value ONCE; only its hash is
 *  persisted. `scopes` must be a non-empty list of tool scopes or ["*"]. */
export async function mintMcpToken(
  organizationId: string,
  opts: { label?: string; scopes?: string[]; expiresInDays?: number },
  actor: McpTokenActor,
): Promise<MintedMcpToken> {
  const label = (opts.label ?? "").trim();
  if (!label) throw new McpTokenValidationError("A label is required.");
  const scopes = normalizeScopes(opts.scopes);
  if (scopes.length === 0) throw new McpTokenValidationError("At least one scope is required.");

  const rawToken = generateRawToken();
  const days = opts.expiresInDays && opts.expiresInDays > 0 ? opts.expiresInDays : DEFAULT_EXPIRY_DAYS;
  const expiresAt = new Date(Date.now() + days * 86_400_000);

  const row = await prisma.mcpAccessToken.create({
    data: {
      organizationId,
      tokenHash: hashToken(rawToken),
      label,
      scopes,
      expiresAt,
      createdById: actor.id,
    },
  });

  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: "USER",
    action: "mcp.token.minted",
    resourceType: "McpAccessToken",
    resourceId: row.id,
    afterJson: { label, scopes, expiresAt: expiresAt.toISOString() },
    metadata: { source: "mcp-admin" },
  });

  return { id: row.id, rawToken, label, scopes, expiresAt: expiresAt.toISOString() };
}

/** Resolve a raw bearer token to its org + scopes, or null for any invalid /
 *  revoked / expired token (never leaks which). Lazily flips an expired
 *  ACTIVE row to EXPIRED and stamps lastUsedAt on a valid hit. */
export async function resolveMcpToken(rawToken: string): Promise<ResolvedMcpToken | null> {
  const raw = (rawToken || "").trim();
  if (!raw.startsWith(TOKEN_PREFIX)) return null;
  const row = await prisma.mcpAccessToken.findUnique({ where: { tokenHash: hashToken(raw) } });
  if (!row) return null;

  const now = Date.now();
  if (row.status === "ACTIVE" && row.expiresAt.getTime() <= now) {
    await prisma.mcpAccessToken.update({ where: { id: row.id }, data: { status: "EXPIRED" } });
    return null;
  }
  if (row.status !== "ACTIVE") return null;

  await prisma.mcpAccessToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date(now) } });

  return { id: row.id, organizationId: row.organizationId, label: row.label, scopes: row.scopes };
}

/** Revoke a token. Non-ACTIVE tokens are left as-is (idempotent-ish). */
export async function revokeMcpToken(
  organizationId: string,
  tokenId: string,
  actor: McpTokenActor,
): Promise<void> {
  const row = await prisma.mcpAccessToken.findFirst({
    where: { id: tokenId, organizationId },
    select: { id: true, status: true, label: true },
  });
  if (!row) throw new McpTokenNotFoundError(tokenId);
  if (row.status !== "ACTIVE") return;

  await prisma.mcpAccessToken.update({ where: { id: row.id }, data: { status: "REVOKED" } });
  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: "USER",
    action: "mcp.token.revoked",
    resourceType: "McpAccessToken",
    resourceId: row.id,
    beforeJson: { status: "ACTIVE" },
    afterJson: { status: "REVOKED" },
    metadata: { source: "mcp-admin", label: row.label },
  });
}

/** List an org's tokens (newest first). Never returns the hash or raw value. */
export async function listMcpTokens(organizationId: string): Promise<McpTokenSummary[]> {
  const rows = await prisma.mcpAccessToken.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, label: true, scopes: true, status: true,
      expiresAt: true, lastUsedAt: true, createdAt: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    scopes: r.scopes,
    status: r.status,
    expiresAt: r.expiresAt.toISOString(),
    lastUsedAt: r.lastUsedAt ? r.lastUsedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  }));
}

/** Trim, de-dupe, drop empties. ["*"] (or a list containing "*") collapses to
 *  the all-tools wildcard. */
export function normalizeScopes(input: string[] | undefined): string[] {
  const list = (input ?? []).map((s) => (typeof s === "string" ? s.trim() : "")).filter(Boolean);
  if (list.includes("*")) return ["*"];
  return Array.from(new Set(list));
}
