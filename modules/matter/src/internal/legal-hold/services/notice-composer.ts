/**
 * Notice composer — server-side rendering of a HoldNoticeTemplate
 * with custodian / matter / hold / org context substituted, plus the
 * issuance path used by the 4c.3 4-step notice composer wizard.
 *
 * Why a separate service from `issueNoticeService` (notice-template.ts):
 *   - The 4b path issued the same template body to every recipient,
 *     with no substitution. The composer must show a concrete
 *     preview and let the user edit it before sending.
 *   - The composer accepts an optional `editedBody` so the issuance's
 *     `bodyHashAtIssuance` reflects what was actually sent, not the
 *     template's stored version.
 *   - Per recipient we write a `REMINDER_SENT` event so the timeline
 *     shows N rows (one per custodian) — the brief asks for this so
 *     the audit trail names everyone who received the notice.
 *
 * Email sending is stubbed — the issuance + audit rows ARE the
 * defensibility evidence; the SMTP/SES/Outlook glue is a separate
 * surface (sunset condition: when first customer demands real
 * delivery; documented in CLAUDE.md exception ledger).
 */
import {
  bodyHash,
  prisma,
  type HoldNoticeIssuance,
  type HoldNoticeTemplate,
} from "@aegis/db";
import type { HoldActor } from "../types";
import { recordHoldEvent } from "./timeline";

const ACK_LINK_BASE =
  process.env.NOTICE_ACK_LINK_BASE ??
  "https://aegis-eight-roan.vercel.app";

export interface NoticeComposerVariables {
  custodian: {
    name: string;
    email: string | null;
    role: string | null;
  };
  matter: {
    title: string;
    matterNumber: string | null;
    jurisdictions: string[];
  };
  hold: {
    title: string;
    holdNumber: string | null;
    scopeDescription: string;
    triggeredAt: string | null;
  };
  org: { name: string };
  notice: {
    /** /custodian/holds/[holdId]/acknowledge URL — already exists from 4b. */
    acknowledgmentLink: string;
  };
}

export interface ComposerPreviewInput {
  holdId: string;
  templateId: string;
  /** Default: first unacknowledged custodian on the hold. */
  previewCustodianPersonId?: string;
}

export interface ComposerPreviewResult {
  template: {
    id: string;
    name: string;
    version: number;
    jurisdictionKey: string | null;
  };
  /** The template body with `{{...}}` placeholders left in place. */
  rawBody: string;
  /** The body with variables substituted using `previewCustodian`. */
  renderedBody: string;
  previewCustodian: {
    personId: string;
    name: string;
    email: string | null;
  } | null;
  /** Rendered candidate-recipient roster — UI uses these directly. */
  recipients: Array<{
    personId: string;
    name: string;
    email: string | null;
    role: string | null;
    acknowledgedAt: string | null;
    releasedAt: string | null;
  }>;
}

/**
 * Build the preview the wizard's step 2 shows. Pure read; no audit
 * row, no mutation. Resolves the template, picks a representative
 * custodian, and runs the substitution pass.
 */
export async function getNoticeComposerPreviewService(
  input: ComposerPreviewInput,
  actor: HoldActor,
): Promise<ComposerPreviewResult> {
  const ctx = await loadContext(input.holdId, actor.organizationId);
  if (!ctx) throw new Error(`Hold ${input.holdId} not found`);

  const tpl = await prisma.holdNoticeTemplate.findFirst({
    where: {
      id: input.templateId,
      organizationId: actor.organizationId,
      isActive: true,
    },
  });
  if (!tpl)
    throw new Error(`Template ${input.templateId} not found / inactive`);

  const previewPerson =
    (input.previewCustodianPersonId &&
      ctx.custodians.find(
        (c) => c.personId === input.previewCustodianPersonId,
      )) ||
    ctx.custodians.find((c) => !c.acknowledgedAt) ||
    ctx.custodians[0] ||
    null;

  const rendered = previewPerson
    ? renderTemplate(tpl.bodyMarkdown, buildVariables(ctx, previewPerson))
    : tpl.bodyMarkdown;

  return {
    template: {
      id: tpl.id,
      name: tpl.name,
      version: tpl.version,
      jurisdictionKey: tpl.jurisdictionKey,
    },
    rawBody: tpl.bodyMarkdown,
    renderedBody: rendered,
    previewCustodian: previewPerson
      ? {
          personId: previewPerson.personId,
          name: previewPerson.personName,
          email: previewPerson.personEmail,
        }
      : null,
    recipients: ctx.custodians.map((c) => ({
      personId: c.personId,
      name: c.personName,
      email: c.personEmail,
      role: c.personRole,
      acknowledgedAt: c.acknowledgedAt?.toISOString() ?? null,
      releasedAt: c.releasedAt?.toISOString() ?? null,
    })),
  };
}

export interface ComposeAndSendInput {
  holdId: string;
  templateId: string;
  /**
   * Optional override of the rendered body — if present, it's hashed
   * and stored as the issuance snapshot in place of the template's
   * own bodyHash. The user might edit verbiage in step 2 of the
   * wizard; the edit applies to THIS issuance only.
   */
  editedBody?: string;
  /** Default: every non-released, non-acknowledged custodian. */
  recipientCustodianPersonIds?: string[];
}

export interface ComposeAndSendResult {
  issuance: HoldNoticeIssuance;
  recipientCount: number;
  /**
   * `true` when the email-delivery side is stubbed (it always is
   * today). The UI shows a "Recorded — delivery integration pending"
   * note rather than a green "Sent" badge so we don't oversell.
   */
  deliveryStubbed: boolean;
}

/**
 * The 4-step wizard's "Send" handler. Snapshots the rendered body's
 * hash, writes one HoldNoticeIssuance row, then writes one
 * REMINDER_SENT event per selected custodian so the timeline names
 * each recipient. Email sending is stubbed.
 */
export async function composeAndSendNoticeService(
  input: ComposeAndSendInput,
  actor: HoldActor,
): Promise<ComposeAndSendResult> {
  const ctx = await loadContext(input.holdId, actor.organizationId);
  if (!ctx) throw new Error(`Hold ${input.holdId} not found`);

  const tpl = await prisma.holdNoticeTemplate.findFirst({
    where: {
      id: input.templateId,
      organizationId: actor.organizationId,
      isActive: true,
    },
  });
  if (!tpl)
    throw new Error(`Template ${input.templateId} not found / inactive`);

  // Default to every non-released, non-acknowledged custodian. If
  // the wizard sent recipientCustodianPersonIds explicitly, honour
  // that — but still scope to live custodians on the hold.
  const eligibleIds = new Set(
    ctx.custodians
      .filter((c) => !c.releasedAt)
      .map((c) => c.personId),
  );
  const requested = input.recipientCustodianPersonIds;
  const recipientPersonIds = (
    requested && requested.length > 0
      ? requested.filter((id) => eligibleIds.has(id))
      : ctx.custodians
          .filter((c) => !c.releasedAt && !c.acknowledgedAt)
          .map((c) => c.personId)
  );
  if (recipientPersonIds.length === 0) {
    throw new Error("No eligible recipients for this notice");
  }

  // The hash MUST reflect what was actually sent. Use the edited
  // body's hash if the user customised; otherwise the template's
  // own hash from the row.
  const finalBody = input.editedBody ?? tpl.bodyMarkdown;
  const finalHash =
    input.editedBody && input.editedBody !== tpl.bodyMarkdown
      ? bodyHash(input.editedBody)
      : tpl.bodyHash;

  const issuance = await prisma.holdNoticeIssuance.create({
    data: {
      legalHoldId: ctx.id,
      templateId: tpl.id,
      templateVersion: tpl.version,
      bodyHashAtIssuance: finalHash,
      recipientCount: recipientPersonIds.length,
      issuedById: actor.id,
    },
  });

  // One audit / timeline row per recipient — the brief explicitly
  // asks for "writes audit rows for each affected custodian" so the
  // chain names every individual the notice went to.
  for (const personId of recipientPersonIds) {
    const c = ctx.custodians.find((c) => c.personId === personId);
    await recordHoldEvent({
      legalHoldId: ctx.id,
      organizationId: actor.organizationId,
      actor,
      type: "REMINDER_SENT",
      summary: `Notice sent to ${c?.personName ?? personId}`,
      auditAction: "matter.legal_hold.notice.sent",
      afterJson: {
        issuanceId: issuance.id,
        templateId: tpl.id,
        templateVersion: tpl.version,
        bodyHashAtIssuance: finalHash,
        recipientPersonId: personId,
        recipientName: c?.personName ?? null,
        recipientEmail: c?.personEmail ?? null,
        bodyEdited: !!input.editedBody && input.editedBody !== tpl.bodyMarkdown,
        deliveryStubbed: true,
      },
    });
  }

  // Touch — markup the unused finalBody so the variable doesn't get
  // tree-shaken before a future "real send" reads it. The body's
  // ALREADY hashed above; the next step (real send) reads from this
  // closure.
  void finalBody;

  return {
    issuance,
    recipientCount: recipientPersonIds.length,
    deliveryStubbed: true,
  };
}

// ── helpers ──────────────────────────────────────────────────────

interface LoadedContext {
  id: string;
  title: string;
  scopeDescription: string;
  holdNumber: string | null;
  triggeredAt: Date | null;
  matterTitle: string;
  matterNumber: string | null;
  matterJurisdictions: string[];
  organizationName: string;
  custodians: Array<{
    personId: string;
    personName: string;
    personEmail: string | null;
    personRole: string | null;
    acknowledgedAt: Date | null;
    releasedAt: Date | null;
  }>;
}

async function loadContext(
  holdId: string,
  organizationId: string,
): Promise<LoadedContext | null> {
  const hold = await prisma.legalHold.findFirst({
    where: { id: holdId, organizationId },
    include: {
      organization: { select: { name: true } },
      matter: {
        select: { title: true, matterNumber: true, jurisdiction: true },
      },
      custodians: {
        include: {
          person: { select: { name: true, email: true, metadata: true } },
        },
        orderBy: [{ createdAt: "asc" }],
      },
    },
  });
  if (!hold) return null;
  // The matter has a single optional jurisdiction; the hold itself
  // has an array. Prefer the hold's array (it's the authoritative
  // legal-hold scope) and fall back to the matter's value when the
  // hold's is empty.
  const jurisdictions =
    hold.jurisdictions.length > 0
      ? hold.jurisdictions
      : hold.matter.jurisdiction
        ? [hold.matter.jurisdiction]
        : [];
  return {
    id: hold.id,
    title: hold.title,
    scopeDescription: hold.scopeDescription,
    holdNumber: hold.holdNumber,
    triggeredAt: hold.triggeredAt,
    matterTitle: hold.matter.title,
    matterNumber: hold.matter.matterNumber,
    matterJurisdictions: jurisdictions,
    organizationName: hold.organization.name,
    custodians: hold.custodians.map((c) => ({
      personId: c.personId,
      personName: c.person.name,
      personEmail: c.person.email,
      personRole: extractRole(c.person.metadata),
      acknowledgedAt: c.acknowledgedAt,
      releasedAt: c.releasedAt,
    })),
  };
}

/**
 * Person has no first-class `role` column — convention is to stash
 * employment role on `metadata.role` when known. Returns null when
 * absent so the template substitution renders `(unset)`.
 */
function extractRole(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const m = metadata as Record<string, unknown>;
  const role = m.role;
  return typeof role === "string" ? role : null;
}

function buildVariables(
  ctx: LoadedContext,
  custodian: LoadedContext["custodians"][number],
): NoticeComposerVariables {
  return {
    custodian: {
      name: custodian.personName,
      email: custodian.personEmail,
      role: custodian.personRole,
    },
    matter: {
      title: ctx.matterTitle,
      matterNumber: ctx.matterNumber,
      jurisdictions: ctx.matterJurisdictions,
    },
    hold: {
      title: ctx.title,
      holdNumber: ctx.holdNumber,
      scopeDescription: ctx.scopeDescription,
      triggeredAt: ctx.triggeredAt?.toISOString() ?? null,
    },
    org: { name: ctx.organizationName },
    notice: {
      acknowledgmentLink: `${ACK_LINK_BASE}/custodian/holds/${ctx.id}/acknowledge`,
    },
  };
}

const VAR_PATTERN = /\{\{\s*([a-zA-Z][a-zA-Z0-9.]*)\s*\}\}/g;

/**
 * Substitute `{{path.segments}}` placeholders against the variable
 * tree. Missing values render as `(unset)` so the user can spot
 * unbound variables in the preview rather than getting a silently
 * empty notice.
 */
export function renderTemplate(
  body: string,
  vars: NoticeComposerVariables,
): string {
  return body.replace(VAR_PATTERN, (_full, path: string) => {
    const value = lookup(vars, path.split("."));
    if (value === null || value === undefined) return "(unset)";
    if (Array.isArray(value)) return value.join(", ");
    return String(value);
  });
}

function lookup(root: unknown, segments: string[]): unknown {
  let cur: unknown = root;
  for (const seg of segments) {
    if (cur && typeof cur === "object" && seg in (cur as object)) {
      cur = (cur as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }
  return cur;
}
