/**
 * CollectionWorkspace — the unified, cross-source Collect & Review stage
 * workspace for one collection (ReviewSet), at /review/collections/[id]. The
 * shared destination the eDiscovery hub opens, whatever the source (legal hold,
 * DSAR, investigation). Post-collection stages: Cull → Review → Batches →
 * Produce. Collection itself stays module-specific (hold custodians / DSAR
 * subject) and feeds this workspace upstream.
 */
import React, { useCallback, useEffect, useState } from "react";
import { C, F, M, SR, Stepper } from "@aegis/ui";
import { ReviewStep, ProduceStep } from "./ReviewSteps";
import { BatchPanel } from "./BatchPanel";
import { CullPanel } from "./CullPanel";
import { ValidationPanel } from "./ValidationPanel";
import { EcaPanel } from "./EcaPanel";
import { CopilotPanel } from "./CopilotPanel";

export interface CollectionWorkspaceProps {
  /** Review-set REST base, e.g. "/api/review/sets". */
  apiBase: string;
  collectionId: string;
  onBack: () => void;
}

type Stage = "eca" | "cull" | "review" | "copilot" | "validate" | "batches" | "produce";
const SOURCE: Record<string, { label: string; col: string }> = {
  LEGAL_HOLD: { label: "Legal Hold", col: C.bl }, DSAR: { label: "DSAR", col: C.tl },
  INVESTIGATION: { label: "Investigation", col: C.pp }, ADHOC: { label: "Ad-hoc", col: C.am },
};

function useReviewPerms() {
  const [canMutate, setCanMutate] = useState(false);
  useEffect(() => {
    fetch("/api/auth/current-user", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        const perms: string[] = d?.user?.permissions || [];
        setCanMutate(perms.includes?.("matter:legal_hold:issue") || perms.includes?.("privacy:dsar:fulfill"));
      })
      .catch(() => {});
  }, []);
  return canMutate;
}

export const CollectionWorkspace: React.FC<CollectionWorkspaceProps> = ({ apiBase, collectionId, onBack }) => {
  const canMutate = useReviewPerms();
  const [summary, setSummary] = useState<{ name: string; origin: string; status: string } | null>(null);
  const [stage, setStage] = useState<Stage>("review");

  const load = useCallback(() => {
    fetch(`${apiBase}/${collectionId}`).then((r) => r.json()).then((d) => { if (d.ok) setSummary({ name: d.summary.name, origin: d.summary.origin, status: d.summary.status }); }).catch(() => {});
  }, [apiBase, collectionId]);
  useEffect(() => { load(); }, [load]);

  const src = summary ? (SOURCE[summary.origin] || { label: summary.origin, col: C.t3 }) : null;
  const stages: Array<{ key: Stage; label: string }> = [
    { key: "eca", label: "ECA" }, { key: "cull", label: "Cull" }, { key: "review", label: "Review" }, { key: "copilot", label: "Copilot" }, { key: "validate", label: "Validate" }, { key: "batches", label: "Batches" }, { key: "produce", label: "Produce" },
  ];
  const currentStep = stages.findIndex((s) => s.key === stage) + 1;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.t1, fontFamily: F, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 28px", borderBottom: `1px solid ${C.br}`, minWidth: 0 }}>
        <button onClick={onBack} style={{ padding: "8px 12px", background: "transparent", color: C.t3, border: `1px solid ${C.t3}`, borderRadius: 8, fontFamily: F, fontSize: 12, fontWeight: 600, cursor: "pointer", flex: "none" }}>← eDiscovery</button>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: M, fontSize: 10.5, letterSpacing: 1.4, color: C.cy, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 8 }}>
            Collection{src && <span style={{ fontSize: 9.5, fontWeight: 700, color: src.col, border: `1px solid ${src.col}`, borderRadius: 4, padding: "1px 6px" }}>{src.label}</span>}
          </div>
          <div style={{ fontFamily: SR, fontSize: 22, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 560 }}>{summary?.name ?? "Loading…"}</div>
        </div>
      </div>
      <div style={{ padding: "14px 28px", borderBottom: `1px solid ${C.br}`, overflowX: "auto" }}>
        <div style={{ minWidth: 720 }}>
          <Stepper
            steps={stages.map((s) => ({ label: s.label }))}
            current={currentStep}
            furthest={stages.length}
            onStepClick={(n) => { const target = stages[n - 1]; if (target) setStage(target.key); }}
            compact
          />
        </div>
      </div>

      {stage === "eca" && <EcaPanel apiBase={apiBase} reviewSetId={collectionId} />}
      {stage === "cull" && <CullPanel apiBase={apiBase} reviewSetId={collectionId} canMutate={canMutate} />}
      {stage === "review" && <ReviewStep apiBase={apiBase} reviewSetId={collectionId} canMutate={canMutate} onProduce={() => setStage("produce")} onReload={load} />}
      {stage === "copilot" && <CopilotPanel apiBase={apiBase} reviewSetId={collectionId} canMutate={canMutate} />}
      {stage === "validate" && <ValidationPanel apiBase={apiBase} reviewSetId={collectionId} canMutate={canMutate} />}
      {stage === "batches" && <BatchPanel apiBase={apiBase} reviewSetId={collectionId} canMutate={canMutate} />}
      {stage === "produce" && <ProduceStep apiBase={apiBase} reviewSetId={collectionId} canMutate={canMutate} onReload={load} />}
    </div>
  );
};
