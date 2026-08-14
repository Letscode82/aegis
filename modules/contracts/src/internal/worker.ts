/**
 * Scheduled contract worker (CTR-20) — the cron entry points behind
 * /api/cron/*. Where the existing admin HTTP triggers run one sweep for the
 * calling admin's org, these iterate every organisation so a single scheduler
 * (Vercel Cron / GitHub Actions / any pinger) keeps the whole platform swept.
 *
 * Two passes, both idempotent and pg-boss-ready (the CLAUDE.md documented
 * exception): a daily SWEEP that arms renewal-notice obligations and flips
 * overdue obligations to BREACHED, and a weekly DIGEST that summarises each
 * org's actionable contract state and emails it to the org's leadership via
 * the shared @aegis/email mailer. Per-org failures are isolated — one org
 * throwing never aborts the batch.
 */
import { prisma, logAudit } from "@aegis/db";
import { sendEmail, renderBasicEmail } from "@aegis/email";
import { ensureRenewalNoticeObligations } from "./renewals";
import { evaluateObligationBreaches } from "./obligation-jobs";
import { getContractDigest, type ContractDigest } from "./digest";

// ── Pure helpers (unit-tested) ───────────────────────────────────────

/** Roles whose users receive the weekly contract digest by default. */
export const DIGEST_ROLE_NAMES = ["admin", "gc", "legal_ops"] as const;

/** Parse a comma/semicolon/space-separated recipient list (env override). */
export function parseDigestRecipients(csv: string | undefined | null): string[] {
  if (!csv) return [];
  return csv
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.includes("@"));
}

/** Merge role-derived + env-configured recipients, de-duplicated (pure). */
export function mergeRecipients(roleEmails: string[], envCsv: string | undefined | null): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of [...roleEmails, ...parseDigestRecipients(envCsv)]) {
    const key = e.toLowerCase();
    if (e && !seen.has(key)) { seen.add(key); out.push(e); }
  }
  return out;
}

// ── Sweep pass (daily) ───────────────────────────────────────────────

export interface OrgSweepResult {
  organizationId: string;
  noticesScanned: number;
  noticesCreated: number;
  obligationsBreached: number;
  error?: string;
}

/** Run both sweeps for one org. Best-effort per sub-pass. */
export async function runContractSweepsForOrg(organizationId: string): Promise<OrgSweepResult> {
  const notices = await ensureRenewalNoticeObligations(organizationId);
  const breaches = await evaluateObligationBreaches(organizationId);
  return {
    organizationId,
    noticesScanned: notices.scanned,
    noticesCreated: notices.created,
    obligationsBreached: breaches.breached,
  };
}

export interface AllOrgResult<T> {
  orgs: number;
  ran: number;
  failed: number;
  results: T[];
  generatedAt: string;
}

async function listOrganizationIds(): Promise<string[]> {
  const rows = await prisma.organization.findMany({ select: { id: true } });
  return rows.map((r) => r.id);
}

/** Daily sweep across every org. One org's failure is captured, not thrown. */
export async function runAllOrgContractSweeps(): Promise<AllOrgResult<OrgSweepResult>> {
  const ids = await listOrganizationIds();
  const results: OrgSweepResult[] = [];
  let failed = 0;
  for (const organizationId of ids) {
    try {
      results.push(await runContractSweepsForOrg(organizationId));
    } catch (err) {
      failed += 1;
      results.push({ organizationId, noticesScanned: 0, noticesCreated: 0, obligationsBreached: 0, error: String((err as Error)?.message || err) });
    }
  }
  return { orgs: ids.length, ran: ids.length - failed, failed, results, generatedAt: new Date().toISOString() };
}

// ── Digest pass (weekly) ─────────────────────────────────────────────

/** The org's default digest recipients: leadership-role users + env override. */
export async function resolveDigestRecipients(organizationId: string): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: {
      organizationId,
      suspendedAt: null,
      role: { name: { in: [...DIGEST_ROLE_NAMES] } },
    },
    select: { email: true },
  });
  const roleEmails = users.map((u) => u.email).filter((e): e is string => !!e && e.includes("@"));
  return mergeRecipients(roleEmails, process.env.CONTRACT_DIGEST_TO);
}

export interface OrgDigestResult {
  organizationId: string;
  actionableTotal: number;
  summaryLine: string;
  recipients: number;
  delivered: boolean;
  reason?: string | null;
  error?: string;
}

function digestParagraphs(digest: ContractDigest): string[] {
  const paras = [digest.summaryLine];
  const sec = digest.sections;
  const line = (label: string, items: { title: string; detail: string }[]) =>
    items.length ? `${label}: ${items.slice(0, 5).map((i) => `${i.title} (${i.detail})`).join("; ")}` : null;
  for (const p of [
    line("Tampered", sec.tampered),
    line("Overdue obligations", sec.obligationsOverdue),
    line("Renewal notice windows closing", sec.noticesClosing),
    line("Obligations due soon", sec.obligationsDue),
    line("Expiring soon", sec.expiringSoon),
  ]) {
    if (p) paras.push(p);
  }
  return paras;
}

/**
 * Compute the org's digest and email it to leadership. Chain-sealed
 * `contract.digest.generated` records the outcome (delivered flag + recipient
 * count + provider). Skips the email when nothing is actionable or there are
 * no recipients, but still records the digest was computed.
 */
export async function runContractDigestForOrg(organizationId: string): Promise<OrgDigestResult> {
  const digest = await getContractDigest(organizationId);
  const recipients = await resolveDigestRecipients(organizationId);
  const base = (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");

  let delivered = false;
  let reason: string | null = null;
  const shouldSend = digest.actionableTotal > 0 && recipients.length > 0;
  if (shouldSend) {
    const { html, text } = renderBasicEmail({
      heading: "Your weekly contract digest",
      paragraphs: digestParagraphs(digest),
      button: base ? { label: "Open contracts", url: `${base}/contracts` } : null,
      footnote: `Covering items due within ${digest.dueWithinDays} days.`,
    });
    const result = await sendEmail({ to: recipients, subject: `Contract digest — ${digest.summaryLine}`, html, text });
    delivered = result.delivered;
    reason = result.reason ?? null;
  } else {
    reason = recipients.length === 0 ? "no-recipient" : "nothing-actionable";
  }

  await logAudit({
    organizationId,
    actorId: null,
    actorType: "SYSTEM",
    action: "contract.digest.generated",
    resourceType: "Organization",
    resourceId: organizationId,
    afterJson: {
      counts: digest.counts,
      summaryLine: digest.summaryLine,
      actionableTotal: digest.actionableTotal,
      recipients: recipients.length,
      delivered,
      reason,
    } as never,
    metadata: { source: "contracts", channel: "email", job: "digest" } as never,
  }).catch(() => {});

  return { organizationId, actionableTotal: digest.actionableTotal, summaryLine: digest.summaryLine, recipients: recipients.length, delivered, reason };
}

/** Weekly digest across every org. One org's failure is captured, not thrown. */
export async function runAllOrgContractDigests(): Promise<AllOrgResult<OrgDigestResult>> {
  const ids = await listOrganizationIds();
  const results: OrgDigestResult[] = [];
  let failed = 0;
  for (const organizationId of ids) {
    try {
      results.push(await runContractDigestForOrg(organizationId));
    } catch (err) {
      failed += 1;
      results.push({ organizationId, actionableTotal: 0, summaryLine: "", recipients: 0, delivered: false, error: String((err as Error)?.message || err) });
    }
  }
  return { orgs: ids.length, ran: ids.length - failed, failed, results, generatedAt: new Date().toISOString() };
}
