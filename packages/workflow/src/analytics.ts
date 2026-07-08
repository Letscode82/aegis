/**
 * Workflow SLA analytics (program #3) — "where is every matter stopped,
 * and where does the delay live?"
 *
 * Pure aggregation over WorkflowTransition + the definition steps. Time
 * spent on a step = the gap between entering it (a transition whose
 * toStepOrder is that step) and leaving it (the next transition). The
 * current step's clock runs from stepEnteredAt to now.
 */
import { prisma } from "@aegis/db";

const HOUR_MS = 3_600_000;

export interface StuckInstance {
  instanceId: string;
  definitionKey: string;
  definitionName: string;
  entityType: string;
  entityId: string;
  currentStepOrder: number;
  currentStepName: string;
  currentStepRole: string | null;
  currentStepKind: "HUMAN" | "AGENT";
  hoursOnStep: number;
  slaHours: number | null;
  breached: boolean;
  totalHoursOpen: number;
}

export interface StageDelay {
  stepName: string;
  kind: "HUMAN" | "AGENT";
  avgHours: number;
  samples: number;
}

export interface WorkflowSlaOverview {
  summary: {
    inProgress: number;
    breached: number;
    humanAvgHours: number;
    agentAvgHours: number;
  };
  instances: StuckInstance[]; // in-progress, most-overdue first
  stageDelays: StageDelay[]; // slowest first
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export async function getWorkflowSlaOverview(
  organizationId: string,
  now: Date = new Date(),
): Promise<WorkflowSlaOverview> {
  const instances = await prisma.workflowInstance.findMany({
    where: { organizationId },
    include: {
      definition: { include: { steps: { orderBy: { stepOrder: "asc" } } } },
      transitions: { orderBy: { createdAt: "asc" } },
    },
  });

  const stuck: StuckInstance[] = [];
  // stepName → { total hours, samples, kind }
  const stage = new Map<string, { total: number; samples: number; kind: "HUMAN" | "AGENT" }>();

  for (const inst of instances) {
    const stepByOrder = new Map(inst.definition.steps.map((s) => [s.stepOrder, s]));

    // Historical time-per-step from consecutive transitions.
    const ts = inst.transitions;
    for (let i = 0; i < ts.length; i++) {
      const tr = ts[i];
      if (!tr) continue;
      const enteredStep = tr.toStepOrder;
      if (enteredStep == null) continue;
      const enteredAt = tr.createdAt.getTime();
      const next = ts[i + 1];
      const leftAt = next
        ? next.createdAt.getTime()
        : inst.status === "IN_PROGRESS"
          ? now.getTime()
          : null;
      if (leftAt == null) continue;
      const step = stepByOrder.get(enteredStep);
      if (!step) continue;
      const hours = (leftAt - enteredAt) / HOUR_MS;
      const cur = stage.get(step.name) ?? { total: 0, samples: 0, kind: step.kind };
      cur.total += hours;
      cur.samples += 1;
      cur.kind = step.kind;
      stage.set(step.name, cur);
    }

    if (inst.status !== "IN_PROGRESS") continue;
    const step = stepByOrder.get(inst.currentStepOrder);
    if (!step) continue;
    const hoursOnStep = (now.getTime() - inst.stepEnteredAt.getTime()) / HOUR_MS;
    const startTs = inst.transitions[0]?.createdAt.getTime() ?? inst.createdAt.getTime();
    stuck.push({
      instanceId: inst.id,
      definitionKey: inst.definition.key,
      definitionName: inst.definition.name,
      entityType: inst.entityType,
      entityId: inst.entityId,
      currentStepOrder: inst.currentStepOrder,
      currentStepName: step.name,
      currentStepRole: step.approverRole,
      currentStepKind: step.kind,
      hoursOnStep: round1(hoursOnStep),
      slaHours: step.slaHours,
      breached: step.slaHours != null && hoursOnStep > step.slaHours,
      totalHoursOpen: round1((now.getTime() - startTs) / HOUR_MS),
    });
  }

  stuck.sort((a, b) => {
    // Breached first, then most overdue vs its SLA, then longest on step.
    if (a.breached !== b.breached) return a.breached ? -1 : 1;
    return b.hoursOnStep - a.hoursOnStep;
  });

  const stageDelays: StageDelay[] = [...stage.entries()]
    .map(([stepName, v]) => ({ stepName, kind: v.kind, avgHours: round1(v.total / v.samples), samples: v.samples }))
    .sort((a, b) => b.avgHours - a.avgHours);

  const humanStages = stageDelays.filter((s) => s.kind === "HUMAN");
  const agentStages = stageDelays.filter((s) => s.kind === "AGENT");
  const avg = (arr: StageDelay[]) =>
    arr.length ? round1(arr.reduce((s, x) => s + x.avgHours, 0) / arr.length) : 0;

  return {
    summary: {
      inProgress: stuck.length,
      breached: stuck.filter((s) => s.breached).length,
      humanAvgHours: avg(humanStages),
      agentAvgHours: avg(agentStages),
    },
    instances: stuck,
    stageDelays,
  };
}
