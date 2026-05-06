/**
 * Step 5 — Review & Issue (sub-PR 4d.0).
 *
 * Placeholder shipped in Commit 4. The full review summary +
 * defensibility-preview render lands in Commit 5.
 */
import React from "react";
import { SH, C, F } from "@aegis/ui";
import type { WizardStepProps } from "./types";

export interface Step5ReviewIssueProps extends WizardStepProps {
  /** Called after the wizard creates / promotes the hold and is
   *  ready to enter the ProgressPanel for live issuance. */
  onIssue: (holdId: string) => void;
}

export const Step5ReviewIssue: React.FC<Step5ReviewIssueProps> = ({
  state,
  onIssue,
}) => {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <SH icon="🚀" title="Review & issue" sub="Ready to send?" />
      <div
        style={{
          padding: 12,
          background: C.s1,
          border: `1px solid ${C.brL}`,
          borderRadius: 4,
          fontSize: 12,
          lineHeight: 1.6,
        }}
      >
        <strong>{state.holdName || "(unnamed hold)"}</strong>
        <br />
        Jurisdictions: {state.jurisdictions.join(", ") || "—"}
        <br />
        Custodians: {state.selectedCustodians.length}
        <br />
        Recipients: {state.noticeRecipients.length}
        <br />
        <em style={{ color: C.t3 }}>
          Full summary + defensibility preview lands in the next
          commit. For now the Issue button is wired to the
          existing draft-hold create flow so the ProgressPanel
          handoff path is exercisable.
        </em>
      </div>
      <button
        type="button"
        onClick={() => {
          // Placeholder issue path — Commit 5 wires the actual
          // create-hold + transition + ProgressPanel handoff. For
          // now we surface the draftHoldId if one was already
          // created (resumed flow).
          if (state.draftHoldId) onIssue(state.draftHoldId);
        }}
        disabled={!state.draftHoldId}
        style={{
          background: state.draftHoldId ? C.bl : C.brL,
          border: "none",
          color: state.draftHoldId ? C.bg : C.t3,
          padding: "10px 24px",
          fontFamily: F,
          fontWeight: 700,
          fontSize: 13,
          borderRadius: 4,
          cursor: state.draftHoldId ? "pointer" : "not-allowed",
          letterSpacing: 0.5,
          textTransform: "uppercase",
          justifySelf: "end",
        }}
      >
        Issue Hold
      </button>
    </div>
  );
};
