/**
 * C-10 — login-less client portal.
 *
 * A white-label self-service link that lets a business-user / client contact
 * (a Person who is a party on one or more matters) see a scoped, read-only
 * view of those matters — status, open-task count, and active legal holds —
 * without an authenticated AEGIS account.
 *
 * Same posture as the DSAR + contract-review portals: only the SHA-256 hash
 * of the raw token is stored; the raw token lives once in the shared URL;
 * validity (status + expiry) and scope (the person's MatterParty rows) are
 * re-derived from the database on every call, never trusted from the caller.
 * The public resolve path takes no actor — the token IS the gate — and writes
 * a chain-sealed AuditLog row with a SYSTEM actor. Minting and revoking are
 * internal, gated at the route and attributed to the issuing MatterActor.
 */
import { randomBytes } from "node:crypto";
import { prisma, logAudit, sha256Hex } from "@aegis/db";
import type { MatterActor } from "../types";

const DEFAULT_EXPIRY_DAYS = 30;
const ACTIVE_HOLD_STATUSES = ["ISSUED", "ACTIVE", "PARTIALLY_RELEASED"] as const;
const OPEN_TASK_STATUSES = ["PENDING", "IN_PROGRESS"] as const;

function generateRawToken(): string {
  return randomBytes(24).toString("base64url");
}
function hashToken(raw: string): string {
  return sha256Hex(raw);
}
/** Build the portal URL. Relative when no base is configured (an email needs
 *  an absolute URL — set APP_BASE_URL / NEXT_PUBLIC_APP_URL). */
function portalUrl(rawToken: string): string {
  const base = (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  return `${base}/client-portal/${rawToken}`;
}

export class ClientPortalPersonNotFoundError extends Error {
  constructor(id: string) {
    super(`Person ${id} not found in this organization`);
    this.name = "ClientPortalPersonNotFoundError";
  }
}
export class ClientPortalTokenNotFoundError extends Error {
  constructor(id: string) {
    super(`Client portal token ${id} not found`);
    this.name = "ClientPortalTokenNotFoundError";
  }
}

export interface MintedClientPortalToken {
  id: string;
  rawToken: string;
  url: string;
  expiresAt: string;
}

export interface ClientPortalMatterView {
  id: string;
  number: string | null;
  title: string;
  type: string;
  status: string;
  role: string;
  openTasks: number;
  activeHolds: number;
}

export interface ClientPortalView {
  organizationName: string;
  personName: string;
  matters: ClientPortalMatterView[];
  generatedAt: string;
}

export interface ClientPortalRecipient {
  personId: string;
  name: string;
  email: string | null;
  matterCount: number;
  token: { id: string; status: string; expiresAt: string; lastViewedAt: string | null } | null;
}

/** Issue a portal link for a client Person. At most one ACTIVE token per
 *  person — issuing a new one supersedes (revokes) any existing ACTIVE one so
 *  an old link can't outlive its replacement. */
export async function mintClientPortalTokenService(
  organizationId: string,
  personId: string,
  opts: { label?: string; expiresInDays?: number },
  actor: MatterActor,
): Promise<MintedClientPortalToken> {
  const person = await prisma.person.findFirst({
    where: { id: personId, organizationId },
    select: { id: true, name: true },
  });
  if (!person) throw new ClientPortalPersonNotFoundError(personId);

  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const days = opts.expiresInDays && opts.expiresInDays > 0 ? opts.expiresInDays : DEFAULT_EXPIRY_DAYS;
  const expiresAt = new Date(Date.now() + days * 86_400_000);

  const row = await prisma.$transaction(async (tx) => {
    await tx.clientPortalToken.updateMany({
      where: { organizationId, personId, status: "ACTIVE" },
      data: { status: "REVOKED" },
    });
    return tx.clientPortalToken.create({
      data: {
        organizationId,
        personId,
        tokenHash,
        label: opts.label?.trim() || null,
        expiresAt,
        createdById: actor.id,
      },
    });
  });

  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: "USER",
    action: "matter.portal.invited",
    resourceType: "Person",
    resourceId: personId,
    afterJson: { tokenId: row.id, personName: person.name, expiresAt: expiresAt.toISOString() },
    metadata: { source: "client-portal", tokenId: row.id },
  });

  return { id: row.id, rawToken, url: portalUrl(rawToken), expiresAt: expiresAt.toISOString() };
}

/** Public resolve — token is the gate. Returns null for any invalid / revoked
 *  / expired token (never leaks which). Lazily flips an expired ACTIVE row to
 *  EXPIRED, stamps view timestamps, and writes a SYSTEM-actor audit row. */
export async function resolveClientPortalService(rawToken: string): Promise<ClientPortalView | null> {
  const raw = (rawToken || "").trim();
  if (!raw) return null;
  const row = await prisma.clientPortalToken.findUnique({ where: { tokenHash: hashToken(raw) } });
  if (!row) return null;

  const now = new Date();
  if (row.status === "ACTIVE" && row.expiresAt.getTime() <= now.getTime()) {
    await prisma.clientPortalToken.update({ where: { id: row.id }, data: { status: "EXPIRED" } });
    return null;
  }
  if (row.status !== "ACTIVE") return null;

  const [org, person, parties] = await Promise.all([
    prisma.organization.findUnique({ where: { id: row.organizationId }, select: { name: true } }),
    prisma.person.findUnique({ where: { id: row.personId }, select: { name: true } }),
    prisma.matterParty.findMany({
      where: { personId: row.personId, matter: { organizationId: row.organizationId } },
      select: {
        role: true,
        matter: { select: { id: true, matterNumber: true, title: true, type: true, status: true } },
      },
    }),
  ]);

  const matterIds = parties.map((p) => p.matter.id);
  const [openTaskGroups, activeHoldGroups] = await Promise.all([
    matterIds.length
      ? prisma.matterTask.groupBy({
          by: ["matterId"],
          where: { matterId: { in: matterIds }, status: { in: [...OPEN_TASK_STATUSES] } },
          _count: { _all: true },
        })
      : Promise.resolve([] as { matterId: string; _count: { _all: number } }[]),
    matterIds.length
      ? prisma.legalHold.groupBy({
          by: ["matterId"],
          where: { matterId: { in: matterIds }, status: { in: [...ACTIVE_HOLD_STATUSES] } },
          _count: { _all: true },
        })
      : Promise.resolve([] as { matterId: string; _count: { _all: number } }[]),
  ]);
  const openTaskByMatter = new Map(openTaskGroups.map((g) => [g.matterId, g._count._all]));
  const activeHoldByMatter = new Map(activeHoldGroups.map((g) => [g.matterId, g._count._all]));

  // One view per matter (a person could hold two roles on one matter — keep
  // the first; the role is informational on the portal).
  const seen = new Set<string>();
  const matters: ClientPortalMatterView[] = [];
  for (const p of parties) {
    if (seen.has(p.matter.id)) continue;
    seen.add(p.matter.id);
    matters.push({
      id: p.matter.id,
      number: p.matter.matterNumber ?? null,
      title: p.matter.title,
      type: p.matter.type,
      status: p.matter.status,
      role: p.role,
      openTasks: openTaskByMatter.get(p.matter.id) ?? 0,
      activeHolds: activeHoldByMatter.get(p.matter.id) ?? 0,
    });
  }

  await prisma.clientPortalToken.update({
    where: { id: row.id },
    data: { viewedAt: row.viewedAt ?? now, lastViewedAt: now },
  });

  // SYSTEM-actor audit — the token-holder is a Person, not a User. First view
  // only, so repeated polling doesn't flood the ledger.
  if (!row.viewedAt) {
    await logAudit({
      organizationId: row.organizationId,
      actorId: row.personId,
      actorType: "SYSTEM",
      action: "matter.portal.viewed",
      resourceType: "Person",
      resourceId: row.personId,
      metadata: { source: "client-portal", via: "portal-token", tokenId: row.id, matters: matters.length },
    });
  }

  return {
    organizationName: org?.name ?? "AEGIS",
    personName: person?.name ?? "Client",
    matters,
    generatedAt: now.toISOString(),
  };
}

/** Revoke a portal link. Idempotent-ish: a non-ACTIVE token is left as-is. */
export async function revokeClientPortalTokenService(
  organizationId: string,
  tokenId: string,
  actor: MatterActor,
): Promise<void> {
  const row = await prisma.clientPortalToken.findFirst({
    where: { id: tokenId, organizationId },
    select: { id: true, personId: true, status: true },
  });
  if (!row) throw new ClientPortalTokenNotFoundError(tokenId);
  if (row.status !== "ACTIVE") return;

  await prisma.clientPortalToken.update({ where: { id: row.id }, data: { status: "REVOKED" } });
  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: "USER",
    action: "matter.portal.revoked",
    resourceType: "Person",
    resourceId: row.personId,
    beforeJson: { tokenId: row.id, status: "ACTIVE" },
    afterJson: { tokenId: row.id, status: "REVOKED" },
    metadata: { source: "client-portal", tokenId: row.id },
  });
}

/** Internal admin list — every person who is a party on at least one matter,
 *  with their matter count and current ACTIVE portal token (if any), so the
 *  admin surface can mint / revoke / copy a link per client. */
export async function listClientPortalRecipientsService(
  organizationId: string,
): Promise<ClientPortalRecipient[]> {
  const parties = await prisma.matterParty.findMany({
    where: { matter: { organizationId } },
    select: { personId: true, matterId: true },
  });
  if (parties.length === 0) return [];

  const matterCountByPerson = new Map<string, Set<string>>();
  for (const p of parties) {
    if (!matterCountByPerson.has(p.personId)) matterCountByPerson.set(p.personId, new Set());
    matterCountByPerson.get(p.personId)!.add(p.matterId);
  }
  const personIds = Array.from(matterCountByPerson.keys());

  const [persons, activeTokens] = await Promise.all([
    prisma.person.findMany({
      where: { id: { in: personIds }, organizationId },
      select: { id: true, name: true, email: true },
    }),
    prisma.clientPortalToken.findMany({
      where: { organizationId, personId: { in: personIds }, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      select: { id: true, personId: true, status: true, expiresAt: true, lastViewedAt: true },
    }),
  ]);
  const tokenByPerson = new Map<string, (typeof activeTokens)[number]>();
  for (const t of activeTokens) {
    if (!tokenByPerson.has(t.personId)) tokenByPerson.set(t.personId, t);
  }

  return persons
    .map((p) => {
      const tok = tokenByPerson.get(p.id);
      return {
        personId: p.id,
        name: p.name,
        email: p.email ?? null,
        matterCount: matterCountByPerson.get(p.id)?.size ?? 0,
        token: tok
          ? {
              id: tok.id,
              status: tok.status,
              expiresAt: tok.expiresAt.toISOString(),
              lastViewedAt: tok.lastViewedAt ? tok.lastViewedAt.toISOString() : null,
            }
          : null,
      };
    })
    .sort((a, b) => b.matterCount - a.matterCount || a.name.localeCompare(b.name));
}
