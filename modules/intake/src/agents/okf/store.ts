/**
 * oKF store — AgentDefinition + KnowledgePack persistence (server-only,
 * chain-sealed). Assembles DB rows into an OkfDocument, saves drafts,
 * publishes immutable versions, lists history, reverts, and seeds the
 * code-shipped static defs.
 *
 * Every publish + revert writes an AuditLog row via logAudit (best-effort,
 * matching the module's mutation discipline). The Agent Designer never
 * touches Prisma directly — it goes through these functions.
 */
import { prisma, logAudit, sha256Hex } from "@aegis/db";
import {
  normalizeDocument,
  serializeDocument,
  canonicalStringify,
} from "./serialize";
import type { OkfDocument, OkfPack } from "./schema";

interface Actor {
  id: string | null;
  type?: "USER" | "AGENT" | "SYSTEM";
}

export interface AgentDefinitionSummary {
  agentKey: string;
  name: string;
  icon: string | null;
  enabled: boolean;
  status: string;
  publishedVersion: number;
  hasDraft: boolean;
  updatedAt: string;
}

// ── Assemble ─────────────────────────────────────────────────────────

type DefRow = NonNullable<Awaited<ReturnType<typeof loadDefRow>>>;

function loadDefRow(organizationId: string, agentKey: string) {
  return prisma.agentDefinition.findUnique({
    where: { organizationId_agentKey: { organizationId, agentKey } },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });
}

async function loadPacks(organizationId: string, agentKey: string): Promise<OkfPack[]> {
  const packs = await prisma.knowledgePack.findMany({
    where: { organizationId, agentKey },
    include: { items: { orderBy: { sortOrder: "asc" } }, cohorts: { orderBy: { sortOrder: "asc" } } },
    orderBy: { createdAt: "asc" },
  });
  return packs.map((p) => ({
    key: p.key,
    name: p.name,
    description: p.description,
    kind: p.kind as OkfPack["kind"],
    items: p.items
      .filter((it) => it.active)
      .map((it) => ({
        code: it.code,
        kind: it.kind as OkfPack["items"][number]["kind"],
        title: it.title,
        bodyMarkdown: it.bodyMarkdown,
        data: (it.dataJson as Record<string, unknown>) ?? {},
        cohortTags: it.cohortTags ?? [],
        sortOrder: it.sortOrder,
      })),
    cohorts: p.cohorts.map((c) => ({
      key: c.key,
      name: c.name,
      tag: c.tag,
      selector: (c.selectorJson as Record<string, unknown>) ?? {},
      sortOrder: c.sortOrder,
    })),
  }));
}

function agentFromRow(row: DefRow, knowledge: OkfPack[]): OkfDocument {
  return normalizeDocument({
    okfVersion: 1,
    agent: {
      key: row.agentKey,
      name: row.name,
      shortName: row.shortName,
      icon: row.icon,
      description: row.description,
      enabled: row.enabled,
      productionReady: row.productionReady,
      displayOrder: row.displayOrder,
      routing: row.routingJson,
      model: row.modelJson,
      prompt: row.promptJson,
      output: row.outputJson,
      risks: row.risks,
      playbook: row.playbookJson,
      approverRole: row.approverRole,
      executionMode: row.executionMode,
    },
    knowledge,
  });
}

/**
 * The published oKF document for an agent (or null if none). This is what
 * the runtime resolves. Falls back to the draft only if explicitly asked.
 */
export async function getPublishedAgentDocument(
  organizationId: string,
  agentKey: string,
): Promise<OkfDocument | null> {
  const row = await loadDefRow(organizationId, agentKey);
  if (!row) return null;
  const latest = row.versions[0];
  // A published version is the source of truth for the live agent; the
  // AgentDefinition columns mirror it. Prefer the frozen specJson so
  // the runtime is byte-stable with what was published.
  if (row.publishedVersion > 0 && latest) {
    return normalizeDocument(latest.specJson);
  }
  return agentFromRow(row, await loadPacks(organizationId, agentKey));
}

/** The current editable document (draft columns + live packs). */
export async function getAgentDocument(
  organizationId: string,
  agentKey: string,
): Promise<OkfDocument | null> {
  const row = await loadDefRow(organizationId, agentKey);
  if (!row) return null;
  return agentFromRow(row, await loadPacks(organizationId, agentKey));
}

export async function listAgentDefinitions(organizationId: string): Promise<AgentDefinitionSummary[]> {
  const rows = await prisma.agentDefinition.findMany({
    where: { organizationId },
    orderBy: { displayOrder: "asc" },
  });
  return rows.map((r) => ({
    agentKey: r.agentKey,
    name: r.name,
    icon: r.icon,
    enabled: r.enabled,
    status: r.status,
    publishedVersion: r.publishedVersion,
    hasDraft: canonicalStringify(r.draftJson) !== "{}",
    updatedAt: r.updatedAt.toISOString(),
  }));
}

// ── Write the agent columns from an oKF document (shared by seed + save)

async function writeAgentColumns(
  organizationId: string,
  doc: OkfDocument,
  extra: { status?: "DRAFT" | "PUBLISHED"; publishedVersion?: number; draftJson?: unknown } = {},
) {
  const a = doc.agent;
  const base = {
    name: a.name,
    shortName: a.shortName,
    icon: a.icon,
    description: a.description,
    enabled: a.enabled,
    productionReady: a.productionReady,
    displayOrder: a.displayOrder,
    routingJson: a.routing as never,
    modelJson: a.model as never,
    promptJson: a.prompt as never,
    outputJson: a.output as never,
    risks: a.risks,
    playbookJson: a.playbook as never,
    approverRole: a.approverRole,
    executionMode: a.executionMode,
    ...(extra.status ? { status: extra.status } : {}),
    ...(extra.publishedVersion != null ? { publishedVersion: extra.publishedVersion } : {}),
    ...(extra.draftJson !== undefined ? { draftJson: extra.draftJson as never } : {}),
  };
  return prisma.agentDefinition.upsert({
    where: { organizationId_agentKey: { organizationId, agentKey: a.key } },
    create: { organizationId, agentKey: a.key, ...base },
    update: base,
  });
}

/** Replace an agent's knowledge packs from an oKF document (idempotent). */
async function writeKnowledgePacks(organizationId: string, doc: OkfDocument) {
  for (const pack of doc.knowledge) {
    const packRow = await prisma.knowledgePack.upsert({
      where: { organizationId_key: { organizationId, key: pack.key } },
      create: {
        organizationId,
        key: pack.key,
        name: pack.name,
        description: pack.description,
        kind: pack.kind as never,
        agentKey: doc.agent.key,
        status: "PUBLISHED",
        publishedVersion: 1,
      },
      update: { name: pack.name, description: pack.description, kind: pack.kind as never, agentKey: doc.agent.key },
    });
    // Items — upsert by (packId, code); prune codes no longer present.
    const keepCodes = new Set(pack.items.map((i) => i.code));
    const existing = await prisma.knowledgeItem.findMany({ where: { packId: packRow.id }, select: { code: true } });
    for (const e of existing) if (!keepCodes.has(e.code)) await prisma.knowledgeItem.deleteMany({ where: { packId: packRow.id, code: e.code } });
    for (const it of pack.items) {
      await prisma.knowledgeItem.upsert({
        where: { packId_code: { packId: packRow.id, code: it.code } },
        create: { organizationId, packId: packRow.id, code: it.code, kind: it.kind as never, title: it.title, bodyMarkdown: it.bodyMarkdown, dataJson: it.data as never, cohortTags: it.cohortTags, sortOrder: it.sortOrder },
        update: { kind: it.kind as never, title: it.title, bodyMarkdown: it.bodyMarkdown, dataJson: it.data as never, cohortTags: it.cohortTags, sortOrder: it.sortOrder },
      });
    }
    // Cohorts — upsert by (packId, key).
    for (const c of pack.cohorts) {
      await prisma.knowledgeCohort.upsert({
        where: { packId_key: { packId: packRow.id, key: c.key } },
        create: { organizationId, packId: packRow.id, key: c.key, name: c.name, tag: c.tag, selectorJson: c.selector as never, sortOrder: c.sortOrder },
        update: { name: c.name, tag: c.tag, selectorJson: c.selector as never, sortOrder: c.sortOrder },
      });
    }
  }
}

/**
 * Seed / upsert an agent definition + its packs from a static oKF doc.
 * Idempotent: safe to re-run. Marks the def PUBLISHED at version 1 on
 * first seed so the runtime resolves it immediately; leaves an existing
 * (possibly edited) row's published state untouched.
 */
export async function seedAgentDefinition(organizationId: string, rawDoc: unknown): Promise<void> {
  const doc = normalizeDocument(rawDoc);
  const existing = await loadDefRow(organizationId, doc.agent.key);
  await writeKnowledgePacks(organizationId, doc);
  if (existing && existing.publishedVersion > 0) {
    // Already published (and maybe edited) — refresh only the descriptive
    // columns, never clobber a customer's published version.
    await writeAgentColumns(organizationId, doc);
    return;
  }
  await writeAgentColumns(organizationId, doc, { status: "PUBLISHED", publishedVersion: 1, draftJson: {} });
  const spec = serializeDocument(doc);
  const row = await loadDefRow(organizationId, doc.agent.key);
  if (row) {
    await prisma.agentDefinitionVersion.upsert({
      where: { definitionId_version: { definitionId: row.id, version: 1 } },
      create: {
        organizationId,
        definitionId: row.id,
        agentKey: doc.agent.key,
        version: 1,
        specJson: JSON.parse(spec) as never,
        bodyHash: sha256Hex(spec),
        changeLog: "Seeded from code-shipped static definition.",
        createdById: null,
      },
      update: {},
    });
  }
}

// ── Draft + publish (Agent Designer) ─────────────────────────────────

/** Save an in-progress edit to draftJson (no behaviour change until publish).
 *  Persists the knowledge packs/items too so the Designer's Knowledge tab
 *  edits (add/edit/reorder/delete items, cohort tags) are durable — the
 *  full document is the source of truth. Publish then freezes a version. */
export async function saveAgentDraft(organizationId: string, agentKey: string, rawDoc: unknown): Promise<void> {
  const doc = normalizeDocument(rawDoc);
  if (doc.agent.key !== agentKey) throw new Error("agentKey mismatch");
  await writeAgentColumns(organizationId, doc, { status: "DRAFT", draftJson: JSON.parse(serializeDocument(doc)) });
  await writeKnowledgePacks(organizationId, doc);
}

/**
 * Publish the current document as a new immutable version + make it live.
 * Skips a no-op publish (identical canonical spec to the latest version).
 */
export async function publishAgentDefinition(
  organizationId: string,
  agentKey: string,
  changeLog: string | null,
  actor: Actor,
): Promise<{ version: number } | null> {
  const doc = await getAgentDocument(organizationId, agentKey);
  if (!doc) throw new Error("Agent definition not found");
  const row = await loadDefRow(organizationId, agentKey);
  if (!row) throw new Error("Agent definition not found");

  const spec = serializeDocument(doc);
  const hash = sha256Hex(spec);
  const latest = row.versions[0];
  if (latest && latest.bodyHash === hash) return null; // no-op

  const version = row.publishedVersion + 1;
  await prisma.agentDefinitionVersion.create({
    data: {
      organizationId,
      definitionId: row.id,
      agentKey,
      version,
      specJson: JSON.parse(spec) as never,
      bodyHash: hash,
      changeLog,
      createdById: actor.id,
    },
  });
  await prisma.agentDefinition.update({
    where: { id: row.id },
    data: { status: "PUBLISHED", publishedVersion: version, draftJson: {} },
  });
  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: actor.type ?? "USER",
    action: "agent.definition.published",
    resourceType: "AgentDefinition",
    resourceId: row.id,
    afterJson: { agentKey, version, bodyHash: hash } as never,
    metadata: { source: "agent-designer", changeLog } as never,
  });
  return { version };
}

export interface AgentVersionSummary {
  version: number;
  bodyHash: string;
  changeLog: string | null;
  createdAt: string;
}

export async function listAgentDefinitionVersions(organizationId: string, agentKey: string): Promise<AgentVersionSummary[]> {
  const rows = await prisma.agentDefinitionVersion.findMany({
    where: { organizationId, agentKey },
    orderBy: { version: "desc" },
    select: { version: true, bodyHash: true, changeLog: true, createdAt: true },
  });
  return rows.map((r) => ({ version: r.version, bodyHash: r.bodyHash, changeLog: r.changeLog, createdAt: r.createdAt.toISOString() }));
}

export async function getAgentDefinitionVersion(organizationId: string, agentKey: string, version: number): Promise<OkfDocument | null> {
  const row = await prisma.agentDefinitionVersion.findFirst({ where: { organizationId, agentKey, version } });
  return row ? normalizeDocument(row.specJson) : null;
}

/** Revert: publish the chosen historical spec as a NEW version (append-only). */
export async function revertAgentDefinition(organizationId: string, agentKey: string, toVersion: number, actor: Actor): Promise<{ version: number } | null> {
  const target = await getAgentDefinitionVersion(organizationId, agentKey, toVersion);
  if (!target) throw new Error("Version not found");
  await writeAgentColumns(organizationId, target, { status: "DRAFT" });
  await writeKnowledgePacks(organizationId, target);
  return publishAgentDefinition(organizationId, agentKey, `Reverted to version ${toVersion}.`, actor);
}
