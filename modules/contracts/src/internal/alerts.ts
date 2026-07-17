/**
 * Contract key-date alerts (CTR-4) — the renewal / expiry / obligation
 * signals a GC needs surfaced before they bite. Pure read aggregation
 * over Contract + the shared Obligation entity; deterministic, no AI.
 * Feeds the Mission Control "Contract key dates" card and any renewal
 * dashboard.
 */
import { prisma } from "@aegis/db";
import { daysToExpiry as calcDaysToExpiry, obligationOverdue } from "./derive";

export type AlertKind =
  | "AUTO_RENEW_TRAP"
  | "EXPIRING"
  | "EXPIRED"
  | "OBLIGATION_OVERDUE"
  | "OBLIGATION_DUE";

export type AlertSeverity = "high" | "medium" | "low";

export interface ContractAlert {
  id: string;
  kind: AlertKind;
  contractId: string;
  contractTitle: string;
  counterpartyName: string | null;
  date: string | null;
  daysOut: number | null; // negative = past due
  severity: AlertSeverity;
  detail: string;
}

export interface ContractAlerts {
  alerts: ContractAlert[];
  counts: {
    total: number;
    autoRenewTraps: number;
    expiring: number;
    expired: number;
    obligationsOverdue: number;
    obligationsDue: number;
  };
  horizonDays: number;
  generatedAt: string;
}

const LIVE = new Set(["ACTIVE", "EXECUTED"]);
const SEVERITY_RANK: Record<AlertSeverity, number> = { high: 0, medium: 1, low: 2 };

export async function getContractAlerts(
  organizationId: string,
  opts?: { horizonDays?: number; obligationHorizonDays?: number },
): Promise<ContractAlerts> {
  const now = new Date();
  const horizonDays = opts?.horizonDays ?? 90;
  const obligationHorizonDays = opts?.obligationHorizonDays ?? 30;

  const [contracts, obligations] = await Promise.all([
    prisma.contract.findMany({
      where: { organizationId },
      select: { id: true, title: true, status: true, autoRenew: true, expiryDate: true, noticeWindowDays: true, counterparty: { select: { name: true } } },
    }),
    prisma.obligation.findMany({
      where: { organizationId, sourceType: "CONTRACT", status: { in: ["OPEN", "IN_PROGRESS"] } },
      select: { id: true, description: true, dueDate: true, status: true, sourceId: true },
    }),
  ]);

  const contractById: Record<string, { title: string; counterpartyName: string | null }> = {};
  for (const c of contracts) contractById[c.id] = { title: c.title, counterpartyName: c.counterparty?.name ?? null };

  const alerts: ContractAlert[] = [];
  const counts = { total: 0, autoRenewTraps: 0, expiring: 0, expired: 0, obligationsOverdue: 0, obligationsDue: 0 };

  for (const c of contracts) {
    const cpName = c.counterparty?.name ?? null;
    const days = calcDaysToExpiry(now, c.expiryDate);
    if (days == null) continue;

    if (days < 0) {
      if (!LIVE.has(c.status)) continue; // already marked expired/terminated
      alerts.push({ id: c.id, kind: "EXPIRED", contractId: c.id, contractTitle: c.title, counterpartyName: cpName, date: c.expiryDate!.toISOString(), daysOut: days, severity: "high", detail: `Past expiry ${-days}d ago — still marked ${c.status}.` });
      counts.expired++;
      continue;
    }
    if (!LIVE.has(c.status)) continue;

    const inNoticeWindow = c.autoRenew && c.noticeWindowDays != null && days <= c.noticeWindowDays;
    if (inNoticeWindow) {
      alerts.push({ id: c.id, kind: "AUTO_RENEW_TRAP", contractId: c.id, contractTitle: c.title, counterpartyName: cpName, date: c.expiryDate!.toISOString(), daysOut: days, severity: "high", detail: `Auto-renews in ${days}d — inside the ${c.noticeWindowDays}d non-renewal notice window. Act to avoid lock-in.` });
      counts.autoRenewTraps++;
    } else if (days <= horizonDays) {
      alerts.push({ id: c.id, kind: "EXPIRING", contractId: c.id, contractTitle: c.title, counterpartyName: cpName, date: c.expiryDate!.toISOString(), daysOut: days, severity: days <= 30 ? "high" : "medium", detail: `Expires in ${days}d${c.autoRenew ? " (auto-renews)" : ""}.` });
      counts.expiring++;
    }
  }

  for (const o of obligations) {
    const meta = contractById[o.sourceId];
    if (!meta) continue; // obligation's contract not in this org's set
    const days = calcDaysToExpiry(now, o.dueDate);
    if (obligationOverdue(o.dueDate, o.status, now)) {
      alerts.push({ id: o.id, kind: "OBLIGATION_OVERDUE", contractId: o.sourceId, contractTitle: meta.title, counterpartyName: meta.counterpartyName, date: o.dueDate!.toISOString(), daysOut: days, severity: "high", detail: `Obligation overdue ${days != null ? `${-days}d` : ""}: ${o.description}` });
      counts.obligationsOverdue++;
    } else if (days != null && days >= 0 && days <= obligationHorizonDays) {
      alerts.push({ id: o.id, kind: "OBLIGATION_DUE", contractId: o.sourceId, contractTitle: meta.title, counterpartyName: meta.counterpartyName, date: o.dueDate!.toISOString(), daysOut: days, severity: days <= 7 ? "medium" : "low", detail: `Obligation due in ${days}d: ${o.description}` });
      counts.obligationsDue++;
    }
  }

  alerts.sort((a, b) => {
    const s = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (s !== 0) return s;
    return (a.daysOut ?? 9999) - (b.daysOut ?? 9999);
  });
  counts.total = alerts.length;

  return { alerts, counts, horizonDays, generatedAt: now.toISOString() };
}
