import { describe, it, expect } from "vitest";
import { MockDmsProvider } from "../src/mock-provider.js";
import { HttpDmsProvider, DmsHttpError, sharePointDialect, imanageDialect, netDocumentsDialect } from "../src/http-provider.js";
import {
  dmsOAuthConfig,
  dmsConnectorDescriptor,
  registerDmsConnectors,
  dmsOAuthEndpoints,
  DMS_PROVIDER_IDS,
} from "../src/descriptors.js";
import { ConnectorRegistry } from "@aegis/connectors";

describe("MockDmsProvider", () => {
  it("lists seeded documents and round-trips a versioned upload", async () => {
    const p = new MockDmsProvider();
    const page = await p.listDocuments({ folderId: "f-acme" });
    expect(page.documents.map((d) => d.externalId)).toEqual(["doc-1", "doc-2"]);

    const versioned = await p.uploadDocument({ folderId: "f-acme", name: "Complaint.pdf", content: new Uint8Array([1, 2, 3]), externalId: "doc-1" });
    expect(versioned.version).toBe("2");
    expect(versioned.contentHash).toBe("hash-doc-1-v2");

    const created = await p.uploadDocument({ folderId: "f-acme", name: "New.pdf", content: new Uint8Array([9]) });
    expect(created.version).toBe("1");
    expect(await p.getDocument(created.externalId)).not.toBeNull();
  });

  it("paginates and searches", async () => {
    const p = new MockDmsProvider();
    const first = await p.listDocuments({ folderId: "f-acme", pageSize: 1 });
    expect(first.documents).toHaveLength(1);
    expect(first.nextCursor).toBe("1");
    const hits = await p.search("engagement");
    expect(hits.map((d) => d.externalId)).toEqual(["doc-2"]);
  });
});

describe("HttpDmsProvider over a fake fetch", () => {
  function fakeFetch(routes: Record<string, { status?: number; json?: unknown; bytes?: Uint8Array }>): typeof fetch {
    return (async (url: string | URL | Request) => {
      const u = typeof url === "string" ? url : url.toString();
      const match = Object.keys(routes).find((prefix) => u.startsWith(prefix));
      const r = match ? routes[match]! : { status: 404, json: {} };
      return {
        status: r.status ?? 200,
        async json() {
          return r.json ?? {};
        },
        async text() {
          return JSON.stringify(r.json ?? {});
        },
        async arrayBuffer() {
          return (r.bytes ?? new Uint8Array()).buffer;
        },
        headers: { get: () => null },
      } as unknown as Response;
    }) as unknown as typeof fetch;
  }

  it("maps a SharePoint Graph listing through the dialect with a bearer token", async () => {
    let authHeader = "";
    const base = "https://graph.microsoft.com/v1.0/drives/drive1/items/f1/children";
    const fetchImpl = (async (url: string, init: RequestInit) => {
      authHeader = (init.headers as Record<string, string>).Authorization ?? "";
      return {
        status: 200,
        async json() {
          return {
            value: [
              {
                id: "01ABC",
                name: "Brief.docx",
                size: 1234,
                eTag: "etag-1",
                lastModifiedDateTime: "2026-03-01T10:00:00Z",
                webUrl: "https://sp/01ABC",
                file: { mimeType: "application/vnd...", hashes: { quickXorHash: "QX1" } },
                parentReference: { id: "f1" },
              },
            ],
          };
        },
        async text() {
          return "";
        },
        headers: { get: () => null },
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const provider = new HttpDmsProvider({
      dialect: sharePointDialect("drive1"),
      getAccessToken: async () => "tok-123",
      fetchImpl,
    });
    const page = await provider.listDocuments({ folderId: "f1" });
    void base;
    expect(authHeader).toBe("Bearer tok-123");
    expect(page.documents).toEqual([
      {
        externalId: "01ABC",
        name: "Brief.docx",
        folderId: "f1",
        mimeType: "application/vnd...",
        sizeBytes: 1234,
        version: "etag-1",
        contentHash: "QX1",
        modifiedAt: "2026-03-01T10:00:00Z",
        webUrl: "https://sp/01ABC",
      },
    ]);
  });

  it("returns null on a 404 getDocument and throws DmsHttpError otherwise", async () => {
    const provider = new HttpDmsProvider({
      dialect: imanageDialect("acme.imanage.work", "LIB1"),
      getAccessToken: async () => "t",
      fetchImpl: fakeFetch({ "https://acme.imanage.work/api/v2/documents/missing": { status: 404 } }),
    });
    expect(await provider.getDocument("missing")).toBeNull();

    const err = new HttpDmsProvider({
      dialect: imanageDialect("acme.imanage.work", "LIB1"),
      getAccessToken: async () => "t",
      fetchImpl: fakeFetch({ "https://acme.imanage.work/api/v2/documents/boom": { status: 500, json: { error: "nope" } } }),
    });
    await expect(err.getDocument("boom")).rejects.toBeInstanceOf(DmsHttpError);
  });

  it("downloads bytes through the NetDocuments dialect", async () => {
    const provider = new HttpDmsProvider({
      dialect: netDocumentsDialect("CAB1"),
      getAccessToken: async () => "t",
      fetchImpl: ((async () => ({
        status: 200,
        async json() {
          return {};
        },
        async text() {
          return "";
        },
        async arrayBuffer() {
          return new Uint8Array([7, 8, 9]).buffer;
        },
        headers: { get: () => null },
      })) as unknown as typeof fetch),
    });
    const dl = await provider.downloadDocument("envX");
    expect(Array.from(dl.content)).toEqual([7, 8, 9]);
  });
});

describe("DMS connector descriptors", () => {
  it("builds provider endpoints and honors tenant", () => {
    expect(dmsOAuthEndpoints("sharepoint", "tenant-xyz").authorizeUrl).toContain("tenant-xyz");
    expect(dmsOAuthEndpoints("netdocuments").tokenUrl).toContain("netvoyage.com");
    expect(dmsOAuthEndpoints("imanage", "acme.imanage.work").tokenUrl).toBe("https://acme.imanage.work/auth/oauth2/token");
  });

  it("uses PKCE for a public client and basic auth for a confidential one", () => {
    const pub = dmsOAuthConfig("sharepoint", { clientId: "c", redirectUri: "https://a/cb" });
    expect(pub.usePkce).toBe(true);
    const conf = dmsOAuthConfig("imanage", { clientId: "c", clientSecret: "s", redirectUri: "https://a/cb", tenant: "h" });
    expect(conf.usePkce).toBe(false);
    expect(conf.scopes).toEqual(["user", "documents"]);
  });

  it("registers only the providers the resolver can configure, skipping duplicates", () => {
    const reg = new ConnectorRegistry();
    const resolve = (id: string) =>
      id === "netdocuments" ? null : { clientId: "c", redirectUri: "https://a/cb", tenant: "t" };
    const first = registerDmsConnectors(reg, resolve);
    expect(first.sort()).toEqual(["imanage", "sharepoint"]);
    // idempotent: a second pass registers nothing new
    expect(registerDmsConnectors(reg, resolve)).toEqual([]);
    expect(reg.list("dms").map((d) => d.id).sort()).toEqual(["imanage", "sharepoint"]);
  });

  it("descriptor carries the dms kind and a label", () => {
    const d = dmsConnectorDescriptor("imanage", { clientId: "c", clientSecret: "s", redirectUri: "https://a/cb", tenant: "h" });
    expect(d.kind).toBe("dms");
    expect(d.label).toBe("iManage Work");
    expect(DMS_PROVIDER_IDS).toContain(d.id);
  });
});
