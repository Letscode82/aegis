/**
 * HoldHeaderStrip — top of the legal-hold workspace.
 *
 * Cyber-Response-grade density: hold ID + status + jurisdictions
 * inline on a single row, serif title below, scope as one-line
 * truncated text expandable on click. Right side carries the
 * defensibility badge and the contextual primary action button.
 *
 * The action button is contextual:
 *   DRAFT              → "Issue Hold" (disabled when 0 custodians)
 *   ISSUED / ACTIVE    → "Release Hold"
 *   PARTIALLY_RELEASED → "Release Remaining"
 *   RELEASED           → "Re-open Hold"  (no-op stub for 4c.2)
 *
 * No backend changes — all transitions are handled by the existing
 * /api/matter/[id]/holds/[holdId]/{issue,release} endpoints.
 */
import React, { useState } from "react";
import { Card, Pill, Sparkline, C, F, M, SR } from "@aegis/ui";
import { DefensibilityBadge, JurisdictionPills, StatusPill } from "./badges";
import type { HoldDetailDTO, LegalHoldStatusKey } from "./types";

export interface HoldHeaderStripProps {
  hold: HoldDetailDTO;
  defensibilityScore: number | null;
  custodianCount: number;
  onIssue: () => void;
  onRelease: () => void;
  busy?: boolean;
  /** When false the primary action stays in view but is disabled. */
  canIssue: boolean;
  canRelease: boolean;
  /** True when the hold has at least one HoldTriggerEvent recorded. */
  hasTriggerEvent?: boolean;
  /** Fired when the user clicks "Record / edit trigger event". */
  onEditTrigger?: () => void;
  /** Fired when the user clicks any jurisdiction pill. */
  onClickJurisdiction?: (code: string) => void;
  /** Recent score snapshots for the sparkline. Optional; renders
   *  nothing when empty / undefined. */
  snapshotPoints?: Array<{ label: string; value: number }>;
  /** Fired when the user clicks the sparkline. */
  onOpenTrend?: () => void;
}

interface PrimaryAction {
  label: string;
  variant: "primary" | "danger" | "neutral";
  onClick: () => void;
  disabled: boolean;
  disabledReason?: string;
}

function primaryActionFor(
  status: LegalHoldStatusKey,
  custodianCount: number,
  canIssue: boolean,
  canRelease: boolean,
  onIssue: () => void,
  onRelease: () => void,
  busy: boolean,
  hasTriggerEvent: boolean,
): PrimaryAction {
  if (status === "DRAFT") {
    return {
      label: busy ? "Issuing…" : "Issue hold",
      variant: "primary",
      onClick: onIssue,
      disabled:
        busy || custodianCount === 0 || !canIssue || !hasTriggerEvent,
      disabledReason: !hasTriggerEvent
        ? "Record the trigger event before issuing."
        : custodianCount === 0
          ? "Add at least one custodian to issue this hold."
          : !canIssue
            ? "Requires matter:legal_hold:issue."
            : undefined,
    };
  }
  if (status === "ISSUED" || status === "ACTIVE") {
    return {
      label: busy ? "Releasing…" : "Release hold",
      variant: "danger",
      onClick: onRelease,
      disabled: busy || !canRelease,
      disabledReason: !canRelease ? "Requires matter:legal_hold:release." : undefined,
    };
  }
  if (status === "PARTIALLY_RELEASED") {
    return {
      label: busy ? "Releasing…" : "Release remaining",
      variant: "danger",
      onClick: onRelease,
      disabled: busy || !canRelease,
      disabledReason: !canRelease ? "Requires matter:legal_hold:release." : undefined,
    };
  }
  return {
    label: "Re-open hold",
    variant: "neutral",
    onClick: () => {
      /* re-open lifecycle ships in a follow-up — kept disabled in 4c.2 */
    },
    disabled: true,
    disabledReason: "Re-open flow not implemented in 4c.2.",
  };
}

const ACTION_COLORS: Record<PrimaryAction["variant"], { bg: string; text: string }> = {
  primary: { bg: C.bl, text: C.bg },
  danger: { bg: C.rd, text: C.bg },
  neutral: { bg: C.br, text: C.t1 },
};

export const HoldHeaderStrip: React.FC<HoldHeaderStripProps> = ({
  hold,
  defensibilityScore,
  custodianCount,
  onIssue,
  onRelease,
  busy,
  canIssue,
  canRelease,
  hasTriggerEvent = true,
  onEditTrigger,
  onClickJurisdiction,
  snapshotPoints,
  onOpenTrend,
}) => {
  const [scopeOpen, setScopeOpen] = useState(false);
  const action = primaryActionFor(
    hold.status,
    custodianCount,
    canIssue,
    canRelease,
    onIssue,
    onRelease,
    !!busy,
    hasTriggerEvent,
  );
  const colors = ACTION_COLORS[action.variant];

  return (
    <Card style={{ borderLeft: `3px solid ${C.em}` }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 14,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              gap: 6,
              marginBottom: 4,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontFamily: M,
                fontSize: 11,
                color: C.em,
                fontWeight: 600,
                letterSpacing: 0.5,
              }}
            >
              {hold.holdNumber ?? "(draft)"}
            </span>
            <StatusPill status={hold.status} />
            <JurisdictionPills
              codes={hold.jurisdictions}
              onClickCode={onClickJurisdiction}
            />
            {hold.affectsDepartedCustodians && (
              <Pill t="Departed custodians" c={C.rd} />
            )}
            {hold.privilegeFlags &&
              Object.values(hold.privilegeFlags).some(Boolean) && (
                <Pill t="Privilege flagged" c={C.am} />
              )}
          </div>
          <div
            style={{
              fontFamily: SR,
              fontSize: 22,
              color: C.t1,
              fontWeight: 400,
              lineHeight: 1.2,
            }}
          >
            {hold.title}
          </div>
          {hold.scopeDescription && (
            <div
              onClick={() => setScopeOpen((v) => !v)}
              style={{
                fontSize: 11.5,
                color: C.t2,
                marginTop: 6,
                fontFamily: F,
                lineHeight: 1.4,
                cursor: "pointer",
                ...(scopeOpen
                  ? {}
                  : {
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }),
              }}
              role="button"
              tabIndex={0}
              aria-label={scopeOpen ? "Collapse scope description" : "Expand scope description"}
            >
              {hold.scopeDescription}
            </div>
          )}
          <TriggerEventBlock
            hold={hold}
            hasTriggerEvent={hasTriggerEvent}
            canEdit={canIssue}
            onEditTrigger={onEditTrigger}
          />
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 10,
            flexShrink: 0,
          }}
        >
          {defensibilityScore !== null && (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <DefensibilityBadge score={defensibilityScore} />
              {snapshotPoints && snapshotPoints.length > 1 && (
                <Sparkline
                  points={snapshotPoints}
                  width={90}
                  height={22}
                  ariaLabel="30-day defensibility trend"
                  onClick={onOpenTrend}
                />
              )}
            </div>
          )}
          <button
            type="button"
            onClick={action.onClick}
            disabled={action.disabled}
            title={action.disabledReason}
            aria-label={action.label}
            style={{
              background: action.disabled ? C.br : colors.bg,
              color: colors.text,
              border: "none",
              padding: "8px 18px",
              borderRadius: 4,
              fontFamily: F,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 0.6,
              textTransform: "uppercase",
              cursor: action.disabled ? "not-allowed" : "pointer",
              opacity: action.disabled ? 0.55 : 1,
              transition: "opacity .15s",
            }}
          >
            {action.label}
          </button>
          {action.disabledReason && action.disabled && (
            <span
              style={{
                fontSize: 9.5,
                color: C.t4,
                fontFamily: M,
                maxWidth: 200,
                textAlign: "right",
                lineHeight: 1.3,
              }}
            >
              {action.disabledReason}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
};

/**
 * Trigger event block — shown below the title/scope line. Either a
 * yellow warning banner (no trigger recorded yet) or a tight detail
 * row (date + description, click to expand, edit button).
 */
const TriggerEventBlock: React.FC<{
  hold: HoldDetailDTO;
  hasTriggerEvent: boolean;
  canEdit: boolean;
  onEditTrigger?: () => void;
}> = ({ hold, hasTriggerEvent, canEdit, onEditTrigger }) => {
  const [expanded, setExpanded] = useState(false);

  if (!hasTriggerEvent) {
    return (
      <div
        style={{
          marginTop: 10,
          padding: "8px 10px",
          background: `${C.am}10`,
          border: `1px solid ${C.am}55`,
          borderLeft: `3px solid ${C.am}`,
          borderRadius: 4,
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
        role="status"
      >
        <span
          style={{
            fontFamily: M,
            fontSize: 10.5,
            color: C.am,
            fontWeight: 600,
            letterSpacing: 0.3,
          }}
        >
          ⚠ No trigger event recorded — required before issuance.
        </span>
        {canEdit && onEditTrigger && (
          <button
            type="button"
            onClick={onEditTrigger}
            style={{
              background: C.am,
              color: C.bg,
              border: "none",
              padding: "4px 12px",
              borderRadius: 4,
              fontFamily: F,
              fontSize: 10.5,
              fontWeight: 700,
              cursor: "pointer",
              letterSpacing: 0.4,
              textTransform: "uppercase",
            }}
          >
            Record trigger event
          </button>
        )}
      </div>
    );
  }

  const date = hold.triggeredAt
    ? new Date(hold.triggeredAt).toISOString().slice(0, 10)
    : null;
  const description = hold.triggerEventDescription ?? "";
  const truncated =
    !expanded && description.length > 100
      ? `${description.slice(0, 100)}…`
      : description;

  return (
    <div
      style={{
        marginTop: 8,
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        fontFamily: M,
        fontSize: 10.5,
        color: C.t3,
        letterSpacing: 0.3,
      }}
    >
      <span style={{ color: C.am, flexShrink: 0 }} aria-hidden="true">
        ▲
      </span>
      {date && (
        <span style={{ color: C.t4, flexShrink: 0 }}>{date} ·</span>
      )}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-label={
          expanded ? "Collapse trigger description" : "Expand trigger description"
        }
        style={{
          background: "transparent",
          border: "none",
          color: C.t2,
          fontFamily: F,
          fontSize: 11,
          padding: 0,
          textAlign: "left",
          cursor: "pointer",
          flex: 1,
          minWidth: 0,
          ...(expanded
            ? {}
            : {
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }),
        }}
      >
        {truncated}
      </button>
      {canEdit && onEditTrigger && (
        <button
          type="button"
          onClick={onEditTrigger}
          aria-label="Edit trigger event"
          style={{
            background: "transparent",
            border: `1px solid ${C.br}`,
            color: C.t2,
            padding: "2px 8px",
            borderRadius: 3,
            fontFamily: M,
            fontSize: 9.5,
            cursor: "pointer",
            letterSpacing: 0.3,
            textTransform: "uppercase",
            flexShrink: 0,
          }}
        >
          Edit
        </button>
      )}
    </div>
  );
};
