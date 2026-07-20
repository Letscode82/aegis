import { describe, it, expect } from "vitest";
import {
  normalizeDocument,
  serializeDocument,
  parseDocument,
  canonicalStringify,
} from "../src/agents/okf/serialize";
import { validateOkfDocument, OKF_VERSION } from "../src/agents/okf/schema";
import { STATIC_AGENT_DEFS } from "../src/agents/okf/static-defs";

describe("oKF serializer", () => {
  it("canonicalStringify sorts keys so structurally-equal objects are byte-equal", () => {
    const a = canonicalStringify({ b: 1, a: { d: 2, c: 3 } });
    const b = canonicalStringify({ a: { c: 3, d: 2 }, b: 1 });
    expect(a).toBe(b);
  });

  it("normalizeDocument fills every default from a sparse input", () => {
    const doc = normalizeDocument({ agent: { key: "x", name: "X", prompt: { systemTemplate: "hi" } } });
    expect(doc.okfVersion).toBe(OKF_VERSION);
    expect(doc.agent.model.maxTokens).toBeGreaterThan(0);
    expect(doc.agent.output.autoSendAtConfidence).toBeGreaterThan(0);
    expect(doc.agent.routing.matchType).toEqual([]);
    expect(doc.knowledge).toEqual([]);
  });

  it("export → import → export is byte-identical for every static def", () => {
    for (const def of STATIC_AGENT_DEFS) {
      const s1 = serializeDocument(def);
      const parsed = parseDocument(JSON.parse(s1));
      expect(parsed.ok, `${def.agent.key}: ${parsed.validation.errors.join(", ")}`).toBe(true);
      const s2 = serializeDocument(parsed.document!);
      expect(s2).toBe(s1);
    }
  });

  it("validate rejects a document missing required agent fields", () => {
    const r = validateOkfDocument({ okfVersion: 1, agent: { key: "", name: "" }, knowledge: [] });
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it("parseDocument fails closed on an invalid document", () => {
    const r = parseDocument({ nonsense: true });
    expect(r.ok).toBe(false);
    expect(r.document).toBeNull();
  });
});

describe("static defs cover all 11 agents", () => {
  it("has 11 valid definitions with unique keys", () => {
    expect(STATIC_AGENT_DEFS).toHaveLength(11);
    const keys = new Set(STATIC_AGENT_DEFS.map((d) => d.agent.key));
    expect(keys.size).toBe(11);
    for (const d of STATIC_AGENT_DEFS) {
      expect(validateOkfDocument(d).ok, d.agent.key).toBe(true);
    }
  });

  it("contract-review carries its clause library as CLAUSE items", () => {
    const cr = STATIC_AGENT_DEFS.find((d) => d.agent.key === "contract-review-agent")!;
    const clauses = cr.knowledge[0].items;
    expect(clauses.length).toBeGreaterThanOrEqual(10);
    expect(clauses.every((i) => i.kind === "CLAUSE")).toBe(true);
    expect(clauses.some((i) => i.code === "C.LIAB.CAP")).toBe(true);
  });
});
