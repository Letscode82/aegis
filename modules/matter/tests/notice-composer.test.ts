/**
 * Unit tests for the notice-composer service's variable
 * substitution (sub-PR 4c.3).
 *
 * The DB-touching paths (`getNoticeComposerPreviewService`,
 * `composeAndSendNoticeService`) require Postgres and the audit
 * chain; those land in the `db-integrity` job. Here we test the
 * pure `renderTemplate` helper exhaustively because the placeholder
 * grammar is the part end users (legal ops drafting templates) care
 * about most.
 */
import { describe, expect, it } from "vitest";
import { renderTemplate } from "../src/internal/legal-hold/services/notice-composer";

const VARS = {
  custodian: {
    name: "Marcus Reid",
    email: "marcus@acme.com",
    role: "Director",
  },
  matter: {
    title: "Snowflake breach response",
    matterNumber: "M-2026-0042",
    jurisdictions: ["US-CA", "EU-DE"],
  },
  hold: {
    title: "Snowflake-hold",
    holdNumber: "LH-2026-0001",
    scopeDescription: "All data sources connected to user-X.",
    triggeredAt: "2026-01-15T00:00:00.000Z",
  },
  org: { name: "Acme Corp" },
  notice: {
    acknowledgmentLink:
      "https://aegis-eight-roan.vercel.app/custodian/holds/lh-1/acknowledge",
  },
};

describe("renderTemplate()", () => {
  it("substitutes simple top-level placeholders", () => {
    expect(renderTemplate("Hello {{custodian.name}}", VARS)).toBe(
      "Hello Marcus Reid",
    );
  });

  it("substitutes deep paths", () => {
    expect(renderTemplate("Org: {{org.name}}", VARS)).toBe("Org: Acme Corp");
  });

  it("substitutes multiple placeholders in one string", () => {
    expect(
      renderTemplate(
        "Dear {{custodian.name}}, matter {{matter.title}} ({{matter.matterNumber}})",
        VARS,
      ),
    ).toBe(
      "Dear Marcus Reid, matter Snowflake breach response (M-2026-0042)",
    );
  });

  it("renders array values as comma-separated", () => {
    expect(
      renderTemplate("Jurisdictions: {{matter.jurisdictions}}", VARS),
    ).toBe("Jurisdictions: US-CA, EU-DE");
  });

  it("renders missing paths as `(unset)`", () => {
    expect(renderTemplate("Hi {{custodian.title}}", VARS)).toBe(
      "Hi (unset)",
    );
  });

  it("renders null leaves as `(unset)`", () => {
    const v = {
      ...VARS,
      hold: { ...VARS.hold, holdNumber: null },
    };
    expect(renderTemplate("Hold {{hold.holdNumber}}", v)).toBe("Hold (unset)");
  });

  it("tolerates whitespace inside the placeholder", () => {
    expect(renderTemplate("Hi {{ custodian.name }}", VARS)).toBe(
      "Hi Marcus Reid",
    );
  });

  it("leaves non-placeholder content alone", () => {
    const body =
      "## Notice\n\nThis is markdown with a {{custodian.name}} placeholder.";
    expect(renderTemplate(body, VARS)).toContain("## Notice");
    expect(renderTemplate(body, VARS)).toContain("Marcus Reid");
  });

  it("substitutes the acknowledgment link", () => {
    const body = "Click here: {{notice.acknowledgmentLink}}";
    expect(renderTemplate(body, VARS)).toContain(
      "/custodian/holds/lh-1/acknowledge",
    );
  });

  it("ignores invalid placeholder syntax (single braces, etc.)", () => {
    expect(renderTemplate("price: {custodian.name}", VARS)).toBe(
      "price: {custodian.name}",
    );
  });
});
