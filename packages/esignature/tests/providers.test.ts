import { describe, it, expect } from "vitest";
import { MockESignatureProvider } from "../src/mock-provider.js";
import {
  HttpESignatureProvider,
  ESignatureHttpError,
  docusignDialect,
  adobeSignDialect,
} from "../src/http-provider.js";
import {
  esignatureOAuthConfig,
  esignatureOAuthEndpoints,
  esignatureConnectorDescriptor,
  registerESignatureConnectors,
} from "../src/descriptors.js";
import { ConnectorRegistry } from "@aegis/connectors";
import type { CreateEnvelopeRequest } from "../src/types.js";

const REQ: CreateEnvelopeRequest = {
  referenceId: "contract-42",
  subject: "Master Services Agreement",
  message: "Please sign.",
  documents: [{ name: "msa.pdf", mimeType: "application/pdf", content: new Uint8Array([1, 2, 3]) }],
  recipients: [
    { email: "gc@acme.com", name: "Acme GC" },
    { email: "cc@aegis.com", name: "AEGIS", role: "cc" },
  ],
};

describe("MockESignatureProvider", () => {
  it("runs a full create → sign → complete → download lifecycle", async () => {
    const p = new MockESignatureProvider();
    const ref = await p.createEnvelope({ ...REQ, sendImmediately: true });
    expect(ref.status).toBe("sent");
    expect(ref.referenceId).toBe("contract-42");

    p.advanceToDelivered(ref.envelopeId);
    p.signRecipient(ref.envelopeId, "gc@acme.com");
    p.markCompleted(ref.envelopeId);

    const status = await p.getEnvelopeStatus(ref.envelopeId);
    expect(status.status).toBe("completed");
    expect(status.recipients[0]?.status).toBe("signed");
    expect(status.completedAt).toBeDefined();

    const docs = await p.downloadSignedDocuments(ref.envelopeId);
    expect(docs).toHaveLength(1);
    expect(new TextDecoder().decode(docs[0]!.content)).toContain("signed:");
  });

  it("creates a draft, sends it, and refuses download before completion", async () => {
    const p = new MockESignatureProvider();
    const ref = await p.createEnvelope({ ...REQ, sendImmediately: false });
    expect(ref.status).toBe("created");
    await p.sendEnvelope(ref.envelopeId);
    expect((await p.getEnvelopeStatus(ref.envelopeId)).status).toBe("sent");
    await expect(p.downloadSignedDocuments(ref.envelopeId)).rejects.toThrow(/not completed/);
  });

  it("voids an in-flight envelope", async () => {
    const p = new MockESignatureProvider();
    const ref = await p.createEnvelope({ ...REQ, sendImmediately: true });
    const voided = await p.voidEnvelope(ref.envelopeId, "superseded");
    expect(voided.status).toBe("voided");
    expect((await p.getEnvelopeStatus(ref.envelopeId)).completedAt).toBeDefined();
  });
});

describe("HttpESignatureProvider — DocuSign dialect over a fake fetch", () => {
  it("creates an envelope with base64 docs and a bearer token", async () => {
    const calls: { url: string; method?: string; auth?: string; body?: unknown }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({
        url,
        method: init.method,
        auth: (init.headers as Record<string, string>).Authorization,
        body: init.body ? JSON.parse(init.body as string) : undefined,
      });
      return {
        status: 201,
        async json() {
          return { envelopeId: "DS-1", status: "sent" };
        },
        async text() {
          return "";
        },
        headers: { get: () => null },
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const provider = new HttpESignatureProvider({
      dialect: docusignDialect("https://na3.docusign.net", "acct-1"),
      getAccessToken: async () => "tok-xyz",
      fetchImpl,
    });
    const ref = await provider.createEnvelope({ ...REQ, sendImmediately: true });
    expect(ref).toMatchObject({ provider: "docusign", envelopeId: "DS-1", status: "sent", referenceId: "contract-42" });

    const call = calls[0]!;
    expect(call.url).toBe("https://na3.docusign.net/restapi/v2.1/accounts/acct-1/envelopes");
    expect(call.auth).toBe("Bearer tok-xyz");
    const body = call.body as { status: string; documents: { documentBase64: string }[]; recipients: { signers: unknown[]; carbonCopies: unknown[] } };
    expect(body.status).toBe("sent");
    expect(body.documents[0]!.documentBase64).toBe(Buffer.from([1, 2, 3]).toString("base64"));
    expect(body.recipients.signers).toHaveLength(1);
    expect(body.recipients.carbonCopies).toHaveLength(1);
  });

  it("maps a DocuSign status response with recipients", async () => {
    const provider = new HttpESignatureProvider({
      dialect: docusignDialect("https://na3.docusign.net", "acct-1"),
      getAccessToken: async () => "t",
      fetchImpl: ((async () => ({
        status: 200,
        async json() {
          return {
            status: "completed",
            completedDateTime: "2026-02-02T00:00:00Z",
            recipients: { signers: [{ email: "gc@acme.com", name: "Acme GC", status: "Completed", signedDateTime: "2026-02-02T00:00:00Z" }] },
          };
        },
        async text() {
          return "";
        },
        headers: { get: () => null },
      })) as unknown as typeof fetch),
    });
    const status = await provider.getEnvelopeStatus("DS-1");
    expect(status.status).toBe("completed");
    expect(status.recipients[0]).toMatchObject({ email: "gc@acme.com", status: "signed" });
    expect(status.completedAt).toBe("2026-02-02T00:00:00Z");
  });

  it("surfaces a non-2xx as ESignatureHttpError and downloads bytes", async () => {
    const err = new HttpESignatureProvider({
      dialect: docusignDialect("https://na3.docusign.net", "acct-1"),
      getAccessToken: async () => "t",
      fetchImpl: ((async () => ({ status: 403, async json() { return {}; }, async text() { return "forbidden"; }, headers: { get: () => null } })) as unknown as typeof fetch),
    });
    await expect(err.getEnvelopeStatus("DS-1")).rejects.toBeInstanceOf(ESignatureHttpError);

    const ok = new HttpESignatureProvider({
      dialect: docusignDialect("https://na3.docusign.net", "acct-1"),
      getAccessToken: async () => "t",
      fetchImpl: ((async () => ({
        status: 200,
        async json() { return {}; },
        async text() { return ""; },
        async arrayBuffer() { return new Uint8Array([80, 68, 70]).buffer; },
        headers: { get: () => null },
      })) as unknown as typeof fetch),
    });
    const docs = await ok.downloadSignedDocuments("DS-1");
    expect(docs[0]!.name).toBe("DS-1.pdf");
    expect(Array.from(docs[0]!.content)).toEqual([80, 68, 70]);
  });
});

describe("HttpESignatureProvider — Adobe Sign dialect", () => {
  it("creates an agreement and maps member status", async () => {
    let createdBody: Record<string, unknown> | undefined;
    const provider = new HttpESignatureProvider({
      dialect: adobeSignDialect("https://api.na1.adobesign.com"),
      getAccessToken: async () => "t",
      fetchImpl: ((async (url: string, init: RequestInit) => {
        if ((init.method ?? "GET") === "POST") {
          createdBody = JSON.parse(init.body as string);
          return { status: 201, async json() { return { id: "AS-1", status: "OUT_FOR_SIGNATURE" }; }, async text() { return ""; }, headers: { get: () => null } } as unknown as Response;
        }
        return {
          status: 200,
          async json() { return { status: "SIGNED", participantSets: [{ status: "SIGNED", memberInfos: [{ email: "gc@acme.com", name: "Acme GC" }] }] }; },
          async text() { return ""; },
          headers: { get: () => null },
        } as unknown as Response;
      }) as unknown as typeof fetch),
    });
    const ref = await provider.createEnvelope({ ...REQ, documents: [{ name: "tdid:TD-9", mimeType: "application/pdf", content: new Uint8Array([1]) }], sendImmediately: true });
    expect(ref).toMatchObject({ provider: "adobesign", envelopeId: "AS-1", status: "sent" });
    expect((createdBody!.fileInfos as { transientDocumentId: string }[])[0]!.transientDocumentId).toBe("TD-9");

    const status = await provider.getEnvelopeStatus("AS-1");
    expect(status.status).toBe("completed");
    expect(status.recipients[0]).toMatchObject({ email: "gc@acme.com", status: "signed" });
  });
});

describe("e-signature connector descriptors", () => {
  it("resolves provider endpoints, sandbox-aware", () => {
    expect(esignatureOAuthEndpoints("docusign").authorizeUrl).toContain("account.docusign.com");
    expect(esignatureOAuthEndpoints("docusign", true).authorizeUrl).toContain("account-d.docusign.com");
    expect(esignatureOAuthEndpoints("adobesign").tokenUrl).toContain("adobesign.com");
  });

  it("builds configs and registers only configurable providers", () => {
    const conf = esignatureOAuthConfig("docusign", { clientId: "c", clientSecret: "s", redirectUri: "https://a/cb" });
    expect(conf.usePkce).toBe(false);
    expect(conf.scopes).toEqual(["signature", "impersonation"]);

    const reg = new ConnectorRegistry();
    const registered = registerESignatureConnectors(reg, (id) =>
      id === "adobesign" ? null : { clientId: "c", clientSecret: "s", redirectUri: "https://a/cb" },
    );
    expect(registered).toEqual(["docusign"]);
    expect(registerESignatureConnectors(reg, () => ({ clientId: "c", redirectUri: "https://a/cb" }))).toEqual(["adobesign"]);
    expect(reg.list("esignature").map((d) => d.id).sort()).toEqual(["adobesign", "docusign"]);
  });

  it("descriptor carries the esignature kind and a label", () => {
    const d = esignatureConnectorDescriptor("docusign", { clientId: "c", clientSecret: "s", redirectUri: "https://a/cb" });
    expect(d.kind).toBe("esignature");
    expect(d.label).toBe("DocuSign");
  });
});
