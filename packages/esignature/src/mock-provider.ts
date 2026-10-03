/**
 * Mock e-signature provider (C-5).
 *
 * The zero-infra implementation of `ESignatureProvider` — an in-memory
 * envelope lifecycle that backs tests and local dev where no signing
 * credentials exist, so the demo can execute a contract end-to-end without
 * DocuSign / Adobe Sign. Deterministic ids; `advanceToSigned()` /
 * `markCompleted()` let tests and the demo drive the lifecycle forward exactly
 * as a webhook would.
 */
import { assertTransition } from "./envelope.js";
import type {
  CreateEnvelopeRequest,
  EnvelopeRef,
  EnvelopeStatus,
  ESignatureProvider,
  ESignatureProviderId,
  RecipientStatus,
  SignedDocument,
} from "./types.js";

interface MockEnvelope {
  ref: EnvelopeRef;
  recipients: RecipientStatus[];
  documents: { name: string; mimeType: string }[];
  completedAt?: string;
}

export class MockESignatureProvider implements ESignatureProvider {
  readonly id: ESignatureProviderId;
  private readonly envelopes = new Map<string, MockEnvelope>();
  private seq = 0;
  private readonly clock: () => string;

  constructor(opts: { id?: ESignatureProviderId; now?: () => string } = {}) {
    this.id = opts.id ?? "docusign";
    this.clock = opts.now ?? (() => new Date(Date.UTC(2026, 0, 1)).toISOString());
  }

  async createEnvelope(req: CreateEnvelopeRequest): Promise<EnvelopeRef> {
    const envelopeId = `env-${++this.seq}`;
    const env: MockEnvelope = {
      ref: {
        provider: this.id,
        envelopeId,
        status: req.sendImmediately ? "sent" : "created",
        referenceId: req.referenceId,
      },
      recipients: req.recipients
        .filter((r) => (r.role ?? "signer") === "signer")
        .map((r) => ({ email: r.email, name: r.name, status: "pending" as const })),
      documents: req.documents.map((d) => ({ name: d.name, mimeType: d.mimeType })),
    };
    this.envelopes.set(envelopeId, env);
    return env.ref;
  }

  async sendEnvelope(envelopeId: string): Promise<EnvelopeRef> {
    const env = this.require(envelopeId);
    assertTransition(env.ref.status, "sent");
    env.ref = { ...env.ref, status: "sent" };
    return env.ref;
  }

  async getEnvelopeStatus(envelopeId: string): Promise<EnvelopeStatus> {
    const env = this.require(envelopeId);
    return { ...env.ref, recipients: env.recipients.map((r) => ({ ...r })), completedAt: env.completedAt };
  }

  async voidEnvelope(envelopeId: string, _reason: string): Promise<EnvelopeRef> {
    const env = this.require(envelopeId);
    assertTransition(env.ref.status, "voided");
    env.ref = { ...env.ref, status: "voided" };
    env.completedAt = this.clock();
    return env.ref;
  }

  async downloadSignedDocuments(envelopeId: string): Promise<SignedDocument[]> {
    const env = this.require(envelopeId);
    if (env.ref.status !== "completed") {
      throw new Error(`Mock e-sign: envelope ${envelopeId} is ${env.ref.status}, not completed`);
    }
    return env.documents.map((d) => ({
      envelopeId,
      name: d.name,
      mimeType: d.mimeType,
      content: new TextEncoder().encode(`signed:${envelopeId}:${d.name}`),
    }));
  }

  /* ---- Test / demo drivers (what a provider webhook would do) ---- */

  /** Move a sent envelope to "delivered" (recipient opened it). */
  advanceToDelivered(envelopeId: string): void {
    const env = this.require(envelopeId);
    assertTransition(env.ref.status, "delivered");
    env.ref = { ...env.ref, status: "delivered" };
  }

  /** Mark one recipient signed. */
  signRecipient(envelopeId: string, email: string): void {
    const env = this.require(envelopeId);
    const r = env.recipients.find((x) => x.email === email);
    if (!r) throw new Error(`Mock e-sign: no recipient ${email} on ${envelopeId}`);
    r.status = "signed";
    r.signedAt = this.clock();
  }

  /** Complete the envelope once every signer has signed. */
  markCompleted(envelopeId: string): void {
    const env = this.require(envelopeId);
    const allSigned = env.recipients.every((r) => r.status === "signed");
    if (!allSigned) {
      for (const r of env.recipients) {
        if (r.status === "pending") {
          r.status = "signed";
          r.signedAt = this.clock();
        }
      }
    }
    assertTransition(env.ref.status, "completed");
    env.ref = { ...env.ref, status: "completed" };
    env.completedAt = this.clock();
  }

  private require(envelopeId: string): MockEnvelope {
    const env = this.envelopes.get(envelopeId);
    if (!env) throw new Error(`Mock e-sign: envelope ${envelopeId} not found`);
    return env;
  }
}
