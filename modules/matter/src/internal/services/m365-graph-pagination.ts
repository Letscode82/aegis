/**
 * Microsoft Graph pagination helper (sub-PR 4d.0).
 *
 * Microsoft Graph paginates responses via `@odata.nextLink` and
 * REJECTS `$top=N` on a number of read endpoints AEGIS uses for
 * data-source enumeration (Drives, Teams, MailFolders, etc.) with:
 *
 *   "Query option 'Top' is not allowed."
 *
 * Smoke test pre-this-PR: `enumerateDataSourcesForUser` returned ✗
 * because of that rejection. The fix is to drop `$top=` and
 * paginate via the SDK's native nextLink chaining.
 *
 * `fetchAllPaged` walks the entire result set. Callers that only
 * need the first page (e.g. "is the user joined to ANY team?") can
 * use `fetchFirstPage` to avoid round-tripping every page.
 */
import type { Client } from "@microsoft/microsoft-graph-client";

interface ODataPage<T> {
  value?: T[];
  ["@odata.nextLink"]?: string;
}

/**
 * Walk every page returned by a Graph endpoint. Caps at
 * `maxPages` to avoid runaway loops if Microsoft returns a cyclic
 * link (defensive — should never happen).
 */
export async function fetchAllPaged<T>(
  graph: Client,
  initialPath: string,
  opts: { maxPages?: number } = {},
): Promise<T[]> {
  const maxPages = opts.maxPages ?? 50;
  const out: T[] = [];
  let path: string | undefined = initialPath;
  for (let i = 0; path && i < maxPages; i++) {
    const page = (await graph.api(path).get()) as ODataPage<T>;
    if (Array.isArray(page.value)) out.push(...page.value);
    path = page["@odata.nextLink"];
  }
  return out;
}

/** First-page-only variant for "do any rows exist" checks. */
export async function fetchFirstPage<T>(
  graph: Client,
  initialPath: string,
): Promise<T[]> {
  const page = (await graph.api(initialPath).get()) as ODataPage<T>;
  return Array.isArray(page.value) ? page.value : [];
}
