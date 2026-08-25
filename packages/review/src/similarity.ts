/**
 * PROC-9 (pure) — near-duplicate detection (MinHash over word shingles) and a
 * lightweight language-ID heuristic. Deterministic, dependency-free, unit-
 * tested. Exact dedup already exists (dedupKey); this finds *near* duplicates
 * (edited/quoted variants) and tags document language. Persisting the results
 * onto ReviewSetItem needs a column (a separate migration) — these helpers are
 * the engine that both an on-the-fly read and that later column can use.
 */

// ── Near-duplicate detection (MinHash) ──────────────────────────────

const STOP = new Set(["the", "and", "for", "are", "was", "with", "from", "this", "that", "have", "has", "you", "your", "our"]);

/** Word shingles (k-grams) of a document's text, lowercased + de-noised. */
export function shingles(text: string, k = 3): Set<string> {
  const words = (text || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 2 && !STOP.has(w));
  const out = new Set<string>();
  if (words.length < k) { if (words.length) out.add(words.join(" ")); return out; }
  for (let i = 0; i + k <= words.length; i++) out.add(words.slice(i, i + k).join(" "));
  return out;
}

/** Deterministic 32-bit string hash (FNV-1a) with a seed mix. */
function hashSeeded(s: string, seed: number): number {
  let h = (2166136261 ^ seed) >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** MinHash signature: the min hash across shingles for each of `numHashes` seeds. */
export function minhashSignature(shingleSet: Set<string>, numHashes = 32): number[] {
  const sig = new Array<number>(numHashes).fill(0xffffffff);
  if (shingleSet.size === 0) return sig;
  for (const sh of shingleSet) {
    for (let i = 0; i < numHashes; i++) {
      const h = hashSeeded(sh, i * 0x9e3779b1);
      if (h < sig[i]!) sig[i] = h;
    }
  }
  return sig;
}

/** Estimated Jaccard similarity = fraction of matching signature positions. */
export function estimateJaccard(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let match = 0;
  for (let i = 0; i < n; i++) if (a[i] === b[i]) match++;
  return match / n;
}

export interface NearDupGroup { ids: string[]; size: number }

/**
 * Group documents that are near-duplicates (estimated Jaccard ≥ threshold).
 * Pairwise (O(n²)) — call on a bounded set. Singletons are omitted. Returns
 * groups largest-first, ids sorted for determinism.
 */
export function nearDuplicateGroups(
  items: Array<{ id: string; text: string | null | undefined }>,
  opts: { threshold?: number; numHashes?: number; k?: number } = {},
): NearDupGroup[] {
  const threshold = opts.threshold ?? 0.8;
  const sigs = items.map((it) => ({ id: it.id, sig: minhashSignature(shingles(it.text ?? "", opts.k ?? 3), opts.numHashes ?? 32), empty: !(it.text && it.text.trim()) }));
  // Union-find over near-duplicate pairs.
  const parent = new Map<string, string>();
  const find = (x: string): string => { let r = x; while (parent.get(r) && parent.get(r) !== r) r = parent.get(r)!; return r; };
  const union = (a: string, b: string) => { parent.set(find(a), find(b)); };
  for (const s of sigs) parent.set(s.id, s.id);
  for (let i = 0; i < sigs.length; i++) {
    if (sigs[i]!.empty) continue;
    for (let j = i + 1; j < sigs.length; j++) {
      if (sigs[j]!.empty) continue;
      if (estimateJaccard(sigs[i]!.sig, sigs[j]!.sig) >= threshold) union(sigs[i]!.id, sigs[j]!.id);
    }
  }
  const groups = new Map<string, string[]>();
  for (const s of sigs) { const root = find(s.id); groups.set(root, [...(groups.get(root) ?? []), s.id]); }
  return [...groups.values()]
    .filter((ids) => ids.length > 1)
    .map((ids) => ({ ids: [...ids].sort(), size: ids.length }))
    .sort((a, b) => b.size - a.size || a.ids[0]!.localeCompare(b.ids[0]!));
}

// ── Language identification (stopword heuristic) ────────────────────

const LANG_STOP: Record<string, string[]> = {
  en: ["the", "and", "of", "to", "in", "is", "that", "for", "with", "was"],
  de: ["der", "die", "und", "das", "ist", "nicht", "ein", "zu", "mit", "den"],
  fr: ["le", "la", "les", "et", "des", "une", "est", "pour", "dans", "que"],
  es: ["el", "la", "los", "que", "de", "una", "por", "con", "para", "como"],
};

/** Best-guess ISO language code from stopword frequency; "unknown" if weak. */
export function detectLanguage(text: string | null | undefined): string {
  const words = (text || "").toLowerCase().split(/[^a-zà-ÿ]+/).filter(Boolean);
  if (words.length < 8) return "unknown";
  const counts = new Set(words);
  let best = "unknown", bestScore = 0;
  for (const [lang, stops] of Object.entries(LANG_STOP)) {
    const score = stops.reduce((n, w) => n + (counts.has(w) ? 1 : 0), 0);
    if (score > bestScore) { bestScore = score; best = lang; }
  }
  return bestScore >= 2 ? best : "unknown";
}
