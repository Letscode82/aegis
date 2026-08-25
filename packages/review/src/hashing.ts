/**
 * PROC-5 (pure) — content hashing, hash-based dedup, and deNIST.
 *
 * Server-side (uses node:crypto). These are the engine pieces for defensible,
 * hash-based deduplication and NIST NSRL de-listing. Persisting a per-item
 * `contentHash` onto ReviewSetItem (so dedup/deNIST run in the pipeline) is a
 * later migration; these functions are what that wiring — and any on-the-fly
 * read — will call.
 */
import { createHash } from "node:crypto";

/** SHA-256 hex of a document's normalized text (the modern dedup identity). */
export function contentHash(text: string | null | undefined): string {
  return createHash("sha256").update((text ?? "").replace(/\s+/g, " ").trim()).digest("hex");
}

/** MD5 hex — the legacy eDiscovery identity many load files still carry. */
export function md5Hash(text: string | null | undefined): string {
  return createHash("md5").update((text ?? "").replace(/\s+/g, " ").trim()).digest("hex");
}

export interface HashedItem { id: string; hash: string }

export interface DedupResult {
  /** One representative id per distinct hash (the "keep" set). */
  unique: string[];
  /** Groups of exact-content duplicates: keep the first, drop the rest. */
  groups: Array<{ keep: string; drop: string[] }>;
  duplicateCount: number;
}

/** Group items by identical content hash — exact-content dedup (order stable). */
export function dedupByHash(items: HashedItem[]): DedupResult {
  const byHash = new Map<string, string[]>();
  for (const it of items) {
    if (!it.hash) continue;
    byHash.set(it.hash, [...(byHash.get(it.hash) ?? []), it.id]);
  }
  const unique: string[] = [];
  const groups: Array<{ keep: string; drop: string[] }> = [];
  let duplicateCount = 0;
  for (const ids of byHash.values()) {
    unique.push(ids[0]!);
    if (ids.length > 1) { groups.push({ keep: ids[0]!, drop: ids.slice(1) }); duplicateCount += ids.length - 1; }
  }
  return { unique, groups, duplicateCount };
}

/**
 * A tiny built-in set of known non-substantive content hashes (starter deNIST).
 * The real NIST NSRL set is ~100M+ file hashes loaded from a distributed file —
 * a data (not code) follow-up; `deNIST` accepts an extra set so that loader
 * plugs in without a code change.
 */
export const KNOWN_SYSTEM_HASHES: ReadonlySet<string> = new Set<string>([
  contentHash(""), // empty document
]);

/** True when the hash is a known system / non-substantive file. */
export function isKnownSystemHash(hash: string, extra?: ReadonlySet<string>): boolean {
  return KNOWN_SYSTEM_HASHES.has(hash) || (extra?.has(hash) ?? false);
}

/** Split items into kept vs. removed (known system files) — deNIST. */
export function deNIST(items: HashedItem[], extra?: ReadonlySet<string>): { kept: string[]; removed: string[] } {
  const kept: string[] = [], removed: string[] = [];
  for (const it of items) (isKnownSystemHash(it.hash, extra) ? removed : kept).push(it.id);
  return { kept, removed };
}
