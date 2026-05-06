/**
 * DataSourceRow — single data-source row with inline preservation
 * actions. Visible inside the expanded custodian row of
 * CustodiansPanel.
 *
 * Two stage transitions live here:
 *   1. Mark preservation APPLIED   — sets preservationAppliedAt,
 *                                     fires DATA_SOURCE_PRESERVATION_APPLIED
 *   2. Mark preservation CONFIRMED — sets preservationConfirmedAt,
 *                                     fires DATA_SOURCE_PRESERVATION_CONFIRMED
 *
 * Stage 2 is gated on stage 1 — you can't confirm what hasn't been
 * applied. The button states reflect the gate explicitly so the
 * user understands the workflow rather than getting silent no-ops.
 */
import React from "react";
import { C, F, M } from "@aegis/ui";
import type { HoldDataSourceDTO } from "./types";
import { DataSourceStatusBadge } from "./DataSourceStatusBadge";

export const TYPE_ICON: Record<string, string> = {
  EMAIL_MAILBOX: "✉",
  ARCHIVED_MAILBOX: "📦",
  DEPARTED_USER_MAILBOX: "👤",
  ONEDRIVE: "💾",
  SHAREPOINT_SITE: "🗂",
  TEAMS_CHANNEL: "#",
  TEAMS_DM: "💬",
  TEAMS_PRIVATE_CHANNEL: "🔒",
  SLACK_CHANNEL: "#",
  SLACK_DM: "💬",
  GOOGLE_DRIVE: "💾",
  GOOGLE_CHAT: "💬",
  EPHEMERAL_CHAT_AUTO_DELETE: "⏱",
  LOCAL_DEVICE: "💻",
  PHYSICAL_FILES: "📁",
  THIRD_PARTY_SAAS: "🔗",
  OTHER: "?",
};

export interface DataSourceRowProps {
  source: HoldDataSourceDTO;
  canMutate: boolean;
  busy: boolean;
  onApply: (dsId: string) => void;
  onConfirm: (dsId: string) => void;
  /** Sub-PR 4d.0 — context the new lifecycle badge needs to fire
   *  the per-source `Retry` endpoint. When omitted, the badge
   *  renders read-only (no retry button) so legacy callers don't
   *  break. */
  matterId?: string;
  holdId?: string;
  personId?: string;
  /** Refresh hook called after a successful retry so the parent
   *  re-fetches its custodian list. */
  onAfterRetry?: () => void;
}

export const DataSourceRow: React.FC<DataSourceRowProps> = ({
  source: d,
  canMutate,
  busy,
  onApply,
  onConfirm,
  matterId,
  holdId,
  personId,
  onAfterRetry,
}) => {
  const applied = !!d.preservationAppliedAt;
  const confirmed = !!d.preservationConfirmedAt;
  const conflict = d.retentionPolicyConflict;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "20px 1.4fr 200px 140px 200px",
        gap: 8,
        alignItems: "center",
        padding: "5px 6px",
        fontSize: 10.5,
        fontFamily: F,
        borderBottom: `1px solid ${C.br}22`,
      }}
    >
      <span style={{ fontFamily: M, color: C.t3 }} aria-hidden="true">
        {TYPE_ICON[d.type] ?? "•"}
      </span>
      <span
        style={{
          color: C.t1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={d.displayLabel}
      >
        {d.displayLabel}
      </span>
      <span style={{ fontFamily: M, fontSize: 9.5, color: C.t3 }}>
        {d.type} · {d.preservationAction}
      </span>
      <span
        style={{
          fontFamily: M,
          fontSize: 9.5,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          color: C.t3,
        }}
      >
        {matterId && holdId && personId ? (
          <DataSourceStatusBadge
            matterId={matterId}
            holdId={holdId}
            personId={personId}
            dataSourceId={d.id}
            status={d.preservationStatus}
            preservationAppliedAt={d.preservationAppliedAt}
            preservationConfirmedAt={d.preservationConfirmedAt}
            preservationFailureReason={d.preservationFailureReason ?? null}
            onAfterRetry={onAfterRetry}
          />
        ) : (
          // Back-compat — legacy text status when context is missing.
          <span style={{ color: confirmed ? C.gn : applied ? C.bl : C.am }}>
            {confirmed
              ? "✓ confirmed"
              : applied
                ? "● applied"
                : "○ pending"}
          </span>
        )}
        {conflict && (
          <span style={{ color: C.am }} aria-label="Retention policy conflict">
            ⚠ conflict
          </span>
        )}
      </span>
      <span
        style={{
          textAlign: "right",
          display: "inline-flex",
          gap: 4,
          justifyContent: "flex-end",
        }}
      >
        {canMutate && !applied && (
          <button
            type="button"
            onClick={() => onApply(d.id)}
            disabled={busy}
            style={miniBtn(C.bl, busy)}
            aria-label={`Mark preservation applied for ${d.displayLabel}`}
          >
            Mark applied
          </button>
        )}
        {canMutate && applied && !confirmed && (
          <button
            type="button"
            onClick={() => onConfirm(d.id)}
            disabled={busy}
            style={miniBtn(C.gn, busy)}
            aria-label={`Mark preservation confirmed for ${d.displayLabel}`}
          >
            Mark confirmed
          </button>
        )}
      </span>
    </div>
  );
};

function miniBtn(color: string, busy: boolean): React.CSSProperties {
  return {
    background: "transparent",
    border: `1px solid ${color}55`,
    color,
    padding: "3px 9px",
    borderRadius: 4,
    fontSize: 10,
    fontFamily: F,
    fontWeight: 500,
    cursor: busy ? "wait" : "pointer",
    opacity: busy ? 0.5 : 1,
    letterSpacing: 0.3,
  };
}
