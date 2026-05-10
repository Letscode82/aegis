/**
 * Bug B coverage — `M365GraphDelegatedClient.addSource` guards (Part 2).
 *
 * Defense-in-depth at the AEGIS↔Graph trust boundary. Even with Part 1
 * resolving identifiers at the call site, addSource fails loud on
 * obviously-wrong input rather than letting a stale CUID/GUID reach
 * Microsoft Graph and surface as an opaque 4xx.
 *
 * Mirrors PR #42's `addCustodian` guard test in
 * `custodian-identifier-resolution.test.ts`.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@aegis/db", () => ({
  logAudit: vi.fn(async () => undefined),
}));

vi.mock("../src/internal/services/m365-graph-delegated-auth", () => ({
  getFreshDelegatedAccessToken: vi.fn(async () => ({
    accessToken: "stub-token",
    expiresAt: new Date(Date.now() + 60_000),
  })),
}));

import { M365GraphDelegatedClient } from "../src/internal/services/m365-graph-delegated-client";
import type { ApplyPreservationInput } from "../src/internal/services/m365";

type AddSource = (
  caseId: string,
  custodianId: string,
  input: ApplyPreservationInput,
) => Promise<string | null>;

function privateAddSource(client: M365GraphDelegatedClient): AddSource {
  return (
    client as unknown as { addSource: AddSource }
  ).addSource.bind(client);
}

const mailboxBase: ApplyPreservationInput = {
  custodianExternalIdentifier: "marcus.reid@6bs6wq.onmicrosoft.com",
  dataSourceExternalIdentifier: "marcus.reid@6bs6wq.onmicrosoft.com",
  type: "EMAIL_MAILBOX",
  action: "LEGAL_HOLD_IN_PLACE",
  reasonCode: "hold:lh-test",
};

const siteBase: ApplyPreservationInput = {
  custodianExternalIdentifier: "marcus.reid@6bs6wq.onmicrosoft.com",
  dataSourceExternalIdentifier: "https://contoso.sharepoint.com/sites/x",
  type: "SHAREPOINT_SITE",
  action: "LEGAL_HOLD_IN_PLACE",
  reasonCode: "hold:lh-test",
};

describe("M365GraphDelegatedClient.addSource — userSource guard", () => {
  it("throws on a non-email dataSourceExternalIdentifier for EMAIL_MAILBOX", async () => {
    const client = new M365GraphDelegatedClient("tenant-x", "org-1");
    const addSource = privateAddSource(client);
    await expect(
      addSource("case-1", "cust-1", {
        ...mailboxBase,
        dataSourceExternalIdentifier: "ckxyz0000abcdefg",
      }),
    ).rejects.toThrow(/must be a UPN \(email format\)/);
  });

  it("error message includes the offending value and the source type", async () => {
    const client = new M365GraphDelegatedClient("tenant-x", "org-1");
    const addSource = privateAddSource(client);
    await expect(
      addSource("case-1", "cust-1", {
        ...mailboxBase,
        type: "ONEDRIVE",
        dataSourceExternalIdentifier: "garbage-id",
      }),
    ).rejects.toThrow(/"garbage-id"/);
    await expect(
      addSource("case-1", "cust-1", {
        ...mailboxBase,
        type: "ONEDRIVE",
        dataSourceExternalIdentifier: "garbage-id",
      }),
    ).rejects.toThrow(/ONEDRIVE/);
  });
});

describe("M365GraphDelegatedClient.addSource — siteSource guard", () => {
  it("throws on a non-URL dataSourceExternalIdentifier for SHAREPOINT_SITE", async () => {
    const client = new M365GraphDelegatedClient("tenant-x", "org-1");
    const addSource = privateAddSource(client);
    await expect(
      addSource("case-1", "cust-1", {
        ...siteBase,
        dataSourceExternalIdentifier: "not-a-url",
      }),
    ).rejects.toThrow(/must be an http\(s\) webUrl/);
    await expect(
      addSource("case-1", "cust-1", {
        ...siteBase,
        dataSourceExternalIdentifier: "not-a-url",
      }),
    ).rejects.toThrow(/"not-a-url"/);
  });
});

describe("M365GraphDelegatedClient.addSource — happy paths serialize bodies exactly", () => {
  function makeClient(captured: { path?: string; body?: unknown }) {
    const client = new M365GraphDelegatedClient("tenant-x", "org-1");
    const fakeGraph = {
      api(path: string) {
        captured.path = path;
        return {
          post: async (body: unknown) => {
            captured.body = body;
            return { id: "stub-source-id" };
          },
        };
      },
    };
    (client as unknown as { graph: unknown }).graph = fakeGraph;
    return client;
  }

  it("mailbox call posts { email: <upn> }", async () => {
    const captured: { path?: string; body?: unknown } = {};
    const client = makeClient(captured);
    const addSource = privateAddSource(client);
    const id = await addSource("case-1", "cust-1", mailboxBase);
    expect(id).toBe("stub-source-id");
    expect(captured.path).toContain("/userSources");
    expect(captured.body).toEqual({
      email: "marcus.reid@6bs6wq.onmicrosoft.com",
    });
  });

  it("site call posts { site: { webUrl: <url> } }", async () => {
    const captured: { path?: string; body?: unknown } = {};
    const client = makeClient(captured);
    const addSource = privateAddSource(client);
    const id = await addSource("case-1", "cust-1", siteBase);
    expect(id).toBe("stub-source-id");
    expect(captured.path).toContain("/siteSources");
    expect(captured.body).toEqual({
      site: { webUrl: "https://contoso.sharepoint.com/sites/x" },
    });
  });
});
