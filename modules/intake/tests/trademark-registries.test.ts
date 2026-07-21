import { describe, it, expect } from "vitest";
import { normalizeStatus, coerceClasses, type HttpFetch, type HttpResponse } from "../src/trademark/registries/types";
import { UsptoClient, mapUspto } from "../src/trademark/registries/uspto";
import { EuipoClient, mapEuipo } from "../src/trademark/registries/euipo";
import { WipoClient, mapWipo } from "../src/trademark/registries/wipo";
import { getConfiguredRegistries, searchAllRegistries } from "../src/trademark/registries/factory";

const ok = (body: unknown): HttpResponse => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
const httpReturning = (body: unknown): HttpFetch => async () => ok(body);

describe("registry helpers", () => {
  it("normalizeStatus maps to LIVE/DEAD/PENDING", () => {
    expect(normalizeStatus("Registered")).toBe("LIVE");
    expect(normalizeStatus("Abandoned")).toBe("DEAD");
    expect(normalizeStatus("Under examination")).toBe("PENDING");
  });
  it("coerceClasses handles arrays, csv, numbers", () => {
    expect(coerceClasses([9, "42"])).toEqual([9, 42]);
    expect(coerceClasses("9, 42")).toEqual([9, 42]);
    expect(coerceClasses(99)).toEqual([]); // out of range
  });
});

describe("registry response mappers", () => {
  it("mapUspto extracts marks", () => {
    const marks = mapUspto({ trademarks: [{ markElement: "AURORA", serialNumber: "88123456", internationalClass: "9,42", status: "Registered", ownerName: "Aurora Inc." }] });
    expect(marks).toHaveLength(1);
    expect(marks[0]).toMatchObject({ source: "USPTO", wordMark: "AURORA", classes: [9, 42], status: "LIVE", ref: "88123456" });
  });
  it("mapEuipo extracts marks from wordMarkSpecification", () => {
    const marks = mapEuipo({ trademarks: [{ wordMarkSpecification: { verbalElement: "AURORA" }, applicationNumber: "0180", niceClasses: [42], status: "Registered" }] });
    expect(marks[0]).toMatchObject({ source: "EUIPO", wordMark: "AURORA", classes: [42], ref: "0180" });
  });
  it("mapWipo extracts marks from brandName", () => {
    const marks = mapWipo({ results: [{ brandName: "AURORA", registrationNumber: "IR-999", niceClass: "9", status: "Active", holder: "Aurora Inc." }] });
    expect(marks[0]).toMatchObject({ source: "WIPO", wordMark: "AURORA", classes: [9], ref: "IR-999", status: "LIVE" });
  });
});

describe("clients (injected http)", () => {
  it("UsptoClient searches + maps", async () => {
    const c = new UsptoClient({ apiKey: "k", searchUrl: "https://example/uspto" }, httpReturning({ trademarks: [{ markElement: "ZED", serialNumber: "1", internationalClass: "9" }] }));
    const r = await c.searchMarks("ZED", [9]);
    expect(r[0].wordMark).toBe("ZED");
  });
  it("EuipoClient does OAuth then search", async () => {
    let call = 0;
    const http: HttpFetch = async () => { call += 1; return ok(call === 1 ? { access_token: "t", expires_in: 3600 } : { trademarks: [{ wordMarkSpecification: { verbalElement: "ZED" }, applicationNumber: "9" }] }); };
    const c = new EuipoClient({ clientId: "id", clientSecret: "s", tokenUrl: "https://tok", searchUrl: "https://srch" }, http);
    const r = await c.searchMarks("ZED", []);
    expect(call).toBe(2); // token, then search
    expect(r[0].wordMark).toBe("ZED");
  });
});

const HTTP: HttpFetch = async () => ok({});

describe("factory config gating", () => {
  it("no env → no registries (local-table fallback)", () => {
    expect(getConfiguredRegistries({}, HTTP)).toEqual([]);
  });
  it("full USPTO env → one client", () => {
    const c = getConfiguredRegistries({ USPTO_API_KEY: "k", USPTO_SEARCH_URL: "u" }, HTTP);
    expect(c.map((x) => x.source)).toEqual(["USPTO"]);
  });
  it("partial config in production throws (fail-loud)", () => {
    expect(() => getConfiguredRegistries({ NODE_ENV: "production", USPTO_API_KEY: "k" }, HTTP)).toThrow(/partial/i);
  });
  it("partial config in dev is skipped, not fatal", () => {
    expect(getConfiguredRegistries({ USPTO_API_KEY: "k" }, HTTP)).toEqual([]);
  });
});

describe("searchAllRegistries merge", () => {
  it("merges + dedups, records per-registry errors", async () => {
    const good = { source: "USPTO", searchMarks: async () => [{ source: "USPTO", ref: "1", wordMark: "A", classes: [9], status: "LIVE" }, { source: "USPTO", ref: "1", wordMark: "A", classes: [9], status: "LIVE" }] };
    const bad = { source: "WIPO", searchMarks: async () => { throw new Error("down"); } };
    const { marks, errors } = await searchAllRegistries([good, bad], "A", [9]);
    expect(marks).toHaveLength(1); // deduped
    expect(errors).toEqual([{ source: "WIPO", error: "down" }]);
  });
});
