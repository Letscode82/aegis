import { describe, it, expect, beforeEach } from "vitest";
import {
  resolveMgmtConfig,
  isAuth0ManagementConfigured,
  generateInitialPassword,
  createInviteSetPasswordLink,
  _clearMgmtTokenCache,
  type MgmtConfig,
} from "../src/management";

const CFG: MgmtConfig = {
  issuerBaseUrl: "https://tenant.us.auth0.com",
  clientId: "mgmt-client",
  clientSecret: "mgmt-secret",
  connection: "Username-Password-Authentication",
  appBaseUrl: "https://app.example",
};

beforeEach(() => _clearMgmtTokenCache());

describe("resolveMgmtConfig", () => {
  it("returns null when required vars are missing", () => {
    expect(resolveMgmtConfig({})).toBeNull();
    expect(
      resolveMgmtConfig({ AUTH0_ISSUER_BASE_URL: "https://t.auth0.com", AUTH0_MGMT_CLIENT_ID: "x" }),
    ).toBeNull();
    expect(isAuth0ManagementConfigured({})).toBe(false);
  });

  it("resolves config, trims the trailing slash, and defaults the connection", () => {
    const cfg = resolveMgmtConfig({
      AUTH0_ISSUER_BASE_URL: "https://t.us.auth0.com/",
      AUTH0_MGMT_CLIENT_ID: "cid",
      AUTH0_MGMT_CLIENT_SECRET: "sec",
      AUTH0_BASE_URL: "https://app",
    });
    expect(cfg).toEqual({
      issuerBaseUrl: "https://t.us.auth0.com",
      clientId: "cid",
      clientSecret: "sec",
      connection: "Username-Password-Authentication",
      appBaseUrl: "https://app",
    });
  });

  it("honours a custom DB connection", () => {
    const cfg = resolveMgmtConfig({
      AUTH0_ISSUER_BASE_URL: "https://t.auth0.com",
      AUTH0_MGMT_CLIENT_ID: "cid",
      AUTH0_MGMT_CLIENT_SECRET: "sec",
      AUTH0_DB_CONNECTION: "AEGIS-Users",
    });
    expect(cfg?.connection).toBe("AEGIS-Users");
  });
});

describe("generateInitialPassword", () => {
  it("satisfies Auth0's default policy (upper, lower, digit, symbol, length)", () => {
    for (let i = 0; i < 20; i++) {
      const p = generateInitialPassword();
      expect(p.length).toBeGreaterThanOrEqual(16);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[0-9]/);
      expect(p).toMatch(/[^A-Za-z0-9]/);
    }
  });
});

describe("createInviteSetPasswordLink", () => {
  it("degrades (no throw) when not configured", async () => {
    const r = await createInviteSetPasswordLink({ email: "a@b.com" }, { config: undefined, fetchImpl: undefined });
    // No env configured in the test runner → resolveMgmtConfig() returns null.
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("not-configured");
  });

  it("creates the user then mints a ticket when the user does not exist", async () => {
    const calls: { url: string; body?: unknown }[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(init.body as string) : undefined });
      if (url.endsWith("/oauth/token")) {
        return jsonRes({ access_token: "tok", expires_in: 3600 });
      }
      if (url.includes("/users-by-email")) {
        return jsonRes([]); // not found
      }
      if (url.endsWith("/api/v2/users")) {
        return jsonRes({ user_id: "auth0|new123" });
      }
      if (url.endsWith("/tickets/password-change")) {
        return jsonRes({ ticket: "https://tenant.us.auth0.com/reset?ticket=abc" });
      }
      throw new Error(`unexpected url ${url}`);
    }) as unknown as typeof fetch;

    const r = await createInviteSetPasswordLink(
      { email: "New.User@b.com", name: "New User" },
      { config: CFG, fetchImpl },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.url).toBe("https://tenant.us.auth0.com/reset?ticket=abc");
      expect(r.userId).toBe("auth0|new123");
      expect(r.userCreated).toBe(true);
    }
    // The create payload lowercases the email and targets the configured connection.
    const createCall = calls.find((c) => c.url.endsWith("/api/v2/users"));
    expect((createCall?.body as { email: string }).email).toBe("new.user@b.com");
    expect((createCall?.body as { connection: string }).connection).toBe(
      "Username-Password-Authentication",
    );
    // The ticket payload carries the result_url from appBaseUrl.
    const ticketCall = calls.find((c) => c.url.endsWith("/tickets/password-change"));
    expect((ticketCall?.body as { result_url: string }).result_url).toBe("https://app.example");
    expect((ticketCall?.body as { mark_email_as_verified: boolean }).mark_email_as_verified).toBe(true);
  });

  it("reuses an existing user instead of creating a duplicate", async () => {
    let createCalled = false;
    const fetchImpl = (async (url: string) => {
      if (url.endsWith("/oauth/token")) return jsonRes({ access_token: "tok", expires_in: 3600 });
      if (url.includes("/users-by-email")) return jsonRes([{ user_id: "auth0|exists" }]);
      if (url.endsWith("/api/v2/users")) {
        createCalled = true;
        return jsonRes({ user_id: "should-not-happen" });
      }
      if (url.endsWith("/tickets/password-change")) return jsonRes({ ticket: "https://t/reset" });
      throw new Error(`unexpected url ${url}`);
    }) as unknown as typeof fetch;

    const r = await createInviteSetPasswordLink({ email: "e@b.com" }, { config: CFG, fetchImpl });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.userCreated).toBe(false);
    expect(createCalled).toBe(false);
  });

  it("returns ok:false with the http reason on an Auth0 error (never throws)", async () => {
    const fetchImpl = (async (url: string) => {
      if (url.endsWith("/oauth/token")) return jsonRes({ access_token: "tok", expires_in: 3600 });
      if (url.includes("/users-by-email")) return new Response("boom", { status: 500 });
      throw new Error(`unexpected url ${url}`);
    }) as unknown as typeof fetch;

    const r = await createInviteSetPasswordLink({ email: "e@b.com" }, { config: CFG, fetchImpl });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("users-by-email-http-500");
  });
});

function jsonRes(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
