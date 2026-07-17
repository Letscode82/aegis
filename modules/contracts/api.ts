/**
 * @aegis/contracts — Contract Lifecycle Management (CLM).
 *
 * PUBLIC SURFACE. The only file other modules and the app may import
 * from. Internal read/mutation services and UI live under `src/internal`
 * / `src/ui` and are private (module-isolation rule).
 *
 * Scope (one of the 11 locked modules — see docs/contracts-module-plan.md):
 * the system of record for contracts. Firm/counterparty = `Counterparty`,
 * signatories = `Person`, the paper = `Document`, commitments = the SHARED
 * `Obligation` entity (sourceType = CONTRACT), approval flow = the reused
 * workflow ladder. Never a `ContractParty` table.
 *
 * CTR-1 ships the repository (reads), obligation management, and clause
 * persistence — all chain-sealed. CTR-2 wires the intake CLM ladder to
 * spawn a Contract and runs the shared contract agent to extract clauses
 * + obligations, feeding Company Brain.
 */
export {
  getContractsOverview,
  getContractDetail,
  type ContractsOverview,
  type ContractSummary,
  type ContractDetail,
  type ContractClauseDTO,
  type ContractObligationDTO,
} from "./src/internal/reads";

export {
  createContract,
  updateContractStatus,
  addClause,
  createObligation,
  updateObligationStatus,
  completeObligation,
  type CreateContractInput,
  type CreateClauseInput,
  type CreateObligationInput,
} from "./src/internal/service";

export {
  extractContractKnowledge,
  type ExtractedKnowledge,
  type ExtractedClause,
  type ExtractedObligation,
} from "./src/internal/extract";

export {
  spawnContractFromIntake,
  extractAndPersistContractKnowledge,
  type SpawnContractFromIntakeInput,
  type SpawnContractResult,
  type ContractExtractionResult,
} from "./src/internal/intake-spawn";
