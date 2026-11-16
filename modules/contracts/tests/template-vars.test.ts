import { describe, it, expect } from "vitest";
import { extractTemplatePlaceholders, humanizePlaceholder, inferTemplateFieldSpec, inferTemplateFields } from "../src/internal/template-vars";

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
