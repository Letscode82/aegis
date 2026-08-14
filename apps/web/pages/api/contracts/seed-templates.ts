/**
 * Seed the sample contract templates (CTR-18) into the org's template library.
 *   POST — upsert the built-in MSA + mutual-NDA templates. Idempotent (upserts
 *          on org+key), so calling it twice just refreshes. contracts:approve.
 *
 * Exists as a standalone admin route (not the main db:seed) so the full-size
 * MSA can be added to a live environment without re-running the whole seed —
 * which collides on the pre-seeded admin email. Mutations are chain-sealed
 * inside seedSampleTemplates → upsertTemplate.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { seedSampleTemplates } from "@aegis/contracts";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    assertUserCanDo(user, Permission.ContractsApprove);
    const result = await seedSampleTemplates(user.organizationId, { id: user.id, type: "USER" });
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
