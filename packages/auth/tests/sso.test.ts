/**
 * Per-tenant SSO federation helpers (C-6). Pure — no DB, no Auth0.
 */
import { describe, expect, it } from "vitest";
import {
  normalizeDomain,
  emailDomain,
  matchConnectionByEmail,
  resolveSsoRoleName,
  SSO_DEFAULT_ROLE,
  type SsoConnectionRecord,
} from "../src/sso";

function conn(partial: Partial<SsoConnectionRecord>): SsoConnectionRecord {
  return {
    organizationId: "org-x",
    connectionName: "conn-x",
    emailDomains: ["acme.com"],
    defaultRoleName: "attorney",
    jitProvisioning: true,
    enabled: true,
    ...partial,
  };
}

describe("normalizeDomain / emailDomain", () => {
  it("lower-cases and strips a leading @", () => {
    expect(normalizeDomain(" @ACME.com ")).toBe("acme.com");
  });
  it("extracts the domain from an email", () => {
    expect(emailDomain("Jane.Doe@Acme.com")).toBe("acme.com");
  });
  it("returns null for a malformed email", () => {
    expect(emailDomain("not-an-email")).toBeNull();
    expect(emailDomain("trailing@")).toBeNull();
  });
});

describe("matchConnectionByEmail", () => {
  const a = conn({ organizationId: "org-a", connectionName: "entra-a", emailDomains: ["acme.com", "acme.co.uk"] });
  const b = conn({ organizationId: "org-b", connectionName: "okta-b", emailDomains: ["globex.com"] });

  it("matches on domain, case-insensitively", () => {
    expect(matchConnectionByEmail("user@ACME.com", [a, b])?.organizationId).toBe("org-a");
    expect(matchConnectionByEmail("user@globex.com", [a, b])?.organizationId).toBe("org-b");
  });

  it("matches a secondary domain on the same connection", () => {
    expect(matchConnectionByEmail("user@acme.co.uk", [a, b])?.connectionName).toBe("entra-a");
  });

  it("returns null when no connection claims the domain", () => {
    expect(matchConnectionByEmail("user@unknown.com", [a, b])).toBeNull();
  });

  it("skips disabled connections", () => {
    const disabled = conn({ organizationId: "org-c", emailDomains: ["acme.com"], enabled: false });
    expect(matchConnectionByEmail("user@acme.com", [disabled])).toBeNull();
  });

  it("first enabled match wins on a duplicate-domain misconfig", () => {
    const dup = conn({ organizationId: "org-dup", connectionName: "dup", emailDomains: ["acme.com"] });
    expect(matchConnectionByEmail("user@acme.com", [a, dup])?.organizationId).toBe("org-a");
  });

  it("returns null for a malformed email", () => {
    expect(matchConnectionByEmail("broken", [a])).toBeNull();
  });
});

describe("resolveSsoRoleName", () => {
  it("returns the configured role when canonical", () => {
    expect(resolveSsoRoleName(conn({ defaultRoleName: "legal_ops" }))).toBe("legal_ops");
  });
  it("falls back to least privilege for a non-canonical role", () => {
    expect(resolveSsoRoleName(conn({ defaultRoleName: "superuser" }))).toBe(SSO_DEFAULT_ROLE);
    expect(SSO_DEFAULT_ROLE).toBe("requester");
  });
});
