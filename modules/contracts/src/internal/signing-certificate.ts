/**
 * Certificate of Completion (CLM Phase 5e — court-grade execution evidence).
 *
 * The evidentiary artifact an e-signature platform (DocuSign / Adobe Sign)
 * produces after a signing ceremony: WHO signed, on behalf of which party, WHEN,
 * HOW (method), from WHAT IP / user-agent, bound to WHAT terms (content hash),
 * and ANCHORED to the tamper-evident audit chain (the sealed AuditLog
 * chainPosition + contentHash of each signature event). AEGIS already captures
 * every one of these during the native signing ceremony — this assembles them
 * into one deterministic, reproducible certificate a litigator can rely on.
 *
 * Pure assembler (`buildSigningCertificate`) + a service that fetches the rows
 * (`getSigningCertificateService`) + a deterministic text renderer
 * (`renderSigningCertificateText`). No AI, no external provider, no mutation.
 */
import { prisma } from "@aegis/db";
import { computeContractTermsHashFromDb } from "./integrity";

export const SIGNING_CERTIFICATE_SCHEMA = "aegis.contract.signing-certificate.v1";

type Party = "INTERNAL" | "COUNTERPARTY";

export interface CertificateSignerRow {
  id: string;
  party: Party;
  signerName: string;
  signerEmail: string | null;
  method: string;
  signedAt: Date;
  signedTermsHash: string | null;
}
export interface CertificateRequestRow {
  resultingSignatureId: string | null;
  party: Party;
  signerName: string;
  signerIp: string | null;
  signerUserAgent: string | null;
  createdAt: Date;
  viewedAt: Date | null;
  signedAt: Date | null;
}
export interface CertificateAuditRow {
  action: string;
  chainPosition: string; // BigInt rendered as string
  contentHash: string;
  createdAt: Date;
  signatureId: string | null; // afterJson.signatureId when present
}
export interface CertificateContractRow {
  id: string;
  title: string;
  type: string;
  status: string;
  executedAt: Date | null;
  counterpartyName: string | null;
  value: number | null;
  currency: string;
  governingLaw: string | null;
}

export interface CertificateSigner {
  party: Party;
  signerName: string;
  signerEmail: string | null;
  method: string;
  signedAt: string;
  signedTermsHash: string | null;
  /** signedTermsHash matches the contract's CURRENT terms hash → not altered since signing. */
  termsHashVerified: boolean;
  ip: string | null;
  userAgent: string | null;
  invitedAt: string | null;
  viewedAt: string | null;
  /** The sealed audit-chain anchor for this signature (null if attorney-recorded without a sealed row match). */
  auditChainPosition: string | null;
  auditContentHash: string | null;
}

export interface SigningCertificate {
  schema: typeof SIGNING_CERTIFICATE_SCHEMA;
  generatedAt: string;
  contract: {
    id: string;
    title: string;
    type: string;
    status: string;
    executedAt: string | null;
    counterpartyName: string | null;
    value: number | null;
    currency: string;
    governingLaw: string | null;
    currentTermsHash: string | null;
  };
  executed: boolean;
  completeness: { hasInternal: boolean; hasCounterparty: boolean; bothSigned: boolean };
  signers: CertificateSigner[];
  /** Every sealed signature-lifecycle audit event, in chain order — the immutable ledger proof. */
  auditTrail: { action: string; chainPosition: string; contentHash: string; at: string }[];
  integrity: {
    /** true when every signer's signedTermsHash equals the current terms hash. */
    allTermsHashesMatch: boolean;
    /** true when every signer is anchored to a sealed audit row. */
    allSignaturesAnchored: boolean;
    note: string;
  };
}

/** Pure assembler — deterministic given the same rows + `now`. */
export function buildSigningCertificate(
  contract: CertificateContractRow,
  signatures: CertificateSignerRow[],
  requests: CertificateRequestRow[],
  audit: CertificateAuditRow[],
  currentTermsHash: string | null,
  now: Date = new Date(),
): SigningCertificate {
  const reqBySigId = new Map<string, CertificateRequestRow>();
  for (const r of requests) if (r.resultingSignatureId) reqBySigId.set(r.resultingSignatureId, r);
  const auditBySigId = new Map<string, CertificateAuditRow>();
  for (const a of audit) if (a.signatureId && !auditBySigId.has(a.signatureId)) auditBySigId.set(a.signatureId, a);

  const signers: CertificateSigner[] = [...signatures]
    .sort((a, b) => a.signedAt.getTime() - b.signedAt.getTime())
    .map((s) => {
      const req = reqBySigId.get(s.id);
      const anchor = auditBySigId.get(s.id);
      return {
        party: s.party,
        signerName: s.signerName,
        signerEmail: s.signerEmail,
        method: s.method,
        signedAt: s.signedAt.toISOString(),
        signedTermsHash: s.signedTermsHash,
        termsHashVerified: !!s.signedTermsHash && !!currentTermsHash && s.signedTermsHash === currentTermsHash,
        ip: req?.signerIp ?? null,
        userAgent: req?.signerUserAgent ?? null,
        invitedAt: req ? req.createdAt.toISOString() : null,
        viewedAt: req?.viewedAt ? req.viewedAt.toISOString() : null,
        auditChainPosition: anchor?.chainPosition ?? null,
        auditContentHash: anchor?.contentHash ?? null,
      };
    });

  const hasInternal = signers.some((s) => s.party === "INTERNAL");
  const hasCounterparty = signers.some((s) => s.party === "COUNTERPARTY");
  const allTermsHashesMatch = signers.length > 0 && signers.every((s) => s.termsHashVerified);
  const allSignaturesAnchored = signers.length > 0 && signers.every((s) => s.auditChainPosition != null);

  const note = signers.length === 0
    ? "No signatures recorded for this contract yet."
    : allTermsHashesMatch && allSignaturesAnchored
    ? "Every signature is bound to the current contract terms and anchored to the tamper-evident audit chain."
    : [
        allTermsHashesMatch ? null : "One or more signatures were applied to a different version of the terms than is current (the contract changed after signing, or was re-extracted).",
        allSignaturesAnchored ? null : "One or more signatures were recorded by an attorney on a party's behalf rather than through the signing-link ceremony.",
      ].filter(Boolean).join(" ");

  return {
    schema: SIGNING_CERTIFICATE_SCHEMA,
    generatedAt: now.toISOString(),
    contract: {
      id: contract.id,
      title: contract.title,
      type: contract.type,
      status: contract.status,
      executedAt: contract.executedAt ? contract.executedAt.toISOString() : null,
      counterpartyName: contract.counterpartyName,
      value: contract.value,
      currency: contract.currency,
      governingLaw: contract.governingLaw,
      currentTermsHash,
    },
    executed: contract.status === "EXECUTED" || contract.status === "ACTIVE",
    completeness: { hasInternal, hasCounterparty, bothSigned: hasInternal && hasCounterparty },
    signers,
    auditTrail: [...audit]
      .sort((a, b) => Number(BigInt(a.chainPosition) - BigInt(b.chainPosition)))
      .map((a) => ({ action: a.action, chainPosition: a.chainPosition, contentHash: a.contentHash, at: a.createdAt.toISOString() })),
    integrity: { allTermsHashesMatch, allSignaturesAnchored, note },
  };
}

const money = (v: number | null, ccy: string) => {
  if (v == null) return "—";
  const sym = ccy === "EUR" ? "€" : ccy === "GBP" ? "£" : ccy === "USD" ? "$" : `${ccy} `;
  return `${sym}${v.toLocaleString("en-US")}`;
};

/** Deterministic plaintext certificate — the printable court artifact. Pure. */
export function renderSigningCertificateText(cert: SigningCertificate): string {
  const L: string[] = [];
  const rule = "=".repeat(68);
  const thin = "-".repeat(68);
  L.push(rule);
  L.push("CERTIFICATE OF COMPLETION");
  L.push("AEGIS — Native Electronic Signature");
  L.push(rule);
  L.push("");
  L.push(`Generated:        ${cert.generatedAt}`);
  L.push(`Certificate ID:   ${cert.schema}`);
  L.push("");
  L.push("CONTRACT");
  L.push(thin);
  L.push(`Title:            ${cert.contract.title}`);
  L.push(`Reference:        ${cert.contract.id}`);
  L.push(`Type:             ${cert.contract.type}`);
  L.push(`Counterparty:     ${cert.contract.counterpartyName ?? "—"}`);
  L.push(`Value:            ${money(cert.contract.value, cert.contract.currency)}`);
  L.push(`Governing law:    ${cert.contract.governingLaw ?? "—"}`);
  L.push(`Status:           ${cert.contract.status}`);
  L.push(`Executed:         ${cert.contract.executedAt ?? "— (not yet executed)"}`);
  L.push(`Terms hash:       ${cert.contract.currentTermsHash ?? "—"}`);
  L.push("");
  L.push(`SIGNERS (${cert.signers.length})`);
  L.push(thin);
  if (cert.signers.length === 0) {
    L.push("  (no signatures recorded)");
  } else {
    cert.signers.forEach((s, i) => {
      L.push(`${i + 1}. ${s.signerName}  [${s.party}]`);
      L.push(`     Email:        ${s.signerEmail ?? "—"}`);
      L.push(`     Method:       ${s.method}`);
      L.push(`     Signed at:    ${s.signedAt}`);
      L.push(`     Invited at:   ${s.invitedAt ?? "—"}`);
      L.push(`     Viewed at:    ${s.viewedAt ?? "—"}`);
      L.push(`     IP address:   ${s.ip ?? "—"}`);
      L.push(`     User agent:   ${s.userAgent ?? "—"}`);
      L.push(`     Terms hash:   ${s.signedTermsHash ?? "—"} ${s.signedTermsHash ? (s.termsHashVerified ? "(VERIFIED — matches current terms)" : "(DIFFERS from current terms)") : ""}`);
      L.push(`     Audit anchor: ${s.auditChainPosition != null ? `chain #${s.auditChainPosition} · ${s.auditContentHash}` : "— (attorney-recorded)"}`);
      L.push("");
    });
  }
  L.push("TAMPER-EVIDENT AUDIT TRAIL");
  L.push(thin);
  if (cert.auditTrail.length === 0) {
    L.push("  (no sealed signature events)");
  } else {
    for (const e of cert.auditTrail) {
      L.push(`  #${e.chainPosition}  ${e.at}  ${e.action}`);
      L.push(`         ${e.contentHash}`);
    }
  }
  L.push("");
  L.push("INTEGRITY");
  L.push(thin);
  L.push(`  Both parties signed:      ${cert.completeness.bothSigned ? "YES" : "NO"}`);
  L.push(`  Terms unchanged since signing: ${cert.integrity.allTermsHashesMatch ? "YES" : "NO"}`);
  L.push(`  All signatures anchored:  ${cert.integrity.allSignaturesAnchored ? "YES" : "NO"}`);
  L.push(`  ${cert.integrity.note}`);
  L.push("");
  L.push(rule);
  L.push("This certificate is generated deterministically from AEGIS's");
  L.push("append-only, cryptographically chained audit ledger. Each audit");
  L.push("anchor above can be independently re-verified against the ledger.");
  L.push(rule);
  return L.join("\n");
}

const SIGNATURE_AUDIT_ACTIONS = [
  "contract.signature.recorded",
  "contract.signature.signed",
  "contract.signature.requested",
  "contract.signature.viewed",
  "contract.signature.declined",
  "contract.signature.request_revoked",
  "contract.signature.removed",
];

/** Fetch rows + assemble. Read-only; org-scoped. */
export async function getSigningCertificateService(
  organizationId: string,
  contractId: string,
  now: Date = new Date(),
): Promise<SigningCertificate> {
  const contract = await prisma.contract.findFirst({
    where: { id: contractId, organizationId },
    select: {
      id: true, title: true, type: true, status: true, executedAt: true, value: true, currency: true, governingLaw: true,
      counterparty: { select: { name: true } },
    },
  });
  if (!contract) throw new Error("Contract not found");

  const [signatures, requests, auditRows, currentTermsHash] = await Promise.all([
    prisma.contractSignature.findMany({
      where: { organizationId, contractId },
      select: { id: true, party: true, signerName: true, signerEmail: true, method: true, signedAt: true, signedTermsHash: true },
    }),
    prisma.contractSignatureRequest.findMany({
      where: { organizationId, contractId },
      select: { resultingSignatureId: true, party: true, signerName: true, signerIp: true, signerUserAgent: true, createdAt: true, viewedAt: true, signedAt: true },
    }),
    prisma.auditLog.findMany({
      where: { organizationId, resourceType: "Contract", resourceId: contractId, action: { in: SIGNATURE_AUDIT_ACTIONS } },
      select: { action: true, chainPosition: true, contentHash: true, timestamp: true, afterJson: true },
    }),
    computeContractTermsHashFromDb(organizationId, contractId).catch(() => null),
  ]);

  const audit: CertificateAuditRow[] = auditRows.map((a) => {
    const after = (a.afterJson && typeof a.afterJson === "object" ? a.afterJson : {}) as Record<string, unknown>;
    const sigId = typeof after.signatureId === "string" ? after.signatureId : null;
    return { action: a.action, chainPosition: a.chainPosition.toString(), contentHash: a.contentHash, createdAt: a.timestamp, signatureId: sigId };
  });

  return buildSigningCertificate(
    {
      id: contract.id, title: contract.title, type: contract.type, status: contract.status,
      executedAt: contract.executedAt, counterpartyName: contract.counterparty?.name ?? null,
      value: contract.value, currency: contract.currency, governingLaw: contract.governingLaw,
    },
    signatures as CertificateSignerRow[],
    requests as CertificateRequestRow[],
    audit,
    currentTermsHash,
    now,
  );
}
