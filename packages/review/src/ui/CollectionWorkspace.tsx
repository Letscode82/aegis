/**
 * CollectionWorkspace — the unified, cross-source Collect & Review stage
 * workspace for one collection (ReviewSet), at /review/collections/[id]. The
 * shared destination the eDiscovery hub opens, whatever the source (legal hold,
 * DSAR, investigation). Post-collection stages: Cull → Review → Batches →
 * Produce. Collection itself stays module-specific (hold custodians / DSAR
 * subject) and feeds this workspace upstream.
 */
import React, { useCallback, useEffect, useState } from "react";
import { C, F, M, SR } from "@aegis/ui";
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
  const stages: Array<{ key: Stage; n: number; label: string }> = [
    { key: "eca", n: 1, label: "ECA" }, { key: "cull", n: 2, label: "Cull" }, { key: "review", n: 3, label: "Review" }, { key: "copilot", n: 4, label: "Copilot" }, { key: "validate", n: 5, label: "Validate" }, { key: "batches", n: 6, label: "Batches" }, { key: "produce", n: 7, label: "Produce" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.t1, fontFamily: F, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 28px", borderBottom: `1px solid ${C.br}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, minWidth: 0 }}>
          <button onClick={onBack} style={{ padding: "8px 12px", background: "transparent", color: C.t3, border: `1px solid ${C.t3}`, borderRadius: 8, fontFamily: F, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>← eDiscovery</button>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: M, fontSize: 10.5, letterSpacing: 1.4, color: C.cy, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 8 }}>
              Collection{src && <span style={{ fontSize: 9.5, fontWeight: 700, color: src.col, border: `1px solid ${src.col}`, borderRadius: 4, padding: "1px 6px" }}>{src.label}</span>}
            </div>
            <div style={{ fontFamily: SR, fontSize: 22, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 560 }}>{summary?.name ?? "Loading…"}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {stages.map((s, i) => {
            const active = stage === s.key;
            return (
              <React.Fragment key={s.key}>
                {i > 0 && <div style={{ width: 20, height: 1, background: C.brL }} />}
                <button onClick={() => setStage(s.key)} style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 13px", borderRadius: 9, cursor: "pointer", background: active ? "rgba(107,142,196,.12)" : "transparent", border: `1px solid ${active ? C.bl : C.br}` }}>
                  <div style={{ width: 18, height: 18, borderRadius: "50%", background: active ? C.bl : "transparent", color: active ? C.bg : C.t4, border: active ? "none" : `1.5px solid ${C.t4}`, fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{s.n}</div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: active ? C.bl : C.t3 }}>{s.label}</span>
                </button>
              </React.Fragment>
            );
          })}
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
