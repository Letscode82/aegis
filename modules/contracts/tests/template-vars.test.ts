import { describe, it, expect } from "vitest";
import { extractTemplatePlaceholders, humanizePlaceholder } from "../src/internal/template-vars";

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
