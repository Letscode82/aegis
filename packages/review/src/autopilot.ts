/**
 * CAP-5 — Case AutoPilot.
 *
 * A single-prompt agentic orchestrator over a collection. One directive plans a
 * DAG of typed steps, each bound to a tool; the run advances through them with a
 * planner + observe/decide/act/check loop:
 *
 *   - READ tools (eca, case_graph, assemble) run freely as the run advances.
 *   - MUTATING tools (cull, ai_review) touch evidence, so each writes a PENDING
 *     `AgentDecision` and PAUSES the run — the human approve keystroke is the
 *     only path that executes the mutation and chain-seals it (CAP-4 contract,
 *     now driven by the AutoPilot). The AI proposes the whole plan and runs the
 *     safe parts, then stops at each evidence-touching step.
 *   - After the pipeline assembles, a bounded critic may re-plan one remediation
 *     pass (e.g. the first review surfaced 0 responsive docs → re-run broader),
 *     capped so the loop always terminates.
 *
 * The planner and tool-kind classification are pure and unit-tested; the loop
 * itself is thin orchestration over the existing review services.
 */
import { prisma, logAudit, AgentApprovalStatus } from "@aegis/db";
import { applyThreadNearDupCull } from "./cull";
import { runAiReviewOnReviewSet } from "./ai";
import { getEcaFunnel } from "./eca";
import { runCaseGraph } from "./case-graph";
import { buildCaseBrief } from "./copilot";

export type Actor = { id: string | null; type?: "USER" | "AGENT" | "SYSTEM" };

const AGENT_NAME = "case-autopilot";
const MAX_PASSES = 2;

// ── Pure planner + tool registry (unit-tested) ──────────────────────

export type AutoPilotTool = "cull" | "ai_review" | "eca" | "case_graph" | "assemble";

export interface ToolMeta {
  title: string;
  kind: "read" | "mutating";
  /** One-line description of what the tool does, shown in the panel. */
  blurb: string;
}

export const TOOL_META: Record<AutoPilotTool, ToolMeta> = {
  cull: {
    title: "Cull duplicates & threads",
    kind: "mutating",
    blurb: "Suppress near-duplicates and non-inclusive email thread members.",
  },
  ai_review: {
    title: "AI review",
    kind: "mutating",
    blurb: "Tag every pending document for responsiveness, privilege, PII, and key-doc — with citations.",
  },
  eca: {
    title: "Early case assessment",
    kind: "read",
    blurb: "Build the volume funnel (collected → culled → in-scope) and cost estimate.",
  },
  case_graph: {
    title: "Case graph",
    kind: "read",
    blurb: "Cluster issues, extract the timeline and entities, synthesize a theory, and find gaps.",
  },
  assemble: {
    title: "Assemble findings",
    kind: "read",
    blurb: "Compose the case brief: theory, key documents, timeline, and recommended next actions.",
  },
};

export interface PlanState {
  itemCount: number;
  /** Items already excluded by a prior cull pass. */
  excludedCount: number;
  /** Items that already carry an AI route (i.e. AI review has run). */
  aiRoutedCount: number;
}

export interface PlannedStep {
  tool: AutoPilotTool;
  title: string;
  kind: "read" | "mutating";
}

function stepFor(tool: AutoPilotTool): PlannedStep {
  return { tool, title: TOOL_META[tool].title, kind: TOOL_META[tool].kind };
}

/**
 * Deterministic planner. Given the current state of the collection, lay out the
 * pipeline: cull first (if not already), then review, then assessment, graph,
 * and the final assembly. Read tools always run; mutating tools are included
 * only when there's work for them.
 */
export function planSteps(state: PlanState): PlannedStep[] {
  const steps: PlannedStep[] = [];
  if (state.itemCount === 0) return steps;
  if (state.excludedCount === 0 && state.itemCount > 3) steps.push(stepFor("cull"));
  if (state.aiRoutedCount < state.itemCount) steps.push(stepFor("ai_review"));
  steps.push(stepFor("eca"));
  steps.push(stepFor("case_graph"));
  steps.push(stepFor("assemble"));
  return steps;
}

export interface CritiqueInput {
  aiReviewRan: boolean;
  responsiveCount: number;
  passCount: number;
}

export interface CritiqueResult {
  /** Steps to append for another bounded pass (empty = converged). */
  append: PlannedStep[];
  note: string;
}

/**
 * Bounded critic. The "check" half of the loop: after assembly, decide whether
 * one more pass is warranted. The one automatic re-plan trigger is "review ran
 * but surfaced zero responsive documents" — re-run review broader, then
 * re-observe. Capped at MAX_PASSES so the loop always terminates.
 */
export function critique(input: CritiqueInput): CritiqueResult {
  if (
    input.aiReviewRan &&
    input.responsiveCount === 0 &&
    input.passCount < MAX_PASSES
  ) {
    return {
      append: [stepFor("ai_review"), stepFor("case_graph"), stepFor("assemble")],
      note: "First pass surfaced 0 responsive documents — re-running review with broadened criteria, then re-observing.",
    };
  }
  return { append: [], note: "Converged — no further automatic passes warranted." };
}

// ── DTOs ────────────────────────────────────────────────────────────

export interface AutoPilotStepDTO {
  id: string;
  ordinal: number;
  tool: string;
  title: string;
  blurb: string;
  kind: string;
  status: string;
  output: unknown;
  agentDecisionId: string | null;
  error: string | null;
  finishedAt: string | null;
}

export interface AutoPilotRunDTO {
  id: string;
  reviewSetId: string;
  directive: string;
  status: string;
  summary: string | null;
  degraded: boolean;
  createdAt: string;
  steps: AutoPilotStepDTO[];
}

function stepToDTO(s: {
  id: string;
  ordinal: number;
  tool: string;
  title: string;
  kind: string;
  status: string;
  outputJson: unknown;
  agentDecisionId: string | null;
  error: string | null;
  finishedAt: Date | null;
}): AutoPilotStepDTO {
  return {
    id: s.id,
    ordinal: s.ordinal,
    tool: s.tool,
    title: s.title,
    blurb: TOOL_META[s.tool as AutoPilotTool]?.blurb ?? "",
    kind: s.kind,
    status: s.status,
    output: s.outputJson ?? null,
    agentDecisionId: s.agentDecisionId,
    error: s.error,
    finishedAt: s.finishedAt?.toISOString() ?? null,
  };
}

async function runToDTO(runId: string): Promise<AutoPilotRunDTO | null> {
  const run = await prisma.caseAutoPilotRun.findUnique({
    where: { id: runId },
    include: { steps: { orderBy: { ordinal: "asc" } } },
  });
  if (!run) return null;
  return {
    id: run.id,
    reviewSetId: run.reviewSetId,
    directive: run.directive,
    status: run.status,
    summary: run.summary,
    degraded: run.degraded,
    createdAt: run.createdAt.toISOString(),
    steps: run.steps.map(stepToDTO),
  };
}

// ── Orchestration ───────────────────────────────────────────────────

async function planStateForReviewSet(reviewSetId: string): Promise<PlanState> {
  const [itemCount, excludedCount, aiRoutedCount] = await Promise.all([
    prisma.reviewSetItem.count({ where: { reviewSetId } }),
    prisma.reviewSetItem.count({ where: { reviewSetId, excludedAt: { not: null } } }),
    prisma.reviewSetItem.count({ where: { reviewSetId, aiRoute: { not: null } } }),
  ]);
  return { itemCount, excludedCount, aiRoutedCount };
}

/** Start a run: plan the steps, persist them, and advance as far as the
 *  autonomous (read) steps allow before the first gate. */
export async function startAutoPilot(
  organizationId: string,
  reviewSetId: string,
  directive: string,
  actor: Actor,
): Promise<AutoPilotRunDTO> {
  const rs = await prisma.reviewSet.findFirst({
    where: { id: reviewSetId, organizationId },
    select: { id: true },
  });
  if (!rs) throw new Error("Review set not found");
  const clean = (directive || "").trim();
  if (!clean) throw new Error("Add a directive to start the AutoPilot.");

  const state = await planStateForReviewSet(reviewSetId);
  const planned = planSteps(state);
  if (planned.length === 0) throw new Error("This collection has no documents to work up yet.");

  const run = await prisma.caseAutoPilotRun.create({
    data: {
      organizationId,
      reviewSetId,
      directive: clean,
      status: "RUNNING",
      planJson: { maxPasses: MAX_PASSES } as never,
      createdById: actor.id,
      steps: {
        create: planned.map((s, i) => ({
          organizationId,
          ordinal: i + 1,
          tool: s.tool,
          title: s.title,
          kind: s.kind,
          status: "PENDING",
        })),
      },
    },
  });

  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: actor.type ?? "USER",
    action: "reviewset.autopilot.started",
    resourceType: "CaseAutoPilotRun",
    resourceId: run.id,
    afterJson: { reviewSetId, directive: clean, steps: planned.map((s) => s.tool) } as never,
    metadata: { source: "review", channel: "case-autopilot" } as never,
  });

  await advanceRun(organizationId, run.id, actor);
  const dto = await runToDTO(run.id);
  if (!dto) throw new Error("Run vanished after start");
  return dto;
}

/**
 * Advance the run: execute READ steps in order; at the first PENDING MUTATING
 * step, open its gate (PENDING AgentDecision) and stop. When no PENDING steps
 * remain, run the critic — append a bounded remediation pass or finish.
 */
async function advanceRun(
  organizationId: string,
  runId: string,
  actor: Actor,
): Promise<void> {
  // Bound the outer loop defensively; step count is small.
  for (let guard = 0; guard < 200; guard++) {
    const next = await prisma.caseAutoPilotStep.findFirst({
      where: { runId, status: "PENDING" },
      orderBy: { ordinal: "asc" },
    });

    if (!next) {
      // No pending steps — decide whether to re-plan.
      const replanned = await maybeReplan(organizationId, runId);
      if (replanned) continue;
      await prisma.caseAutoPilotRun.update({
        where: { id: runId },
        data: { status: "DONE" },
      });
      await logAudit({
        organizationId,
        actorId: actor.id,
        actorType: actor.type ?? "USER",
        action: "reviewset.autopilot.completed",
        resourceType: "CaseAutoPilotRun",
        resourceId: runId,
        metadata: { source: "review", channel: "case-autopilot" } as never,
      });
      return;
    }

    if (TOOL_META[next.tool as AutoPilotTool]?.kind === "mutating") {
      // Open the gate and stop — the mutation runs only on approval.
      await openGate(organizationId, runId, next.id, next.tool, actor);
      return;
    }

    // READ step — execute now.
    await executeReadStep(organizationId, runId, next.id, next.tool, actor);
  }
}

/** Create the PENDING AgentDecision for a mutating step and pause the run. */
async function openGate(
  organizationId: string,
  runId: string,
  stepId: string,
  tool: string,
  actor: Actor,
): Promise<void> {
  const run = await prisma.caseAutoPilotRun.findUniqueOrThrow({
    where: { id: runId },
    select: { reviewSetId: true },
  });
  const meta = TOOL_META[tool as AutoPilotTool];
  const decision = await prisma.agentDecision.create({
    data: {
      organizationId,
      agentName: AGENT_NAME,
      modelId: "deterministic",
      modelVersion: "cap5-v1",
      promptHash: "n/a",
      recommendationJson: { tool, title: meta?.title ?? tool, runId, stepId, reviewSetId: run.reviewSetId } as never,
      confidence: null,
      approvalStatus: AgentApprovalStatus.PENDING,
      resourceType: "ReviewSet",
      resourceId: run.reviewSetId,
    },
  });
  await prisma.caseAutoPilotStep.update({
    where: { id: stepId },
    data: { status: "WAITING_APPROVAL", agentDecisionId: decision.id },
  });
  await prisma.caseAutoPilotRun.update({
    where: { id: runId },
    data: { status: "WAITING_APPROVAL" },
  });
  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: actor.type ?? "USER",
    action: "reviewset.autopilot.step.proposed",
    resourceType: "AgentDecision",
    resourceId: decision.id,
    afterJson: { tool, runId, stepId } as never,
    metadata: { source: "review", channel: "case-autopilot" } as never,
  });
}

async function executeReadStep(
  organizationId: string,
  runId: string,
  stepId: string,
  tool: string,
  actor: Actor,
): Promise<void> {
  const run = await prisma.caseAutoPilotRun.findUniqueOrThrow({
    where: { id: runId },
    select: { reviewSetId: true, directive: true },
  });
  await prisma.caseAutoPilotStep.update({
    where: { id: stepId },
    data: { status: "RUNNING", startedAt: new Date() },
  });
  try {
    let output: unknown = null;
    if (tool === "eca") {
      output = await getEcaFunnel(organizationId, run.reviewSetId);
    } else if (tool === "case_graph") {
      const dossier = await runCaseGraph(organizationId, run.reviewSetId, actor);
      output = {
        theory: dossier.theory,
        responsiveCount: dossier.brief.counts.responsive,
        collected: dossier.brief.counts.collected,
        coded: dossier.brief.counts.coded,
        clusters: dossier.issueClusters.length,
        timeline: dossier.timeline.length,
        entities: dossier.entities.length,
        keyDocuments: dossier.keyDocuments.slice(0, 10),
        gaps: dossier.gaps,
        recommendations: dossier.recommendations,
        degraded: dossier.degraded,
        model: dossier.model,
      };
      if (dossier.degraded) {
        await prisma.caseAutoPilotRun.update({ where: { id: runId }, data: { degraded: true } });
      }
    } else if (tool === "assemble") {
      output = await assembleFindings(organizationId, runId, run.reviewSetId, run.directive);
    }
    await prisma.caseAutoPilotStep.update({
      where: { id: stepId },
      data: { status: "DONE", outputJson: (output ?? null) as never, finishedAt: new Date() },
    });
  } catch (err) {
    await prisma.caseAutoPilotStep.update({
      where: { id: stepId },
      data: { status: "FAILED", error: String((err as Error).message || err), finishedAt: new Date() },
    });
  }
}

/** Compose the final case brief markdown from the accumulated step outputs. */
async function assembleFindings(
  organizationId: string,
  runId: string,
  reviewSetId: string,
  directive: string,
): Promise<{ markdown: string }> {
  const brief = await buildCaseBrief(organizationId, reviewSetId);
  const graphStep = await prisma.caseAutoPilotStep.findFirst({
    where: { runId, tool: "case_graph", status: "DONE" },
    orderBy: { ordinal: "desc" },
  });
  const graph = (graphStep?.outputJson ?? null) as
    | {
        theory?: string;
        gaps?: string[];
        recommendations?: string[];
        timeline?: number;
        clusters?: number;
      }
    | null;

  const lines: string[] = [];
  lines.push(`# Case AutoPilot — findings`);
  lines.push("");
  lines.push(`**Directive.** ${directive}`);
  lines.push("");
  lines.push(`**Collection.** ${brief.counts.collected} collected · ${brief.counts.coded} coded · ${brief.counts.responsive} responsive · ${brief.counts.privileged} privileged.`);
  lines.push("");
  if (graph?.theory) {
    lines.push(`## Theory of the case`);
    lines.push(graph.theory);
    lines.push("");
  }
  if (brief.keyDocuments.length > 0) {
    lines.push(`## Key documents`);
    for (const d of brief.keyDocuments.slice(0, 10)) lines.push(`- ${d.title}`);
    lines.push("");
  }
  if (graph?.gaps && graph.gaps.length > 0) {
    lines.push(`## Gaps`);
    for (const g of graph.gaps) lines.push(`- ${g}`);
    lines.push("");
  }
  lines.push(`## Recommended next actions`);
  const recs = new Set<string>(graph?.recommendations ?? []);
  recs.add("Validate the AI review on a stratified sample (Validate tab) before producing.");
  recs.add("Confirm the timeline facts into the chronology.");
  for (const r of recs) lines.push(`- ${r}`);
  lines.push("");

  const markdown = lines.join("\n");
  await prisma.caseAutoPilotRun.update({ where: { id: runId }, data: { summary: markdown } });
  return { markdown };
}

/** After the pipeline drains, decide whether to append a bounded pass. */
async function maybeReplan(organizationId: string, runId: string): Promise<boolean> {
  const steps = await prisma.caseAutoPilotStep.findMany({
    where: { runId },
    orderBy: { ordinal: "asc" },
  });
  const passCount = steps.filter((s) => s.tool === "assemble").length;
  const aiReviewRan = steps.some((s) => s.tool === "ai_review" && s.status === "DONE");
  const latestGraph = [...steps].reverse().find((s) => s.tool === "case_graph" && s.status === "DONE");
  const responsiveCount =
    ((latestGraph?.outputJson as { responsiveCount?: number } | null)?.responsiveCount) ?? 0;

  const verdict = critique({ aiReviewRan, responsiveCount, passCount });
  if (verdict.append.length === 0) return false;

  const baseOrdinal = steps.length;
  await prisma.caseAutoPilotStep.createMany({
    data: verdict.append.map((s, i) => ({
      organizationId,
      runId,
      ordinal: baseOrdinal + i + 1,
      tool: s.tool,
      title: s.title,
      kind: s.kind,
      status: "PENDING",
      // Mark the re-run so the executor can broaden.
      inputJson: s.tool === "ai_review" ? ({ pendingOnly: false, note: verdict.note } as never) : undefined,
    })),
  });
  return true;
}

/** Approve a paused mutating step → EXECUTE it, chain-seal it, and resume. */
export async function approveAutoPilotStep(
  organizationId: string,
  stepId: string,
  actor: Actor,
): Promise<AutoPilotRunDTO> {
  const step = await prisma.caseAutoPilotStep.findFirst({
    where: { id: stepId, organizationId },
    include: { run: { select: { id: true, reviewSetId: true, directive: true } } },
  });
  if (!step) throw new Error("Step not found");
  if (step.status !== "WAITING_APPROVAL" || !step.agentDecisionId) {
    throw new Error("Step is not awaiting approval.");
  }
  const decision = await prisma.agentDecision.findFirst({
    where: { id: step.agentDecisionId, organizationId, agentName: AGENT_NAME },
    select: { id: true, approvalStatus: true },
  });
  if (!decision || decision.approvalStatus !== AgentApprovalStatus.PENDING) {
    throw new Error("Gate is not pending.");
  }

  const reviewSetId = step.run.reviewSetId;
  await prisma.caseAutoPilotStep.update({
    where: { id: stepId },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  let output: unknown = null;
  try {
    if (step.tool === "cull") {
      output = await applyThreadNearDupCull(organizationId, reviewSetId, actor);
    } else if (step.tool === "ai_review") {
      const input = (step.inputJson as { pendingOnly?: boolean } | null) ?? {};
      output = await runAiReviewOnReviewSet(
        organizationId,
        reviewSetId,
        { pendingOnly: input.pendingOnly ?? true },
        actor,
      );
    } else {
      throw new Error(`Tool ${step.tool} is not a mutating step.`);
    }
  } catch (err) {
    await prisma.caseAutoPilotStep.update({
      where: { id: stepId },
      data: { status: "FAILED", error: String((err as Error).message || err), finishedAt: new Date() },
    });
    await prisma.caseAutoPilotRun.update({ where: { id: step.run.id }, data: { status: "RUNNING" } });
    // Keep advancing — a failed mutation doesn't block the read pipeline.
    await advanceRun(organizationId, step.run.id, actor);
    const dto1 = await runToDTO(step.run.id);
    if (!dto1) throw new Error("Run vanished");
    return dto1;
  }

  const auditId = await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: actor.type ?? "USER",
    action: "reviewset.autopilot.step.approved",
    resourceType: "ReviewSet",
    resourceId: reviewSetId,
    afterJson: { tool: step.tool, output } as never,
    metadata: { source: "review", channel: "case-autopilot", agentDecisionId: step.agentDecisionId } as never,
  });
  await prisma.agentDecision.update({
    where: { id: step.agentDecisionId },
    data: {
      approvalStatus: AgentApprovalStatus.APPROVED,
      approvedById: actor.id,
      approvedAt: new Date(),
      resultingAuditLogId: auditId ?? null,
    },
  });
  await prisma.caseAutoPilotStep.update({
    where: { id: stepId },
    data: {
      status: "DONE",
      outputJson: (output ?? null) as never,
      resultingAuditLogId: auditId ?? null,
      finishedAt: new Date(),
    },
  });
  await prisma.caseAutoPilotRun.update({ where: { id: step.run.id }, data: { status: "RUNNING" } });

  await advanceRun(organizationId, step.run.id, actor);
  const dto = await runToDTO(step.run.id);
  if (!dto) throw new Error("Run vanished");
  return dto;
}

/** Reject a paused mutating step → skip it, reject the gate, and resume. */
export async function rejectAutoPilotStep(
  organizationId: string,
  stepId: string,
  actor: Actor,
): Promise<AutoPilotRunDTO> {
  const step = await prisma.caseAutoPilotStep.findFirst({
    where: { id: stepId, organizationId },
    include: { run: { select: { id: true } } },
  });
  if (!step) throw new Error("Step not found");
  if (step.status !== "WAITING_APPROVAL") throw new Error("Step is not awaiting approval.");

  if (step.agentDecisionId) {
    await prisma.agentDecision.updateMany({
      where: { id: step.agentDecisionId, approvalStatus: AgentApprovalStatus.PENDING },
      data: { approvalStatus: AgentApprovalStatus.REJECTED, approvedById: actor.id, approvedAt: new Date() },
    });
  }
  await prisma.caseAutoPilotStep.update({
    where: { id: stepId },
    data: { status: "SKIPPED", finishedAt: new Date() },
  });
  await prisma.caseAutoPilotRun.update({ where: { id: step.run.id }, data: { status: "RUNNING" } });
  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: actor.type ?? "USER",
    action: "reviewset.autopilot.step.rejected",
    resourceType: "CaseAutoPilotStep",
    resourceId: stepId,
    metadata: { source: "review", channel: "case-autopilot" } as never,
  });

  await advanceRun(organizationId, step.run.id, actor);
  const dto = await runToDTO(step.run.id);
  if (!dto) throw new Error("Run vanished");
  return dto;
}

export async function getAutoPilotRun(
  organizationId: string,
  runId: string,
): Promise<AutoPilotRunDTO | null> {
  const run = await prisma.caseAutoPilotRun.findFirst({
    where: { id: runId, organizationId },
    select: { id: true },
  });
  if (!run) return null;
  return runToDTO(runId);
}

/** The latest run for a review set (the panel polls this). */
export async function getLatestAutoPilotRun(
  organizationId: string,
  reviewSetId: string,
): Promise<AutoPilotRunDTO | null> {
  const run = await prisma.caseAutoPilotRun.findFirst({
    where: { organizationId, reviewSetId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!run) return null;
  return runToDTO(run.id);
}
