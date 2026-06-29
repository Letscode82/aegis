/**
 * OFAC SDN feed parser (Intake P2b) — the production sanctions data
 * source. The parser is pure; the network call is injected so this runs
 * offline. Sample rows mirror the real Treasury SDN.CSV shape
 * (header-less, "-0-" empties, "; "-joined programs, quoted commas).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("./server", () => ({})); // type-only import; no runtime need

const { parseCsv, parseOfacSdnCsv, makeOfacSdnFetcher, OFAC_SDN_CSV_URL } =
  await import("../src/sanctions/ofac-feed");

const SAMPLE = [
  `36,"AEROCARIBBEAN AIRLINES","-0- ","CUBA","-0- ","-0- "`,
  `306,"HIZBALLAH","-0- ","SDGT; SYRIA","-0- "`,
  `12345,"KORLINE CO., LTD.","-0- ","DPRK2","-0- "`,
  `7777,"DOE, John","individual","IRAN","Chief"`,
  `-0-,"","-0- ","-0- "`, // junk row — skipped
].join("\n");

describe("parseCsv", () => {
  it("handles quoted fields with embedded commas", () => {
    const rows = parseCsv(`1,"Smith, John","x"`);
    expect(rows[0]).toEqual(["1", "Smith, John", "x"]);
  });
  it("handles doubled-quote escapes", () => {
    const rows = parseCsv(`1,"the ""big"" co",y`);
    expect(rows[0]).toEqual(["1", 'the "big" co', "y"]);
  });
});

describe("parseOfacSdnCsv", () => {
  it("maps entities, normalizes -0- empties, splits programs", () => {
    const out = parseOfacSdnCsv(SAMPLE);
    expect(out).toHaveLength(4); // junk row dropped

    const hiz = out.find((e) => e.sourceRef === "306")!;
    expect(hiz.entityName).toBe("HIZBALLAH");
    expect(hiz.source).toBe("OFAC-SDN");
    expect(hiz.entityType).toBe("entity"); // "-0-" → entity
    expect(hiz.programs).toEqual(["SDGT", "SYRIA"]); // "; " split

    const person = out.find((e) => e.sourceRef === "7777")!;
    expect(person.entityType).toBe("individual");
    expect(person.entityName).toBe("DOE, John"); // quoted comma preserved
    expect(person.programs).toEqual(["IRAN"]);
  });

  it("drops rows with no ent_num or no name", () => {
    const out = parseOfacSdnCsv(`-0-,"AAA","-0-","X"\n99,"","-0-","X"`);
    expect(out).toHaveLength(0);
  });
});

describe("makeOfacSdnFetcher", () => {
  it("fetches the SDN URL and returns parsed entries", async () => {
    const httpGet = vi.fn().mockResolvedValue(SAMPLE);
    const fetcher = makeOfacSdnFetcher(httpGet);
    const entries = await fetcher();
    expect(httpGet).toHaveBeenCalledWith(OFAC_SDN_CSV_URL);
    expect(entries.length).toBe(4);
    expect(entries[0].source).toBe("OFAC-SDN");
  });

  it("throws when the feed yields no entries (so the caller can fall back)", async () => {
    const httpGet = vi.fn().mockResolvedValue("-0-,\"\",\"-0-\",\"-0-\"");
    await expect(makeOfacSdnFetcher(httpGet)()).rejects.toThrow(/no parseable entries/i);
  });

  it("propagates a network error (caller falls back to bootstrap)", async () => {
    const httpGet = vi.fn().mockRejectedValue(new Error("HTTP 503"));
    await expect(makeOfacSdnFetcher(httpGet)()).rejects.toThrow(/503/);
  });
});
