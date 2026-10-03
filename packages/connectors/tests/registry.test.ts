import { describe, it, expect } from "vitest";
import { ConnectorRegistry } from "../src/registry.js";
import { InMemoryTokenStore, getValidAccessToken } from "../src/token-store.js";
import type { ConnectorDescriptor, TokenSet } from "../src/types.js";

const DOCUSIGN: ConnectorDescriptor = {
  id: "docusign",
  label: "DocuSign",
  kind: "esignature",
  oauth: {
    authorizeUrl: "https://account.docusign.com/oauth/auth",
    tokenUrl: "https://account.docusign.com/oauth/token",
    clientId: "cid",
    clientSecret: "sec",
    redirectUri: "https://aegis.example/cb",
    scopes: ["signature"],
  },
};

const IMANAGE: ConnectorDescriptor = { ...DOCUSIGN, id: "imanage", label: "iManage", kind: "dms" };

describe("ConnectorRegistry", () => {
  it("registers, resolves, and lists by kind", () => {
    const reg = new ConnectorRegistry();
    reg.register(DOCUSIGN);
    reg.register(IMANAGE);
    expect(reg.get("docusign")?.label).toBe("DocuSign");
    expect(reg.has("imanage")).toBe(true);
    expect(reg.list().length).toBe(2);
    expect(reg.list("dms").map((c) => c.id)).toEqual(["imanage"]);
  });

  it("fails loud on a duplicate id", () => {
    const reg = new ConnectorRegistry();
    reg.register(DOCUSIGN);
    expect(() => reg.register(DOCUSIGN)).toThrow(/already registered/);
  });
});

describe("getValidAccessToken", () => {
  const live: TokenSet = { accessToken: "live", refreshToken: "r0", expiresAt: 10_000_000 };

  it("returns the stored token when it is still fresh", async () => {
    const store = new InMemoryTokenStore();
    await store.put("org1", "docusign", live);
    const tok = await getValidAccessToken({
      organizationId: "org1",
      connectorId: "docusign",
      store,
      refresh: async () => ({ accessToken: "new", expiresAt: 0 }),
      needsRefresh: () => false,
    });
    expect(tok).toBe("live");
  });

  it("refreshes when stale and preserves the prior refresh token", async () => {
    const store = new InMemoryTokenStore();
    await store.put("org1", "docusign", { accessToken: "old", refreshToken: "r0", expiresAt: 1 });
    const tok = await getValidAccessToken({
      organizationId: "org1",
      connectorId: "docusign",
      store,
      refresh: async () => ({ accessToken: "fresh", expiresAt: 999 }), // no refresh_token returned
      needsRefresh: () => true,
    });
    expect(tok).toBe("fresh");
    const saved = await store.get("org1", "docusign");
    expect(saved?.refreshToken).toBe("r0");
  });

  it("returns null when there is no token, or none to refresh with", async () => {
    const store = new InMemoryTokenStore();
    expect(
      await getValidAccessToken({ organizationId: "o", connectorId: "x", store, refresh: async () => live, needsRefresh: () => true }),
    ).toBeNull();
    await store.put("o", "x", { accessToken: "a", expiresAt: 1 }); // no refresh token
    expect(
      await getValidAccessToken({ organizationId: "o", connectorId: "x", store, refresh: async () => live, needsRefresh: () => true }),
    ).toBeNull();
  });
});
