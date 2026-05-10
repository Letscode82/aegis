/**
 * Bug B coverage — `resolveDataSourceExternalIdentifier` (Part 1).
 *
 * Mirrors `custodian-identifier-resolution.test.ts` from PR #42 one
 * layer down. For mailbox-like sources we resolve from
 * `Person.email`, not the free-form `CustodianDataSource.externalIdentifier`,
 * so a stale CUID/GUID/UPN in that column cannot reach Graph. SHAREPOINT_SITE
 * still rides the persisted webUrl after a startsWith("http") sanity check.
 * Every other type throws `DataSourceNotImplementedError` until B.2 / B.3
 * land.
 */
import { describe, expect, it, vi } from "vitest";
import type { DataSourceType } from "@aegis/db";

vi.mock("@aegis/db", () => ({
  logAudit: vi.fn(async () => undefined),
}));

import {
  DataSourceNotImplementedError,
  resolveDataSourceExternalIdentifier,
} from "../src/internal/legal-hold/services/data-sources";

const personWithEmail = {
  id: "p-1",
  name: "Marcus Reid",
  email: "marcus.reid@6bs6wq.onmicrosoft.com",
};
const personNoEmail = { id: "p-2", name: "Sarah Watson", email: null };

describe("resolveDataSourceExternalIdentifier — mailbox / OneDrive", () => {
  const mailboxTypes: DataSourceType[] = [
    "EMAIL_MAILBOX",
    "ARCHIVED_MAILBOX",
    "DEPARTED_USER_MAILBOX",
    "ONEDRIVE",
  ];

  for (const type of mailboxTypes) {
    it(`returns person.email for ${type}, ignoring stale externalIdentifier`, () => {
      expect(
        resolveDataSourceExternalIdentifier(
          // externalIdentifier is intentionally a CUID — exactly the bug
          // shape Bug B describes. The resolver must NOT trust it.
          { type, externalIdentifier: "ckxyz0000abcdefg" },
          personWithEmail,
        ),
      ).toBe("marcus.reid@6bs6wq.onmicrosoft.com");
    });

    it(`throws on ${type} when person.email is null, naming person and type`, () => {
      expect(() =>
        resolveDataSourceExternalIdentifier(
          { type, externalIdentifier: "anything" },
          personNoEmail,
        ),
      ).toThrow(/p-2/);
      expect(() =>
        resolveDataSourceExternalIdentifier(
          { type, externalIdentifier: "anything" },
          personNoEmail,
        ),
      ).toThrow(/Sarah Watson/);
      expect(() =>
        resolveDataSourceExternalIdentifier(
          { type, externalIdentifier: "anything" },
          personNoEmail,
        ),
      ).toThrow(new RegExp(type));
    });
  }
});

describe("resolveDataSourceExternalIdentifier — SHAREPOINT_SITE", () => {
  it("returns externalIdentifier unchanged when it is a https URL", () => {
    const url = "https://contoso.sharepoint.com/sites/legal-matters";
    expect(
      resolveDataSourceExternalIdentifier(
        { type: "SHAREPOINT_SITE", externalIdentifier: url },
        personWithEmail,
      ),
    ).toBe(url);
  });

  it("accepts http URLs (some on-prem-hybrid tenants)", () => {
    const url = "http://intranet.contoso.com/sites/x";
    expect(
      resolveDataSourceExternalIdentifier(
        { type: "SHAREPOINT_SITE", externalIdentifier: url },
        personWithEmail,
      ),
    ).toBe(url);
  });

  it("throws on a non-URL externalIdentifier with the offending value", () => {
    expect(() =>
      resolveDataSourceExternalIdentifier(
        { type: "SHAREPOINT_SITE", externalIdentifier: "not-a-url" },
        personWithEmail,
      ),
    ).toThrow(/"not-a-url"/);
    expect(() =>
      resolveDataSourceExternalIdentifier(
        { type: "SHAREPOINT_SITE", externalIdentifier: "not-a-url" },
        personWithEmail,
      ),
    ).toThrow(/expected an http\(s\) webUrl/);
  });
});

describe("resolveDataSourceExternalIdentifier — unsupported types throw NotImplementedError", () => {
  it("throws for TEAMS_CHANNEL pointing at the B.2 follow-up", () => {
    expect(() =>
      resolveDataSourceExternalIdentifier(
        { type: "TEAMS_CHANNEL", externalIdentifier: "irrelevant" },
        personWithEmail,
      ),
    ).toThrow(DataSourceNotImplementedError);
    expect(() =>
      resolveDataSourceExternalIdentifier(
        { type: "TEAMS_CHANNEL", externalIdentifier: "irrelevant" },
        personWithEmail,
      ),
    ).toThrow(/TEAMS_CHANNEL/);
    expect(() =>
      resolveDataSourceExternalIdentifier(
        { type: "TEAMS_CHANNEL", externalIdentifier: "irrelevant" },
        personWithEmail,
      ),
    ).toThrow(/B\.2/);
  });

  it("throws for SLACK_CHANNEL pointing at the B.3 follow-up", () => {
    expect(() =>
      resolveDataSourceExternalIdentifier(
        { type: "SLACK_CHANNEL", externalIdentifier: "irrelevant" },
        personWithEmail,
      ),
    ).toThrow(DataSourceNotImplementedError);
    expect(() =>
      resolveDataSourceExternalIdentifier(
        { type: "SLACK_CHANNEL", externalIdentifier: "irrelevant" },
        personWithEmail,
      ),
    ).toThrow(/B\.3/);
  });

  const teamsRest: DataSourceType[] = ["TEAMS_PRIVATE_CHANNEL", "TEAMS_DM"];
  for (const type of teamsRest) {
    it(`throws DataSourceNotImplementedError for ${type} (B.2)`, () => {
      expect(() =>
        resolveDataSourceExternalIdentifier(
          { type, externalIdentifier: "irrelevant" },
          personWithEmail,
        ),
      ).toThrow(DataSourceNotImplementedError);
      expect(() =>
        resolveDataSourceExternalIdentifier(
          { type, externalIdentifier: "irrelevant" },
          personWithEmail,
        ),
      ).toThrow(/B\.2/);
    });
  }

  const slackGoogle: DataSourceType[] = ["SLACK_DM", "GOOGLE_DRIVE", "GOOGLE_CHAT"];
  for (const type of slackGoogle) {
    it(`throws DataSourceNotImplementedError for ${type} (B.3)`, () => {
      expect(() =>
        resolveDataSourceExternalIdentifier(
          { type, externalIdentifier: "irrelevant" },
          personWithEmail,
        ),
      ).toThrow(DataSourceNotImplementedError);
      expect(() =>
        resolveDataSourceExternalIdentifier(
          { type, externalIdentifier: "irrelevant" },
          personWithEmail,
        ),
      ).toThrow(/B\.3/);
    });
  }
});
