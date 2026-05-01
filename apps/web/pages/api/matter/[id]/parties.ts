import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { prisma } from "@aegis/db";
import {
  addMatterParty,
  removeMatterParty,
  type MatterPartyRole,
} from "@aegis/matter";
import { requireActor, requireActorAny } from "../../../../lib/matter-actor";

const VALID_ROLES = new Set<MatterPartyRole>([
  "LEAD_ATTORNEY",
  "ATTORNEY",
  "PARALEGAL",
  "OPS_SUPPORT",
  "CLIENT_CONTACT",
  "CUSTODIAN",
  "EXPERT_WITNESS",
  "OPPOSING_COUNSEL",
  "OTHER",
]);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const id = req.query.id;
  if (typeof id !== "string") {
    return res.status(400).json({ error: "Invalid id" });
  }

  if (req.method === "GET") {
    const actor = await requireActorAny(req, res, [
      Permission.MatterReadAll,
      Permission.MatterReadAssigned,
    ]);
    if (!actor) return;

    const matter = await prisma.matter.findFirst({
      where: { id, organizationId: actor.organizationId },
      select: { id: true },
    });
    if (!matter) return res.status(404).json({ error: "Not found" });

    const parties = await prisma.matterParty.findMany({
      where: { matterId: id },
      include: { person: { select: { id: true, name: true } } },
      orderBy: [{ role: "asc" }, { addedAt: "asc" }],
    });

    return res.status(200).json(
      parties.map((p) => ({
        id: p.id,
        matterId: p.matterId,
        personId: p.personId,
        personName: p.person.name,
        role: p.role,
        addedAt: p.addedAt.toISOString(),
      })),
    );
  }

  if (req.method === "POST") {
    const actor = await requireActor(req, res, Permission.MatterUpdate);
    if (!actor) return;
    const body = (req.body ?? {}) as { personId?: string; role?: string };
    if (!body.personId || !body.role || !VALID_ROLES.has(body.role as MatterPartyRole)) {
      return res
        .status(400)
        .json({ error: "personId and a valid role are required" });
    }
    try {
      const created = await addMatterParty(
        id,
        body.personId,
        body.role as MatterPartyRole,
        actor,
      );
      return res.status(201).json({
        id: created.id,
        matterId: created.matterId,
        personId: created.personId,
        role: created.role,
        addedAt: created.addedAt.toISOString(),
      });
    } catch (err) {
      console.error("[/api/matter/:id/parties POST] failed:", err);
      return res.status(500).json({ error: String(err) });
    }
  }

  if (req.method === "DELETE") {
    const actor = await requireActor(req, res, Permission.MatterUpdate);
    if (!actor) return;
    const personId = req.query.personId;
    if (typeof personId !== "string") {
      return res
        .status(400)
        .json({ error: "personId query parameter required" });
    }
    try {
      await removeMatterParty(id, personId, actor);
      return res.status(204).end();
    } catch (err) {
      console.error("[/api/matter/:id/parties DELETE] failed:", err);
      return res.status(500).json({ error: String(err) });
    }
  }

  res.setHeader("Allow", "GET,POST,DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}
