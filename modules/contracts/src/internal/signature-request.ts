/**
 * Native e-signature (CTR-15).
 *
 * A real signing ceremony — not "the attorney recorded it". A signer receives a
 * tokenised link, reviews the contract, confirms identity + consent, and applies
 * their signature. We capture signer name/email, IP, user-agent, timestamp, and
 * bind the signature to the exact terms (the resulting ContractSignature carries
 * `signedTermsHash`). When both required signatures are in and the contract is
 * APPROVED, it auto-executes (existing recordSignature path). Provider-swap
 * ready: a DocuSign/Adobe envelope id would sit alongside `tokenHash`. The
 * signing link is delivered by email through the shared `@aegis/email` mailer
 * (see notify.ts) — best-effort and chain-sealed; it degrades to a logged
 * no-op when no mail provider is configured, and the link is always returned
 * for manual sharing.
 */
import { prisma, logAudit } from "@aegis/db";
import type { SignatureParty } from "@aegis/db";
import { hashToken, generateRawToken } from "./review-token";
import { recordSignature } from "./signatures";
import { getContractDetail, type ContractDetail } from "./reads";
import { sendContractSignatureInvite } from "./notify";

type Actor = { id: string | null; type?: "USER" | "AGENT" | "SYSTEM" };
const DEFAULT_EXPIRY_DAYS = 14;

/** Absolute signing URL. Relative when no base is configured (email links
 *  need an absolute URL — set APP_BASE_URL / NEXT_PUBLIC_APP_URL in prod). */
export function signUrl(rawToken: string): string {
  const base = (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  return `${base}/sign/${rawToken}`;
}

export interface SignatureRequestInput {
  party: SignatureParty;
  signerName: string;
  signerEmail?: string | null;
  signerPersonId?: string | null;
  signingOrder?: number;
}

export interface SignatureRequestDTO {
  id: string;
  party: SignatureParty;
  signerName: string;
  signerEmail: string | null;
  status: string;
  signingOrder: number;
  expiresAt: string;
  viewedAt: string | null;
  signedAt: string | null;
  createdAt: string;
}

export interface MintedSignatureRequest {
  requestId: string;
  /** App-relative signing path; the caller prepends the origin. */
  signingPath: string;
}

function toDTO(r: {
  id: string; party: SignatureParty; signerName: string; signerEmail: string | null; status: string;
  signingOrder: number; expiresAt: Date; viewedAt: Date | null; signedAt: Date | null; createdAt: Date;
}): SignatureRequestDTO {
  return {
    id: r.id, party: r.party, signerName: r.signerName, signerEmail: r.signerEmail, status: r.status,
    signingOrder: r.signingOrder, expiresAt: r.expiresAt.toISOString(),
    viewedAt: r.viewedAt ? r.viewedAt.toISOString() : null,
    signedAt: r.signedAt ? r.signedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  };
}

/** Issue an e-signature request + tokenised link. Chain-sealed. */
export async function requestSignature(
  organizationId: string,
  contractId: string,
  input: SignatureRequestInput,
  actor: Actor,
): Promise<MintedSignatureRequest> {
  const contract = await prisma.contract.findFirst({ where: { id: contractId, organizationId }, select: { status: true, title: true } });
  if (!contract) throw new Error("Contract not found");
  if (["EXECUTED", "ACTIVE", "TERMINATED", "EXPIRED"].includes(contract.status)) {
    throw new Error(`Cannot request a signature on a ${contract.status} contract.`);
  }
  if (!input.signerName?.trim()) throw new Error("Signer name is required");
  if (input.party !== "INTERNAL" && input.party !== "COUNTERPARTY") throw new Error("party must be INTERNAL or COUNTERPARTY");

  const rawToken = generateRawToken();
  const expiresAt = new Date(Date.now() + DEFAULT_EXPIRY_DAYS * 86_400_000);
  const row = await prisma.contractSignatureRequest.create({
    data: {
      organizationId, contractId,
      party: input.party,
      signerName: input.signerName.trim(),
      signerEmail: input.signerEmail?.trim() || null,
      signerPersonId: input.signerPersonId || null,
      tokenHash: hashToken(rawToken),
      signingOrder: input.signingOrder ?? 1,
      expiresAt,
      createdById: actor.id ?? "system",
    },
  });
  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: actor.type ?? (actor.id ? "USER" : "SYSTEM"),
    action: "contract.signature.requested",
    resourceType: "Contract",
    resourceId: contractId,
    afterJson: { requestId: row.id, party: row.party, signerName: row.signerName, expiresAt: expiresAt.toISOString() } as never,
    metadata: { source: "contracts" } as never,
  });

  // Real delivery — best-effort, chain-sealed inside notify. A mail failure
  // (or no configured provider) never fails the request; the signing link is
  // still returned for the attorney to share manually.
  await sendContractSignatureInvite({
    organizationId,
    contractId,
    to: row.signerEmail,
    contractTitle: contract.title,
    signerName: row.signerName,
    url: signUrl(rawToken),
    expiresAt: expiresAt.toISOString(),
    actor,
  }).catch(() => {});

  return { requestId: row.id, signingPath: `/sign/${rawToken}` };
}

async function loadRequest(rawToken: string) {
  if (!rawToken) return null;
  return prisma.contractSignatureRequest.findUnique({ where: { tokenHash: hashToken(rawToken) } });
}

function usable(row: { status: string; expiresAt: Date }, now: Date): boolean {
  if (row.status !== "SENT" && row.status !== "VIEWED") return false;
  return row.expiresAt.getTime() > now.getTime();
}

export interface SigningContext {
  requestId: string;
  status: string;
  signerName: string;
  party: SignatureParty;
  expiresAt: string;
  contract: ContractDetail;
}

/** Resolve a signing token → context. Marks VIEWED on first open. Null when
 *  invalid / expired / already signed / revoked. */
export async function resolveSignatureRequest(rawToken: string): Promise<SigningContext | null> {
  const row = await loadRequest(rawToken);
  if (!row) return null;
  const now = new Date();
  if (row.status === "SENT" && row.expiresAt.getTime() <= now.getTime()) {
    await prisma.contractSignatureRequest.update({ where: { id: row.id }, data: { status: "EXPIRED" } });
    return null;
  }
  if (!usable(row, now)) return null;

  if (!row.viewedAt) {
    await prisma.contractSignatureRequest.update({ where: { id: row.id }, data: { status: "VIEWED", viewedAt: now } });
    await logAudit({
      organizationId: row.organizationId, actorId: null, actorType: "SYSTEM",
      action: "contract.signature.viewed", resourceType: "Contract", resourceId: row.contractId,
      afterJson: { requestId: row.id, signerName: row.signerName } as never, metadata: { source: "contract-sign" } as never,
    });
  }

  const contract = await getContractDetail(row.organizationId, row.contractId);
  if (!contract) return null;
  return {
    requestId: row.id, status: row.viewedAt ? row.status : "VIEWED",
    signerName: row.signerName, party: row.party, expiresAt: row.expiresAt.toISOString(), contract,
  };
}

/** Apply the signature. The signer types their name + explicitly consents; we
 *  capture IP/UA and record the ContractSignature (method "esign"), which
 *  content-hashes the terms and auto-executes when both sides have signed. */
export async function submitSignature(
  rawToken: string,
  input: { typedName: string; agreed: boolean; ip?: string | null; userAgent?: string | null },
): Promise<{ ok: true; executed: boolean } | { ok: false; error: string }> {
  const row = await loadRequest(rawToken);
  if (!row) return { ok: false, error: "Invalid or expired signing link" };
  if (!usable(row, new Date())) return { ok: false, error: "This signing link is no longer active" };
  if (!input.agreed) return { ok: false, error: "You must consent to sign electronically" };
  if (!input.typedName?.trim()) return { ok: false, error: "Type your full name to sign" };

  let executed = false;
  try {
    const state = await recordSignature(
      row.organizationId, row.contractId,
      { party: row.party, signerName: input.typedName.trim(), signerEmail: row.signerEmail, signerPersonId: row.signerPersonId, method: "esign" },
      { id: null, type: "SYSTEM" },
    );
    executed = state.executed;
  } catch (e) {
    return { ok: false, error: String((e as Error).message || e) };
  }

  const sig = await prisma.contractSignature.findFirst({
    where: { contractId: row.contractId, party: row.party },
    orderBy: { signedAt: "desc" }, select: { id: true },
  });
  await prisma.contractSignatureRequest.update({
    where: { id: row.id },
    data: { status: "SIGNED", signedAt: new Date(), resultingSignatureId: sig?.id ?? null, signerIp: input.ip ?? null, signerUserAgent: input.userAgent ?? null },
  });
  await logAudit({
    organizationId: row.organizationId, actorId: null, actorType: "SYSTEM",
    action: "contract.signature.signed", resourceType: "Contract", resourceId: row.contractId,
    afterJson: { requestId: row.id, party: row.party, signerName: input.typedName.trim(), ip: input.ip ?? null } as never,
    metadata: { source: "contract-sign", method: "esign" } as never,
  });
  return { ok: true, executed };
}

/** Signer declines. */
export async function declineSignature(rawToken: string, reason?: string | null): Promise<{ ok: boolean }> {
  const row = await loadRequest(rawToken);
  if (!row || !usable(row, new Date())) return { ok: false };
  await prisma.contractSignatureRequest.update({ where: { id: row.id }, data: { status: "DECLINED", declinedReason: reason?.slice(0, 500) || null } });
  await logAudit({
    organizationId: row.organizationId, actorId: null, actorType: "SYSTEM",
    action: "contract.signature.declined", resourceType: "Contract", resourceId: row.contractId,
    afterJson: { requestId: row.id, reason: reason ?? null } as never, metadata: { source: "contract-sign" } as never,
  });
  return { ok: true };
}

export async function listSignatureRequests(organizationId: string, contractId: string): Promise<SignatureRequestDTO[]> {
  const rows = await prisma.contractSignatureRequest.findMany({
    where: { organizationId, contractId }, orderBy: [{ signingOrder: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(toDTO);
}

export async function revokeSignatureRequest(organizationId: string, requestId: string, actor: Actor): Promise<{ ok: boolean }> {
  const row = await prisma.contractSignatureRequest.findFirst({ where: { id: requestId, organizationId } });
  if (!row) throw new Error("Signature request not found");
  if (row.status === "SIGNED") throw new Error("Cannot revoke a completed signature");
  await prisma.contractSignatureRequest.update({ where: { id: requestId }, data: { status: "REVOKED" } });
  await logAudit({
    organizationId, actorId: actor.id, actorType: actor.type ?? "USER",
    action: "contract.signature.request_revoked", resourceType: "Contract", resourceId: row.contractId,
    afterJson: { requestId } as never, metadata: { source: "contracts" } as never,
  });
  return { ok: true };
}
