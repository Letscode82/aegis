/**
 * Workflow engine — DB-backed integration tests. Runs via
 * `pnpm --filter @aegis/workflow run test:db` in CI's db-integrity job.
 *
 * Covers: define (idempotent + 15-step guard), start (skip-aware first
 * step), approve-to-completion, reject-to-start, send-back-to-previous,
 * optimistic version lock, agent-task queueing on AGENT steps, and the
 * chain-sealed audit twin on every transition.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@aegis/db";
import {
  actOnWorkflow,
  defineWorkflow,
  getWorkflowInstance,
  startWorkflow,
  WorkflowError,
  WorkflowVersionConflictError,
  runAgentTask,
  listAgentTasks,
  seedWorkflowLibrary,
} from "../src/index";

let orgId = "";
let userId = "";

beforeAll(async () => {
  await prisma.$connect();
  const org = await prisma.organization.create({
    data: { name: `wf-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` },
  });
  orgId = org.id;
  const role = await prisma.role.create({
    data: { organizationId: orgId, name: "admin", permissions: [] },
  });
  const user = await prisma.user.create({
    data: {
      organizationId: orgId,
      roleId: role.id,
      name: "WF Tester",
      email: `wf-tester-${Date.now()}@aegis-demo.example`,
    },
  });
  userId = user.id;
});

afterAll(async () => {
  // AuditLog rows are append-only (delete-blocked by trigger); the org
  // and its cascading workflow rows stay behind as test residue in the
  // throwaway CI database — same policy as the admin guard suite.
  await prisma.$disconnect();
});

const LADDER = {
  key: "test_contract_ladder",
  name: "Test Contract Ladder",
  steps: [
    { stepOrder: 1, name: "Draft", screenKey: "draft" },
    { stepOrder: 2, name: "Legal Review", screenKey: "legal", slaHours: 24 },
    {
      stepOrder: 3,
      name: "Finance Review",
      screenKey: "finance",
      metadataJson: { skip_if: { field: "contract_value", op: "lt", value: 10000 } },
    },
    { stepOrder: 4, name: "GC Approval", screenKey: "gc" },
  ],
};

describe("defineWorkflow", () => {
  it("creates and idempotently replaces a ladder", async () => {
    const def1 = await defineWorkflow({ organizationId: orgId, ...LADDER });
    expect(def1.steps).toHaveLength(4);
    const def2 = await defineWorkflow({ organizationId: orgId, ...LADDER, name: "Renamed" });
    expect(def2.id).toBe(def1.id);
    expect(def2.name).toBe("Renamed");
    expect(def2.steps).toHaveLength(4);
  });

  it("enforces the 15-step ceiling and contiguous ordering", async () => {
    await expect(
      defineWorkflow({
        organizationId: orgId,
        key: "too_long",
        name: "Too Long",
        steps: Array.from({ length: 16 }, (_, i) => ({
          stepOrder: i + 1,
          name: `S${i + 1}`,
          screenKey: "s",
        })),
      }),
    ).rejects.toThrow(WorkflowError);
    await expect(
      defineWorkflow({
        organizationId: orgId,
        key: "gappy",
        name: "Gappy",
        steps: [
          { stepOrder: 1, name: "A", screenKey: "a" },
          { stepOrder: 3, name: "C", screenKey: "c" },
        ],
      }),
    ).rejects.toThrow(/contiguous/);
  });
});

describe("ladder semantics", () => {
  it("start honours skip conditions; approve walks to completion; audit twin on every move", async () => {
    await defineWorkflow({ organizationId: orgId, ...LADDER });
    const inst = await startWorkflow({
      organizationId: orgId,
      definitionKey: LADDER.key,
      entityType: "contract",
      entityId: "c-small-1",
      startedById: userId,
      context: { contract_value: 5000 }, // Finance Review skipped
    });
    expect(inst.currentStepOrder).toBe(1);

    let after = await actOnWorkflow({ instanceId: inst.id, action: "approve", actor: userId });
    expect(after.currentStepOrder).toBe(2);
    after = await actOnWorkflow({ instanceId: inst.id, action: "approve", actor: userId });
    expect(after.currentStepOrder).toBe(4); // step 3 skipped
    after = await actOnWorkflow({ instanceId: inst.id, action: "approve", actor: userId });
    expect(after.status).toBe("COMPLETED");

    // Twin audit: every transition row links a chain-sealed AuditLog row.
    const transitions = await prisma.workflowTransition.findMany({
      where: { instanceId: inst.id },
      orderBy: { createdAt: "asc" },
    });
    expect(transitions.map((t) => t.action)).toEqual(["START", "APPROVE", "APPROVE", "APPROVE"]);
    for (const t of transitions) {
      expect(t.resultingAuditLogId, `transition ${t.action} missing audit twin`).toBeTruthy();
      const audit = await prisma.auditLog.findUnique({ where: { id: t.resultingAuditLogId! } });
      expect(audit?.resourceType).toBe("WorkflowInstance");
      expect(audit?.contentHash).toBeTruthy(); // chain-sealed
    }

    // RAG: everything green (skipped step renders skipped).
    const withRag = await getWorkflowInstance(inst.id);
    expect(withRag!.rag.map((r) => r.color)).toEqual(["green", "green", "skipped", "green"]);
  });

  it("reject resets to the first actionable step; send_back targets a previous step", async () => {
    const inst = await startWorkflow({
      organizationId: orgId,
      definitionKey: LADDER.key,
      entityType: "contract",
      entityId: "c-big-1",
      startedById: userId,
      context: { contract_value: 50000 },
    });
    await actOnWorkflow({ instanceId: inst.id, action: "approve", actor: userId }); // -> 2
    await actOnWorkflow({ instanceId: inst.id, action: "approve", actor: userId }); // -> 3
    const rejected = await actOnWorkflow({ instanceId: inst.id, action: "reject", actor: userId });
    expect(rejected.currentStepOrder).toBe(1);

    await actOnWorkflow({ instanceId: inst.id, action: "approve", actor: userId }); // -> 2
    await actOnWorkflow({ instanceId: inst.id, action: "approve", actor: userId }); // -> 3
    const sentBack = await actOnWorkflow({
      instanceId: inst.id,
      action: "send_back",
      actor: userId,
      targetStep: 2,
      comment: "needs a cleaner liability rider",
    });
    expect(sentBack.currentStepOrder).toBe(2);
    // The send-back source (step 3) shows red until re-approved.
    const withRag = await getWorkflowInstance(inst.id);
    expect(withRag!.rag.find((r) => r.stepOrder === 3)!.color).toBe("red");

    await expect(
      actOnWorkflow({ instanceId: inst.id, action: "send_back", actor: userId, targetStep: 5 }),
    ).rejects.toThrow(/previous step/);
  });

  it("optimistic version lock refuses a stale double-approval", async () => {
    const inst = await startWorkflow({
      organizationId: orgId,
      definitionKey: LADDER.key,
      entityType: "contract",
      entityId: "c-race-1",
      startedById: userId,
    });
    const loaded = await getWorkflowInstance(inst.id);
    await actOnWorkflow({
      instanceId: inst.id,
      action: "approve",
      actor: userId,
      expectedVersion: loaded!.version,
    });
    await expect(
      actOnWorkflow({
        instanceId: inst.id,
        action: "approve",
        actor: userId,
        expectedVersion: loaded!.version, // stale
      }),
    ).rejects.toThrow(WorkflowVersionConflictError);
  });

  it("arriving at an AGENT step queues exactly one pending agent task", async () => {
    await defineWorkflow({
      organizationId: orgId,
      key: "agent_ladder",
      name: "Agent Ladder",
      steps: [
        { stepOrder: 1, name: "Submit", screenKey: "submit" },
        {
          stepOrder: 2,
          name: "AI Review",
          screenKey: "agent_review",
          kind: "AGENT",
          agentConfigJson: { agentKey: "contract-review-agent", minConfidence: 0.8 },
        },
        { stepOrder: 3, name: "Sign-off", screenKey: "signoff" },
      ],
    });
    const inst = await startWorkflow({
      organizationId: orgId,
      definitionKey: "agent_ladder",
      entityType: "intake_ticket",
      entityId: "t-1",
      startedById: userId,
    });
    await actOnWorkflow({ instanceId: inst.id, action: "approve", actor: userId }); // -> AGENT step
    const tasks = await prisma.workflowAgentTask.findMany({
      where: { instanceId: inst.id, stepOrder: 2 },
    });
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.status).toBe("PENDING");

    // Humans can still act on an agent step directly (never locked out);
    // the agent actor string lands as an AGENT-attributed audit row.
    const done = await actOnWorkflow({
      instanceId: inst.id,
      action: "approve",
      actor: "agent:contract-review-agent",
      comment: "within playbook",
    });
    expect(done.currentStepOrder).toBe(3);
    const agentTransition = await prisma.workflowTransition.findFirst({
      where: { instanceId: inst.id, actor: "agent:contract-review-agent" },
    });
    const audit = await prisma.auditLog.findUnique({
      where: { id: agentTransition!.resultingAuditLogId! },
    });
    expect(audit?.actorType).toBe("AGENT");
    expect(audit?.actorId).toBeNull();
  });
});

describe("agent-task lifecycle (W-B) — findings only, never advances", () => {
  async function taskAtAgentStep(entityId: string) {
    const inst = await startWorkflow({
      organizationId: orgId,
      definitionKey: "agent_ladder",
      entityType: "intake_ticket",
      entityId,
      startedById: userId,
      context: { ticket: { id: entityId, desc: "MSA review" } },
    });
    await actOnWorkflow({ instanceId: inst.id, action: "approve", actor: userId });
    const task = await prisma.workflowAgentTask.findFirstOrThrow({
      where: { instanceId: inst.id, stepOrder: 2 },
    });
    return { inst, task };
  }

  it("high confidence → DONE with findings; the ladder does NOT move", async () => {
    const { inst, task } = await taskAtAgentStep("t-agent-done");
    const updated = await runAgentTask(task.id, async () => ({
      confidence: 0.95,
      suggestedAction: "approve-and-send",
      summary: "within playbook",
    }));
    expect(updated.status).toBe("DONE");
    const after = await getWorkflowInstance(inst.id);
    expect(after!.currentStepOrder).toBe(2); // human still owns the step
    expect((updated.outputJson as { confidence: number }).confidence).toBe(0.95);
  });

  it("below minConfidence → ESCALATED; handler crash → FAILED; re-run refused", async () => {
    const { task } = await taskAtAgentStep("t-agent-esc");
    const updated = await runAgentTask(task.id, async () => ({
      confidence: 0.4,
      suggestedAction: "flag-for-review",
      summary: "degraded",
    }));
    expect(updated.status).toBe("ESCALATED");
    await expect(
      runAgentTask(task.id, async () => ({ confidence: 1, suggestedAction: "x", summary: "" })),
    ).rejects.toThrow(/not pending/);

    const { task: task2 } = await taskAtAgentStep("t-agent-fail");
    const failed = await runAgentTask(task2.id, async () => {
      throw new Error("boom");
    });
    expect(failed.status).toBe("FAILED");
  });

  it("writes an AGENT-attributed audit row for every run", async () => {
    const { task } = await taskAtAgentStep("t-agent-audit");
    await runAgentTask(task.id, async () => ({
      confidence: 0.9,
      suggestedAction: "approve-and-send",
      summary: "ok",
    }));
    const audit = await prisma.auditLog.findFirst({
      where: { resourceType: "WorkflowAgentTask", resourceId: task.id },
    });
    expect(audit?.action).toBe("workflow.agent_task.done");
    expect(audit?.actorType).toBe("AGENT");
    expect(audit?.contentHash).toBeTruthy();
  });

  it("listAgentTasks filters by org and status", async () => {
    const pending = await listAgentTasks(orgId, "PENDING");
    for (const t of pending) expect(t.status).toBe("PENDING");
    const all = await listAgentTasks(orgId);
    expect(all.length).toBeGreaterThan(0);
  });
});

describe("governance library seeding (W-D)", () => {
  it("seeds all 10 ladders idempotently", async () => {
    const first = await seedWorkflowLibrary(orgId);
    expect(first).toHaveLength(10);
    const again = await seedWorkflowLibrary(orgId);
    expect(again).toEqual(first);
    const defs = await prisma.workflowDefinition.findMany({
      where: { organizationId: orgId, key: { in: first } },
      include: { steps: true },
    });
    expect(defs).toHaveLength(10);
    const litigation = defs.find((d) => d.key === "patent_litigation")!;
    expect(litigation.steps).toHaveLength(7);
  });
});
