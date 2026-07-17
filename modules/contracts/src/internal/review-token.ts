/**
 * Counterparty review tokens (CTR-3) — login-less, scoped external access
 * to a single contract draft, chain-sealed end to end.
 *
 * The counterparty contact has no Auth0 User, so the token IS the gate:
 * validity (status + expiry) and scope (one contract) are re-derived from
 * the row on every call, never trusted from the caller — the same posture
 * the custodian API uses. Only the SHA-256 hash of the token is stored;
 * the raw token exists once, in the emailed URL. Every counterparty action
 * writes a chain-sealed `contract.review.*` AuditLog row attributed to the
 * COUNTERPARTY_CONTACT Person. Nothing the counterparty does auto-executes
 * — the internal attorney still drives status via the gated internal
 * routes. Governance is the product.
 */
import { randomBytes } from "node:crypto";
import { prisma, logAudit, sha256Hex } from "@aegis/db";
import { getContractDetail, type ContractDetail } from "./reads";

const DEFAULT_EXPIRY_DAYS = 14;

// ── Pure helpers (unit-tested; no DB) ────────────────────────────────

export type ReviewDecision = "ACCEPT" | "COUNTER" | "COMMENT";

/** URL-safe opaque token. 24 random bytes → 32 base64url chars. */
export function generateRawToken(): string {
  return randomBytes(24).toString("base64url");
}

export function hashToken(raw: string): string {
  return sha256Hex(raw);
}

export function decisionToAction(d: ReviewDecision): string {
  return d === "ACCEPT"
    ? "contract.review.accepted"
    : d === "COUNTER"
      ? "contract.review.countered"
      : "contract.review.commented";
}

/** A final decision (accept/counter) closes the link; comments keep it open. */
export function isFinalDecision(d: ReviewDecision): boolean {
  return d === "ACCEPT" || d === "COUNTER";
}

/** Is a token row usable right now? Pure given `now`. */
export function tokenUsable(
  row: { status: string; expiresAt: Date },
  now: Date,
): { ok: boolean; reason: "ok" | "revoked" | "used" | "expired" } {
  if (row.status === "REVOKED") return { ok: false, reason: "revoked" };
  if (row.status === "USED") return { ok: false, reason: "used" };
  if (row.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: "expired" };
  return { ok: true, reason: "ok" };
}

/** Build the portal URL. Relative when no base is configured. */
export function reviewUrl(rawToken: string): string {
  const base = (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  return `${base}/contract-review/${rawToken}`;
}

// ── DTOs ─────────────────────────────────────────────────────────────

export interface MintedReviewToken {
  id: string;
  rawToken: string; // returned ONCE — never persisted, never logged
  url: string;
  expiresAt: string;
}

export interface ReviewTokenContext {
  tokenId: string;
  status: string;
  consented: boolean;
  expiresAt: string;
  counterpartyContact: { personId: string; name: string; email: string | null };
  counterpartyName: string | null;
  contract: ContractDetail;
}

export interface ReviewActivityEvent {
  action: string;
  at: string;
  personName: string | null;
  decision: string | null;
  comment: string | null;
}

export interface ReviewActivity {
  tokens: Array<{
    id: string;
    status: string;
    personName: string | null;
    expiresAt: string;
    consentAt: string | null;
    viewedAt: string | null;
    respondedAt: string | null;
    lastDecision: string | null;
  }>;
  events: ReviewActivityEvent[];
  /** Counterparty contacts on this contract's counterparty, for the invite picker. */
  availableContacts: Array<{ personId: string; name: string; email: string | null }>;
}

type Actor = { id: string | null; type?: "USER" | "AGENT" | "SYSTEM" };

// ── Mint (internal, gated at the route) ──────────────────────────────

export async function mintContractReviewToken(
  organizationId: string,
  contractId: string,
  personId: string,
  opts: { expiresInDays?: number },
  actor: Actor,
): Promise<MintedReviewToken> {
  const contract = await prisma.contract.findFirst({ where: { id: contractId, organizationId }, select: { id: true, title: true } });
  if (!contract) throw new Error("Contract not found");
  const person = await prisma.person.findFirst({ where: { id: personId, organizationId }, select: { id: true, name: true } });
  if (!person) throw new Error("Counterparty contact not found");

  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const days = opts.expiresInDays && opts.expiresInDays > 0 ? opts.expiresInDays : DEFAULT_EXPIRY_DAYS;
  const expiresAt = new Date(Date.now() + days * 86_400_000);

  const row = await prisma.contractReviewToken.create({
    data: { organizationId, contractId, personId, tokenHash, expiresAt, createdById: actor.id ?? "system" },
  });

  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: actor.type ?? "USER",
    action: "contract.review.invited",
    resourceType: "Contract",
    resourceId: contractId,
    afterJson: { tokenId: row.id, personId, personName: person.name, expiresAt: expiresAt.toISOString() } as never,
    metadata: { source: "contracts", tokenId: row.id } as never,
  });

  return { id: row.id, rawToken, url: reviewUrl(rawToken), expiresAt: expiresAt.toISOString() };
}

// ── Resolve (external, token-scoped) ─────────────────────────────────

async function loadToken(rawToken: string) {
  if (!rawToken) return null;
  const row = await prisma.contractReviewToken.findUnique({ where: { tokenHash: hashToken(rawToken) } });
  return row;
}

/**
 * Resolve a raw token to its scoped context, or null when invalid /
 * expired / revoked / used. Lazily flips a past-expiry ACTIVE row to
 * EXPIRED. Records a one-time `contract.review.viewed` on first load.
 */
export async function resolveContractReviewToken(rawToken: string): Promise<ReviewTokenContext | null> {
  const row = await loadToken(rawToken);
  if (!row) return null;
  const now = new Date();
  const usable = tokenUsable(row, now);
  if (!usable.ok) {
    if (usable.reason === "expired" && row.status === "ACTIVE") {
      await prisma.contractReviewToken.update({ where: { id: row.id }, data: { status: "EXPIRED" } });
    }
    return null;
  }

  const [contract, person] = await Promise.all([
    getContractDetail(row.organizationId, row.contractId),
    prisma.person.findUnique({ where: { id: row.personId }, select: { id: true, name: true, email: true, metadata: true } }),
  ]);
  if (!contract || !person) return null;

  let counterpartyName: string | null = contract.counterpartyName;
  if (!counterpartyName) {
    const cpId = (person.metadata as { counterpartyId?: string } | null)?.counterpartyId;
    if (cpId) {
      const cp = await prisma.counterparty.findUnique({ where: { id: cpId }, select: { name: true } });
      counterpartyName = cp?.name ?? null;
    }
  }

  if (!row.viewedAt) {
    await prisma.contractReviewToken.update({ where: { id: row.id }, data: { viewedAt: now } });
    await writeReviewAudit(row.organizationId, row.contractId, row.id, "contract.review.viewed", person.id, person.name, null, null);
  }

  return {
    tokenId: row.id,
    status: row.status,
    consented: !!row.consentAt,
    expiresAt: row.expiresAt.toISOString(),
    counterpartyContact: { personId: person.id, name: person.name, email: person.email },
    counterpartyName,
    contract,
  };
}

export async function recordReviewConsent(rawToken: string): Promise<boolean> {
  const row = await loadToken(rawToken);
  if (!row) return false;
  if (!tokenUsable(row, new Date()).ok) return false;
  if (row.consentAt) return true;
  const person = await prisma.person.findUnique({ where: { id: row.personId }, select: { name: true } });
  await prisma.contractReviewToken.update({ where: { id: row.id }, data: { consentAt: new Date() } });
  await writeReviewAudit(row.organizationId, row.contractId, row.id, "contract.review.consented", row.personId, person?.name ?? null, null, null);
  return true;
}

/**
 * Record the counterparty's response. Requires prior consent. ACCEPT /
 * COUNTER are final (token → USED); COMMENT keeps the link open for
 * further rounds. Never mutates the contract's status — internal review
 * still gates.
 */
export async function submitReviewResponse(
  rawToken: string,
  input: { decision: ReviewDecision; comment?: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = await loadToken(rawToken);
  if (!row) return { ok: false, error: "Invalid or expired link" };
  if (!tokenUsable(row, new Date()).ok) return { ok: false, error: "This link is no longer active" };
  if (!row.consentAt) return { ok: false, error: "Consent required before responding" };

  const person = await prisma.person.findUnique({ where: { id: row.personId }, select: { name: true } });
  const now = new Date();
  const final = isFinalDecision(input.decision);
  await prisma.contractReviewToken.update({
    where: { id: row.id },
    data: {
      lastDecision: input.decision,
      respondedAt: final ? now : row.respondedAt,
      status: final ? "USED" : row.status,
    },
  });
  await writeReviewAudit(
    row.organizationId,
    row.contractId,
    row.id,
    decisionToAction(input.decision),
    row.personId,
    person?.name ?? null,
    input.decision,
    (input.comment ?? "").trim() || null,
  );
  return { ok: true };
}

export async function revokeContractReviewToken(organizationId: string, tokenId: string, actor: Actor) {
  const row = await prisma.contractReviewToken.findFirst({ where: { id: tokenId, organizationId } });
  if (!row) throw new Error("Review link not found");
  if (row.status === "REVOKED") return row;
  const updated = await prisma.contractReviewToken.update({ where: { id: tokenId }, data: { status: "REVOKED" } });
  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: actor.type ?? "USER",
    action: "contract.review.revoked",
    resourceType: "Contract",
    resourceId: row.contractId,
    beforeJson: { status: row.status } as never,
    afterJson: { tokenId, status: "REVOKED" } as never,
    metadata: { source: "contracts", tokenId } as never,
  });
  return updated;
}

// ── Internal round-trip read ─────────────────────────────────────────

export async function getContractReviewActivity(organizationId: string, contractId: string): Promise<ReviewActivity> {
  const contract = await prisma.contract.findFirst({ where: { id: contractId, organizationId }, select: { counterpartyId: true } });
  const [tokens, audits, contacts] = await Promise.all([
    prisma.contractReviewToken.findMany({
      where: { organizationId, contractId },
      include: { person: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.auditLog.findMany({
      where: { organizationId, resourceType: "Contract", resourceId: contractId, action: { startsWith: "contract.review." } },
      orderBy: { chainPosition: "desc" },
      take: 100,
    }),
    prisma.person.findMany({
      where: { organizationId, type: "COUNTERPARTY_CONTACT" },
      select: { id: true, name: true, email: true, metadata: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // A contact is eligible when its metadata.counterpartyId matches the
  // contract's counterparty. Shared-entity model: no ContractParty table.
  const cpId = contract?.counterpartyId ?? null;
  const availableContacts = contacts
    .filter((p) => !cpId || (p.metadata as { counterpartyId?: string } | null)?.counterpartyId === cpId)
    .map((p) => ({ personId: p.id, name: p.name, email: p.email }));

  return {
    tokens: tokens.map((t) => ({
      id: t.id,
      status: t.status,
      personName: t.person?.name ?? null,
      expiresAt: t.expiresAt.toISOString(),
      consentAt: t.consentAt?.toISOString() ?? null,
      viewedAt: t.viewedAt?.toISOString() ?? null,
      respondedAt: t.respondedAt?.toISOString() ?? null,
      lastDecision: t.lastDecision,
    })),
    events: audits.map((a) => {
      const meta = (a.metadata ?? {}) as { personName?: string; decision?: string; comment?: string };
      return {
        action: a.action,
        at: a.timestamp.toISOString(),
        personName: meta.personName ?? null,
        decision: meta.decision ?? null,
        comment: meta.comment ?? null,
      };
    }),
    availableContacts,
  };
}

// ── Shared audit writer for counterparty (SYSTEM-actor) events ───────

function writeReviewAudit(
  organizationId: string,
  contractId: string,
  tokenId: string,
  action: string,
  personId: string,
  personName: string | null,
  decision: string | null,
  comment: string | null,
) {
  // The counterparty has no platform User — attribute to the Person id
  // with actorType SYSTEM and carry the human details in metadata so the
  // internal ledger reads "Acme's contact accepted on <date>".
  return logAudit({
    organizationId,
    actorId: personId,
    actorType: "SYSTEM",
    action,
    resourceType: "Contract",
    resourceId: contractId,
    afterJson: { tokenId, decision, comment } as never,
    metadata: {
      source: "contract-review-token",
      via: "review-token",
      actorRole: "counterparty_contact",
      tokenId,
      personName,
      decision,
      comment,
    } as never,
  });
}
