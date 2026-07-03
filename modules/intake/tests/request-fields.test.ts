/**
 * W3-3 (dynamic request-type fields, issue #115) — pure helpers.
 */
import { describe, expect, it } from "vitest";

const {
  humanizeKey,
  missingRequiredFields,
  fieldValuesToLines,
  DynamicFields,
  RequestFieldValues,
} = await import("../src/intake/request-fields.jsx" as never);

const FIELDS = [
  { key: "counterparty_name", label: "Counterparty name", kind: "text", required: true, sortOrder: 10 },
  { key: "contract_value", label: "Contract value (USD)", kind: "number", required: false, sortOrder: 20 },
  { key: "mutual", label: "Mutual NDA?", kind: "boolean", required: true, sortOrder: 30 },
  { key: "governing_law", label: "Governing law", kind: "select", required: false, sortOrder: 40, options: [{ value: "DE", label: "Delaware" }] },
];

describe("humanizeKey", () => {
  it("turns stored keys into readable labels", () => {
    expect(humanizeKey("adverse_party")).toBe("Adverse Party");
    expect(humanizeKey("contract-value")).toBe("Contract Value");
    expect(humanizeKey("")).toBe("");
  });
});

describe("missingRequiredFields", () => {
  it("lists required fields with no meaningful value", () => {
    expect(missingRequiredFields(FIELDS, {})).toEqual(["Counterparty name", "Mutual NDA?"]);
    expect(missingRequiredFields(FIELDS, { counterparty_name: "  " })).toEqual(["Counterparty name", "Mutual NDA?"]);
  });

  it("accepts booleans of either value and filled text", () => {
    expect(
      missingRequiredFields(FIELDS, { counterparty_name: "Acme", mutual: false }),
    ).toEqual([]);
  });

  it("is empty for types with no fields", () => {
    expect(missingRequiredFields([], {})).toEqual([]);
    expect(missingRequiredFields(undefined, {})).toEqual([]);
  });
});

describe("fieldValuesToLines", () => {
  it("renders answered fields as label: value lines, in field order", () => {
    expect(
      fieldValuesToLines(FIELDS, {
        counterparty_name: "Acme Robotics",
        mutual: true,
        governing_law: "DE",
      }),
    ).toEqual([
      "Counterparty name: Acme Robotics",
      "Mutual NDA?: Yes",
      "Governing law: DE",
    ]);
  });

  it("skips empty answers", () => {
    expect(fieldValuesToLines(FIELDS, { contract_value: "" })).toEqual([]);
  });
});

describe("components", () => {
  it("exports the form + detail components", () => {
    expect(typeof DynamicFields).toBe("function");
    expect(typeof RequestFieldValues).toBe("function");
  });
});
