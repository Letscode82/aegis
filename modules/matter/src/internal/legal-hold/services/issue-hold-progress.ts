/**
 * Hold issuance progress orchestrator (sub-PR 4d.0).
 *
 * Composes the existing issue-hold + per-source apply + notice flows
 * into one async generator that yields typed progress events. The
 * SSE endpoint (`/api/matter/[id]/holds/[holdId]/issue-with-progress`)
 * pipes these events to the wizard's ProgressPanel; the snapshot
 * endpoint (`issue-status.ts`) reads the same events from the audit
 * log to support reconnect-from-anywhere.
 *
 * **Architectural commitment:** this orchestrator does NOT
 * re-implement the underlying services. It calls the existing
 * services (`issueLegalHoldService`, `applyDataSourcePreservationService`,
 * `composeAndSendNoticeService`) and translates their results into
 * stream events. If a step fails, the orchestrator emits a
 * `step_failed` event but doesn't abort — the next custodian still
 * gets a try, and the final summary records partial success.
 */
import { prisma } from "@aegis/db";
import type { HoldActor } from "../types";
import { issueLegalHoldService } from "./lifecycle";
import { applyDataSourcePreservationService } from "./data-sources";
import { composeAndSendNoticeService } from "./notice-composer";

export type IssueProgressEvent =
  | {
      type: "step_started";
      id: string;
      label: string;
      parent?: string;
    }
  | {
      type: "step_succeeded";
      id: string;
      durationMs: number;
      data?: Record<string, unknown>;
    }
  | {
      type: "step_failed";
      id: string;
      durationMs: number;
      error: { code: string; message: string };
    }
  | {
      type: "complete";
      summary: {
        totalCustodians: number;
        totalDataSources: number;
        preservedCount: number;
        failedCount: number;
        noticesSent: number;
      };
    }
  | {
      type: "error";
      error: { code: string; message: string };
    };

export interface IssueWithProgressInput {
  holdId: string;
  noticeTemplateId: string;
  recipientCustodianPersonIds: string[];
  /** When false the wizard skips the apply-preservation phase. The
   *  hold record + notice still ship; useful for "I'll add data
   *  sources later" workflows. Defaults to true. */
  pushToMicrosoft?: boolean;
  /** Reason code attached to every per-source applyPreservation call.
   *  Defaults to `hold:<holdId>` matching the existing convention. */
  reasonCode?: string;
}

/**
 * Async generator that yields progress events as the issuance flow
 * runs. Caller pumps each yielded event into the SSE stream.
 *
 * Naming convention for `id`:
 *   - "issue.hold-record"     — the issueLegalHoldService call
 *   - "issue.custodians"      — custodians attached
 *   - "issue.purview"         — top-level Microsoft push
 *   - "issue.purview.cust:<personId>" — per custodian
 *   - "issue.purview.cust:<personId>.ds:<dsId>" — per data source
 *   - "issue.notices"         — composeAndSendNoticeService
 *   - "issue.audit"           — audit-chain seal (informational)
 */
export async function* issueHoldWithProgress(
  input: IssueWithProgressInput,
  actor: HoldActor,
): AsyncGenerator<IssueProgressEvent, void, void> {
  const startedAt = Date.now();
  const reasonCode = input.reasonCode ?? `hold:${input.holdId}`;
  const pushToMicrosoft = input.pushToMicrosoft ?? true;

  let preservedCount = 0;
  let failedCount = 0;
  let totalDataSources = 0;
  let noticesSent = 0;

  try {
    // ── Step: hold record ────────────────────────────────────────
    yield {
      type: "step_started",
      id: "issue.hold-record",
      label: "Hold record created",
    };
    const stepHoldStart = Date.now();
    await issueLegalHoldService(
      {
        holdId: input.holdId,
        noticeTemplateId: input.noticeTemplateId,
        recipientCustodianPersonIds: input.recipientCustodianPersonIds,
      },
      actor,
    );
    yield {
      type: "step_succeeded",
      id: "issue.hold-record",
      durationMs: Date.now() - stepHoldStart,
    };

    // ── Step: custodians attached (informational rollup) ─────────
    yield {
      type: "step_started",
      id: "issue.custodians",
      label: "Custodians attached",
    };
    yield {
      type: "step_succeeded",
      id: "issue.custodians",
      durationMs: Date.now() - stepHoldStart,
      data: { count: input.recipientCustodianPersonIds.length },
    };

    // ── Step: Microsoft push (per custodian, per data source) ────
    if (pushToMicrosoft) {
      yield {
        type: "step_started",
        id: "issue.purview",
        label: "Pushing to Microsoft Purview",
      };
      const purviewStart = Date.now();

      const custodians = await prisma.legalHoldCustodian.findMany({
        where: { legalHoldId: input.holdId },
        include: {
          person: { select: { id: true, name: true, email: true } },
          dataSources: { select: { id: true, displayLabel: true } },
        },
      });

      for (const cust of custodians) {
        const custStepId = `issue.purview.cust:${cust.personId}`;
        yield {
          type: "step_started",
          id: custStepId,
          label: `Adding ${cust.person.name}`,
          parent: "issue.purview",
        };
        const custStart = Date.now();
        let custFailed = false;

        for (const ds of cust.dataSources) {
          totalDataSources += 1;
          const dsStepId = `${custStepId}.ds:${ds.id}`;
          yield {
            type: "step_started",
            id: dsStepId,
            label: ds.displayLabel,
            parent: custStepId,
          };
          const dsStart = Date.now();
          try {
            const updated = await applyDataSourcePreservationService(
              { dataSourceId: ds.id, reasonCode },
              actor,
            );
            if (updated.preservationStatus === "ERROR") {
              failedCount += 1;
              custFailed = true;
              yield {
                type: "step_failed",
                id: dsStepId,
                durationMs: Date.now() - dsStart,
                error: {
                  code: "PRESERVATION_FAILED",
                  message:
                    updated.preservationFailureReason ?? "Microsoft rejected the request",
                },
              };
            } else {
              preservedCount += 1;
              yield {
                type: "step_succeeded",
                id: dsStepId,
                durationMs: Date.now() - dsStart,
                data: { upstreamReferenceId: updated.metadataJson ?? null },
              };
            }
          } catch (err) {
            failedCount += 1;
            custFailed = true;
            const e = err as { name?: string; message?: string };
            yield {
              type: "step_failed",
              id: dsStepId,
              durationMs: Date.now() - dsStart,
              error: {
                code: e.name ?? "PRESERVATION_FAILED",
                message: e.message ?? String(err),
              },
            };
          }
        }

        const custDuration = Date.now() - custStart;
        if (custFailed) {
          yield {
            type: "step_failed",
            id: custStepId,
            durationMs: custDuration,
            error: {
              code: "CUSTODIAN_PARTIAL",
              message: "One or more data sources failed to preserve",
            },
          };
        } else {
          yield {
            type: "step_succeeded",
            id: custStepId,
            durationMs: custDuration,
          };
        }
      }

      yield {
        type: "step_succeeded",
        id: "issue.purview",
        durationMs: Date.now() - purviewStart,
        data: { totalDataSources, preservedCount, failedCount },
      };
    }

    // ── Step: notices ────────────────────────────────────────────
    yield {
      type: "step_started",
      id: "issue.notices",
      label: "Issuing notices to custodians",
    };
    const noticeStart = Date.now();
    try {
      const result = await composeAndSendNoticeService(
        {
          holdId: input.holdId,
          templateId: input.noticeTemplateId,
          recipientCustodianPersonIds: input.recipientCustodianPersonIds,
        },
        actor,
      );
      noticesSent = result.recipientCount ?? input.recipientCustodianPersonIds.length;
      yield {
        type: "step_succeeded",
        id: "issue.notices",
        durationMs: Date.now() - noticeStart,
        data: { recipients: noticesSent },
      };
    } catch (err) {
      const e = err as { name?: string; message?: string };
      yield {
        type: "step_failed",
        id: "issue.notices",
        durationMs: Date.now() - noticeStart,
        error: {
          code: e.name ?? "NOTICE_FAILED",
          message: e.message ?? String(err),
        },
      };
    }

    // ── Audit-chain seal is implicit (every called service writes
    //     audit rows). Emit a synthetic informational step so the UI
    //     has something to render under "Recorded in audit chain". ─
    yield {
      type: "step_started",
      id: "issue.audit",
      label: "Recorded in audit chain",
    };
    yield {
      type: "step_succeeded",
      id: "issue.audit",
      durationMs: Date.now() - startedAt,
    };

    yield {
      type: "complete",
      summary: {
        totalCustodians: input.recipientCustodianPersonIds.length,
        totalDataSources,
        preservedCount,
        failedCount,
        noticesSent,
      },
    };
  } catch (err) {
    const e = err as { name?: string; message?: string };
    yield {
      type: "error",
      error: {
        code: e.name ?? "ISSUE_FLOW_FAILED",
        message: e.message ?? String(err),
      },
    };
  }
}

/**
 * Snapshot of where the issuance flow stands. Built from the
 * persisted side-effects (LegalHold.status, LegalHoldCustodian
 * count, CustodianDataSource statuses, HoldNoticeIssuance count) so
 * the SSE-disconnected client can resume display without losing
 * confidence.
 */
export interface IssueStatusSnapshot {
  holdStatus: string;
  totalCustodians: number;
  totalDataSources: number;
  pendingCount: number;
  onHoldCount: number;
  errorCount: number;
  noticesSent: number;
}

export async function getIssueStatusSnapshot(
  holdId: string,
  organizationId: string,
): Promise<IssueStatusSnapshot> {
  const hold = await prisma.legalHold.findFirst({
    where: { id: holdId, organizationId },
  });
  if (!hold) throw new Error(`Hold ${holdId} not found`);

  const custodians = await prisma.legalHoldCustodian.count({
    where: { legalHoldId: holdId },
  });
  const dataSources = await prisma.custodianDataSource.findMany({
    where: { legalHoldCustodian: { legalHoldId: holdId } },
    select: { preservationStatus: true },
  });
  const counts = dataSources.reduce(
    (acc, ds) => {
      if (ds.preservationStatus === "PENDING") acc.pendingCount += 1;
      else if (ds.preservationStatus === "ON_HOLD") acc.onHoldCount += 1;
      else if (ds.preservationStatus === "ERROR") acc.errorCount += 1;
      return acc;
    },
    { pendingCount: 0, onHoldCount: 0, errorCount: 0 },
  );
  const issuances = await prisma.holdNoticeIssuance.aggregate({
    where: { legalHoldId: holdId },
    _sum: { recipientCount: true },
  });
  return {
    holdStatus: hold.status,
    totalCustodians: custodians,
    totalDataSources: dataSources.length,
    ...counts,
    noticesSent: issuances._sum.recipientCount ?? 0,
  };
}
