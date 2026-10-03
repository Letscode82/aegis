/**
 * E-signature — types (C-5).
 *
 * An e-signature connector fronts the signing provider a legal department uses
 * to execute contracts (DocuSign, Adobe Acrobat Sign). AEGIS reaches it through
 * the shared F-8 OAuth framework (`@aegis/connectors`); the Contracts module
 * drives it to move a `Contract` from APPROVED → EXECUTED, chain-sealing every
 * step. This module is pure types — no runtime, no dependencies.
 *
 * Statuses are normalized across providers to one `EnvelopeStatusValue` so the
 * contract execution state machine never branches on a provider's vocabulary.
 */

/** Registry ids for the e-signature providers AEGIS fronts. */
export type ESignatureProviderId = "docusign" | "adobesign";

/**
 * Normalized envelope lifecycle. Providers map onto these:
 *  - DocuSign:   created → sent → delivered → completed | declined | voided
 *  - Adobe Sign: AUTHORING → OUT_FOR_SIGNATURE → SIGNED/COMPLETED |
 *                DECLINED | CANCELLED
 */
export type EnvelopeStatusValue =
  | "created"
  | "sent"
  | "delivered"
  | "completed"
  | "declined"
  | "voided";

/** A signer (or CC recipient) on an envelope. */
export interface SignatureRecipient {
  email: string;
  name: string;
  /** Signing order (1-based); omit for parallel signing. */
  routingOrder?: number;
  /** "signer" (must sign) or "cc" (receives a copy). */
  role?: "signer" | "cc";
}

/** A document to be signed, carried inline. */
export interface EnvelopeDocument {
  name: string;
  mimeType: string;
  content: Uint8Array;
}

/** The request to create an envelope. */
export interface CreateEnvelopeRequest {
  /** AEGIS-side correlation (e.g. the Contract id) echoed back on status. */
  referenceId?: string;
  subject: string;
  message?: string;
  documents: EnvelopeDocument[];
  recipients: SignatureRecipient[];
  /** Create already sent (true) or leave as a draft for review (false). */
  sendImmediately?: boolean;
}

/** Per-recipient signing state. */
export interface RecipientStatus {
  email: string;
  name: string;
  status: "pending" | "signed" | "declined";
  signedAt?: string;
}

/** The handle returned when an envelope is created. */
export interface EnvelopeRef {
  provider: ESignatureProviderId;
  envelopeId: string;
  status: EnvelopeStatusValue;
  referenceId?: string;
}

/** The full status of an envelope. */
export interface EnvelopeStatus extends EnvelopeRef {
  recipients: RecipientStatus[];
  /** Set once terminal (completed / declined / voided). */
  completedAt?: string;
}

/** A downloaded signed document (the executed PDF). */
export interface SignedDocument {
  envelopeId: string;
  name: string;
  mimeType: string;
  content: Uint8Array;
}

/**
 * The provider seam. One implementation per signing provider (plus the dev
 * mock); the Contracts execution path works against this interface, never a
 * provider SDK.
 */
export interface ESignatureProvider {
  readonly id: ESignatureProviderId;
  /** Create an envelope (optionally sent immediately). */
  createEnvelope(req: CreateEnvelopeRequest): Promise<EnvelopeRef>;
  /** Send a previously-created draft envelope. */
  sendEnvelope(envelopeId: string): Promise<EnvelopeRef>;
  /** Fetch current status. */
  getEnvelopeStatus(envelopeId: string): Promise<EnvelopeStatus>;
  /** Void an in-flight envelope (reason is recorded by the provider). */
  voidEnvelope(envelopeId: string, reason: string): Promise<EnvelopeRef>;
  /** Download the executed document(s) once completed. */
  downloadSignedDocuments(envelopeId: string): Promise<SignedDocument[]>;
}
