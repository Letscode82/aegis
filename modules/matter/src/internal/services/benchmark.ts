/**
 * Extraction throughput benchmark (A6).
 *
 * Runs synthetic documents through the processing engine(s) at the configured
 * concurrency and reports docs/min + MB/min — the numbers that substantiate
 * "faster than Purview" (Purview processing is async, minutes–hours). Always
 * benchmarks native; also benchmarks the configured engine (Tika) when set.
 */
import { nativeProcessingEngine, getProcessingEngineForOrg, type ProcessingEngine } from "./processing";
import { mapLimit, extractConcurrency } from "./map-limit";

export interface BenchmarkResult {
  engine: string;
  docs: number;
  bytesPerDoc: number;
  concurrency: number;
  elapsedMs: number;
  docsPerMin: number;
  mbPerMin: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export async function benchmarkExtraction(
  opts: { count?: number; sizeBytes?: number; concurrency?: number; organizationId?: string } = {},
): Promise<{ results: BenchmarkResult[] }> {
  const count = clamp(Math.floor(opts.count ?? 50), 1, 200);
  const sizeBytes = clamp(Math.floor(opts.sizeBytes ?? 20_000), 100, 200_000);
  const concurrency = clamp(Math.floor(opts.concurrency ?? extractConcurrency()), 1, 16);

  const text = "The quarterly pricing model shows margin at thirty percent. ".repeat(Math.ceil(sizeBytes / 60)).slice(0, sizeBytes);
  const contentBytesB64 = Buffer.from(text, "utf8").toString("base64");

  const engines: Array<{ name: string; eng: ProcessingEngine }> = [{ name: "native", eng: nativeProcessingEngine() }];
  const effective = await getProcessingEngineForOrg(opts.organizationId);
  if (effective.name !== "native-js") engines.push({ name: effective.name, eng: effective });

  const results: BenchmarkResult[] = [];
  for (const { name, eng } of engines) {
    const t0 = Date.now();
    await mapLimit(Array.from({ length: count }), concurrency, (_item, i) =>
      eng.extract({ filename: `doc-${i}.txt`, contentType: "text/plain", contentBytesB64 }),
    );
    const elapsedMs = Math.max(1, Date.now() - t0);
    results.push({
      engine: name,
      docs: count,
      bytesPerDoc: sizeBytes,
      concurrency,
      elapsedMs,
      docsPerMin: Math.round((count / elapsedMs) * 60_000),
      mbPerMin: Math.round(((count * sizeBytes) / 1e6 / elapsedMs) * 60_000 * 10) / 10,
    });
  }
  return { results };
}
