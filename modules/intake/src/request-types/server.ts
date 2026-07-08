/**
 * Intake request types (Phase 1 — configurable workstreams).
 *
 * The container that lets a client define their own request catalog
 * (NDAs, contracts, trademarks, litigation, DPIA, notices, …) with
 * structured fields and a stage workflow — mirrors MatterTypeConfig. The
 * specific field sets per client are configuration authored through the
 * admin API after discovery; this module owns the persistence + audit.
 *
 * Server-only — imports @aegis/db.
 */
import { prisma, logAudit, getCurrentUser } from "@aegis/db";

export interface RequestFieldDTO {
  id?: string;
  key: string;
  label: string;
  kind: string; // text | textarea | select | date | number | boolean
  required: boolean;
  sortOrder: number;
  options: Array<{ value: string; label: string }>;
}

export interface RequestTypeDTO {
  id: string;
  key: string;
  name: string;
  workstream: string | null;
  description: string | null;
  active: boolean;
  stages: string[];
  /// WorkflowDefinition.key bound to this type (W-C) — null = no ladder.
  workflowKey: string | null;
  /// Agent id handling this type (program #5) — null = auto/router.
  preferredAgentId: string | null;
  sortOrder: number;
  fields: RequestFieldDTO[];
}

type Ctx = {
  req?: { headers: Record<string, string | string[] | undefined> };
  res?: unknown;
};

export class RequestTypeNotFoundError extends Error {
  constructor(id: string) {
    super(`Intake request type ${id} not found`);
    this.name = "RequestTypeNotFoundError";
  }
}
export class RequestTypeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestTypeValidationError";
  }
}

const VALID_KINDS = new Set(["text", "textarea", "select", "date", "number", "boolean"]);
const KEY_RE = /^[a-z0-9][a-z0-9_-]*$/;

type TypeRow = {
  id: string;
  key: string;
  name: string;
  workstream: string | null;
  description: string | null;
  active: boolean;
  stagesJson: unknown;
  workflowKey: string | null;
  preferredAgentId: string | null;
  sortOrder: number;
  fields: Array<{
    id: string;
    key: string;
    label: string;
    kind: string;
    required: boolean;
    sortOrder: number;
    optionsJson: unknown;
  }>;
};

function toDTO(r: TypeRow): RequestTypeDTO {
  return {
    id: r.id,
    key: r.key,
    name: r.name,
    workstream: r.workstream,
    description: r.description,
    active: r.active,
    stages: Array.isArray(r.stagesJson) ? (r.stagesJson as string[]) : [],
    workflowKey: r.workflowKey ?? null,
    preferredAgentId: r.preferredAgentId ?? null,
    sortOrder: r.sortOrder,
    fields: r.fields
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((f) => ({
        id: f.id,
        key: f.key,
        label: f.label,
        kind: f.kind,
        required: f.required,
        sortOrder: f.sortOrder,
        options: Array.isArray(f.optionsJson)
          ? (f.optionsJson as Array<{ value: string; label: string }>)
          : [],
      })),
  };
}

const INCLUDE_FIELDS = { fields: true } as const;

export async function listRequestTypes(
  organizationId: string,
  opts: { includeInactive?: boolean } = {},
): Promise<RequestTypeDTO[]> {
  const rows = await prisma.intakeRequestType.findMany({
    where: { organizationId, ...(opts.includeInactive ? {} : { active: true }) },
    include: INCLUDE_FIELDS,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return rows.map((r) => toDTO(r as TypeRow));
}

export async function getRequestType(
  organizationId: string,
  id: string,
): Promise<RequestTypeDTO | null> {
  const row = await prisma.intakeRequestType.findFirst({
    where: { id, organizationId },
    include: INCLUDE_FIELDS,
  });
  return row ? toDTO(row as TypeRow) : null;
}

export interface RequestTypeInput {
  key: string;
  name: string;
  workstream?: string | null;
  description?: string | null;
  active?: boolean;
  stages?: string[];
  workflowKey?: string | null;
  preferredAgentId?: string | null;
  sortOrder?: number;
  fields?: Array<Omit<RequestFieldDTO, "id">>;
}

function validate(input: RequestTypeInput) {
  if (!input.key || !KEY_RE.test(input.key)) {
    throw new RequestTypeValidationError(
      "key is required and must be lowercase alphanumeric with - or _.",
    );
  }
  if (!input.name || !input.name.trim()) {
    throw new RequestTypeValidationError("name is required.");
  }
  const seen = new Set<string>();
  for (const f of input.fields ?? []) {
    if (!f.key || !KEY_RE.test(f.key)) {
      throw new RequestTypeValidationError(`field key "${f.key}" is invalid.`);
    }
    if (seen.has(f.key)) {
      throw new RequestTypeValidationError(`duplicate field key "${f.key}".`);
    }
    seen.add(f.key);
    if (!VALID_KINDS.has(f.kind)) {
      throw new RequestTypeValidationError(`field "${f.key}" has invalid kind "${f.kind}".`);
    }
  }
}

function fieldCreateData(fields: Array<Omit<RequestFieldDTO, "id">> | undefined) {
  return (fields ?? []).map((f, i) => ({
    key: f.key,
    label: f.label,
    kind: f.kind,
    required: !!f.required,
    sortOrder: typeof f.sortOrder === "number" ? f.sortOrder : (i + 1) * 10,
    optionsJson: (f.options ?? []) as never,
  }));
}

export async function createRequestType(
  organizationId: string,
  input: RequestTypeInput,
  ctx: Ctx = {},
): Promise<RequestTypeDTO> {
  validate(input);
  const created = await prisma.intakeRequestType.create({
    data: {
      organizationId,
      key: input.key,
      name: input.name.trim(),
      workstream: input.workstream?.trim() || null,
      description: input.description?.trim() || null,
      active: input.active ?? true,
      stagesJson: (input.stages ?? []) as never,
      workflowKey: input.workflowKey?.trim() || null,
      preferredAgentId: input.preferredAgentId?.trim() || null,
      sortOrder: input.sortOrder ?? 100,
      fields: { create: fieldCreateData(input.fields) },
    },
    include: INCLUDE_FIELDS,
  });
  const actor = await getCurrentUser(ctx.req, ctx.res);
  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: "USER",
    action: "intake.request_type.created",
    resourceType: "IntakeRequestType",
    resourceId: created.id,
    afterJson: { key: created.key, name: created.name, workstream: created.workstream, fields: created.fields.length },
    metadata: { source: "intake-admin" },
  });
  return toDTO(created as TypeRow);
}

export async function updateRequestType(
  organizationId: string,
  id: string,
  input: RequestTypeInput,
  ctx: Ctx = {},
): Promise<RequestTypeDTO> {
  const before = await prisma.intakeRequestType.findFirst({
    where: { id, organizationId },
    include: INCLUDE_FIELDS,
  });
  if (!before) throw new RequestTypeNotFoundError(id);
  validate({ ...input, key: input.key ?? before.key, name: input.name ?? before.name });

  // Replace fields wholesale when provided (simplest deterministic edit);
  // otherwise leave them untouched.
  const updated = await prisma.$transaction(async (tx) => {
    if (input.fields) {
      await tx.intakeRequestField.deleteMany({ where: { requestTypeId: id } });
    }
    return tx.intakeRequestType.update({
      where: { id },
      data: {
        key: input.key ?? before.key,
        name: (input.name ?? before.name).trim(),
        workstream: input.workstream !== undefined ? input.workstream?.trim() || null : before.workstream,
        description: input.description !== undefined ? input.description?.trim() || null : before.description,
        active: input.active ?? before.active,
        stagesJson: (input.stages ?? (before.stagesJson as never)) as never,
        workflowKey: input.workflowKey !== undefined ? input.workflowKey?.trim() || null : before.workflowKey,
        preferredAgentId: input.preferredAgentId !== undefined ? input.preferredAgentId?.trim() || null : before.preferredAgentId,
        sortOrder: input.sortOrder ?? before.sortOrder,
        ...(input.fields ? { fields: { create: fieldCreateData(input.fields) } } : {}),
      },
      include: INCLUDE_FIELDS,
    });
  });

  const actor = await getCurrentUser(ctx.req, ctx.res);
  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: "USER",
    action: "intake.request_type.updated",
    resourceType: "IntakeRequestType",
    resourceId: id,
    beforeJson: { name: before.name, active: before.active, fields: before.fields.length },
    afterJson: { name: updated.name, active: updated.active, fields: updated.fields.length },
    metadata: { source: "intake-admin" },
  });
  return toDTO(updated as TypeRow);
}

export async function deleteRequestType(
  organizationId: string,
  id: string,
  ctx: Ctx = {},
): Promise<void> {
  const before = await prisma.intakeRequestType.findFirst({
    where: { id, organizationId },
    select: { key: true, name: true },
  });
  if (!before) throw new RequestTypeNotFoundError(id);
  await prisma.intakeRequestType.delete({ where: { id } });
  const actor = await getCurrentUser(ctx.req, ctx.res);
  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: "USER",
    action: "intake.request_type.deleted",
    resourceType: "IntakeRequestType",
    resourceId: id,
    beforeJson: { key: before.key, name: before.name },
    metadata: { source: "intake-admin" },
  });
}
