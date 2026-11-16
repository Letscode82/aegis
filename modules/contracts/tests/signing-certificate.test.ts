import { describe, it, expect } from "vitest";
import {
  buildSigningCertificate,
  renderSigningCertificateText,
  SIGNING_CERTIFICATE_SCHEMA,
  type CertificateContractRow,
  type CertificateSignerRow,
  type CertificateRequestRow,
  type CertificateAuditRow,
} from "../src/internal/signing-certificate";

const at = (iso: string) => new Date(iso + "Z");

const contract: CertificateContractRow = {
  id: "ctr_1",
  title: "Master Services Agreement — Acme",
  type: "MSA",
  status: "EXECUTED",
  executedAt: at("2026-03-02T10:00:00"),
  counterpartyName: "Acme Corp",
  value: 250000,
  currency: "USD",
  governingLaw: "Delaware",
};

const HASH = "a".repeat(64);

function sig(p: Partial<CertificateSignerRow>): CertificateSignerRow {
  return {
    id: p.id ?? "sig_1",
    party: p.party ?? "INTERNAL",
    signerName: p.signerName ?? "Alex Nguyen",
    signerEmail: p.signerEmail ?? "alex@aegis.example",
    method: p.method ?? "esign",
    signedAt: p.signedAt ?? at("2026-03-01T09:00:00"),
    signedTermsHash: p.signedTermsHash ?? HASH,
  };
}
function req(p: Partial<CertificateRequestRow>): CertificateRequestRow {
  return {
    resultingSignatureId: p.resultingSignatureId ?? null,
    party: p.party ?? "INTERNAL",
    signerName: p.signerName ?? "Alex Nguyen",
    signerIp: p.signerIp ?? null,
    signerUserAgent: p.signerUserAgent ?? null,
    createdAt: p.createdAt ?? at("2026-02-28T08:00:00"),
    viewedAt: p.viewedAt ?? null,
    signedAt: p.signedAt ?? null,
  };
}
function aud(p: Partial<CertificateAuditRow>): CertificateAuditRow {
  return {
    action: p.action ?? "contract.signature.recorded",
    chainPosition: p.chainPosition ?? "1",
    contentHash: p.contentHash ?? "h".repeat(64),
    createdAt: p.createdAt ?? at("2026-03-01T09:00:01"),
    signatureId: p.signatureId ?? null,
  };
}

describe("buildSigningCertificate", () => {
  it("fully-verified, both-signed, ceremony-anchored certificate", () => {
    const sigs = [
      sig({ id: "s1", party: "INTERNAL", signerName: "Alex", signedAt: at("2026-03-01T09:00:00") }),
      sig({ id: "s2", party: "COUNTERPARTY", signerName: "Dana", signedAt: at("2026-03-02T09:00:00") }),
    ];
    const reqs = [
      req({ resultingSignatureId: "s1", party: "INTERNAL", signerIp: "10.0.0.1", signerUserAgent: "Chrome", viewedAt: at("2026-02-28T12:00:00") }),
      req({ resultingSignatureId: "s2", party: "COUNTERPARTY", signerIp: "10.0.0.2", signerUserAgent: "Safari", viewedAt: at("2026-03-01T12:00:00") }),
    ];
    const audits = [
      aud({ signatureId: "s1", chainPosition: "5", action: "contract.signature.recorded" }),
      aud({ signatureId: "s2", chainPosition: "7", action: "contract.signature.recorded" }),
      aud({ signatureId: null, chainPosition: "6", action: "contract.signature.signed" }),
    ];
    const cert = buildSigningCertificate(contract, sigs, reqs, audits, HASH, at("2026-03-03T00:00:00"));

    expect(cert.schema).toBe(SIGNING_CERTIFICATE_SCHEMA);
    expect(cert.executed).toBe(true);
    expect(cert.completeness).toEqual({ hasInternal: true, hasCounterparty: true, bothSigned: true });
    expect(cert.signers).toHaveLength(2);
    // sorted by signedAt
    expect(cert.signers[0]?.signerName).toBe("Alex");
    expect(cert.signers[0]?.ip).toBe("10.0.0.1");
    expect(cert.signers[0]?.termsHashVerified).toBe(true);
    expect(cert.signers[0]?.auditChainPosition).toBe("5");
    expect(cert.integrity.allTermsHashesMatch).toBe(true);
    expect(cert.integrity.allSignaturesAnchored).toBe(true);
    // audit trail sorted by chain position numerically
    expect(cert.auditTrail.map((e) => e.chainPosition)).toEqual(["5", "6", "7"]);
  });

  it("flags a terms-hash mismatch (contract changed after signing)", () => {
    const cert = buildSigningCertificate(
      contract,
      [sig({ id: "s1", signedTermsHash: "b".repeat(64) })],
      [req({ resultingSignatureId: "s1" })],
      [aud({ signatureId: "s1" })],
      HASH, // current hash differs from the signed one
    );
    expect(cert.signers[0]?.termsHashVerified).toBe(false);
    expect(cert.integrity.allTermsHashesMatch).toBe(false);
    expect(cert.integrity.note).toMatch(/different version of the terms/);
  });

  it("flags an attorney-recorded signature as not anchored", () => {
    const cert = buildSigningCertificate(
      contract,
      [sig({ id: "s1", method: "recorded" })],
      [], // no signing request
      [], // no sealed row with this signatureId
      HASH,
    );
    expect(cert.signers[0]?.auditChainPosition).toBeNull();
    expect(cert.signers[0]?.ip).toBeNull();
    expect(cert.integrity.allSignaturesAnchored).toBe(false);
    expect(cert.integrity.note).toMatch(/attorney/i);
  });

  it("handles a contract with no signatures yet", () => {
    const cert = buildSigningCertificate({ ...contract, status: "APPROVED", executedAt: null }, [], [], [], HASH);
    expect(cert.executed).toBe(false);
    expect(cert.signers).toHaveLength(0);
    expect(cert.completeness.bothSigned).toBe(false);
    expect(cert.integrity.allTermsHashesMatch).toBe(false);
    expect(cert.integrity.note).toMatch(/No signatures/);
  });
});

describe("renderSigningCertificateText", () => {
  it("renders a court-ready plaintext certificate with the key evidence", () => {
    const cert = buildSigningCertificate(
      contract,
      [sig({ id: "s1", party: "INTERNAL", signerName: "Alex" }), sig({ id: "s2", party: "COUNTERPARTY", signerName: "Dana" })],
      [req({ resultingSignatureId: "s1", signerIp: "10.0.0.1", signerUserAgent: "Chrome/120" })],
      [aud({ signatureId: "s1", chainPosition: "5" })],
      HASH,
    );
    const txt = renderSigningCertificateText(cert);
    expect(txt).toContain("CERTIFICATE OF COMPLETION");
    expect(txt).toContain("Master Services Agreement — Acme");
    expect(txt).toContain("Alex");
    expect(txt).toContain("Dana");
    expect(txt).toContain("10.0.0.1");
    expect(txt).toContain("Chrome/120");
    expect(txt).toContain("chain #5");
    expect(txt).toContain("TAMPER-EVIDENT AUDIT TRAIL");
    expect(txt).toContain("$250,000");
  });
});
