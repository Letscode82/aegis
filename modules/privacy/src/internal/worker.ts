/**
 * DSAR SLA breach sweep (the scheduled worker). Flags every open request whose
 * statutory (or extended) deadline has passed with a chain-sealed
 * `privacy.dsar.sla_breached` row. Idempotent without a dedicated column: it
 * re-uses the AuditLog — a request is only flagged again if its effective
 * deadline changed since the last breach row (e.g. after an extension). Same
 * pg-boss-ready shape as the contract sweeps; runs across every org from
 * /api/cron/dsar-sla.
 */
import { prisma, logAudit } from "@aegis/db";
import { slaState } from "./sla";

const OPEN_STATUSES = ["RECEIVED", "VERIFYING", "IN_PROGRESS", "AWAITING_REVIEW"] as const;

export interface DsarSlaSweepResult {
  organizationId: string;
  scanned: number;
  breached: number;
  error?: string;
}

export async function evaluateDsarSlaBreaches(organizationId: string): Promise<DsarSlaSweepResult> {
  const now = new Date();
  const rows = await prisma.dataSubjectRequest.findMany({
    where: { organizationId, status: { in: [...OPEN_STATUSES] } },
    select: { id: true, slaDeadline: true, extendedDeadline: true, requestType: true },
  });

  let breached = 0;
  for (const r of rows) {
    const sla = slaState({ slaDeadline: r.slaDeadline, extendedDeadline: r.extendedDeadline }, now);
    if (!sla.breached) continue;

    const deadlineIso = sla.effectiveDeadline.toISOString();
    // Idempotence: skip if we already flagged this exact deadline.
    const prior = await prisma.auditLog.findFirst({
      where: { organizationId, resourceType: "DataSubjectRequest", resourceId: r.id, action: "privacy.dsar.sla_breached" },
      orderBy: { chainPosition: "desc" },
      select: { afterJson: true },
    });
    const priorDeadline = (prior?.afterJson as { deadline?: string } | null)?.deadline;
    if (priorDeadline === deadlineIso) continue;

    await logAudit({
      organizationId, actorId: null, actorType: "SYSTEM",
      action: "privacy.dsar.sla_breached", resourceType: "DataSubjectRequest", resourceId: r.id,
      afterJson: { deadline: deadlineIso, daysOverdue: Math.abs(sla.daysRemaining) } as never,
      metadata: { source: "privacy", requestType: r.requestType } as never,
    });
    breached += 1;
  }
  return { organizationId, scanned: rows.length, breached };
}

export interface AllOrgDsarSweepResult {
  orgs: number;
  ran: number;
  failed: number;
  results: DsarSlaSweepResult[];
  generatedAt: string;
}

export async function runAllOrgDsarSlaSweeps(): Promise<AllOrgDsarSweepResult> {
  const orgs = await prisma.organization.findMany({ select: { id: true } });
  const results: DsarSlaSweepResult[] = [];
  let failed = 0;
  for (const o of orgs) {
    try {
      results.push(await evaluateDsarSlaBreaches(o.id));
    } catch (err) {
      failed += 1;
      results.push({ organizationId: o.id, scanned: 0, breached: 0, error: String((err as Error)?.message || err) });
    }
  }
  return { orgs: orgs.length, ran: orgs.length - failed, failed, results, generatedAt: new Date().toISOString() };
}
