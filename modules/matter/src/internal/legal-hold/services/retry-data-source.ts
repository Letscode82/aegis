/**
 * Single-data-source retry (sub-PR 4d.0).
 *
 * Thin wrapper over `applyDataSourcePreservationService` so the
 * status-badge "Retry" button on the hold workspace can re-attempt
 * one source without touching the rest of the hold.
 *
 * The wrapper:
 *   1. Verifies the source belongs to the actor's org.
 *   2. Verifies the source is in ERROR state (no point retrying
 *      an already-on-hold source; surfaces a typed error so the UI
 *      can show "already on hold").
 *   3. Flips status PENDING (so the badge animates) before calling
 *      apply — caller's UI doesn't have to do an optimistic update.
 *   4. Delegates to the existing service, which handles the
 *      Microsoft round-trip and audit row write.
 */
import { prisma } from "@aegis/db";
import type { HoldActor } from "../types";
import { applyDataSourcePreservationService } from "./data-sources";

export class DataSourceNotInErrorStateError extends Error {
  public readonly currentStatus: string;
  constructor(dataSourceId: string, currentStatus: string) {
    super(
      `Data source ${dataSourceId} is currently in state ${currentStatus}; ` +
        `retry is only allowed from ERROR.`,
    );
    this.name = "DataSourceNotInErrorStateError";
    this.currentStatus = currentStatus;
  }
}

export interface RetryDataSourceInput {
  dataSourceId: string;
  /** Override the reason code on the retry. Defaults to the
   *  hold:<holdId> convention. */
  reasonCode?: string;
}

export async function retryDataSourcePreservationService(
  input: RetryDataSourceInput,
  actor: HoldActor,
) {
  const ds = await prisma.custodianDataSource.findUnique({
    where: { id: input.dataSourceId },
    include: {
      legalHoldCustodian: {
        select: {
          legalHoldId: true,
          legalHold: { select: { organizationId: true } },
        },
      },
    },
  });
  if (!ds) throw new Error(`Data source ${input.dataSourceId} not found`);
  if (ds.legalHoldCustodian.legalHold.organizationId !== actor.organizationId) {
    throw new Error("Cross-org access refused");
  }
  if (ds.preservationStatus !== "ERROR") {
    throw new DataSourceNotInErrorStateError(ds.id, ds.preservationStatus);
  }

  // Flip to PENDING immediately so the workspace badge animates while
  // the apply call is in flight. apply will overwrite the status to
  // PENDING (success → confirm flips to ON_HOLD) or ERROR (failure).
  await prisma.custodianDataSource.update({
    where: { id: ds.id },
    data: {
      preservationStatus: "PENDING",
      preservationFailureReason: null,
    },
  });

  return applyDataSourcePreservationService(
    {
      dataSourceId: ds.id,
      reasonCode:
        input.reasonCode ?? `hold:${ds.legalHoldCustodian.legalHoldId}`,
    },
    actor,
  );
}
