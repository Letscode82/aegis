import { describe, it, expect } from "vitest";
import {
  fromRoutingJson,
  renderTemplate,
  renderKnowledge,
  selectItemsForTicket,
  mapConfidenceToAction,
  runDefinition,
} from "../src/agents/okf/runtime";
import { buildRec, buildDegradedRec } from "../src/agents/build-rec.js";
import { normalizeDocument } from "../src/agents/okf/serialize";
import { staticDefForKey } from "../src/agents/okf/static-defs";

const friendlyAIError = (e: unknown) => String((e as Error)?.message || e);

describe("fromRoutingJson", () => {
  const canHandle = fromRoutingJson({ matchType: ["contract"], matchKeyword: ["msa"], excludeKeyword: ["nda"], requiresDocument: true });

  it("matches on type", () => {
    expect(canHandle({ type: "Contract Review", desc: "hi", hasDocument: true })).toBe(true);
  });
  it("matches on keyword", () => {
    expect(canHandle({ type: "Other", desc: "please review this MSA", hasDocument: true })).toBe(true);
  });
  it("vetoes on exclude keyword", () => {
    expect(canHandle({ type: "Contract", desc: "an nda here", hasDocument: true })).toBe(false);
  });
  it("requires a document when requiresDocument is set", () => {
    expect(canHandle({ type: "Contract", desc: "msa", hasDocument: false })).toBe(false);
  });
});

describe("renderTemplate", () => {
  it("substitutes {{a.b}} and drops unknowns", () => {
    const out = renderTemplate("Hi {{ticket.firstName}}, re {{ticket.type}} — {{missing}}", {
      "ticket.firstName": "Dana",
      "ticket.type": "NDA",
    });
    expect(out).toBe("Hi Dana, re NDA — ");
  });
});

describe("mapConfidenceToAction", () => {
  const output = { autoSendAtConfidence: 0.85, defaultAction: "flag-for-review", autoSendAction: "approve-and-send" };
  it("returns auto-send at/above threshold", () => {
    expect(mapConfidenceToAction(0.9, output)).toBe("approve-and-send");
    expect(mapConfidenceToAction(0.85, output)).toBe("approve-and-send");
  });
  it("returns default below threshold", () => {
    expect(mapConfidenceToAction(0.84, output)).toBe("flag-for-review");
  });
});

describe("selectItemsForTicket + renderKnowledge (cohorts)", () => {
  const packs = [
    {
      key: "p",
      cohorts: [{ key: "msa", tag: "type:MSA", selector: { matchType: ["msa"] } }],
      items: [
        { code: "ALWAYS", title: "Always", bodyMarkdown: "x", cohortTags: [], sortOrder: 0 },
        { code: "ONLY_MSA", title: "MSA only", bodyMarkdown: "y", cohortTags: ["type:MSA"], sortOrder: 1 },
      ],
    },
  ];
  it("includes always-on items and cohort items only when the cohort matches", () => {
    const msa = selectItemsForTicket(packs, { type: "MSA agreement" });
    expect(msa.map((i) => i.code).sort()).toEqual(["ALWAYS", "ONLY_MSA"]);
    const other = selectItemsForTicket(packs, { type: "NDA" });
    expect(other.map((i) => i.code)).toEqual(["ALWAYS"]);
  });
  it("renders selected items to prose", () => {
    const text = renderKnowledge(selectItemsForTicket(packs, { type: "NDA" }));
    expect(text).toContain("Always");
    expect(text).not.toContain("MSA only");
  });
});

describe("runDefinition — governance-preserving harness", () => {
  const doc = staticDefForKey("contract-review-agent")!;
  const ticket = { type: "Contract Review", desc: "review this MSA", hasDocument: true, from: "Dana Lee", dept: "Eng" };

  it("JSON path maps high confidence to the auto-send action", async () => {
    const rec = await runDefinition(ticket, doc, doc.knowledge, {
      callClaudeJSON: async () => ({ draftedResponse: "ok", confidence: 0.92, reasoning: "r", concerns: [] }),
      callClaude: async () => "prose",
      buildRec, buildDegradedRec, friendlyAIError,
    });
    expect(rec.suggestedAction).toBe("approve-and-send");
    expect(rec.confidence).toBe(0.92);
  });

  it("falls back to plain text when JSON throws (the #208 reliability ladder)", async () => {
    const rec = await runDefinition(ticket, doc, doc.knowledge, {
      callClaudeJSON: async () => { throw new Error("truncated JSON"); },
      callClaude: async () => "A real plain-text review.",
      buildRec, buildDegradedRec, friendlyAIError,
    });
    expect(rec.draftedResponse).toContain("plain-text review");
    expect(rec.suggestedAction).toBe("flag-for-review"); // below auto-send
  });

  it("degrades (never throws) when both Claude calls fail", async () => {
    const boom = async () => { throw new Error("Claude unavailable"); };
    const rec = await runDefinition(ticket, doc, doc.knowledge, {
      callClaudeJSON: boom, callClaude: boom, buildRec, buildDegradedRec, friendlyAIError,
    });
    expect(rec.suggestedAction).toBe("flag-for-review");
    expect(rec.confidence).toBeLessThanOrEqual(0.4);
  });

  it("a text-mode agent runs the prose path directly", async () => {
    const lit = normalizeDocument(staticDefForKey("litigation-agent"));
    const rec = await runDefinition({ type: "Litigation", desc: "dispute", from: "A B" }, lit, lit.knowledge, {
      callClaudeJSON: async () => { throw new Error("should not be called"); },
      callClaude: async () => "Case brief prose.",
      buildRec, buildDegradedRec, friendlyAIError,
    });
    expect(rec.draftedResponse).toBe("Case brief prose.");
  });
});
