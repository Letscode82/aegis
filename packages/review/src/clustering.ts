/**
 * ECA-2 — deterministic concept/theme clustering (pure, unit-tested).
 *
 * Groups a collection's documents into themes from their text alone: TF-IDF
 * over title+excerpt, then greedy cosine-threshold agglomeration. No external
 * dependency, no key, no migration — runs on-the-fly. A separate service layer
 * may add an optional Claude pass to *name* the clusters; this module always
 * produces a deterministic top-terms label so the feature works without a key.
 *
 * The similarity function is the seam: swapping TF-IDF vectors for real
 * embeddings later is a drop-in change with no caller impact.
 */
export interface ClusterDoc {
  id: string;
  title: string;
  excerpt?: string | null;
}

export interface DocCluster {
  id: string;
  label: string;
  topTerms: string[];
  docIds: string[];
  size: number;
}

export interface ClusterOptions {
  /** Cosine similarity a doc must reach to join an existing cluster (0..1). */
  threshold?: number;
  /** Hard cap on cluster count; excess merge into the nearest. */
  maxClusters?: number;
}

const STOPWORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "all", "any", "can", "her", "was", "one", "our", "out",
  "his", "has", "had", "him", "how", "man", "new", "now", "old", "see", "two", "way", "who", "did", "get",
  "may", "him", "this", "that", "with", "from", "have", "will", "your", "they", "been", "were", "them",
  "into", "then", "than", "when", "what", "which", "there", "their", "would", "could", "about", "after",
  "also", "please", "thanks", "regards", "hi", "hello", "dear", "re", "fw", "fwd", "sent", "subject",
  "email", "mail", "message", "attached", "attachment", "http", "https", "www", "com",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && t.length <= 24 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
}

type Vec = Map<string, number>;

function dot(a: Vec, b: Vec): number {
  // Iterate the smaller map.
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let s = 0;
  for (const [k, v] of small) { const w = large.get(k); if (w) s += v * w; }
  return s;
}
function norm(a: Vec): number {
  let s = 0;
  for (const v of a.values()) s += v * v;
  return Math.sqrt(s);
}
function cosine(a: Vec, b: Vec): number {
  const na = norm(a), nb = norm(b);
  if (na === 0 || nb === 0) return 0;
  return dot(a, b) / (na * nb);
}

/**
 * Cluster documents by TF-IDF cosine similarity (greedy, deterministic — input
 * order decides tie-breaks). Empty-text docs collapse into one "Uncategorized"
 * cluster. Returns clusters sorted largest-first.
 */
export function clusterDocuments(docs: ClusterDoc[], opts: ClusterOptions = {}): DocCluster[] {
  const threshold = opts.threshold ?? 0.2;
  const maxClusters = opts.maxClusters ?? 12;
  if (docs.length === 0) return [];

  // 1. Tokenize + document frequency.
  const tokensById = new Map<string, string[]>();
  const df = new Map<string, number>();
  for (const d of docs) {
    const toks = tokenize(`${d.title ?? ""} ${d.excerpt ?? ""}`);
    tokensById.set(d.id, toks);
    for (const t of new Set(toks)) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const N = docs.length;

  // 2. TF-IDF vector per doc.
  const vecById = new Map<string, Vec>();
  for (const d of docs) {
    const toks = tokensById.get(d.id)!;
    const tf = new Map<string, number>();
    for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
    const vec: Vec = new Map();
    for (const [t, c] of tf) {
      const idf = Math.log(N / (df.get(t) ?? 1)) + 1;
      vec.set(t, c * idf);
    }
    vecById.set(d.id, vec);
  }

  // 3. Greedy agglomeration against running-sum centroids.
  interface Bucket { centroid: Vec; docIds: string[]; agg: Vec }
  const buckets: Bucket[] = [];
  const empties: string[] = [];
  for (const d of docs) {
    const vec = vecById.get(d.id)!;
    if (vec.size === 0) { empties.push(d.id); continue; }
    let bestIdx = -1, bestSim = 0;
    for (let i = 0; i < buckets.length; i++) {
      const sim = cosine(vec, buckets[i]!.centroid);
      if (sim > bestSim) { bestSim = sim; bestIdx = i; }
    }
    if (bestIdx >= 0 && bestSim >= threshold) {
      const b = buckets[bestIdx]!;
      b.docIds.push(d.id);
      for (const [k, v] of vec) { b.centroid.set(k, (b.centroid.get(k) ?? 0) + v); b.agg.set(k, (b.agg.get(k) ?? 0) + v); }
    } else {
      buckets.push({ centroid: new Map(vec), agg: new Map(vec), docIds: [d.id] });
    }
  }

  // 4. Cap cluster count — fold smallest into their nearest neighbour.
  buckets.sort((a, b) => b.docIds.length - a.docIds.length);
  while (buckets.length > maxClusters) {
    const victim = buckets.pop()!;
    let bestIdx = 0, bestSim = -1;
    for (let i = 0; i < buckets.length; i++) {
      const sim = cosine(victim.centroid, buckets[i]!.centroid);
      if (sim > bestSim) { bestSim = sim; bestIdx = i; }
    }
    const host = buckets[bestIdx]!;
    host.docIds.push(...victim.docIds);
    for (const [k, v] of victim.agg) host.agg.set(k, (host.agg.get(k) ?? 0) + v);
  }

  // 5. Label by top aggregate terms; deterministic id by rank.
  const out: DocCluster[] = buckets.map((b, i) => {
    const topTerms = [...b.agg.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).slice(0, 4).map(([t]) => t);
    return {
      id: `cluster-${i + 1}`,
      label: topTerms.slice(0, 3).map((t) => t[0]!.toUpperCase() + t.slice(1)).join(" · ") || `Theme ${i + 1}`,
      topTerms,
      docIds: b.docIds,
      size: b.docIds.length,
    };
  });
  if (empties.length > 0) {
    out.push({ id: "cluster-uncategorized", label: "Uncategorized", topTerms: [], docIds: empties, size: empties.length });
  }
  return out.sort((a, b) => b.size - a.size);
}
