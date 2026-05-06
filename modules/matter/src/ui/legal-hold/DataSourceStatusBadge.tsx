/**
 * DataSourceStatusBadge — colored lifecycle badge (sub-PR 4d.0).
 *
 * Surfaces `CustodianDataSource.preservationStatus` in the
 * workspace's per-source rows. Five colors map 1:1 to the schema
 * enum:
 *
 *   NOT_REQUESTED → gray   (Not requested)
 *   PENDING       → amber  (Pending…)
 *   ON_HOLD       → green  (On Hold)
 *   ERROR         → red    (Error · Retry)
 *   RELEASED      → gray   (Released)
 *
 * For ERROR state, the badge renders an inline `Retry` button that
 * fires the new
 * `POST /api/matter/[id]/holds/[holdId]/custodians/[personId]/data-sources/[dsId]/retry`
 * endpoint, then calls back to refresh the parent row.
 *
 * Back-compat: if `status` is undefined (older payloads), we derive
 * a best-guess from the timestamps so the workspace renders sane
 * during the rollout window.
 */
import React, { useState } from "react";
import { C, F, M } from "@aegis/ui";

export type DataSourceLifecycleStatus =
  | "NOT_REQUESTED"
  | "PENDING"
  | "ON_HOLD"
  | "ERROR"
  | "RELEASED";

export interface DataSourceStatusBadgeProps {
  matterId: string;
  holdId: string;
  personId: string;
  dataSourceId: string;
  status?: DataSourceLifecycleStatus;
  /** Used as a fallback when `status` is undefined. */
  preservationAppliedAt?: string | null;
  preservationConfirmedAt?: string | null;
  preservationFailureReason?: string | null;
  /** Called after a successful retry so the parent reloads. */
  onAfterRetry?: () => void;
}

function deriveStatus(
  appliedAt?: string | null,
  confirmedAt?: string | null,
  failureReason?: string | null,
): DataSourceLifecycleStatus {
  if (failureReason) return "ERROR";
  if (confirmedAt) return "ON_HOLD";
  if (appliedAt) return "PENDING";
  return "NOT_REQUESTED";
}

const PALETTE: Record<
  DataSourceLifecycleStatus,
  { color: string; bg: string; label: string }
> = {
  NOT_REQUESTED: { color: C.t3, bg: C.s1, label: "Not requested" },
  PENDING: { color: C.am, bg: C.amG, label: "Pending…" },
  ON_HOLD: { color: C.gn, bg: C.gnG, label: "On Hold" },
  ERROR: { color: C.rd, bg: C.rdG, label: "Error" },
  RELEASED: { color: C.t3, bg: C.s1, label: "Released" },
};

export const DataSourceStatusBadge: React.FC<DataSourceStatusBadgeProps> = ({
  matterId,
  holdId,
  personId,
  dataSourceId,
  status,
  preservationAppliedAt,
  preservationConfirmedAt,
  preservationFailureReason,
  onAfterRetry,
}) => {
  const [retrying, setRetrying] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const effective: DataSourceLifecycleStatus =
    status ??
    deriveStatus(
      preservationAppliedAt,
      preservationConfirmedAt,
      preservationFailureReason,
    );
  const palette = PALETTE[effective];

  async function retry() {
    setRetrying(true);
    setLocalError(null);
    try {
      const r = await fetch(
        `/api/matter/${matterId}/holds/${holdId}/custodians/${personId}/data-sources/${dataSourceId}/retry`,
        { method: "POST" },
      );
      const body = (await r.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: { code?: string; message?: string };
      };
      if (!r.ok || body.ok === false) {
        setLocalError(body.error?.message ?? `HTTP ${r.status}`);
        return;
      }
      onAfterRetry?.();
    } catch (e) {
      setLocalError(String((e as Error).message ?? e));
    } finally {
      setRetrying(false);
    }
  }

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "2px 8px",
        borderRadius: 999,
        background: palette.bg,
        color: palette.color,
        fontFamily: M,
        fontSize: 9.5,
        letterSpacing: 0.4,
        textTransform: "uppercase",
        fontWeight: 600,
      }}
    >
      <span aria-hidden style={{ fontSize: 8 }}>
        ●
      </span>
      <span>{palette.label}</span>
      {effective === "ERROR" && (
        <button
          type="button"
          onClick={() => void retry()}
          disabled={retrying}
          aria-label={`Retry preservation for data source ${dataSourceId}`}
          style={{
            background: "transparent",
            border: `1px solid ${C.rd}55`,
            color: C.rd,
            padding: "1px 6px",
            borderRadius: 3,
            fontFamily: F,
            fontSize: 9,
            fontWeight: 700,
            cursor: retrying ? "wait" : "pointer",
            textTransform: "uppercase",
            letterSpacing: 0.4,
            marginLeft: 4,
          }}
        >
          {retrying ? "…" : "Retry"}
        </button>
      )}
      {localError && (
        <span style={{ color: C.rd, fontSize: 9, fontFamily: F, marginLeft: 4 }}>
          {localError.slice(0, 60)}
        </span>
      )}
    </span>
  );
};
