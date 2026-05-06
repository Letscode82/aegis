/**
 * POST /api/matter/[id]/holds/[holdId]/custodians/[personId]/data-sources/[dsId]/retry
 *
 * Re-attempts `applyPreservation` for one ERROR data source.
 * Surfaces the workspace's "Retry" badge button (sub-PR 4d.0).
 *
 * Response shape:
 *   200 { ok: true, dataSource: { id, preservationStatus, ... } }
 *   409 { ok: false, error: { code: "NOT_IN_ERROR", message } }
 *   500 { ok: false, error: { code, message } }
 *
 * Permission: matter:legal_hold:issue.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import {
  DataSourceNotInErrorStateError,
  retryDataSourcePreservation,
} from "@aegis/matter";
import { requireActor } from "../../../../../../../../../../lib/matter-actor";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      ok: false,
      error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" },
    });
  }
  const dsId = req.query.dsId;
  if (typeof dsId !== "string") {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_DS_ID", message: "Invalid dsId" },
    });
  }
  const actor = await requireActor(req, res, Permission.MatterLegalHoldIssue);
  if (!actor) return;
  try {
    const updated = await retryDataSourcePreservation(
      { dataSourceId: dsId },
      actor,
    );
    return res.status(200).json({
      ok: true,
      dataSource: {
        id: updated.id,
        preservationStatus: updated.preservationStatus,
        preservationFailureReason: updated.preservationFailureReason,
        preservationAppliedAt: updated.preservationAppliedAt?.toISOString() ?? null,
      },
    });
  } catch (err) {
    if (err instanceof DataSourceNotInErrorStateError) {
      return res.status(409).json({
        ok: false,
        error: {
          code: "NOT_IN_ERROR",
          message: err.message,
        },
      });
    }
    const e = err as { name?: string; message?: string };
    return res.status(500).json({
      ok: false,
      error: {
        code: e.name ?? "RETRY_FAILED",
        message: e.message ?? String(err),
      },
    });
  }
}
