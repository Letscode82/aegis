/**
 * GET /api/admin/pipeline/benchmark[?count=&size=&concurrency=]
 *
 * Extraction throughput benchmark (A6). Runs synthetic docs through native
 * (and the configured engine, e.g. Tika) at the configured concurrency and
 * reports docs/min + MB/min. Requires admin:m365:manage (may hit the Tika
 * sidecar). Bounded: count ≤ 200, size ≤ 200 KB.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { benchmarkExtraction } from "@aegis/matter";
import { requireActor } from "../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" } });
  }
  const actor = await requireActor(req, res, Permission.AdminM365Manage);
  if (!actor) return;

  const num = (v: unknown) => (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)) ? Number(v) : undefined);
  try {
    const out = await benchmarkExtraction({
      organizationId: actor.organizationId,
      count: num(req.query.count),
      sizeBytes: num(req.query.size),
      concurrency: num(req.query.concurrency),
    });
    return res.status(200).json({ ok: true, ...out });
  } catch (err) {
    return res.status(500).json({ ok: false, error: { code: "BENCHMARK_FAILED", message: String((err as Error)?.message ?? err) } });
  }
}
