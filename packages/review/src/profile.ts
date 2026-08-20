/**
 * Review profiles (AIR-2) — reusable, versioned review instructions. A profile
 * bundles plain-language responsiveness `criteria`, issue codes, an optional
 * prompt-template override, model params, and confidence thresholds. Every edit
 * freezes an immutable `ReviewProfileVersion` (same pattern as hold notice
 * templates / agent definitions) so an AI review's exact instructions are a
 * defensible record. A review set adopts a profile version, seeding its
 * criteria/issues while staying editable per-set.
 *
 * "Draft with AI" (`draftProfileCriteria`) runs the shared engine's
 * deterministic drafter — freeze-safe; a Claude drafter drops in behind the
 * same shape later. Chain-sealed via logAudit (`reviewprofile.*`).
 */
import { prisma, logAudit } from "@aegis/db";
import { draftReviewCriteria, type DraftedProfile } from "@aegis/ai-review";

export type Actor = { id: string | null; type?: "USER" | "AGENT" | "SYSTEM" };

export interface ReviewIssue { key: string; label: string }
export interface ReviewProfileModelParams { model?: string; temperature?: number; maxTokens?: number }
export interface ReviewProfileThresholds { responsive?: number; privileged?: number; autoCull?: number }

export interface ReviewProfileSummary {
  id: string;
  name: string;
  description: string | null;
  criteria: string;
  issues: ReviewIssue[];
  promptTemplate: string | null;
  modelParams: ReviewProfileModelParams | null;
  thresholds: ReviewProfileThresholds | null;
  version: number;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewProfileVersionSummary {
  version: number;
  name: string;
  description: string | null;
  criteria: string;
  issues: ReviewIssue[];
  promptTemplate: string | null;
  changeLog: string | null;
  createdAt: string;
}

export interface ReviewProfileDetail extends ReviewProfileSummary {
  versions: ReviewProfileVersionSummary[];
}

function cleanIssues(issues?: ReviewIssue[] | null): ReviewIssue[] {
  return (issues ?? []).filter((i) => i && i.key && i.label).map((i) => ({ key: i.key.trim(), label: i.label.trim() }));
}

type ProfileRow = {
  id: string; name: string; description: string | null; criteria: string; issuesJson: unknown;
  promptTemplate: string | null; modelParamsJson: unknown; thresholdsJson: unknown;
  version: number; isArchived: boolean; createdAt: Date; updatedAt: Date;
};

function toSummary(p: ProfileRow): ReviewProfileSummary {
  return {
    id: p.id, name: p.name, description: p.description ?? null, criteria: p.criteria,
    issues: (p.issuesJson as ReviewIssue[] | null) ?? [],
    promptTemplate: p.promptTemplate ?? null,
    modelParams: (p.modelParamsJson as ReviewProfileModelParams | null) ?? null,
    thresholds: (p.thresholdsJson as ReviewProfileThresholds | null) ?? null,
    version: p.version, isArchived: p.isArchived,
    createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString(),
  };
}

export interface UpsertReviewProfileInput {
  name: string;
  description?: string | null;
  criteria: string;
  issues?: ReviewIssue[];
  promptTemplate?: string | null;
  modelParams?: ReviewProfileModelParams | null;
  thresholds?: ReviewProfileThresholds | null;
  changeLog?: string | null;
}

/** Create a profile at version 1 and freeze its first immutable version. */
export async function createReviewProfile(organizationId: string, input: UpsertReviewProfileInput, actor: Actor): Promise<ReviewProfileSummary> {
  const criteria = (input.criteria || "").trim();
  if (!criteria) throw new Error("Review profile requires criteria");
  const issues = cleanIssues(input.issues);
  const created = await prisma.$transaction(async (tx) => {
    const p = await tx.reviewProfile.create({
      data: {
        organizationId, name: (input.name || "Untitled profile").trim(), description: input.description?.trim() || null,
        criteria, issuesJson: issues as never,
        promptTemplate: input.promptTemplate?.trim() || null,
        modelParamsJson: (input.modelParams ?? null) as never,
        thresholdsJson: (input.thresholds ?? null) as never,
        version: 1, createdById: actor.id,
      },
    });
    await tx.reviewProfileVersion.create({
      data: {
        organizationId, profileId: p.id, version: 1, name: p.name, description: p.description,
        criteria: p.criteria, issuesJson: p.issuesJson as never, promptTemplate: p.promptTemplate,
        modelParamsJson: p.modelParamsJson as never, thresholdsJson: p.thresholdsJson as never,
        changeLog: input.changeLog?.trim() || "Initial version", createdById: actor.id,
      },
    });
    return p;
  });
  await logAudit({
    organizationId, actorId: actor.id, actorType: actor.type ?? "USER",
    action: "reviewprofile.created", resourceType: "ReviewProfile", resourceId: created.id,
    afterJson: { name: created.name, version: 1, issues: issues.length } as never,
    metadata: { source: "review", channel: "ediscovery" } as never,
  });
  return toSummary(created as ProfileRow);
}

/** Update a profile: bump the version + freeze a new immutable snapshot. */
export async function updateReviewProfile(organizationId: string, id: string, input: UpsertReviewProfileInput, actor: Actor): Promise<ReviewProfileSummary> {
  const existing = await prisma.reviewProfile.findFirst({ where: { id, organizationId } });
  if (!existing) throw new Error("Review profile not found");
  const criteria = (input.criteria || "").trim();
  if (!criteria) throw new Error("Review profile requires criteria");
  const issues = cleanIssues(input.issues);
  const nextVersion = existing.version + 1;
  const updated = await prisma.$transaction(async (tx) => {
    const p = await tx.reviewProfile.update({
      where: { id },
      data: {
        name: (input.name || existing.name).trim(), description: input.description?.trim() || null,
        criteria, issuesJson: issues as never,
        promptTemplate: input.promptTemplate?.trim() || null,
        modelParamsJson: (input.modelParams ?? null) as never,
        thresholdsJson: (input.thresholds ?? null) as never,
        version: nextVersion,
      },
    });
    await tx.reviewProfileVersion.create({
      data: {
        organizationId, profileId: id, version: nextVersion, name: p.name, description: p.description,
        criteria: p.criteria, issuesJson: p.issuesJson as never, promptTemplate: p.promptTemplate,
        modelParamsJson: p.modelParamsJson as never, thresholdsJson: p.thresholdsJson as never,
        changeLog: input.changeLog?.trim() || null, createdById: actor.id,
      },
    });
    return p;
  });
  await logAudit({
    organizationId, actorId: actor.id, actorType: actor.type ?? "USER",
    action: "reviewprofile.updated", resourceType: "ReviewProfile", resourceId: id,
    beforeJson: { version: existing.version } as never,
    afterJson: { name: updated.name, version: nextVersion, issues: issues.length } as never,
    metadata: { source: "review", channel: "ediscovery" } as never,
  });
  return toSummary(updated as ProfileRow);
}

export async function listReviewProfiles(organizationId: string, opts: { includeArchived?: boolean } = {}): Promise<ReviewProfileSummary[]> {
  const rows = await prisma.reviewProfile.findMany({
    where: { organizationId, ...(opts.includeArchived ? {} : { isArchived: false }) },
    orderBy: [{ updatedAt: "desc" }],
  });
  return rows.map((p) => toSummary(p as ProfileRow));
}

export async function getReviewProfile(organizationId: string, id: string): Promise<ReviewProfileDetail | null> {
  const p = await prisma.reviewProfile.findFirst({
    where: { id, organizationId },
    include: { versions: { orderBy: [{ version: "desc" }] } },
  });
  if (!p) return null;
  return {
    ...toSummary(p as ProfileRow),
    versions: p.versions.map((v) => ({
      version: v.version, name: v.name, description: v.description ?? null, criteria: v.criteria,
      issues: (v.issuesJson as ReviewIssue[] | null) ?? [], promptTemplate: v.promptTemplate ?? null,
      changeLog: v.changeLog ?? null, createdAt: v.createdAt.toISOString(),
    })),
  };
}

/** Archive (soft-delete) a profile. Existing review-set links keep resolving. */
export async function archiveReviewProfile(organizationId: string, id: string, actor: Actor): Promise<ReviewProfileSummary> {
  const existing = await prisma.reviewProfile.findFirst({ where: { id, organizationId }, select: { id: true } });
  if (!existing) throw new Error("Review profile not found");
  const p = await prisma.reviewProfile.update({ where: { id }, data: { isArchived: true } });
  await logAudit({
    organizationId, actorId: actor.id, actorType: actor.type ?? "USER",
    action: "reviewprofile.archived", resourceType: "ReviewProfile", resourceId: id,
    metadata: { source: "review", channel: "ediscovery" } as never,
  });
  return toSummary(p as ProfileRow);
}

/** Adopt a profile version onto a review set — seeds its criteria + issues and
 *  records the provenance link. Existing per-set edits are overwritten by the
 *  profile's copy on purpose (the attorney re-applies knowingly). Chain-sealed. */
export async function applyProfileToReviewSet(organizationId: string, reviewSetId: string, profileId: string, actor: Actor): Promise<{ criteria: string; issues: ReviewIssue[]; profileVersion: number }> {
  const [rs, profile] = await Promise.all([
    prisma.reviewSet.findFirst({ where: { id: reviewSetId, organizationId }, select: { id: true } }),
    prisma.reviewProfile.findFirst({ where: { id: profileId, organizationId } }),
  ]);
  if (!rs) throw new Error("Review set not found");
  if (!profile) throw new Error("Review profile not found");
  const issues = (profile.issuesJson as ReviewIssue[] | null) ?? [];
  await prisma.reviewSet.update({
    where: { id: reviewSetId },
    data: { criteria: profile.criteria, issuesJson: issues as never, reviewProfileId: profile.id, reviewProfileVersion: profile.version },
  });
  await logAudit({
    organizationId, actorId: actor.id, actorType: actor.type ?? "USER",
    action: "reviewprofile.applied", resourceType: "ReviewSet", resourceId: reviewSetId,
    afterJson: { profileId: profile.id, profileVersion: profile.version } as never,
    metadata: { source: "review", channel: "ediscovery" } as never,
  });
  return { criteria: profile.criteria, issues, profileVersion: profile.version };
}

export interface DraftProfileRequest { description: string; context?: string }

/** "✨ Draft with AI" — deterministic (freeze-safe) profile draft from a
 *  description. Returns a suggestion the attorney edits before saving; does not
 *  persist. */
export function draftProfileCriteria(input: DraftProfileRequest): DraftedProfile {
  return draftReviewCriteria({ description: input.description, context: input.context });
}
