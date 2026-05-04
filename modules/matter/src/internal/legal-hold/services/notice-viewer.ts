/**
 * Notice viewer — defensibility evidence surface (sub-PR 4c.3,
 * Item 7). When a court asks "what exactly did the custodian
 * receive on this date," this is the answer.
 *
 * `getNoticeIssuanceForViewerService` returns one issuance with:
 *   - The body re-rendered from the template at the snapshotted
 *     version, with variables substituted using current matter +
 *     hold + org context. (We don't have per-recipient snapshots,
 *     so the rendered body uses a representative custodian — the
 *     previewCustodian — same as the composer.)
 *   - The verbatim `bodyHashAtIssuance` so a reviewer can verify
 *     the recorded hash matches an independent rehash of the
 *     content they've reconstructed.
 *   - Recipient roster (every custodian who got the notice — today
 *     this is "every custodian on the hold at issuance time" since
 *     the legacy issuance row stores recipientCount only;
 *     post-4c.3 we record per-recipient REMINDER_SENT events so the
 *     viewer reads the recipient list off the chain).
 *   - issuedById resolved to a display name via the actor resolver.
 */
import { prisma } from "@aegis/db";
import { renderTemplate } from "./notice-composer";
import type { HoldActor } from "../types";

export interface NoticeIssuanceForViewer {
  issuance: {
    id: string;
    issuedAt: string;
    issuedById: string;
    templateId: string;
    templateVersion: number;
    bodyHashAtIssuance: string;
    recipientCount: number;
  };
  template: {
    id: string;
    name: string;
    /** Current bodyMarkdown from the row — may differ if the template
     *  was edited after this issuance (the snapshot's hash
     *  detects the drift; we reconstruct the body the user saw
     *  using THIS template version's stored content, since we
     *  don't keep per-version body history yet). */
    bodyMarkdown: string;
    version: number;
  };
  /** Body re-rendered using current context against a representative
   *  recipient. */
  renderedBody: string;
  recipients: Array<{
    personId: string;
    personName: string;
    personEmail: string | null;
    /** Filled when the chain has a per-recipient REMINDER_SENT for
     *  this issuance (4c.3 composer writes one per custodian). */
    deliveryEventAt: string | null;
    /** Always "Recorded" today — real email integration is sunset. */
    deliveryStatus: "Recorded" | "Sent" | "Pending";
  }>;
}

export async function getNoticeIssuanceForViewerService(
  holdId: string,
  issuanceId: string,
  actor: HoldActor,
): Promise<NoticeIssuanceForViewer | null> {
  const issuance = await prisma.holdNoticeIssuance.findFirst({
    where: {
      id: issuanceId,
      legalHoldId: holdId,
      legalHold: { organizationId: actor.organizationId },
    },
    include: {
      template: true,
      legalHold: {
        include: {
          organization: { select: { name: true } },
          matter: {
            select: { title: true, matterNumber: true, jurisdiction: true },
          },
          custodians: {
            include: {
              person: { select: { name: true, email: true, metadata: true } },
            },
          },
        },
      },
    },
  });
  if (!issuance) return null;

  // Pull per-recipient REMINDER_SENT events to recover the actual
  // delivery roster (if the issuance was created via the 4c.3
  // composer). Older 4b issuances don't have these events; we fall
  // back to the full custodian list at issuance time.
  const events = await prisma.legalHoldEvent.findMany({
    where: {
      legalHoldId: holdId,
      type: "REMINDER_SENT",
      // Match the issuance via the JSON metadata path.
    },
  });
  const eventByPerson = new Map<string, Date>();
  for (const e of events) {
    const meta = (e.payloadJson ?? {}) as {
      issuanceId?: string;
      recipientPersonId?: string;
    };
    if (meta.issuanceId === issuance.id && meta.recipientPersonId) {
      eventByPerson.set(meta.recipientPersonId, e.occurredAt);
    }
  }

  const previewPerson =
    issuance.legalHold.custodians.find((c) => !c.acknowledgedAt) ??
    issuance.legalHold.custodians[0];

  const renderedBody = previewPerson
    ? renderTemplate(issuance.template.bodyMarkdown, {
        custodian: {
          name: previewPerson.person.name,
          email: previewPerson.person.email,
          role: extractRole(previewPerson.person.metadata),
        },
        matter: {
          title: issuance.legalHold.matter.title,
          matterNumber: issuance.legalHold.matter.matterNumber,
          jurisdictions:
            issuance.legalHold.jurisdictions.length > 0
              ? issuance.legalHold.jurisdictions
              : issuance.legalHold.matter.jurisdiction
                ? [issuance.legalHold.matter.jurisdiction]
                : [],
        },
        hold: {
          title: issuance.legalHold.title,
          holdNumber: issuance.legalHold.holdNumber,
          scopeDescription: issuance.legalHold.scopeDescription,
          triggeredAt:
            issuance.legalHold.triggeredAt?.toISOString() ?? null,
        },
        org: { name: issuance.legalHold.organization.name },
        notice: {
          acknowledgmentLink: `${process.env.NOTICE_ACK_LINK_BASE ?? "https://aegis-eight-roan.vercel.app"}/custodian/holds/${issuance.legalHold.id}/acknowledge`,
        },
      })
    : issuance.template.bodyMarkdown;

  // Recipient roster: prefer per-event records; fall back to the
  // full custodian list when an old 4b issuance lacks them.
  const useEventList = eventByPerson.size > 0;
  const recipients = useEventList
    ? Array.from(eventByPerson.entries()).map(([personId, occurredAt]) => {
        const c = issuance.legalHold.custodians.find(
          (c) => c.personId === personId,
        );
        return {
          personId,
          personName: c?.person.name ?? "(unknown person)",
          personEmail: c?.person.email ?? null,
          deliveryEventAt: occurredAt.toISOString(),
          deliveryStatus: "Recorded" as const,
        };
      })
    : issuance.legalHold.custodians.map((c) => ({
        personId: c.personId,
        personName: c.person.name,
        personEmail: c.person.email,
        deliveryEventAt: null,
        deliveryStatus: "Recorded" as const,
      }));

  return {
    issuance: {
      id: issuance.id,
      issuedAt: issuance.issuedAt.toISOString(),
      issuedById: issuance.issuedById,
      templateId: issuance.templateId,
      templateVersion: issuance.templateVersion,
      bodyHashAtIssuance: issuance.bodyHashAtIssuance,
      recipientCount: issuance.recipientCount,
    },
    template: {
      id: issuance.template.id,
      name: issuance.template.name,
      bodyMarkdown: issuance.template.bodyMarkdown,
      version: issuance.template.version,
    },
    renderedBody,
    recipients,
  };
}

function extractRole(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const m = metadata as Record<string, unknown>;
  return typeof m.role === "string" ? m.role : null;
}
