/**
 * Real OFAC SDN feed (Intake P2b) — the production data source behind
 * sanctions screening, replacing the bootstrap list.
 *
 * Fetches the US Treasury Specially Designated Nationals (SDN) list and
 * parses it into RawSanctionsEntry[] for refreshSanctionsList(). The
 * legacy SDN.CSV format is stable and header-less:
 *   ent_num, SDN_Name, SDN_Type, Program, Title, Call_Sign, Vess_Type,
 *   Tonnage, GRT, Vess_Flag, Vess_Owner, Remarks
 * Empty fields are the literal "-0-". Programs can be "; "-joined.
 *
 * The parser is pure and unit-tested; the network call is injected
 * (`httpGet`) so tests run offline and the admin trigger can fall back
 * to the bootstrap list when the feed is unreachable.
 */
import type { RawSanctionsEntry, SanctionsFeedFetcher } from "./server";

export const OFAC_SDN_CSV_URL = "https://www.treasury.gov/ofac/downloads/sdn.csv";

/** Char-level CSV parse (RFC-4180-ish): handles quoted fields, embedded
 * commas/newlines, and doubled "" escapes. Returns rows of string cells. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

/** OFAC uses "-0-" as the empty sentinel; normalize to "". */
function clean(v: string | undefined): string {
  const s = (v ?? "").trim();
  return s === "-0-" ? "" : s;
}

export function parseOfacSdnCsv(csv: string): RawSanctionsEntry[] {
  const out: RawSanctionsEntry[] = [];
  for (const cells of parseCsv(csv)) {
    if (cells.length < 4) continue;
    const entNum = clean(cells[0]);
    const name = clean(cells[1]);
    if (!entNum || !name) continue;
    const typeRaw = clean(cells[2]).toLowerCase();
    const programRaw = clean(cells[3]);
    const programs = programRaw
      ? programRaw.split(/;\s*/).map((p) => p.trim()).filter(Boolean)
      : [];
    out.push({
      source: "OFAC-SDN",
      sourceRef: entNum,
      entityName: name,
      entityType: typeRaw || "entity",
      programs,
      country: null,
    });
  }
  return out;
}

/** Default network getter — fails loud so the caller can fall back. */
async function defaultHttpGet(url: string): Promise<string> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`OFAC SDN fetch failed: HTTP ${resp.status}`);
  return resp.text();
}

/**
 * Build a SanctionsFeedFetcher backed by the live OFAC SDN feed. Inject
 * `httpGet` in tests. Throws if the feed is unreachable or empty so the
 * admin trigger can fall back to the bootstrap list rather than wiping
 * the table to nothing.
 */
export function makeOfacSdnFetcher(
  httpGet: (url: string) => Promise<string> = defaultHttpGet,
): SanctionsFeedFetcher {
  return async () => {
    const csv = await httpGet(OFAC_SDN_CSV_URL);
    const entries = parseOfacSdnCsv(csv);
    if (entries.length === 0) {
      throw new Error("OFAC SDN feed returned no parseable entries");
    }
    return entries;
  };
}
