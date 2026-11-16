/**
 * Template store (📄 Templates) — UNIFIED with the oKF Knowledge.
 *
 * There is now ONE template store: per-agent `TEMPLATE` KnowledgePacks of
 * `KnowledgeItem`s (kind TEMPLATE). Each Template *kind* maps to the pack of
 * the agent that drafts from it (one pack per agent), so editing the
 * Contracts 📄 Templates screen and editing that agent's Knowledge (Agent
 * Designer → Knowledge tab) are the same data. The legacy `Template` table
 * is retired.
 *
 * Kind → pack:
 *   NDA      → nda-agent            · pack `nda-template`
 *   CONTRACT → contract-review-agent · pack `contract-templates`
 *   NOTICE   → notice-mgmt-agent     · pack `notice-templates`
 *   OTHER    → (no agent)            · pack `general-templates` (lazy)
 *
 * Mapping (KnowledgeItem ↔ TemplateDTO):
 *   code           ↔ key
 *   title          ↔ name
 *   bodyMarkdown   ↔ body
 *   dataJson       ↔ { templateKind, description, version }
 *   active/sortOrder pass through; kind derives from the item's pack.
 *
 * Reads feed the agents' draft source + the admin list; writes are
 * chain-sealed and gated at the route.
 */
import { prisma, logAudit } from "@aegis/db";
import type { KnowledgeItem } from "@aegis/db";
import type { TemplateFieldDef } from "./template-vars";

/** The kinds of draft template. Formerly the `TemplateKind` Prisma enum;
 *  now a plain union since templates live in oKF KnowledgePacks (the legacy
 *  `Template` table + enum were retired). */
export type TemplateKind = "NDA" | "CONTRACT" | "NOTICE" | "OTHER";

export interface TemplateDTO {
  id: string;
  kind: "NDA" | "CONTRACT" | "NOTICE" | "OTHER";
  key: string;
  name: string;
  body: string;
  description: string | null;
  version: number;
  active: boolean;
  sortOrder: number;
  /** Per-template guided-fill field schema (type/required/options/help/group/showIf). */
  fieldSchema: TemplateFieldDef[];
}

export interface UpsertTemplateInput {
  kind: TemplateKind;
  key: string;
  name: string;
  body: string;
  description?: string | null;
  active?: boolean;
  sortOrder?: number;
  fieldSchema?: TemplateFieldDef[] | null;
}

type Actor = { id: string | null; type?: "USER" | "AGENT" | "SYSTEM" };

/** The per-agent template pack each Template kind lives in (one pack/agent). */
const KIND_PACK: Record<
  "NDA" | "CONTRACT" | "NOTICE" | "OTHER",
  { packKey: string; agentKey: string | null; packName: string; packDescription: string }
> = {
  NDA: { packKey: "nda-template", agentKey: "nda-agent", packName: "NDA templates", packDescription: "The approved NDA drafts the agent (and the Contracts Templates screen) works from." },
  CONTRACT: { packKey: "contract-templates", agentKey: "contract-review-agent", packName: "Contract templates", packDescription: "MSA / DPA draft skeletons the Contracts Templates screen manages." },
  NOTICE: { packKey: "notice-templates", agentKey: "notice-mgmt-agent", packName: "Notice templates", packDescription: "Notice drafts the Contracts Templates screen manages." },
  OTHER: { packKey: "general-templates", agentKey: null, packName: "General templates", packDescription: "Templates not tied to a specific drafting agent." },
};

const ALL_PACK_KEYS = Object.values(KIND_PACK).map((p) => p.packKey);
const PACK_KEY_TO_KIND: Record<string, TemplateKind> = Object.fromEntries(
  (Object.keys(KIND_PACK) as Array<keyof typeof KIND_PACK>).map((k) => [KIND_PACK[k].packKey, k as TemplateKind]),
);

const toDTO = (it: KnowledgeItem, packKey: string): TemplateDTO => {
  const d = (it.dataJson as Record<string, unknown>) ?? {};
  const kind = PACK_KEY_TO_KIND[packKey] ?? (d.templateKind as TemplateKind) ?? "OTHER";
  return {
    id: it.id,
    kind: kind as TemplateDTO["kind"],
    key: it.code,
    name: it.title,
    body: it.bodyMarkdown,
    description: (d.description as string) ?? null,
    version: typeof d.version === "number" ? d.version : 1,
    active: it.active,
    sortOrder: it.sortOrder,
    fieldSchema: Array.isArray(d.fieldSchema) ? (d.fieldSchema as TemplateFieldDef[]) : [],
  };
};

/** Get (or lazily create) the org's template pack for a Template kind. */
async function getOrCreateTemplatePack(organizationId: string, kind: TemplateKind): Promise<{ id: string; key: string }> {
  const map = KIND_PACK[kind];
  const existing = await prisma.knowledgePack.findUnique({
    where: { organizationId_key: { organizationId, key: map.packKey } },
    select: { id: true, key: true },
  });
  if (existing) return existing;
  return prisma.knowledgePack.create({
    data: {
      organizationId,
      key: map.packKey,
      name: map.packName,
      description: map.packDescription,
      kind: "TEMPLATE",
      agentKey: map.agentKey,
      status: "PUBLISHED",
      publishedVersion: 1,
    },
    select: { id: true, key: true },
  });
}

/** Resolve the org's template packs (subset by kind, or all). */
async function templatePacks(organizationId: string, kind?: TemplateKind): Promise<Array<{ id: string; key: string }>> {
  const keys = kind ? [KIND_PACK[kind].packKey] : ALL_PACK_KEYS;
  return prisma.knowledgePack.findMany({
    where: { organizationId, key: { in: keys } },
    select: { id: true, key: true },
  });
}

export async function listTemplates(
  organizationId: string,
  opts?: { kind?: TemplateKind; includeInactive?: boolean },
): Promise<TemplateDTO[]> {
  const packs = await templatePacks(organizationId, opts?.kind);
  if (packs.length === 0) return [];
  const packKeyById = new Map(packs.map((p) => [p.id, p.key]));
  const items = await prisma.knowledgeItem.findMany({
    where: {
      packId: { in: packs.map((p) => p.id) },
      kind: "TEMPLATE",
      ...(opts?.includeInactive ? {} : { active: true }),
    },
  });
  const rows = items.map((it) => toDTO(it, packKeyById.get(it.packId) ?? ""));
  // Kind, then sortOrder, then name — matches the legacy ordering.
  const kindOrder: Record<string, number> = { NDA: 0, CONTRACT: 1, NOTICE: 2, OTHER: 3 };
  const rank = (k: string) => kindOrder[k] ?? 9;
  return rows.sort(
    (a, b) => (rank(a.kind) - rank(b.kind)) || (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name),
  );
}

/** Resolve one template by key (active only) — for the agents. */
export async function getTemplateByKey(organizationId: string, key: string): Promise<TemplateDTO | null> {
  const packs = await templatePacks(organizationId);
  if (packs.length === 0) return null;
  const packKeyById = new Map(packs.map((p) => [p.id, p.key]));
  const it = await prisma.knowledgeItem.findFirst({
    where: { packId: { in: packs.map((p) => p.id) }, code: key.trim().toLowerCase(), kind: "TEMPLATE", active: true },
  });
  return it ? toDTO(it, packKeyById.get(it.packId) ?? "") : null;
}

/** First active template of a kind — the agent's default draft source. */
export async function getDefaultTemplateForKind(organizationId: string, kind: TemplateKind): Promise<TemplateDTO | null> {
  const packKey = KIND_PACK[kind].packKey;
  const pack = await prisma.knowledgePack.findUnique({
    where: { organizationId_key: { organizationId, key: packKey } },
    select: { id: true },
  });
  if (!pack) return null;
  const it = await prisma.knowledgeItem.findFirst({
    where: { packId: pack.id, kind: "TEMPLATE", active: true },
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
  });
  return it ? toDTO(it, packKey) : null;
}

/** Upsert on (org, key) within the kind's pack; chain-sealed; bumps version
 *  on body change. A kind change moves the item to the new kind's pack. */
const FIELD_TYPES = new Set(["text", "textarea", "date", "number", "currency", "email", "select"]);

/** Validate + normalize an incoming field schema to safe, storable shapes. */
export function sanitizeFieldSchema(input: unknown): TemplateFieldDef[] {
  if (!Array.isArray(input)) return [];
  const out: TemplateFieldDef[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const token = typeof r.token === "string" ? r.token.trim() : "";
    if (!token || seen.has(token)) continue;
    seen.add(token);
    const def: TemplateFieldDef = { token };
    if (typeof r.label === "string" && r.label.trim()) def.label = r.label.trim().slice(0, 120);
    if (typeof r.type === "string" && FIELD_TYPES.has(r.type)) def.type = r.type as TemplateFieldDef["type"];
    if (typeof r.required === "boolean") def.required = r.required;
    if (Array.isArray(r.options)) {
      const opts = r.options.map((o) => String(o).trim()).filter((o) => o !== "").slice(0, 40);
      if (opts.length) def.options = opts;
    }
    if (typeof r.help === "string" && r.help.trim()) def.help = r.help.trim().slice(0, 400);
    if (typeof r.group === "string" && r.group.trim()) def.group = r.group.trim().slice(0, 60);
    if (r.showIf && typeof r.showIf === "object") {
      const s = r.showIf as Record<string, unknown>;
      const gtoken = typeof s.token === "string" ? s.token.trim() : "";
      if (gtoken && gtoken !== token) {
        const showIf: NonNullable<TemplateFieldDef["showIf"]> = { token: gtoken };
        if (typeof s.equals === "string" && s.equals.trim()) showIf.equals = s.equals.trim().slice(0, 120);
        if (Array.isArray(s.in)) { const inv = s.in.map((x) => String(x).trim()).filter(Boolean).slice(0, 20); if (inv.length) showIf.in = inv; }
        def.showIf = showIf;
      }
    }
    out.push(def);
  }
  return out.slice(0, 100);
}

export async function upsertTemplate(
  organizationId: string,
  input: UpsertTemplateInput,
  actor: Actor,
): Promise<TemplateDTO> {
  const key = input.key.trim().toLowerCase();
  if (!key) throw new Error("key is required");
  if (!input.name.trim()) throw new Error("name is required");
  if (!input.body.trim()) throw new Error("body is required");

  const pack = await getOrCreateTemplatePack(organizationId, input.kind);

  // Find the item by key anywhere in the template packs (to detect a
  // kind change that should move it between per-agent packs).
  const existing = await prisma.knowledgeItem.findFirst({
    where: { organizationId, code: key, kind: "TEMPLATE", pack: { key: { in: ALL_PACK_KEYS } } },
    include: { pack: { select: { id: true, key: true } } },
  });
  const prevData = (existing?.dataJson as Record<string, unknown>) ?? {};
  const prevVersion = typeof prevData.version === "number" ? (prevData.version as number) : 1;
  const bodyChanged = !!existing && existing.bodyMarkdown !== input.body;
  const version = existing ? (bodyChanged ? prevVersion + 1 : prevVersion) : 1;

  // Preserve an existing field schema on body-only edits; replace it when the
  // caller passes one (the admin Fields editor), and sanitize to known shapes.
  const fieldSchema = input.fieldSchema !== undefined
    ? sanitizeFieldSchema(input.fieldSchema)
    : Array.isArray(prevData.fieldSchema)
    ? (prevData.fieldSchema as TemplateFieldDef[])
    : [];
  const dataJson = {
    templateKind: input.kind,
    description: input.description?.trim() || null,
    version,
    fieldSchema,
  };
  const base = {
    kind: "TEMPLATE" as const,
    title: input.name.trim(),
    bodyMarkdown: input.body,
    dataJson: dataJson as never,
    active: input.active ?? true,
    sortOrder: input.sortOrder ?? 0,
  };

  let item: KnowledgeItem;
  if (existing && existing.pack.id === pack.id) {
    item = await prisma.knowledgeItem.update({ where: { id: existing.id }, data: base });
  } else if (existing) {
    // Kind changed → move packs (delete from old, create in the new pack).
    await prisma.knowledgeItem.delete({ where: { id: existing.id } });
    item = await prisma.knowledgeItem.create({ data: { organizationId, packId: pack.id, code: key, ...base } });
  } else {
    item = await prisma.knowledgeItem.create({ data: { organizationId, packId: pack.id, code: key, ...base } });
  }

  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: actor.type ?? "USER",
    action: existing ? "contract.template.updated" : "contract.template.created",
    resourceType: "KnowledgeItem",
    resourceId: item.id,
    afterJson: { kind: input.kind, key, name: base.title, version, active: base.active } as never,
    metadata: { source: "contracts", store: "oKF:templates", templateKind: input.kind } as never,
  });
  return toDTO(item, pack.key);
}

export async function deleteTemplate(organizationId: string, id: string, actor: Actor): Promise<void> {
  const item = await prisma.knowledgeItem.findFirst({
    where: { id, organizationId, kind: "TEMPLATE", pack: { key: { in: ALL_PACK_KEYS } } },
    include: { pack: { select: { key: true } } },
  });
  if (!item) throw new Error("Template not found");
  await prisma.knowledgeItem.delete({ where: { id } });
  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: actor.type ?? "USER",
    action: "contract.template.deleted",
    resourceType: "KnowledgeItem",
    resourceId: id,
    beforeJson: { kind: PACK_KEY_TO_KIND[item.pack.key] ?? "OTHER", key: item.code, name: item.title } as never,
    metadata: { source: "contracts", store: "oKF:templates" } as never,
  });
}
