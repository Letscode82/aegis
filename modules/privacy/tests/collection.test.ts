import { describe, it, expect } from "vitest";
import { collectionKey, summarizeHits } from "../src/internal/collection";

describe("collectionKey", () => {
  it("is case- and whitespace-insensitive so re-collection dedupes", () => {
    expect(collectionKey("Exchange · a@x.com", "Re: Invoice")).toBe(collectionKey("exchange · a@x.com", "  RE: INVOICE "));
  });
  it("distinguishes different sources or titles", () => {
    expect(collectionKey("Exchange", "A")).not.toBe(collectionKey("OneDrive", "A"));
    expect(collectionKey("Exchange", "A")).not.toBe(collectionKey("Exchange", "B"));
  });
});

describe("summarizeHits", () => {
  const hits = [
    { sourceType: "MAILBOX" as const, sourceSystem: "Exchange · a@x.com", title: "Re: invoice" },
    { sourceType: "MAILBOX" as const, sourceSystem: "Exchange · a@x.com", title: "Consent" },
    { sourceType: "ONEDRIVE" as const, sourceSystem: "OneDrive · a@x.com", title: "profile.xlsx" },
    { sourceType: "TEAMS" as const, sourceSystem: "Teams", title: "chat" },
  ];
  it("buckets by source and marks fresh vs already-in-queue", () => {
    const existing = new Set([collectionKey("Exchange · a@x.com", "Consent")]);
    const p = summarizeHits(hits, existing, false, "2026-06-01T00:00:00Z");
    expect(p.total).toBe(4);
    expect(p.fresh).toBe(3);
    expect(p.duplicates).toBe(1);
    const mailbox = p.bySource.find((b) => b.sourceType === "MAILBOX");
    expect(mailbox).toMatchObject({ total: 2, fresh: 1 });
    expect(p.bySource.map((b) => b.sourceType)).toEqual(["MAILBOX", "ONEDRIVE", "TEAMS"]); // canonical order
  });
  it("dedupes within the batch too", () => {
    const dup = [hits[0]!, hits[0]!];
    const p = summarizeHits(dup, new Set(), true, "t");
    expect(p.total).toBe(2);
    expect(p.fresh).toBe(1);
    expect(p.simulated).toBe(true);
  });
});

import { mapEnumeratedSource } from "../src/internal/data-inventory";

describe("mapEnumeratedSource", () => {
  it("maps M365 source types to friendly (system, dataType)", () => {
    expect(mapEnumeratedSource({ type: "EMAIL_MAILBOX", displayLabel: "Exchange mailbox" })).toEqual({ system: "Exchange Online", dataType: "email" });
    expect(mapEnumeratedSource({ type: "ONEDRIVE", displayLabel: "OneDrive" })).toEqual({ system: "OneDrive", dataType: "files" });
    expect(mapEnumeratedSource({ type: "TEAMS_DM", displayLabel: "Teams DM" })).toEqual({ system: "Microsoft Teams", dataType: "chats" });
    expect(mapEnumeratedSource({ type: "SHAREPOINT_SITE", displayLabel: "SP" })).toEqual({ system: "SharePoint", dataType: "documents" });
  });
  it("falls back to the label + normalized type", () => {
    expect(mapEnumeratedSource({ type: "OTHER_SOURCE", displayLabel: "Custom" })).toEqual({ system: "Custom", dataType: "other-source" });
  });
});
