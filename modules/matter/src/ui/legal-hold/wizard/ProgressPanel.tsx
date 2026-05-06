/**
 * ProgressPanel — live issuance progress (sub-PR 4d.0).
 *
 * Skeleton shipped in Commit 4. Commit 5 wires the SSE consumer +
 * tree-style step rendering with success / failure badges. For now
 * the panel renders a brief placeholder with a Close button so the
 * shell's state-machine handoff (issue → progress → close) can be
 * exercised end-to-end.
 */
import React from "react";
import { SH, C, F } from "@aegis/ui";

export interface ProgressPanelProps {
  matterId: string;
  holdId: string;
  noticeTemplateId: string;
  recipientCustodianPersonIds: string[];
  /** Called when the panel finishes — `success` indicates whether
   *  every step succeeded. The shell uses this to fire the right
   *  toast and route to the workspace. */
  onClose: (holdId: string, success: boolean) => void;
}

export const ProgressPanel: React.FC<ProgressPanelProps> = ({
  matterId,
  holdId,
  onClose,
}) => {
  return (
    <div
      style={{
        padding: 24,
        maxWidth: 700,
        margin: "0 auto",
        display: "grid",
        gap: 14,
      }}
    >
      <SH icon="⏱" title="Issuing hold…" sub={`Hold ${holdId}`} />
      <div
        style={{
          padding: 14,
          background: C.s1,
          border: `1px solid ${C.brL}`,
          borderRadius: 4,
          fontSize: 12,
          color: C.t2,
          lineHeight: 1.6,
        }}
      >
        Live progress streaming via SSE will land in Commit 5. The
        panel's success / failure handoff and the wizard's "View
        Hold" CTA are scaffolded now so the next commit can drop in
        the EventSource consumer without further state-machine
        wiring.
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={() => onClose(holdId, true)}
          style={{
            background: C.bl,
            border: "none",
            color: C.bg,
            padding: "8px 16px",
            fontFamily: F,
            fontWeight: 700,
            fontSize: 11,
            borderRadius: 4,
            cursor: "pointer",
            textTransform: "uppercase",
          }}
        >
          View Hold
        </button>
      </div>
      <div style={{ fontSize: 10, color: C.t3, fontFamily: F }}>
        Wizard route: /matter/{matterId}/new-hold-wizard
      </div>
    </div>
  );
};
