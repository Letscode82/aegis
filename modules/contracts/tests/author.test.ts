import { describe, it, expect } from "vitest";
import { renderTemplateBody } from "../src/internal/author";

describe("renderTemplateBody", () => {
  it("substitutes known variables", () => {
    const body = "This NDA is between {{counterparty.name}} and AEGIS, governed by {{contract.governingLaw}}.";
    const out = renderTemplateBody(body, { "counterparty.name": "Globex", "contract.governingLaw": "Delaware" });
    expect(out).toBe("This NDA is between Globex and AEGIS, governed by Delaware.");
  });

  it("tolerates whitespace inside the braces", () => {
    expect(renderTemplateBody("Hello {{  name  }}", { name: "World" })).toBe("Hello World");
  });

  it("leaves unresolved placeholders verbatim (never silently blanks)", () => {
    const out = renderTemplateBody("Party: {{counterparty.name}} · Value: {{value}}", { "counterparty.name": "Acme" });
    expect(out).toBe("Party: Acme · Value: {{value}}");
  });

  it("treats null / empty values as unresolved", () => {
    expect(renderTemplateBody("X{{a}}Y", { a: "" })).toBe("X{{a}}Y");
    expect(renderTemplateBody("X{{a}}Y", { a: null })).toBe("X{{a}}Y");
  });

  it("replaces every occurrence of a variable", () => {
    expect(renderTemplateBody("{{n}}-{{n}}-{{n}}", { n: "1" })).toBe("1-1-1");
  });

  it("handles an empty body", () => {
    expect(renderTemplateBody("", { a: "b" })).toBe("");
  });
});
