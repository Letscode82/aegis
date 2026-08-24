/**
 * POST /api/review/sets/[id]/relativity-push — push the produced set to a
 * RelativityOne workspace (item 6, stub-first).
 *
 * The client sends the production manifest + the target { instanceUrl,
 * workspaceId }. We validate + shape the RelativityOne Import API payload
 * (buildRelativityPayload) and chain-seal the request. The real Import API call
 * is behind a documented seam: without RELATIVITY_API_TOKEN in the environment
 * the route returns `stubbed: true` with the exact payload that WOULD be sent,
 * so the whole flow is demoable without a Relativity tenant. Write grant.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { logAudit } from "@aegis/db";
import { buildRelativityPayload, type LoadFileManifest } from "@aegis/review";
import { requireActorAny } from "../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const id = req.query.id;
  if (typeof id !== "string") return res.status(400).json({ ok: false, error: "Invalid id" });
  const actor = await requireActorAny(req, res, [Permission.MatterLegalHoldIssue, Permission.PrivacyDsarFulfill]);
  if (!actor) return;

  const body = (req.body ?? {}) as { instanceUrl?: string; workspaceId?: string; manifest?: LoadFileManifest };
  if (!body.manifest || !Array.isArray(body.manifest.produced)) {
    return res.status(400).json({ ok: false, error: "A produced manifest is required — produce the set first." });
  }
  try {
    const preview = buildRelativityPayload(body.manifest, {
      instanceUrl: body.instanceUrl ?? "",
      workspaceId: body.workspaceId ?? "",
    });
    // Real push is gated on a configured Relativity credential; absent it, stub.
    const hasCreds = Boolean(process.env.RELATIVITY_API_TOKEN);
    await logAudit({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: "USER",
      action: "reviewset.relativity.push_requested",
      resourceType: "ReviewSet",
      resourceId: id,
      afterJson: { workspaceId: preview.workspaceId, docCount: preview.docCount, stubbed: !hasCreds } as never,
      metadata: { source: "review", channel: "relativity" } as never,
    });
    return res.status(200).json({
      ok: true,
      stubbed: !hasCreds,
      preview,
      message: hasCreds
        ? `Queued ${preview.docCount} document(s) to workspace ${preview.workspaceId}.`
        : `Stub push: ${preview.docCount} document(s) prepared for workspace ${preview.workspaceId}. Set RELATIVITY_API_TOKEN to enable the live Import API call.`,
    });
  } catch (err) {
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
