import { describe, it, expect } from "vitest";
import {
  officeWordDescriptor,
  outlookDescriptor,
  microsoftOAuthConfig,
  OFFICE_WORD_CONNECTOR_ID,
  OUTLOOK_CONNECTOR_ID,
  OFFICE_WORD_SCOPES,
  OUTLOOK_SCOPES,
} from "../src/office.js";
import { buildAuthorizeUrl } from "../src/oauth.js";
import { ConnectorRegistry } from "../src/registry.js";

const OPTS = {
  clientId: "client-abc",
  clientSecret: "secret-xyz",
  tenant: "contoso.onmicrosoft.com",
  redirectUri: "https://aegis.example/api/connectors/office-word/callback",
};

describe("microsoft connector descriptors", () => {
  it("builds the Word descriptor against the v2.0 endpoints", () => {
    const d = officeWordDescriptor(OPTS);
    expect(d.id).toBe(OFFICE_WORD_CONNECTOR_ID);
    expect(d.kind).toBe("other");
    expect(d.oauth.authorizeUrl).toBe(
      "https://login.microsoftonline.com/contoso.onmicrosoft.com/oauth2/v2.0/authorize",
    );
    expect(d.oauth.tokenUrl).toBe(
      "https://login.microsoftonline.com/contoso.onmicrosoft.com/oauth2/v2.0/token",
    );
    expect(d.oauth.scopes).toEqual([...OFFICE_WORD_SCOPES]);
    // Confidential client (secret present) → no PKCE.
    expect(d.oauth.usePkce).toBe(false);
  });

  it("builds the Outlook descriptor as an email connector with mail scopes", () => {
    const d = outlookDescriptor(OPTS);
    expect(d.id).toBe(OUTLOOK_CONNECTOR_ID);
    expect(d.kind).toBe("email");
    expect(d.oauth.scopes).toEqual([...OUTLOOK_SCOPES]);
    expect(d.oauth.scopes).toContain("https://graph.microsoft.com/Mail.Read");
  });

  it("switches to PKCE for a public client (no secret)", () => {
    const cfg = microsoftOAuthConfig({
      id: "x",
      label: "X",
      kind: "other",
      clientId: "pub",
      tenant: "common",
      redirectUri: "https://aegis.example/cb",
      scopes: ["openid"],
    });
    expect(cfg.usePkce).toBe(true);
  });

  it("produces a Microsoft consent URL via buildAuthorizeUrl", () => {
    const d = officeWordDescriptor(OPTS);
    const url = new URL(buildAuthorizeUrl(d.oauth, { state: "nonce-1" }));
    expect(url.origin + url.pathname).toBe(
      "https://login.microsoftonline.com/contoso.onmicrosoft.com/oauth2/v2.0/authorize",
    );
    expect(url.searchParams.get("client_id")).toBe("client-abc");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("nonce-1");
    expect(url.searchParams.get("scope")).toContain("offline_access");
  });

  it("registers in a ConnectorRegistry and resolves by id", () => {
    const reg = new ConnectorRegistry();
    reg.register(officeWordDescriptor(OPTS));
    reg.register(outlookDescriptor(OPTS));
    expect(reg.has(OFFICE_WORD_CONNECTOR_ID)).toBe(true);
    expect(reg.list("email").map((c) => c.id)).toEqual([OUTLOOK_CONNECTOR_ID]);
  });
});
