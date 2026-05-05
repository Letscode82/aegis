/**
 * POST /api/admin/m365/delegated-test
 *
 * Round-trips Graph `/security/cases/ediscoveryCases?$top=1` using the
 * stored delegated token. Verifies the eDiscovery surface actually
 * works end-to-end (auth + license + permissions). Returns
 * `{ ok: true, caseCount: N }` on success or the typed error name +
 * Microsoft message on failure.
 *
 * Permission: admin:m365:manage.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { getFreshDelegatedAccessToken } from "@aegis/matter";
import { logAudit } from "@aegis/db";
import { requireActor } from "../../../../lib/matter-actor";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST" && req.method !== "GET") {
    res.setHeader("Allow", "GET,POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const actor = await requireActor(req, res, Permission.AdminM365Manage);
  if (!actor) return;

  const startedAt = Date.now();
  try {
    const { accessToken, accountUpn } = await getFreshDelegatedAccessToken(
      actor.organizationId,
    );
    // Direct fetch — we don't need the SDK middleware stack for a
    // one-off probe and bypassing it keeps the call cheap.
    const resp = await fetch(
      "https://graph.microsoft.com/v1.0/security/cases/ediscoveryCases?$top=1",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const body = (await resp.json().catch(() => null)) as
      | { value?: unknown[]; error?: { code?: string; message?: string } }
      | null;
    const durationMs = Date.now() - startedAt;
    if (!resp.ok) {
      await logAudit({
        organizationId: actor.organizationId,
        actorId: actor.id,
        actorType: "USER",
        action: "m365.delegated.test.failed",
        resourceType: "OrganizationM365Credential",
        resourceId: actor.organizationId,
        metadata: {
          statusCode: resp.status,
          errorCode: body?.error?.code ?? null,
          durationMs,
        },
      });
      return res.status(502).json({
        ok: false,
        durationMs,
        accountUpn,
        statusCode: resp.status,
        error: {
          code: body?.error?.code ?? "GRAPH_ERROR",
          message: body?.error?.message ?? "Graph rejected the request",
        },
      });
    }
    await logAudit({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: "USER",
      action: "m365.delegated.test.ok",
      resourceType: "OrganizationM365Credential",
      resourceId: actor.organizationId,
      metadata: { caseCount: body?.value?.length ?? 0, durationMs },
    });
    return res.status(200).json({
      ok: true,
      durationMs,
      accountUpn,
      caseCount: Array.isArray(body?.value) ? body!.value!.length : 0,
    });
  } catch (err) {
    const e = err as { name?: string; message?: string };
    return res.status(502).json({
      ok: false,
      durationMs: Date.now() - startedAt,
      error: {
        code: e.name ?? "DELEGATED_TEST_FAILED",
        message: e.message ?? String(err),
      },
    });
  }
}
