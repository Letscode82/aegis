/**
 * Outside-counsel management mutations (SP-5, server-only, chain-sealed).
 *
 * The write side of the counsel panel: edit a firm's rate card
 * (Vendor.ratesCard JSON) and manage its timekeeper roster (Timekeeper
 * rows). Every change writes a chain-sealed AuditLog row; rate INCREASES are
 * called out in the audit metadata so a later approval/report can surface
 * them. No new tables — rate cards live on the Vendor, timekeepers on the
 * existing Timekeeper model.
 */
import { prisma, logAudit } from "@aegis/db";

async function assertVendor(organizationId: string, vendorId: string) {
  const v = await prisma.vendor.findFirst({ where: { id: vendorId, organizationId } });
  if (!v) throw new Error("Firm not found");
  return v;
}

/** Replace a firm's rate card ({tier: rate}). Flags any increased tiers. */
export async function updateVendorRateCard(
  organizationId: string,
  vendorId: string,
  ratesCard: Record<string, number>,
  actorId: string,
): Promise<{ ratesCard: Record<string, number>; increasedTiers: string[] }> {
  const v = await assertVendor(organizationId, vendorId);
  const before = (v.ratesCard as Record<string, number>) || {};

  // Sanitize: keep string tiers → positive finite rates.
  const clean: Record<string, number> = {};
  for (const [tier, rate] of Object.entries(ratesCard || {})) {
    const key = String(tier).trim().slice(0, 60);
    const val = Math.round(Number(rate));
    if (key && Number.isFinite(val) && val > 0) clean[key] = val;
  }

  const increasedTiers = Object.keys(clean).filter((t) => before[t] != null && clean[t]! > before[t]!);

  await prisma.vendor.update({ where: { id: v.id }, data: { ratesCard: clean as never } });
  await logAudit({
    organizationId,
    actorId,
    actorType: "USER",
    action: "spend.counsel.rate_card_updated",
    resourceType: "Vendor",
    resourceId: v.id,
    beforeJson: { ratesCard: before } as never,
    afterJson: { ratesCard: clean } as never,
    metadata: { source: "spend-counsel", increasedTiers } as never,
  });
  return { ratesCard: clean, increasedTiers };
}

export interface AddTimekeeperInput {
  /** Existing Person id, OR a name to provision a new external-counsel Person. */
  personId?: string;
  name?: string;
  title: string;
  defaultRate: number;
  blendedRate?: number | null;
}

/** Add a timekeeper to a firm's roster. Provisions a Person when only a name is given. */
export async function addTimekeeper(
  organizationId: string,
  vendorId: string,
  input: AddTimekeeperInput,
  actorId: string,
): Promise<{ timekeeperId: string; personId: string }> {
  const v = await assertVendor(organizationId, vendorId);
  const title = String(input.title || "").trim().slice(0, 120) || "Timekeeper";
  const defaultRate = Math.round(Number(input.defaultRate));
  if (!Number.isFinite(defaultRate) || defaultRate <= 0) throw new Error("A positive default rate is required");
  const blendedRate = input.blendedRate != null && Number.isFinite(Number(input.blendedRate)) ? Math.round(Number(input.blendedRate)) : null;

  let personId = input.personId?.trim();
  if (personId) {
    const p = await prisma.person.findFirst({ where: { id: personId, organizationId }, select: { id: true } });
    if (!p) throw new Error("Person not found — input validation should have rejected this.");
  } else {
    const name = String(input.name || "").trim().slice(0, 200);
    if (!name) throw new Error("A timekeeper name (or personId) is required");
    const created = await prisma.person.create({
      data: {
        organizationId,
        type: "EXTERNAL_COUNSEL",
        externalRef: `tk:${vendorId}:${Date.now()}`,
        name,
        metadata: { provisionedVia: "spend-counsel", vendorId } as never,
      },
      select: { id: true },
    });
    personId = created.id;
  }

  const tk = await prisma.timekeeper.create({
    data: { vendorId: v.id, personId: personId!, title, defaultRate, blendedRate },
    select: { id: true },
  });

  await logAudit({
    organizationId,
    actorId,
    actorType: "USER",
    action: "spend.counsel.timekeeper_added",
    resourceType: "Timekeeper",
    resourceId: tk.id,
    afterJson: { vendorId: v.id, personId, title, defaultRate, blendedRate } as never,
    metadata: { source: "spend-counsel" } as never,
  });
  return { timekeeperId: tk.id, personId: personId! };
}

export async function updateTimekeeper(
  organizationId: string,
  timekeeperId: string,
  patch: { title?: string; defaultRate?: number; blendedRate?: number | null },
  actorId: string,
): Promise<void> {
  const tk = await prisma.timekeeper.findFirst({
    where: { id: timekeeperId, vendor: { organizationId } },
    include: { vendor: { select: { id: true } } },
  });
  if (!tk) throw new Error("Timekeeper not found");

  const data: { title?: string; defaultRate?: number; blendedRate?: number | null } = {};
  if (patch.title != null) data.title = String(patch.title).trim().slice(0, 120) || tk.title;
  if (patch.defaultRate != null) {
    const r = Math.round(Number(patch.defaultRate));
    if (!Number.isFinite(r) || r <= 0) throw new Error("A positive default rate is required");
    data.defaultRate = r;
  }
  if (patch.blendedRate !== undefined) {
    data.blendedRate = patch.blendedRate != null && Number.isFinite(Number(patch.blendedRate)) ? Math.round(Number(patch.blendedRate)) : null;
  }

  const increased = data.defaultRate != null && data.defaultRate > tk.defaultRate;
  await prisma.timekeeper.update({ where: { id: tk.id }, data });
  await logAudit({
    organizationId,
    actorId,
    actorType: "USER",
    action: "spend.counsel.timekeeper_updated",
    resourceType: "Timekeeper",
    resourceId: tk.id,
    beforeJson: { title: tk.title, defaultRate: tk.defaultRate, blendedRate: tk.blendedRate } as never,
    afterJson: data as never,
    metadata: { source: "spend-counsel", rateIncreased: increased } as never,
  });
}

export async function removeTimekeeper(organizationId: string, timekeeperId: string, actorId: string): Promise<void> {
  const tk = await prisma.timekeeper.findFirst({ where: { id: timekeeperId, vendor: { organizationId } } });
  if (!tk) throw new Error("Timekeeper not found");
  await prisma.timekeeper.delete({ where: { id: tk.id } });
  await logAudit({
    organizationId,
    actorId,
    actorType: "USER",
    action: "spend.counsel.timekeeper_removed",
    resourceType: "Timekeeper",
    resourceId: tk.id,
    beforeJson: { vendorId: tk.vendorId, personId: tk.personId, title: tk.title, defaultRate: tk.defaultRate } as never,
    metadata: { source: "spend-counsel" } as never,
  });
}
