import { describe, it, expect } from "vitest";
import { extractTemplatePlaceholders, humanizePlaceholder, inferTemplateFieldSpec, inferTemplateFields, resolveTemplateFields, isTemplateFieldVisible } from "../src/internal/template-vars";

describe("extractTemplatePlaceholders", () => {
  it("returns unique fillable tokens in first-seen order", () => {
    const body = "Between {{jioEntityName}} at {{jioRegisteredAddress}} on {{effectiveDate}}. Signed by {{jioEntityName}}.";
    expect(extractTemplatePlaceholders(body)).toEqual(["jioEntityName", "jioRegisteredAddress", "effectiveDate"]);
  });

  it("excludes the auto-filled tokens the form/backend resolve", () => {
    const body = "{{contract.title}} ({{contract.type}}) with {{counterparty.name}} under {{contract.governingLaw}} — plus {{coolingOffPeriodDays}} days.";
    expect(extractTemplatePlaceholders(body)).toEqual(["coolingOffPeriodDays"]);
  });

  it("ignores clause markers (never matched) and the {{clauses}} marker", () => {
    const body = "Scope. {{clause:LIAB}} {{clauses}} Then {{renewalTerm}}.";
    expect(extractTemplatePlaceholders(body)).toEqual(["renewalTerm"]);
  });

  it("tolerates whitespace inside the braces", () => {
    expect(extractTemplatePlaceholders("x {{  spaced.token  }} y")).toEqual(["spaced.token"]);
  });

  it("returns [] for no placeholders / empty input", () => {
    expect(extractTemplatePlaceholders("plain text")).toEqual([]);
    expect(extractTemplatePlaceholders("")).toEqual([]);
  });
});

describe("humanizePlaceholder", () => {
  it("humanizes camelCase and dotted tokens", () => {
    expect(humanizePlaceholder("jioRegisteredAddress")).toBe("Jio Registered Address");
    expect(humanizePlaceholder("effectiveDate")).toBe("Effective Date");
    expect(humanizePlaceholder("org.address")).toBe("Org Address");
    expect(humanizePlaceholder("cooling_off_days")).toBe("Cooling Off Days");
  });
});

describe("inferTemplateFieldSpec", () => {
  it("infers date fields", () => {
    expect(inferTemplateFieldSpec("effectiveDate").type).toBe("date");
    expect(inferTemplateFieldSpec("expiryDate").type).toBe("date");
    expect(inferTemplateFieldSpec("executionDate").type).toBe("date");
  });
  it("infers number fields for counts / amounts / rates", () => {
    expect(inferTemplateFieldSpec("coolingOffPeriodDays").type).toBe("number");
    expect(inferTemplateFieldSpec("contractValue").type).toBe("number");
    expect(inferTemplateFieldSpec("interestRate").type).toBe("number");
    expect(inferTemplateFieldSpec("liabilityCap").type).toBe("number");
  });
  it("infers a currency selector and email", () => {
    expect(inferTemplateFieldSpec("currency").type).toBe("currency");
    expect(inferTemplateFieldSpec("borrowerEmail").type).toBe("email");
  });
  it("falls back to text", () => {
    expect(inferTemplateFieldSpec("jioEntityName").type).toBe("text");
    expect(inferTemplateFieldSpec("reRegisteredAddress").type).toBe("text");
  });
  it("marks fields required by default, optional when the name says so", () => {
    expect(inferTemplateFieldSpec("jioEntityName").required).toBe(true);
    expect(inferTemplateFieldSpec("internalNotes").required).toBe(false);
    expect(inferTemplateFieldSpec("optionalRider").required).toBe(false);
  });
  it("judges on the last dotted path segment and sets label", () => {
    const s = inferTemplateFieldSpec("org.effectiveDate");
    expect(s.type).toBe("date");
    expect(s.label).toBe("Org Effective Date");
  });
});

describe("inferTemplateFields", () => {
  it("maps a token list preserving order", () => {
    const specs = inferTemplateFields(["effectiveDate", "jioEntityName", "currency"]);
    expect(specs.map((s) => s.type)).toEqual(["date", "text", "currency"]);
  });
});

describe("resolveTemplateFields", () => {
  const body = "Between {{jioEntityName}} on {{effectiveDate}} for {{term}}. Govt: {{govEntity}}.";

  it("falls back to inference when there is no schema", () => {
    const fields = resolveTemplateFields(body, []);
    expect(fields.map((f) => f.token)).toEqual(["jioEntityName", "effectiveDate", "term", "govEntity"]);
    expect(fields.find((f) => f.token === "effectiveDate")?.type).toBe("date");
    expect(fields.every((f) => f.group === null && f.help === null && f.showIf === null)).toBe(true);
  });

  it("merges a per-template schema over inference (type/label/required/options/help/group/showIf)", () => {
    const fields = resolveTemplateFields(body, [
      { token: "jioEntityName", label: "Lender", required: false, group: "Parties", help: "Legal name" },
      { token: "term", type: "select", options: ["12 months", "24 months"], group: "Commercials" },
      { token: "govEntity", showIf: { token: "term", equals: "24 months" } },
    ]);
    const lender = fields.find((f) => f.token === "jioEntityName")!;
    expect(lender.label).toBe("Lender");
    expect(lender.required).toBe(false);
    expect(lender.group).toBe("Parties");
    expect(lender.help).toBe("Legal name");
    const term = fields.find((f) => f.token === "term")!;
    expect(term.type).toBe("select");
    expect(term.options).toEqual(["12 months", "24 months"]);
    const gov = fields.find((f) => f.token === "govEntity")!;
    expect(gov.showIf).toEqual({ token: "term", equals: "24 months" });
  });

  it("only surfaces fields whose {{token}} is actually in the body", () => {
    const fields = resolveTemplateFields("just {{a}}", [{ token: "a" }, { token: "notInBody", required: true }]);
    expect(fields.map((f) => f.token)).toEqual(["a"]);
  });
});

describe("isTemplateFieldVisible", () => {
  it("is always visible without a condition", () => {
    expect(isTemplateFieldVisible({ showIf: null }, {})).toBe(true);
  });
  it("respects equals", () => {
    const f = { showIf: { token: "regime", equals: "EU" } };
    expect(isTemplateFieldVisible(f, { regime: "EU" })).toBe(true);
    expect(isTemplateFieldVisible(f, { regime: "US" })).toBe(false);
    expect(isTemplateFieldVisible(f, {})).toBe(false);
  });
  it("respects in[]", () => {
    const f = { showIf: { token: "regime", in: ["EU", "UK"] } };
    expect(isTemplateFieldVisible(f, { regime: "UK" })).toBe(true);
    expect(isTemplateFieldVisible(f, { regime: "US" })).toBe(false);
  });
  it("bare showIf shows once the gating field has any value", () => {
    const f = { showIf: { token: "other" } };
    expect(isTemplateFieldVisible(f, { other: "x" })).toBe(true);
    expect(isTemplateFieldVisible(f, { other: "" })).toBe(false);
  });
});
