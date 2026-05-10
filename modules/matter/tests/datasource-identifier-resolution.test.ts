/**
 * Unit coverage for `resolveDataSourceExternalIdentifier` and the
 * companion `addSource` upstream-of-Graph guard. Mirrors
 * custodian-identifier-resolution.test.ts one layer down.
 *
 * The 17-value DataSourceType enum splits three ways:
 *   - mailbox-class (4):   resolves from person.email
 *   - SHAREPOINT_SITE:     keeps externalIdentifier (must be URL-shaped)
 *   - connector-class (7): throws NotImplementedError
 *   - non-Graph (5):       throws NonGraphPreservationError
 */
import { describe, expect, it, vi } from "vitest";
import type { DataSourceType } from "@aegis/db";

vi.mock("@aegis/db", () => ({
  logAudit: vi.fn(async () => undefined),
}));

vi.mock("../src/internal/services/m365-graph-delegated-auth", () => ({
  getFreshDelegatedAccessToken: vi.fn(async () => ({
    accessToken: "stub-token",
    expiresAt: new Date(Date.now() + 60_000),
  })),
}));

import {
  NonGraphPreservationError,
  NotImplementedError,
  resolveDataSourceExternalIdentifier,
} from "../src/internal/legal-hold/services/data-sources";
import { M365GraphDelegatedClient } from "../src/internal/services/m365-graph-delegated-client";

const personWithEmail = {
  id: "p-marcus",
  name: "Marcus Reid",
  email: "marcus.reid@6bs6wq.onmicrosoft.com",
};
const personNoEmail = { id: "p-marcus", name: "Marcus Reid", email: null };

function ds(type: DataSourceType, externalIdentifier = "exchange:marcus.reid") {
  return { id: "ds-1", type, externalIdentifier };
}

describe("resolveDataSourceExternalIdentifier — mailbox-class types", () => {
  it("returns person.email for EMAIL_MAILBOX when present", () => {
    expect(
      resolveDataSourceExternalIdentifier(ds("EMAIL_MAILBOX"), personWithEmail),
    ).toBe("marcus.reid@6bs6wq.onmicrosoft.com");
  });

  it.each<DataSourceType>([
    "EMAIL_MAILBOX",
    "ARCHIVED_MAILBOX",
    "DEPARTED_USER_MAILBOX",
    "ONEDRIVE",
  ])("returns person.email for %s", (type) => {
    expect(
      resolveDataSourceExternalIdentifier(ds(type), personWithEmail),
    ).toBe("marcus.reid@6bs6wq.onmicrosoft.com");
  });

  it("throws when person.email is null on a mailbox type — message names person + datasource", () => {
    expect(() =>
      resolveDataSourceExternalIdentifier(ds("EMAIL_MAILBOX"), personNoEmail),
    ).toThrow(/p-marcus/);
    expect(() =>
      resolveDataSourceExternalIdentifier(ds("EMAIL_MAILBOX"), personNoEmail),
    ).toThrow(/Marcus Reid/);
    expect(() =>
      resolveDataSourceExternalIdentifier(ds("EMAIL_MAILBOX"), personNoEmail),
    ).toThrow(/EMAIL_MAILBOX/);
    expect(() =>
      resolveDataSourceExternalIdentifier(ds("EMAIL_MAILBOX"), personNoEmail),
    ).toThrow(/ds-1/);
  });
});

describe("resolveDataSourceExternalIdentifier — SHAREPOINT_SITE", () => {
  it("returns externalIdentifier unchanged for a valid https URL", () => {
    const url = "https://contoso.sharepoint.com/sites/legal";
    expect(
      resolveDataSourceExternalIdentifier(
        ds("SHAREPOINT_SITE", url),
        personWithEmail,
      ),
    ).toBe(url);
  });

  it("throws on a non-URL externalIdentifier — message includes offending value + ds id", () => {
    expect(() =>
      resolveDataSourceExternalIdentifier(
        ds("SHAREPOINT_SITE", "site:legal"),
        personWithEmail,
      ),
    ).toThrow(/"site:legal"/);
    expect(() =>
      resolveDataSourceExternalIdentifier(
        ds("SHAREPOINT_SITE", "site:legal"),
        personWithEmail,
      ),
    ).toThrow(/ds-1/);
  });
});

describe("resolveDataSourceExternalIdentifier — NotImplementedError types", () => {
  const cases: Array<{ type: DataSourceType; followUp: RegExp }> = [
    { type: "TEAMS_CHANNEL", followUp: /B\.2/ },
    { type: "TEAMS_PRIVATE_CHANNEL", followUp: /B\.2/ },
    { type: "TEAMS_DM", followUp: /B\.2/ },
    { type: "SLACK_CHANNEL", followUp: /B\.3/ },
    { type: "SLACK_DM", followUp: /B\.3/ },
    { type: "GOOGLE_DRIVE", followUp: /B\.3/ },
    { type: "GOOGLE_CHAT", followUp: /B\.3/ },
  ];
  it.each(cases)(
    "throws NotImplementedError for $type with follow-up reference",
    ({ type, followUp }) => {
      expect(() =>
        resolveDataSourceExternalIdentifier(ds(type), personWithEmail),
      ).toThrow(NotImplementedError);
      expect(() =>
        resolveDataSourceExternalIdentifier(ds(type), personWithEmail),
      ).toThrow(new RegExp(type));
      expect(() =>
        resolveDataSourceExternalIdentifier(ds(type), personWithEmail),
      ).toThrow(followUp);
    },
  );
});

describe("resolveDataSourceExternalIdentifier — NonGraphPreservationError types", () => {
  it.each<DataSourceType>([
    "EPHEMERAL_CHAT_AUTO_DELETE",
    "LOCAL_DEVICE",
    "PHYSICAL_FILES",
    "THIRD_PARTY_SAAS",
    "OTHER",
  ])("throws NonGraphPreservationError for %s — message names type + B.6", (type) => {
    expect(() =>
      resolveDataSourceExternalIdentifier(ds(type), personWithEmail),
    ).toThrow(NonGraphPreservationError);
    expect(() =>
      resolveDataSourceExternalIdentifier(ds(type), personWithEmail),
    ).toThrow(new RegExp(type));
    expect(() =>
      resolveDataSourceExternalIdentifier(ds(type), personWithEmail),
    ).toThrow(/B\.6/);
  });
});

describe("error class distinction", () => {
  it("NotImplementedError and NonGraphPreservationError are distinct classes", () => {
    const notImpl = new NotImplementedError("x");
    const nonGraph = new NonGraphPreservationError("y");
    expect(notImpl).toBeInstanceOf(NotImplementedError);
    expect(notImpl).not.toBeInstanceOf(NonGraphPreservationError);
    expect(nonGraph).toBeInstanceOf(NonGraphPreservationError);
    expect(nonGraph).not.toBeInstanceOf(NotImplementedError);
  });

  it("both extend Error with stable error names for log filtering", () => {
    expect(new NotImplementedError("x")).toBeInstanceOf(Error);
    expect(new NotImplementedError("x").name).toBe("NotImplementedError");
    expect(new NonGraphPreservationError("y")).toBeInstanceOf(Error);
    expect(new NonGraphPreservationError("y").name).toBe(
      "NonGraphPreservationError",
    );
  });
});

describe("M365GraphDelegatedClient.addSource — input guards", () => {
  type AddSource = (
    caseId: string,
    custodianId: string,
    input: {
      type: DataSourceType;
      dataSourceExternalIdentifier: string;
      custodianExternalIdentifier: string;
      action: string;
      reasonCode: string;
    },
  ) => Promise<string | null>;

  function getAddSource(): AddSource {
    const client = new M365GraphDelegatedClient("tenant-x", "org-1");
    return (
      client as unknown as { addSource: AddSource }
    ).addSource.bind(client);
  }

  it("throws on a non-email dataSourceExternalIdentifier when the user-source branch is taken", async () => {
    const addSource = getAddSource();
    await expect(
      addSource("case-1", "cust-1", {
        type: "EMAIL_MAILBOX",
        dataSourceExternalIdentifier: "exchange:marcus.reid",
        custodianExternalIdentifier: "marcus.reid@example.com",
        action: "LEGAL_HOLD_IN_PLACE",
        reasonCode: "hold:lh-1",
      }),
    ).rejects.toThrow(/UPN \(email format\)/);
    await expect(
      addSource("case-1", "cust-1", {
        type: "EMAIL_MAILBOX",
        dataSourceExternalIdentifier: "exchange:marcus.reid",
        custodianExternalIdentifier: "marcus.reid@example.com",
        action: "LEGAL_HOLD_IN_PLACE",
        reasonCode: "hold:lh-1",
      }),
    ).rejects.toThrow(/"exchange:marcus\.reid"/);
  });

  it("throws on a non-URL dataSourceExternalIdentifier when isUserSource=false (SHAREPOINT_SITE)", async () => {
    const addSource = getAddSource();
    await expect(
      addSource("case-1", "cust-1", {
        type: "SHAREPOINT_SITE",
        dataSourceExternalIdentifier: "site:legal",
        custodianExternalIdentifier: "marcus.reid@example.com",
        action: "LEGAL_HOLD_IN_PLACE",
        reasonCode: "hold:lh-1",
      }),
    ).rejects.toThrow(/http\(s\) URL/);
    await expect(
      addSource("case-1", "cust-1", {
        type: "SHAREPOINT_SITE",
        dataSourceExternalIdentifier: "site:legal",
        custodianExternalIdentifier: "marcus.reid@example.com",
        action: "LEGAL_HOLD_IN_PLACE",
        reasonCode: "hold:lh-1",
      }),
    ).rejects.toThrow(/"site:legal"/);
  });

  it("happy-path mailbox call serializes body as { email: <upn> }", async () => {
    const captured: { path?: string; body?: unknown } = {};
    const stubGraph = {
      api(path: string) {
        captured.path = path;
        return {
          post: async (body: unknown) => {
            captured.body = body;
            return { id: "graph-source-1" };
          },
        };
      },
    };

    const client = new M365GraphDelegatedClient("tenant-x", "org-1");
    (client as unknown as { graph: unknown }).graph = stubGraph;

    const addSource = (
      client as unknown as { addSource: AddSource }
    ).addSource.bind(client);

    const result = await addSource("case-1", "cust-1", {
      type: "EMAIL_MAILBOX",
      dataSourceExternalIdentifier: "marcus.reid@6bs6wq.onmicrosoft.com",
      custodianExternalIdentifier: "marcus.reid@6bs6wq.onmicrosoft.com",
      action: "LEGAL_HOLD_IN_PLACE",
      reasonCode: "hold:lh-1",
    });

    expect(result).toBe("graph-source-1");
    expect(captured.path).toBe(
      "/security/cases/ediscoveryCases/case-1/custodians/cust-1/userSources",
    );
    expect(captured.body).toEqual({
      email: "marcus.reid@6bs6wq.onmicrosoft.com",
    });
  });

  it("happy-path site call serializes body as { site: { webUrl: <url> } }", async () => {
    const captured: { path?: string; body?: unknown } = {};
    const stubGraph = {
      api(path: string) {
        captured.path = path;
        return {
          post: async (body: unknown) => {
            captured.body = body;
            return { id: "graph-site-1" };
          },
        };
      },
    };

    const client = new M365GraphDelegatedClient("tenant-x", "org-1");
    (client as unknown as { graph: unknown }).graph = stubGraph;

    const addSource = (
      client as unknown as { addSource: AddSource }
    ).addSource.bind(client);

    const url = "https://contoso.sharepoint.com/sites/legal";
    const result = await addSource("case-1", "cust-1", {
      type: "SHAREPOINT_SITE",
      dataSourceExternalIdentifier: url,
      custodianExternalIdentifier: "marcus.reid@6bs6wq.onmicrosoft.com",
      action: "LEGAL_HOLD_IN_PLACE",
      reasonCode: "hold:lh-1",
    });

    expect(result).toBe("graph-site-1");
    expect(captured.path).toBe(
      "/security/cases/ediscoveryCases/case-1/custodians/cust-1/siteSources",
    );
    expect(captured.body).toEqual({
      site: { webUrl: url },
    });
  });
});
