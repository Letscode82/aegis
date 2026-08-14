import { describe, it, expect } from "vitest";
import { collectionKey } from "../src/internal/collection";

describe("collectionKey", () => {
  it("is case- and whitespace-insensitive so re-collection dedupes", () => {
    expect(collectionKey("Exchange · a@x.com", "Re: Invoice")).toBe(collectionKey("exchange · a@x.com", "  RE: INVOICE "));
  });
  it("distinguishes different sources or titles", () => {
    expect(collectionKey("Exchange", "A")).not.toBe(collectionKey("OneDrive", "A"));
    expect(collectionKey("Exchange", "A")).not.toBe(collectionKey("Exchange", "B"));
  });
});
