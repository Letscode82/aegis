/**
 * @aegis/review/ui — the shared reviewer UI. Consuming modules (matter, privacy)
 * mount ReviewStep + ProduceStep against their own review-set REST namespace
 * (`apiBase`) and supply their own collection step.
 */
export { ReviewStep, ProduceStep, routeColor, routeLabel, type ReviewStepProps, type ProduceStepProps } from "./ReviewSteps";
export { BatchPanel, type BatchPanelProps } from "./BatchPanel";
