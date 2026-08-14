import { describe, it, expect } from "vitest";
import { summarizeCollectionBySource } from "../src/internal/legal-hold/services/hold-collection";

describe("summarizeCollectionBySource", () => {
  it("buckets by source in canonical order with up to 3 samples", () => {
    const hits = [
      { sourceType: "TEAMS" as const, sourceSystem: "Teams", title: "chat1", excerpt: null, graphId: null, webUrl: null },
      { sourceType: "MAILBOX" as const, sourceSystem: "Exchange", title: "m1", excerpt: null, graphId: null, webUrl: null },
      { sourceType: "MAILBOX" as const, sourceSystem: "Exchange", title: "m2", excerpt: null, graphId: null, webUrl: null },
      { sourceType: "MAILBOX" as const, sourceSystem: "Exchange", title: "m3", excerpt: null, graphId: null, webUrl: null },
      { sourceType: "MAILBOX" as const, sourceSystem: "Exchange", title: "m4", excerpt: null, graphId: null, webUrl: null },
    ];
    const b = summarizeCollectionBySource(hits);
    expect(b.map((x) => x.sourceType)).toEqual(["MAILBOX", "TEAMS"]); // canonical order, mailbox before teams
    const mail = b.find((x) => x.sourceType === "MAILBOX")!;
    expect(mail.total).toBe(4);
    expect(mail.samples).toHaveLength(3);
  });
  it("is empty for no hits", () => {
    expect(summarizeCollectionBySource([])).toEqual([]);
  });
});
