/**
 * @aegis/review/ui — the shared reviewer UI. Consuming modules (matter, privacy)
 * mount ReviewStep + ProduceStep against their own review-set REST namespace
 * (`apiBase`) and supply their own collection step.
 */
export { ReviewStep, ProduceStep, routeColor, routeLabel, type ReviewStepProps, type ProduceStepProps } from "./ReviewSteps";
export { BatchPanel, type BatchPanelProps } from "./BatchPanel";
export { CullPanel, type CullPanelProps } from "./CullPanel";
export { ValidationPanel, type ValidationPanelProps } from "./ValidationPanel";
export { EcaPanel, type EcaPanelProps } from "./EcaPanel";
export { CopilotPanel, type CopilotPanelProps } from "./CopilotPanel";
export { DossierPanel, type DossierPanelProps } from "./DossierPanel";
export { KnowledgeGraphPanel, type KnowledgeGraphPanelProps } from "./KnowledgeGraphPanel";
export { CollectionWorkspace, type CollectionWorkspaceProps } from "./CollectionWorkspace";
