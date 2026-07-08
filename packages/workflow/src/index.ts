/**
 * @aegis/workflow — cross-module workflow primitives.
 *
 * W-A (docs/workflow-engine-assessment.md): the approval-ladder
 * engine. Definitions are data; instances attach to any host entity;
 * every transition twin-records to the chain-sealed AuditLog.
 *
 * Consumed by modules through this public surface only. UI (wizard,
 * RAG strip, builder) lands in W-D; intake wiring in W-C.
 */
export {
  defineWorkflow,
  startWorkflow,
  actOnWorkflow,
  getWorkflowInstance,
  listInstancesForEntity,
  listWorkflowDefinitions,
  listWorkflowVersions,
  revertWorkflowToVersion,
  ragFor,
  WorkflowError,
  WorkflowVersionConflictError,
  type DefineWorkflowInput,
  type WorkflowActionInput,
} from "./engine";
export {
  runAgentTask,
  listAgentTasks,
  DEFAULT_MIN_CONFIDENCE,
  type AgentTaskHandler,
  type AgentTaskFindings,
  type AgentTaskInput,
} from "./agent-tasks";
export { GOVERNANCE_LIBRARY, seedWorkflowLibrary } from "./library";
export {
  getWorkflowSlaOverview,
  type WorkflowSlaOverview,
  type StuckInstance,
  type StageDelay,
} from "./analytics";
export {
  MAX_STEPS,
  shouldSkip,
  nextActionable,
  computeRag,
  type SkipRule,
  type SkipOp,
  type StepShape,
  type TransitionShape,
  type RagEntry,
} from "./rules";
