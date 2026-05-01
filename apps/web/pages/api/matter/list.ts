import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import {
  listMattersByOrganization,
  type MatterStatus,
  type MatterType,
} from "@aegis/matter";
import { requireActorAny } from "../../../lib/matter-actor";

const VALID_STATUS = new Set<MatterStatus>([
  "DRAFT",
  "OPEN",
  "ACTIVE",
  "STAYED",
  "CLOSED",
  "ARCHIVED",
]);

const VALID_TYPE = new Set<MatterType>([
  "LITIGATION",
  "TRANSACTIONAL",
  "MA",
  "IP",
  "EMPLOYMENT",
  "REGULATORY",
  "INVESTIGATION",
  "ADVISORY",
  "OTHER",
]);

function asArray(v: string | string[] | undefined): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const actor = await requireActorAny(req, res, [
    Permission.MatterReadAll,
    Permission.MatterReadAssigned,
  ]);
  if (!actor) return;

  const status = asArray(req.query.status as string | string[] | undefined)
    .filter((s): s is MatterStatus => VALID_STATUS.has(s as MatterStatus));
  const type = asArray(req.query.type as string | string[] | undefined)
    .filter((t): t is MatterType => VALID_TYPE.has(t as MatterType));
  const searchQuery =
    typeof req.query.q === "string" ? req.query.q : undefined;
  const page = Number(req.query.page) || 1;

  try {
    const out = await listMattersByOrganization(actor.organizationId, {
      status: status.length ? status : undefined,
      type: type.length ? type : undefined,
      searchQuery,
      page,
      pageSize: 25,
    });
    res.status(200).json({
      ...out,
      rows: out.rows.map(serialize),
    });
  } catch (err) {
    console.error("[/api/matter/list] failed:", err);
    res.status(500).json({ error: "Internal error" });
  }
}

// Decimal -> number; Date -> ISO string.
function serialize(m: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(m)) {
    if (v instanceof Date) out[k] = v.toISOString();
    else if (
      v !== null &&
      typeof v === "object" &&
      "toString" in v &&
      "constructor" in v &&
      (v as { constructor: { name: string } }).constructor.name === "Decimal"
    ) {
      out[k] = Number(String(v));
    } else {
      out[k] = v;
    }
  }
  return out;
}
