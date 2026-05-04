/**
 * BulkActionToolbar — appears above the custodian list when 1+
 * rows are selected. Surfaces the three bulk actions:
 *   - Send reminder to N selected
 *   - Mark N acknowledged
 *   - Release N custodians
 *
 * Each opens its dedicated dialog. Toolbar disables actions that
 * are guaranteed to no-op (e.g. "Mark acknowledged" when every
 * selected custodian already is) so the user gets immediate
 * feedback rather than a backend rejection.
 */
import React from "react";
import { C, F, M } from "@aegis/ui";

export interface BulkActionToolbarProps {
  count: number;
  /** Subset metadata so the toolbar can grey out actions that
   *  would no-op for the current selection. */
  alreadyAckedCount: number;
  alreadyReleasedCount: number;
  canIssue: boolean;
  canRelease: boolean;
  onClearSelection: () => void;
  onSendReminder: () => void;
  onMarkAck: () => void;
  onRelease: () => void;
}

export const BulkActionToolbar: React.FC<BulkActionToolbarProps> = ({
  count,
  alreadyAckedCount,
  alreadyReleasedCount,
  canIssue,
  canRelease,
  onClearSelection,
  onSendReminder,
  onMarkAck,
  onRelease,
}) => {
  if (count === 0) return null;
  const ackable = count - alreadyAckedCount - alreadyReleasedCount;
  const releasable = count - alreadyReleasedCount;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 12px",
        background: `${C.bl}1f`,
        border: `1px solid ${C.bl}55`,
        borderRadius: 4,
        margin: "10px 0",
        fontFamily: F,
        fontSize: 11,
        flexWrap: "wrap",
      }}
      role="region"
      aria-label="Bulk actions"
    >
      <span
        style={{
          fontFamily: M,
          fontSize: 10.5,
          color: C.bl,
          fontWeight: 700,
          letterSpacing: 0.5,
          textTransform: "uppercase",
        }}
      >
        {count} selected
      </span>

      <span style={{ flex: 1 }} />

      <button
        type="button"
        onClick={onSendReminder}
        disabled={!canIssue || count === 0}
        style={actionBtn(canIssue && count > 0, C.bl)}
        title={!canIssue ? "Requires matter:legal_hold:issue" : undefined}
      >
        Send reminder to {count}
      </button>

      <button
        type="button"
        onClick={onMarkAck}
        disabled={!canIssue || ackable === 0}
        style={actionBtn(canIssue && ackable > 0, C.gn)}
        title={
          !canIssue
            ? "Requires matter:legal_hold:issue"
            : ackable === 0
              ? "Every selected custodian is already acknowledged or released."
              : undefined
        }
      >
        Mark {ackable} acknowledged
      </button>

      <button
        type="button"
        onClick={onRelease}
        disabled={!canRelease || releasable === 0}
        style={actionBtn(canRelease && releasable > 0, C.rd)}
        title={
          !canRelease
            ? "Requires matter:legal_hold:release"
            : releasable === 0
              ? "Every selected custodian is already released."
              : undefined
        }
      >
        Release {releasable}
      </button>

      <button
        type="button"
        onClick={onClearSelection}
        style={{
          background: "transparent",
          border: `1px solid ${C.br}`,
          color: C.t2,
          padding: "5px 12px",
          borderRadius: 4,
          fontFamily: F,
          fontSize: 10.5,
          cursor: "pointer",
          letterSpacing: 0.3,
        }}
      >
        Clear
      </button>
    </div>
  );
};

function actionBtn(ready: boolean, color: string): React.CSSProperties {
  return {
    background: ready ? color : C.br,
    color: ready ? C.bg : C.t3,
    border: "none",
    padding: "5px 14px",
    borderRadius: 4,
    fontFamily: F,
    fontSize: 10.5,
    fontWeight: 700,
    cursor: ready ? "pointer" : "not-allowed",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    opacity: ready ? 1 : 0.65,
  };
}
