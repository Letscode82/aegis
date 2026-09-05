/**
 * mapLimit — bounded-concurrency async map (A5).
 *
 * Runs `fn` over `items` with at most `limit` in flight, preserving output
 * order. Used to parallelise per-file extraction (through Tika / native) so
 * archive + collection processing is fast — the throughput lever vs Purview's
 * serial, async processing.
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const n = items.length;
  const results = new Array<R>(n);
  const concurrency = Math.max(1, Math.min(limit, n));
  let next = 0;
  const worker = async (): Promise<void> => {
    for (let i = next++; i < n; i = next++) {
      results[i] = await fn(items[i] as T, i);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

/** Extraction concurrency from env (default 4). */
export function extractConcurrency(): number {
  const v = Number.parseInt(process.env.PROC_EXTRACT_CONCURRENCY ?? "", 10);
  return Number.isFinite(v) && v > 0 ? v : 4;
}
