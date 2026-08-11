/**
 * Contract digest (Proactive delivery, Phase 3).
 *
 * Turns the pull-only surfaces (renewals, obligations, integrity) into one
 * push-ready summary: "this week — 2 obligations due, 1 renewal notice window
 * closing, 1 tampered contract." A GC (or an inbox) reads it without visiting
 * five tabs. `getContractDigest` assembles it from the existing services;
 * `summarizeDigest` builds the one-line headline (pure). Real email delivery is
 * a separate surface — the admin job records a chain-sealed
 * `contract.digest.generated` row with deliveryStubbed:true (same documented
 * stub pattern as notice sending).
 */
import { getRenewalPipeline } from "./renewals";
import { getContractIntegrityReport } from "./integrity";
import { listObligations } from "./reads";

export interface DigestCounts {
  obligationsOverdue: number;
  obligationsDue: number;
  noticesClosing: number;
  expiringSoon: number;
  tampered: number;
}

export interface DigestItem {
  contractId: string;
  title: string;
  detail: string;
}

export interface ContractDigest {
  generatedAt: string;
  dueWithinDays: number;
  counts: DigestCounts;
  actionableTotal: number;
  summaryLine: string;
  sections: {
    tampered: DigestItem[];
    obligationsOverdue: DigestItem[];
    noticesClosing: DigestItem[];
    obligationsDue: DigestItem[];
    expiringSoon: DigestItem[];
  };
}

/** One-line headline from the counts (pure). "All clear" when nothing is due. */
export function summarizeDigest(counts: DigestCounts): string {
  const parts: string[] = [];
  if (counts.tampered) parts.push(`${counts.tampered} tampered contract${counts.tampered === 1 ? "" : "s"}`);
  if (counts.obligationsOverdue) parts.push(`${counts.obligationsOverdue} overdue obligation${counts.obligationsOverdue === 1 ? "" : "s"}`);
  if (counts.noticesClosing) parts.push(`${counts.noticesClosing} renewal notice window${counts.noticesClosing === 1 ? "" : "s"} closing`);
  if (counts.obligationsDue) parts.push(`${counts.obligationsDue} obligation${counts.obligationsDue === 1 ? "" : "s"} due soon`);
  if (counts.expiringSoon) parts.push(`${counts.expiringSoon} contract${counts.expiringSoon === 1 ? "" : "s"} expiring soon`);
  if (parts.length === 0) return "All clear — nothing needs attention this week.";
  return parts.join(" · ");
}

const TOP = 10;

export async function getContractDigest(
  organizationId: string,
  opts: { dueWithinDays?: number } = {},
): Promise<ContractDigest> {
  const dueWithinDays = opts.dueWithinDays ?? 7;
  const [obligations, renewals, integrity] = await Promise.all([
    listObligations(organizationId, {}),
    getRenewalPipeline(organizationId),
    getContractIntegrityReport(organizationId),
  ]);

  const overdue = obligations.rows.filter((r) => r.overdue);
  const dueSoon = obligations.rows.filter(
    (r) => !r.overdue && r.daysToDue != null && r.daysToDue >= 0 && r.daysToDue <= dueWithinDays,
  );
  const noticesClosing = renewals.rows.filter(
    (r) => r.urgency === "NOTICE_WINDOW_CLOSING" || r.urgency === "NOTICE_WINDOW_MISSED",
  );
  const expiringSoon = renewals.rows.filter((r) => r.urgency === "EXPIRING_SOON");
  const tampered = integrity.rows.filter((r) => r.integrity === "TAMPERED");

  const counts: DigestCounts = {
    obligationsOverdue: overdue.length,
    obligationsDue: dueSoon.length,
    noticesClosing: noticesClosing.length,
    expiringSoon: expiringSoon.length,
    tampered: tampered.length,
  };

  const oblItem = (r: (typeof obligations.rows)[number]): DigestItem => ({
    contractId: r.contractId,
    title: r.description,
    detail: `${r.contractTitle}${r.daysToDue != null ? ` · ${r.daysToDue < 0 ? `${-r.daysToDue}d overdue` : `due in ${r.daysToDue}d`}` : ""}`,
  });
  const renewalItem = (r: (typeof renewals.rows)[number]): DigestItem => ({
    contractId: r.contractId,
    title: r.title,
    detail: r.noticeDeadline
      ? `act by ${r.noticeDeadline.slice(0, 10)}${r.daysToNoticeDeadline != null ? ` · ${r.daysToNoticeDeadline < 0 ? `${-r.daysToNoticeDeadline}d past` : `${r.daysToNoticeDeadline}d`}` : ""}`
      : r.expiryDate ? `expires ${r.expiryDate.slice(0, 10)}` : "",
  });
  const tamperItem = (r: (typeof integrity.rows)[number]): DigestItem => ({
    contractId: r.contractId,
    title: r.title,
    detail: r.changedFields.length ? `changed: ${r.changedFields.join(", ")}` : "terms changed after signing",
  });

  return {
    generatedAt: new Date().toISOString(),
    dueWithinDays,
    counts,
    actionableTotal:
      counts.obligationsOverdue + counts.obligationsDue + counts.noticesClosing + counts.expiringSoon + counts.tampered,
    summaryLine: summarizeDigest(counts),
    sections: {
      tampered: tampered.slice(0, TOP).map(tamperItem),
      obligationsOverdue: overdue.slice(0, TOP).map(oblItem),
      noticesClosing: noticesClosing.slice(0, TOP).map(renewalItem),
      obligationsDue: dueSoon.slice(0, TOP).map(oblItem),
      expiringSoon: expiringSoon.slice(0, TOP).map(renewalItem),
    },
  };
}
