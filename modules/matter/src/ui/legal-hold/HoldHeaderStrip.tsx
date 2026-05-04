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
import { Card, Pill, C, F, M, SR } from "@aegis/ui";
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
): PrimaryAction {
  if (status === "DRAFT") {
    return {
      label: busy ? "Issuing…" : "Issue hold",
      variant: "primary",
      onClick: onIssue,
      disabled: busy || custodianCount === 0 || !canIssue,
      disabledReason:
        custodianCount === 0
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
            <JurisdictionPills codes={hold.jurisdictions} />
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
          {hold.triggerEventDescription && (
            <div
              style={{
                fontSize: 10,
                color: C.t3,
                fontFamily: M,
                marginTop: 6,
                letterSpacing: 0.3,
              }}
            >
              ▲ {hold.triggerEventDescription}
            </div>
          )}
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
            <DefensibilityBadge score={defensibilityScore} />
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
