/**
 * SK-7 — org-authored ONE Legal skills store (CRUD + chain-sealed audit).
 *
 * Org admins can add, edit, hide, or override the built-in E1 skill catalog
 * (apps/web/lib/one-legal/skills.ts) without a code change. Rows live in the
 * `Skill` table; `getMergedSkills(orgId)` folds them over the static catalog at
 * read time via the pure `mergeSkills` helper, so the console renders exactly
 * the same shape whether a skill is built-in, overridden, or net-new.
 *
 * Governance posture: these are console *entry points*, not a new capability or
 * gate. Invoking any skill (built-in or org-authored) still routes through the
 * same governed pipeline — propose → human Approve → AgentDecision → act. What
 * SK-7 adds is authoring, and every authoring mutation is itself a first-class,
 * chain-sealed AuditLog event (`one_legal.skill.{created,updated,deleted}`), so
 * who changed the playbook surface, and to what, is on the ledger.
 *
 * All reads/writes go through `@aegis/db` (no raw SQL, shared client). The
 * mutations here are the chokepoint; API routes gate them with
 * `assertAndAudit(admin:agents:manage)` before calling in.
 */
import { prisma, logAudit } from "@aegis/db";
import { SKILLS, type OneLegalSkill } from "./skills";
import { validateSkillInput, mergeSkills, orgSkillToCatalog } from "./skills-merge.mjs";

/** A persisted org skill row, catalog-shaped (what the API returns for admin). */
export interface OrgSkillRow {
  id: string;
  slug: string;
  label: string;
  description: string;
  icon: string;
  action: string;
  prompt: string;
  category: string;
  cats: string[];
  reviewSkillId: string | null;
  featured: boolean;
  enabled: boolean;
  createdById: string | null;
  updatedById: string | null;
  createdAt: string;
  updatedAt: string;
}

/** The merged catalog entry served to the console (built-in shape + `_source`). */
export type MergedSkill = OneLegalSkill & { _source?: "builtin" | "override" | "org" };

interface Actor {
  id: string;
  organizationId: string;
}

function rowToDTO(r: {
  id: string;
  slug: string;
  label: string;
  description: string;
  icon: string;
  action: string;
  prompt: string;
  category: string;
  cats: unknown;
  reviewSkillId: string | null;
  featured: boolean;
  enabled: boolean;
  createdById: string | null;
  updatedById: string | null;
  createdAt: Date;
  updatedAt: Date;
}): OrgSkillRow {
  return {
    id: r.id,
    slug: r.slug,
    label: r.label,
    description: r.description,
    icon: r.icon,
    action: r.action,
    prompt: r.prompt,
    category: r.category,
    cats: Array.isArray(r.cats) ? (r.cats as string[]) : [],
    reviewSkillId: r.reviewSkillId,
    featured: r.featured,
    enabled: r.enabled,
    createdById: r.createdById,
    updatedById: r.updatedById,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** Raw org rows for one org, newest-authored first. For the admin surface. */
export async function listOrgSkills(organizationId: string): Promise<OrgSkillRow[]> {
  const rows = await prisma.skill.findMany({
    where: { organizationId },
    orderBy: [{ category: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(rowToDTO);
}

/**
 * The console-facing catalog: built-in SKILLS with this org's rows folded in
 * (overrides in place, hides removed, net-new appended). The only read the
 * public `GET /api/one-legal/skills` route needs.
 */
export async function getMergedSkills(organizationId: string): Promise<MergedSkill[]> {
  const rows = await prisma.skill.findMany({ where: { organizationId }, orderBy: [{ createdAt: "asc" }] });
  const dto = rows.map(rowToDTO);
  const statics = SKILLS.map((s) => ({ ...s, _source: "builtin" as const }));
  return mergeSkills(statics, dto) as MergedSkill[];
}

export class SkillValidationError extends Error {
  constructor(public errors: string[]) {
    super(errors.join("; "));
    this.name = "SkillValidationError";
  }
}
export class SkillNotFoundError extends Error {
  constructor() {
    super("Skill not found");
    this.name = "SkillNotFoundError";
  }
}
export class SkillSlugConflictError extends Error {
  constructor(slug: string) {
    super(`A skill with slug "${slug}" already exists in this organization.`);
    this.name = "SkillSlugConflictError";
  }
}

/** Create an org skill. Throws on validation / slug-conflict. Audited. */
export async function createOrgSkill(actor: Actor, input: unknown): Promise<OrgSkillRow> {
  const { ok, errors, value } = validateSkillInput(input, { partial: false });
  if (!ok || !value) throw new SkillValidationError(errors);

  const existing = await prisma.skill.findUnique({
    where: { organizationId_slug: { organizationId: actor.organizationId, slug: value.slug } },
  });
  if (existing) throw new SkillSlugConflictError(value.slug);

  const row = await prisma.skill.create({
    data: {
      organizationId: actor.organizationId,
      slug: value.slug,
      label: value.label,
      description: value.description ?? "",
      icon: value.icon ?? "✦",
      action: value.action,
      prompt: value.prompt,
      category: value.category,
      cats: value.cats ?? [],
      reviewSkillId: value.reviewSkillId ?? null,
      featured: value.featured ?? false,
      enabled: value.enabled ?? true,
      createdById: actor.id,
      updatedById: actor.id,
    },
  });
  await logAudit({
    organizationId: actor.organizationId,
    actorId: actor.id,
    actorType: "USER",
    action: "one_legal.skill.created",
    resourceType: "Skill",
    resourceId: row.id,
    afterJson: { slug: row.slug, label: row.label, action: row.action, category: row.category, enabled: row.enabled },
    metadata: { source: "admin-ui" },
  });
  return rowToDTO(row);
}

/** Update an org skill (partial). Throws if missing / invalid / slug clash. Audited. */
export async function updateOrgSkill(actor: Actor, id: string, input: unknown): Promise<OrgSkillRow> {
  const before = await prisma.skill.findFirst({ where: { id, organizationId: actor.organizationId } });
  if (!before) throw new SkillNotFoundError();

  const { ok, errors, value } = validateSkillInput(input, { partial: true });
  if (!ok || !value) throw new SkillValidationError(errors);

  // A slug change must not collide with another row in the same org.
  if (value.slug && value.slug !== before.slug) {
    const clash = await prisma.skill.findUnique({
      where: { organizationId_slug: { organizationId: actor.organizationId, slug: value.slug } },
    });
    if (clash && clash.id !== id) throw new SkillSlugConflictError(value.slug);
  }

  const row = await prisma.skill.update({
    where: { id },
    data: { ...value, updatedById: actor.id },
  });
  await logAudit({
    organizationId: actor.organizationId,
    actorId: actor.id,
    actorType: "USER",
    action: "one_legal.skill.updated",
    resourceType: "Skill",
    resourceId: row.id,
    beforeJson: { slug: before.slug, label: before.label, action: before.action, category: before.category, enabled: before.enabled, featured: before.featured },
    afterJson: { slug: row.slug, label: row.label, action: row.action, category: row.category, enabled: row.enabled, featured: row.featured },
    metadata: { source: "admin-ui", changed: Object.keys(value) },
  });
  return rowToDTO(row);
}

/** Delete an org skill. Throws if missing. Audited. */
export async function deleteOrgSkill(actor: Actor, id: string): Promise<void> {
  const before = await prisma.skill.findFirst({ where: { id, organizationId: actor.organizationId } });
  if (!before) throw new SkillNotFoundError();

  await prisma.skill.delete({ where: { id } });
  await logAudit({
    organizationId: actor.organizationId,
    actorId: actor.id,
    actorType: "USER",
    action: "one_legal.skill.deleted",
    resourceType: "Skill",
    resourceId: id,
    beforeJson: { slug: before.slug, label: before.label, action: before.action, category: before.category },
    metadata: { source: "admin-ui" },
  });
}

export { validateSkillInput, orgSkillToCatalog };
