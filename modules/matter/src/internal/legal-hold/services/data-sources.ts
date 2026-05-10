/**
 * CustodianDataSource lifecycle — add, apply preservation, confirm
 * preservation. Preservation orchestration routes through the
 * MockM365Client extensions (sunset 4c).
 */
import { prisma, type CustodianDataSource, type DataSourceType } from "@aegis/db";
import type {
  AddCustodianDataSourceInput,
  ApplyDataSourcePreservationInput,
  ConfirmDataSourcePreservationInput,
  HoldActor,
} from "../types";
import type { PreservationResult } from "../../services/m365";
import { getM365ClientForOrg } from "../../services/m365-factory";
import { recordHoldEvent } from "./timeline";

export function resolveCustodianExternalIdentifier(person: {
  externalRef: string | null;
  email: string | null;
  id: string;
  name: string;
}): string {
  if (person.externalRef) return person.externalRef;
  if (person.email) return person.email;
  throw new Error(
    `Cannot resolve M365 custodian identifier for person ${person.id} (${person.name}): both externalRef and email are null. ` +
      `Sync this person from M365 (helper 08 in seed) or set externalRef explicitly before adding them to a hold.`,
  );
}

/**
 * Thrown when a CustodianDataSource row carries a type AEGIS does
 * not yet know how to push to Microsoft Purview. The hold workflow
 * surfaces this as a per-row preservation failure (status=ERROR)
 * with the unsupported type in the reason; the rest of the hold
 * still issues. Sunset when the corresponding follow-up lands
 * (B.2 for Teams, B.3 for Slack/Google).
 */
export class DataSourceNotImplementedError extends Error {
  constructor(type: DataSourceType, followUp: string) {
    super(
      `Preservation for data source type ${type} is not yet supported by AEGIS. ` +
        `Track follow-up: ${followUp}.`,
    );
    this.name = "DataSourceNotImplementedError";
  }
}

/**
 * Resolve the per-source identifier sent to Microsoft Graph as the
 * userSource `email` body field (mailbox / OneDrive sources) or
 * siteSource `webUrl` (SharePoint sites).
 *
 * Why this exists: `CustodianDataSource.externalIdentifier` is a
 * free-form String at the schema level — there is no UPN constraint,
 * no URL constraint, no per-type discrimination. For mailbox-like
 * types we want a fresh resolution from `Person.email` (same shape
 * as PR #42's resolveCustodianExternalIdentifier one layer up) so
 * stale CUIDs / GUIDs / out-of-date UPNs in `externalIdentifier`
 * cannot reach Graph and surface as opaque 404 "User mailbox not
 * found" errors. SharePoint sites still ride their persisted webUrl
 * after a startsWith("http") sanity check.
 */
export function resolveDataSourceExternalIdentifier(
  dataSource: { type: DataSourceType; externalIdentifier: string },
  person: { id: string; name: string; email: string | null },
): string {
  switch (dataSource.type) {
    case "EMAIL_MAILBOX":
    case "ARCHIVED_MAILBOX":
    case "DEPARTED_USER_MAILBOX":
    case "ONEDRIVE": {
      if (!person.email) {
        throw new Error(
          `Cannot resolve M365 ${dataSource.type} identifier for person ${person.id} (${person.name}): person.email is null. ` +
            `Sync this person from M365 (helper 08 in seed) before issuing preservation against a mailbox / OneDrive source.`,
        );
      }
      return person.email;
    }
    case "SHAREPOINT_SITE": {
      const value = dataSource.externalIdentifier;
      if (!value.startsWith("http")) {
        throw new Error(
          `Invalid SHAREPOINT_SITE externalIdentifier ${JSON.stringify(value)}: ` +
            `expected an http(s) webUrl. Update the data source row's externalIdentifier to a Graph-resolvable site URL.`,
        );
      }
      return value;
    }
    case "TEAMS_CHANNEL":
    case "TEAMS_PRIVATE_CHANNEL":
    case "TEAMS_DM":
      throw new DataSourceNotImplementedError(dataSource.type, "B.2 (Teams Channel preservation)");
    case "SLACK_CHANNEL":
    case "SLACK_DM":
    case "GOOGLE_DRIVE":
    case "GOOGLE_CHAT":
      throw new DataSourceNotImplementedError(
        dataSource.type,
        "B.3 (Slack/Google graceful degradation)",
      );
    case "EPHEMERAL_CHAT_AUTO_DELETE":
    case "LOCAL_DEVICE":
    case "PHYSICAL_FILES":
    case "THIRD_PARTY_SAAS":
    case "OTHER":
      throw new DataSourceNotImplementedError(
        dataSource.type,
        "B.3 (non-Graph preservation modes)",
      );
    default: {
      const exhaustive: never = dataSource.type;
      throw new Error(`Unknown DataSourceType: ${String(exhaustive)}`);
    }
  }
}

async function loadHoldOrgFromDataSource(
  dataSourceId: string,
): Promise<{ legalHoldId: string; organizationId: string; personId: string }> {
  const ds = await prisma.custodianDataSource.findUnique({
    where: { id: dataSourceId },
    select: {
      legalHoldCustodian: {
        select: {
          legalHoldId: true,
          personId: true,
          legalHold: { select: { organizationId: true } },
        },
      },
    },
  });
  if (!ds) throw new Error(`Data source ${dataSourceId} not found`);
  return {
    legalHoldId: ds.legalHoldCustodian.legalHoldId,
    organizationId: ds.legalHoldCustodian.legalHold.organizationId,
    personId: ds.legalHoldCustodian.personId,
  };
}

export async function addCustodianDataSourceService(
  input: AddCustodianDataSourceInput,
  actor: HoldActor,
): Promise<CustodianDataSource> {
  const lhc = await prisma.legalHoldCustodian.findUnique({
    where: { id: input.legalHoldCustodianId },
    select: {
      id: true,
      legalHoldId: true,
      legalHold: { select: { organizationId: true } },
    },
  });
  if (!lhc) throw new Error(`Custodian row ${input.legalHoldCustodianId} not found`);
  if (lhc.legalHold.organizationId !== actor.organizationId) {
    throw new Error("Cross-org access refused");
  }

  const created = await prisma.custodianDataSource.create({
    data: {
      legalHoldCustodianId: input.legalHoldCustodianId,
      type: input.type,
      externalIdentifier: input.externalIdentifier,
      displayLabel: input.displayLabel,
      preservationAction: input.preservationAction ?? "LEGAL_HOLD_IN_PLACE",
      retentionPolicyConflict: input.retentionPolicyConflict ?? false,
      metadataJson: (input.metadata ?? null) as object,
    },
  });

  await recordHoldEvent({
    legalHoldId: lhc.legalHoldId,
    organizationId: actor.organizationId,
    actor,
    type: "DATA_SOURCE_ADDED",
    summary: `Data source added: ${input.displayLabel}`,
    auditAction: "matter.legal_hold.data_source.added",
    afterJson: {
      id: created.id,
      type: created.type,
      label: created.displayLabel,
      action: created.preservationAction,
      retentionPolicyConflict: created.retentionPolicyConflict,
    },
  });

  return created;
}

export async function applyDataSourcePreservationService(
  input: ApplyDataSourcePreservationInput,
  actor: HoldActor,
): Promise<CustodianDataSource> {
  const ds = await prisma.custodianDataSource.findUnique({
    where: { id: input.dataSourceId },
    include: {
      legalHoldCustodian: {
        include: {
          person: {
            select: { id: true, name: true, externalRef: true, email: true },
          },
          legalHold: { select: { organizationId: true } },
        },
      },
    },
  });
  if (!ds) throw new Error(`Data source ${input.dataSourceId} not found`);
  if (ds.legalHoldCustodian.legalHold.organizationId !== actor.organizationId) {
    throw new Error("Cross-org access refused");
  }

  // Route through the M365 factory. Real Graph when creds resolve;
  // mock fallback otherwise. 4b shipped with mock-only; 4c wires
  // M365GraphClient into the same interface — no caller change.
  // Resolve the data-source identifier BEFORE calling Graph so a
  // stale CUID/GUID/UPN can't reach addSource as the body's `email`
  // field. Mailbox-like sources read from `person.email` (the same
  // shape as PR #42 one layer up); SharePoint rides the persisted
  // webUrl. Unsupported types (Teams, Slack, Google, …) throw
  // DataSourceNotImplementedError, which we translate into a
  // per-row ERROR result so the hold's other sources still issue.
  let result: PreservationResult;
  try {
    const dataSourceExternalIdentifier = resolveDataSourceExternalIdentifier(
      { type: ds.type, externalIdentifier: ds.externalIdentifier },
      ds.legalHoldCustodian.person,
    );
    const m365 = await getM365ClientForOrg(actor.organizationId);
    result = await m365.applyPreservation({
      custodianExternalIdentifier: resolveCustodianExternalIdentifier(ds.legalHoldCustodian.person),
      dataSourceExternalIdentifier,
      type: ds.type,
      action: ds.preservationAction,
      reasonCode: input.reasonCode,
    });
  } catch (err) {
    if (err instanceof DataSourceNotImplementedError) {
      result = {
        ok: false,
        appliedAt: new Date().toISOString(),
        upstreamReferenceId: null,
        failureReason: err.message,
      };
    } else {
      throw err;
    }
  }

  const appliedAt = new Date(result.appliedAt);
  const updated = await prisma.custodianDataSource.update({
    where: { id: ds.id },
    data: {
      preservationAppliedAt: appliedAt,
      preservationFailureReason: result.failureReason,
      preservationAction: result.ok
        ? ds.preservationAction
        : "PRESERVATION_FAILED",
      // Sub-PR 4d.0: lifecycle status surfaces in the workspace as
      // colored badges. PENDING here means "we sent the request,
      // confirmation has not arrived yet" — confirmDataSourcePreservation
      // flips PENDING → ON_HOLD. On failure, jump straight to ERROR
      // so retry button appears immediately.
      preservationStatus: result.ok ? "PENDING" : "ERROR",
    },
  });

  await recordHoldEvent({
    legalHoldId: ds.legalHoldCustodian.legalHoldId,
    organizationId: actor.organizationId,
    actor,
    type: result.ok ? "DATA_SOURCE_PRESERVATION_APPLIED" : "DATA_SOURCE_PRESERVATION_FAILED",
    summary: result.ok
      ? `Preservation applied: ${ds.displayLabel}`
      : `Preservation FAILED: ${ds.displayLabel} (${result.failureReason})`,
    auditAction: result.ok
      ? "matter.legal_hold.data_source.preservation.applied"
      : "matter.legal_hold.data_source.preservation.failed",
    afterJson: {
      dataSourceId: ds.id,
      action: result.ok ? ds.preservationAction : "PRESERVATION_FAILED",
      appliedAt: appliedAt.toISOString(),
      upstreamReferenceId: result.upstreamReferenceId,
    },
  });

  return updated;
}

export async function confirmDataSourcePreservationService(
  input: ConfirmDataSourcePreservationInput,
  actor: HoldActor,
): Promise<CustodianDataSource> {
  const ctx = await loadHoldOrgFromDataSource(input.dataSourceId);
  if (ctx.organizationId !== actor.organizationId) {
    throw new Error("Cross-org access refused");
  }

  const confirmedAt = new Date();
  const updated = await prisma.custodianDataSource.update({
    where: { id: input.dataSourceId },
    data: {
      preservationConfirmedAt: confirmedAt,
      preservationConfirmedById: actor.id,
      // Sub-PR 4d.0: confirm flips PENDING → ON_HOLD. We don't
      // touch ERROR rows here — those need retry first.
      preservationStatus: "ON_HOLD",
    },
  });

  await recordHoldEvent({
    legalHoldId: ctx.legalHoldId,
    organizationId: actor.organizationId,
    actor,
    type: "DATA_SOURCE_PRESERVATION_CONFIRMED",
    summary: `IT preservation confirmed: ${updated.displayLabel}`,
    auditAction: "matter.legal_hold.data_source.preservation.confirmed",
    afterJson: {
      dataSourceId: input.dataSourceId,
      confirmedAt: confirmedAt.toISOString(),
      confirmedById: actor.id,
    },
  });

  return updated;
}
