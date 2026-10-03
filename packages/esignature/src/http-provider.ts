/**
 * HTTP e-signature provider (C-5).
 *
 * The production implementation of `ESignatureProvider`: it drives a signing
 * provider's REST API over the global `fetch` (zero SDK, proxy-friendly) with a
 * bearer token resolved through the shared F-8 OAuth framework. Per-provider
 * request shapes and response mappers live in an `ESignatureDialect`, so this
 * class stays generic and each provider is a small adapter.
 *
 * The access token is injected (`getAccessToken`) — the caller wires it to
 * `@aegis/connectors.getValidAccessToken` over a `DbTokenStore`, so this
 * package never imports `@aegis/db` and never re-implements refresh.
 */
import { normalizeStatus } from "./envelope.js";
import type {
  CreateEnvelopeRequest,
  EnvelopeRef,
  EnvelopeStatus,
  ESignatureProvider,
  ESignatureProviderId,
  RecipientStatus,
  SignedDocument,
} from "./types.js";

export interface ESignRequest {
  method: "GET" | "POST" | "PUT";
  path: string;
  headers?: Record<string, string>;
  body?: unknown;
  binary?: boolean;
}

export interface ESignatureDialect {
  readonly id: ESignatureProviderId;
  readonly baseUrl: string;
  createEnvelope(req: CreateEnvelopeRequest): ESignRequest;
  mapCreated(raw: unknown, req: CreateEnvelopeRequest): EnvelopeRef;
  sendEnvelope(envelopeId: string): ESignRequest;
  getEnvelopeStatus(envelopeId: string): ESignRequest;
  mapStatus(raw: unknown, envelopeId: string): EnvelopeStatus;
  voidEnvelope(envelopeId: string, reason: string): ESignRequest;
  downloadSignedDocuments(envelopeId: string): ESignRequest;
  downloadFilename(envelopeId: string): string;
}

export type ESignFetch = typeof fetch;

export interface HttpESignatureProviderOptions {
  dialect: ESignatureDialect;
  getAccessToken: () => Promise<string>;
  fetchImpl?: ESignFetch;
}

export class ESignatureHttpError extends Error {
  constructor(
    readonly status: number,
    readonly providerId: ESignatureProviderId,
    readonly detail: string,
  ) {
    super(`E-sign ${providerId} returned ${status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
    this.name = "ESignatureHttpError";
  }
}

export class HttpESignatureProvider implements ESignatureProvider {
  readonly id: ESignatureProviderId;
  private readonly dialect: ESignatureDialect;
  private readonly getAccessToken: () => Promise<string>;
  private readonly doFetch: ESignFetch;

  constructor(opts: HttpESignatureProviderOptions) {
    this.dialect = opts.dialect;
    this.id = opts.dialect.id;
    this.getAccessToken = opts.getAccessToken;
    this.doFetch = opts.fetchImpl ?? fetch;
  }

  private async send(req: ESignRequest): Promise<unknown> {
    const token = await this.getAccessToken();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: req.binary ? "application/pdf" : "application/json",
      ...req.headers,
    };
    let body: BodyInit | undefined;
    if (req.body !== undefined) {
      headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
      body = JSON.stringify(req.body);
    }
    const res = await this.doFetch(this.dialect.baseUrl.replace(/\/$/, "") + req.path, {
      method: req.method,
      headers,
      body,
    });
    if (res.status < 200 || res.status >= 300) {
      const detail = await res.text().catch(() => "");
      throw new ESignatureHttpError(res.status, this.id, detail);
    }
    if (req.binary) return new Uint8Array(await res.arrayBuffer());
    return res.json().catch(() => ({}));
  }

  async createEnvelope(req: CreateEnvelopeRequest): Promise<EnvelopeRef> {
    return this.dialect.mapCreated(await this.send(this.dialect.createEnvelope(req)), req);
  }

  async sendEnvelope(envelopeId: string): Promise<EnvelopeRef> {
    await this.send(this.dialect.sendEnvelope(envelopeId));
    return this.dialect.mapStatus(await this.send(this.dialect.getEnvelopeStatus(envelopeId)), envelopeId);
  }

  async getEnvelopeStatus(envelopeId: string): Promise<EnvelopeStatus> {
    return this.dialect.mapStatus(await this.send(this.dialect.getEnvelopeStatus(envelopeId)), envelopeId);
  }

  async voidEnvelope(envelopeId: string, reason: string): Promise<EnvelopeRef> {
    await this.send(this.dialect.voidEnvelope(envelopeId, reason));
    return { provider: this.id, envelopeId, status: "voided" };
  }

  async downloadSignedDocuments(envelopeId: string): Promise<SignedDocument[]> {
    const bytes = (await this.send(this.dialect.downloadSignedDocuments(envelopeId))) as Uint8Array;
    return [{ envelopeId, name: this.dialect.downloadFilename(envelopeId), mimeType: "application/pdf", content: bytes }];
  }
}

/* ------------------------------------------------------------------ *
 * Dialects. Defensive mappers so a surprising provider payload
 * degrades rather than throwing deep in an execution flow.
 * ------------------------------------------------------------------ */

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}
function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function b64(content: Uint8Array): string {
  return Buffer.from(content).toString("base64");
}

/** DocuSign eSignature REST API v2.1. `accountBaseUri` + `accountId` are resolved at connect time. */
export function docusignDialect(accountBaseUri: string, accountId: string): ESignatureDialect {
  const prefix = `/restapi/v2.1/accounts/${accountId}`;
  const mapRecipients = (raw: unknown): RecipientStatus[] => {
    const signers = arr(obj(raw).signers);
    return signers.map((s): RecipientStatus => {
      const r = obj(s);
      const native = (str(r.status) ?? "created").toLowerCase();
      const status: RecipientStatus["status"] =
        native === "completed" || native === "signed" ? "signed" : native === "declined" ? "declined" : "pending";
      return { email: str(r.email) ?? "", name: str(r.name) ?? "", status, signedAt: str(r.signedDateTime) };
    });
  };
  return {
    id: "docusign",
    baseUrl: accountBaseUri,
    createEnvelope: (req) => ({
      method: "POST",
      path: `${prefix}/envelopes`,
      body: {
        emailSubject: req.subject,
        emailBlurb: req.message,
        status: req.sendImmediately === false ? "created" : "sent",
        documents: req.documents.map((d, i) => ({
          documentId: String(i + 1),
          name: d.name,
          fileExtension: d.name.split(".").pop() ?? "pdf",
          documentBase64: b64(d.content),
        })),
        recipients: {
          signers: req.recipients
            .filter((r) => (r.role ?? "signer") === "signer")
            .map((r, i) => ({ email: r.email, name: r.name, recipientId: String(i + 1), routingOrder: String(r.routingOrder ?? i + 1) })),
          carbonCopies: req.recipients
            .filter((r) => r.role === "cc")
            .map((r, i) => ({ email: r.email, name: r.name, recipientId: `cc-${i + 1}` })),
        },
      },
    }),
    mapCreated: (raw, req) => {
      const r = obj(raw);
      return {
        provider: "docusign",
        envelopeId: str(r.envelopeId) ?? "",
        status: normalizeStatus("docusign", str(r.status) ?? (req.sendImmediately === false ? "created" : "sent")),
        referenceId: req.referenceId,
      };
    },
    sendEnvelope: (envelopeId) => ({ method: "PUT", path: `${prefix}/envelopes/${envelopeId}`, body: { status: "sent" } }),
    getEnvelopeStatus: (envelopeId) => ({ method: "GET", path: `${prefix}/envelopes/${envelopeId}?include=recipients` }),
    mapStatus: (raw, envelopeId) => {
      const r = obj(raw);
      const status = normalizeStatus("docusign", str(r.status) ?? "sent");
      return {
        provider: "docusign",
        envelopeId,
        status,
        recipients: mapRecipients(r.recipients),
        completedAt: str(r.completedDateTime) ?? str(r.voidedDateTime) ?? str(r.declinedDateTime),
      };
    },
    voidEnvelope: (envelopeId, reason) => ({
      method: "PUT",
      path: `${prefix}/envelopes/${envelopeId}`,
      body: { status: "voided", voidedReason: reason },
    }),
    downloadSignedDocuments: (envelopeId) => ({ method: "GET", path: `${prefix}/envelopes/${envelopeId}/documents/combined`, binary: true }),
    downloadFilename: (envelopeId) => `${envelopeId}.pdf`,
  };
}

/**
 * Adobe Acrobat Sign REST API v6. `apiAccessPoint` is the per-account base
 * (resolved via `/baseUris` after consent). Document bytes are expected to have
 * been uploaded as transient documents first; `createEnvelope` references them
 * by `transientDocumentId` carried on each document's name as `tdid:<id>` (the
 * caller resolves uploads — the one provider-specific pre-step).
 */
export function adobeSignDialect(apiAccessPoint: string): ESignatureDialect {
  const prefix = `/api/rest/v6`;
  const mapMembers = (raw: unknown): RecipientStatus[] => {
    const sets = arr(obj(raw).participantSets);
    const out: RecipientStatus[] = [];
    for (const set of sets) {
      for (const m of arr(obj(set).memberInfos)) {
        const r = obj(m);
        const native = (str(obj(set).status) ?? "").toLowerCase();
        const status: RecipientStatus["status"] =
          native.includes("signed") || native.includes("completed") ? "signed" : native.includes("declined") ? "declined" : "pending";
        out.push({ email: str(r.email) ?? "", name: str(r.name) ?? str(r.email) ?? "", status });
      }
    }
    return out;
  };
  return {
    id: "adobesign",
    baseUrl: apiAccessPoint,
    createEnvelope: (req) => ({
      method: "POST",
      path: `${prefix}/agreements`,
      body: {
        fileInfos: req.documents.map((d) => ({ transientDocumentId: (str(d.name)?.startsWith("tdid:") ? d.name.slice(5) : d.name) })),
        name: req.subject,
        message: req.message,
        participantSetsInfo: req.recipients
          .filter((r) => (r.role ?? "signer") === "signer")
          .map((r, i) => ({ order: r.routingOrder ?? i + 1, role: "SIGNER", memberInfos: [{ email: r.email }] })),
        signatureType: "ESIGN",
        state: req.sendImmediately === false ? "AUTHORING" : "IN_PROCESS",
      },
    }),
    mapCreated: (raw, req) => ({
      provider: "adobesign",
      envelopeId: str(obj(raw).id) ?? "",
      status: normalizeStatus("adobesign", str(obj(raw).status) ?? (req.sendImmediately === false ? "AUTHORING" : "OUT_FOR_SIGNATURE")),
      referenceId: req.referenceId,
    }),
    sendEnvelope: (envelopeId) => ({ method: "PUT", path: `${prefix}/agreements/${envelopeId}/state`, body: { state: "IN_PROCESS" } }),
    getEnvelopeStatus: (envelopeId) => ({ method: "GET", path: `${prefix}/agreements/${envelopeId}/members` }),
    mapStatus: (raw, envelopeId) => ({
      provider: "adobesign",
      envelopeId,
      status: normalizeStatus("adobesign", str(obj(raw).status) ?? "OUT_FOR_SIGNATURE"),
      recipients: mapMembers(raw),
    }),
    voidEnvelope: (envelopeId, reason) => ({
      method: "PUT",
      path: `${prefix}/agreements/${envelopeId}/state`,
      body: { state: "CANCELLED", agreementCancellationInfo: { comment: reason, notifyOthers: true } },
    }),
    downloadSignedDocuments: (envelopeId) => ({ method: "GET", path: `${prefix}/agreements/${envelopeId}/combinedDocument`, binary: true }),
    downloadFilename: (envelopeId) => `${envelopeId}.pdf`,
  };
}
