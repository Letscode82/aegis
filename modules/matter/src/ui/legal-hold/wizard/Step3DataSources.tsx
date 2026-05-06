/**
 * Step 3 — Data Sources (sub-PR 4d.0).
 *
 * Placeholder shipped in Commit 4. The full live-discovery + per-
 * custodian SharePoint picker lands in Commit 5.
 */
import React, { useEffect } from "react";
import { SH, C } from "@aegis/ui";
import type { WizardStepProps } from "./types";

export const Step3DataSources: React.FC<WizardStepProps> = ({
  state,
  onValid,
}) => {
  useEffect(() => {
    // Provisional gate: any non-empty selection (including
    // skip-auto-discovery) lets counsel proceed. Commit 5 wires real
    // discovery + tally validation.
    onValid(state.skipAutoDiscovery || state.selectedCustodians.length > 0);
  }, [state.skipAutoDiscovery, state.selectedCustodians.length, onValid]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <SH icon="🔍" title="Data sources" sub="What data should we preserve?" />
      <div style={{ color: C.t3, fontSize: 12 }}>
        {state.selectedCustodians.length} custodian
        {state.selectedCustodians.length === 1 ? "" : "s"} ready for live
        M365 discovery. The discovery flow + SharePoint picker lands
        in the next commit; for now the wizard accepts an empty
        selection so the navigation gate is exercisable end-to-end.
      </div>
    </div>
  );
};
