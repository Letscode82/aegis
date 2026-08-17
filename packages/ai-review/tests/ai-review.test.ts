import { describe, it, expect } from "vitest";
import {
  buildReviewPrompt,
  parseAiReview,
  reviewDeterministic,
  screenDeterministic,
  routeTags,
  summarizeRoutes,
  type ReviewInstruction,
  type ReviewItem,
  type ReviewTag,
} from "../src/index";

const instruction: ReviewInstruction = {
  criteria: "Records concerning Priya Kulkarni's employment, benefits, and personal data.",
  subject: { name: "Priya Kulkarni", email: "priya.kulkarni@x.com" },
};

const items: ReviewItem[] = [
  { id: "a", title: "Employment record - Priya Kulkarni", text: "Salary band and manager for priya.kulkarni@x.com.", sourceSystem: "HRIS" },
  { id: "b", title: "Nightly backup completed", text: "System log, 4.2 TB. No personal data.", sourceSystem: "SharePoint" },
  { id: "c", title: "RE: privileged - litigation strategy", text: "Attorney-client: our counsel advises the following approach.", sourceSystem: "Exchange" },
];

describe("buildReviewPrompt", () => {
  it("includes criteria, subject, dimensions and every item id", () => {
    const p = buildReviewPrompt(instruction, items);
    expect(p).toContain("Priya Kulkarni");
    expect(p).toContain("RESPONSIVE");
    expect(p).toContain("STRICT JSON");
    for (const it of items) expect(p).toContain(`#${it.id}`);
  });
  it("lists issues when provided", () => {
    const p = buildReviewPrompt({ ...instruction, issues: [{ key: "kickback", description: "vendor kickbacks" }] }, items);
    expect(p).toContain("kickback: vendor kickbacks");
  });
});

describe("screenDeterministic", () => {
  it("flags responsive PII record and routes to reviewer", () => {
    const tags = screenDeterministic(instruction, items[0]!);
    const resp = tags.find((t) => t.kind === "RESPONSIVE")!;
    expect(resp.value).toBe(true);
    expect(tags.find((t) => t.kind === "PII")!.value).toBe(true);
    expect(routeTags(tags, { fromModel: false })).toBe("REVIEWER");
  });
  it("marks a non-responsive system log for auto-cull", () => {
    const tags = screenDeterministic(instruction, items[1]!);
    expect(tags.find((t) => t.kind === "RESPONSIVE")!.value).toBe(false);
    expect(routeTags(tags, { fromModel: false })).toBe("AUTO_CULL");
  });
  it("detects privilege and routes to attorney", () => {
    const tags = screenDeterministic(instruction, items[2]!);
    expect(tags.find((t) => t.kind === "PRIVILEGED")!.value).toBe(true);
    expect(routeTags(tags, { fromModel: false })).toBe("ATTORNEY");
  });
});

describe("routeTags", () => {
  const base = (over: Partial<ReviewTag>): ReviewTag => ({ kind: "RESPONSIVE", value: true, confidence: 0.9, citation: "x", rationale: "", issueKey: null, ...over });
  it("low confidence escalates to attorney", () => {
    expect(routeTags([base({ confidence: 0.2 })])).toBe("ATTORNEY");
  });
  it("fail-closed: confident model call without citation -> attorney", () => {
    expect(routeTags([base({ confidence: 0.9, citation: null })], { fromModel: true })).toBe("ATTORNEY");
    // Same tag from the deterministic screen is allowed (no citation rule).
    expect(routeTags([base({ confidence: 0.9, citation: null })], { fromModel: false })).toBe("REVIEWER");
  });
  it("privilege always wins", () => {
    expect(routeTags([base({}), { kind: "PRIVILEGED", value: true, confidence: 0.9, citation: "c", rationale: "", issueKey: null }])).toBe("ATTORNEY");
  });
});

describe("parseAiReview", () => {
  it("parses model JSON, clamps confidence, coerces citation", () => {
    const raw = { results: [{ itemId: "a", tags: [{ kind: "responsive", value: true, confidence: 1.4, citation: "priya.kulkarni@x.com", rationale: "subject email" }] }] };
    const out = parseAiReview(raw, instruction, [items[0]!]);
    expect(out).toHaveLength(1);
    const resp = out[0]!.tags[0]!;
    expect(resp.kind).toBe("RESPONSIVE");
    expect(resp.confidence).toBe(1); // clamped
    expect(out[0]!.route).toBe("REVIEWER");
    expect(out[0]!.degraded).toBe(false);
  });
  it("fills omitted items from the deterministic screen (batch always complete)", () => {
    const out = parseAiReview({ results: [] }, instruction, items);
    expect(out).toHaveLength(3);
    expect(out.every((r) => r.tags.length > 0)).toBe(true);
    expect(out.every((r) => r.degraded)).toBe(true); // all fell back
  });
  it("recovers JSON embedded in prose", () => {
    const raw = 'Here you go: {"results":[{"itemId":"b","tags":[{"kind":"RESPONSIVE","value":false,"confidence":0.9,"citation":null,"rationale":"log"}]}]} done';
    const out = parseAiReview(raw, instruction, [items[1]!]);
    expect(out[0]!.route).toBe("AUTO_CULL");
    expect(out[0]!.degraded).toBe(false);
  });
});

describe("reviewDeterministic + summarizeRoutes", () => {
  it("routes a full batch and tallies", () => {
    const results = reviewDeterministic(instruction, items);
    const summary = summarizeRoutes(results.map((r) => r.route));
    expect(summary.total).toBe(3);
    expect(summary.reviewer).toBe(1); // a
    expect(summary.autoCull).toBe(1); // b
    expect(summary.attorney).toBe(1); // c
  });
});
