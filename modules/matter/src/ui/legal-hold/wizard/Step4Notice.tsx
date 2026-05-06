/**
 * Step 4 — Notice (sub-PR 4d.0).
 *
 * Placeholder shipped in Commit 4. The template picker + preview
 * pane lands in Commit 5.
 */
import React, { useEffect } from "react";
import { SH, C } from "@aegis/ui";
import type { WizardStepProps } from "./types";

export const Step4Notice: React.FC<WizardStepProps> = ({
  state,
  update,
  onValid,
}) => {
  // Default the recipients to every selected custodian so the
  // shell's gate flips green automatically once Step 2 is filled.
  useEffect(() => {
    if (
      state.noticeRecipients.length === 0 &&
      state.selectedCustodians.length > 0
    ) {
      update({
        noticeRecipients: state.selectedCustodians.map((c) => c.id),
      });
    }
  }, [state.selectedCustodians, state.noticeRecipients.length, update]);

  useEffect(() => {
    onValid(state.noticeRecipients.length > 0);
  }, [state.noticeRecipients, onValid]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <SH icon="✉" title="Notice" sub="Tell custodians about the hold." />
      <div style={{ color: C.t3, fontSize: 12 }}>
        Default English template will be auto-selected when this step
        is fully implemented in the next commit. Recipients default to
        all {state.selectedCustodians.length} custodian
        {state.selectedCustodians.length === 1 ? "" : "s"} from Step 2.
      </div>
    </div>
  );
};
