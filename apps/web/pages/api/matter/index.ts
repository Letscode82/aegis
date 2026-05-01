import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import {
  createMatter,
  type CreateMatterInput,
  type MatterType,
} from "@aegis/matter";
import { requireActor } from "../../../lib/matter-actor";
import { serializeMatter } from "../../../lib/matter-serialize";

const VALID_TYPES: MatterType[] = [
  "LITIGATION",
  "TRANSACTIONAL",
  "MA",
  "IP",
  "EMPLOYMENT",
  "REGULATORY",
  "INVESTIGATION",
  "ADVISORY",
  "OTHER",
];

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const actor = await requireActor(req, res, Permission.MatterCreate);
  if (!actor) return;

  const body = req.body as Partial<CreateMatterInput> | undefined;
  if (!body || typeof body.title !== "string" || !body.title.trim()) {
    return res.status(400).json({ error: "title is required" });
  }
  if (!body.type || !VALID_TYPES.includes(body.type as MatterType)) {
    return res.status(400).json({ error: "Invalid matter type" });
  }

  try {
    const matter = await createMatter(
      {
        title: body.title.trim(),
        type: body.type as MatterType,
        description: body.description,
        jurisdiction: body.jurisdiction,
        estimatedValue:
          typeof body.estimatedValue === "number"
            ? body.estimatedValue
            : undefined,
        estimatedDurationDays:
          typeof body.estimatedDurationDays === "number"
            ? body.estimatedDurationDays
            : undefined,
        counterpartyId: body.counterpartyId,
        parentMatterId: body.parentMatterId,
        leadAttorneyPersonId: body.leadAttorneyPersonId,
        intakeTicketId: body.intakeTicketId,
        initialStatus: body.initialStatus,
      },
      actor,
    );
    res.status(201).json(serializeMatter(matter));
  } catch (err) {
    console.error("[/api/matter POST] failed:", err);
    res.status(500).json({ error: String(err) });
  }
}
