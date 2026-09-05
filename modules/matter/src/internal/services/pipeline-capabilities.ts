/**
 * Pipeline planner (B1) — per-org capability detection.
 *
 * Composes the existing status probes (M365 connection, delegated eDiscovery,
 * processing engine) into one capability snapshot the pipeline planner (B2)
 * uses to route each matter stage to the best engine — native, Tika, or
 * Purview. Read-only; no mutation.
 */
import { getM365ConnectionStatus } from "./m365-graph-auth";
import { getDelegatedAuthStatus } from "./m365-graph-delegated-auth";
import { getProcessingStatusForOrg } from "./processing";

export interface PipelineEngines {
  /** In-process extraction — always available. */
  nativeExtract: boolean;
  /** Tika sidecar reachable (broad-format + OCR). */
  tikaExtract: boolean;
  /** Purview in-place preservation (delegated eDiscovery connected). */
  purviewPreserve: boolean;
  /** Purview processing available — note: read-back is portal-limited (PROC-7b). */
  purviewProcess: boolean;
  /** AEGIS AI review — always available (degrades to deterministic without a key). */
  aiReview: boolean;
}

export interface OrgProcessingCapabilities {
  m365: { connected: boolean; mode: string; tenantIdMasked: string | null };
  ediscovery: { connected: boolean; accountUpn: string | null; expired: boolean };
  processing: { configuredMode: string; effectiveMode: string; tikaReachable: boolean; tikaVersion: string | null };
  engines: PipelineEngines;
}

/** Pure mapping from raw connection facts to the engine availability matrix. */
export function deriveEngines(input: { ediscoveryConnected: boolean; tikaReachable: boolean }): PipelineEngines {
  return {
    nativeExtract: true,
    tikaExtract: input.tikaReachable,
    purviewPreserve: input.ediscoveryConnected,
    purviewProcess: input.ediscoveryConnected,
    aiReview: true,
  };
}

export async function getOrgProcessingCapabilities(organizationId: string): Promise<OrgProcessingCapabilities> {
  const [m365, deleg, proc] = await Promise.all([
    getM365ConnectionStatus(organizationId).catch(() => null),
    getDelegatedAuthStatus(organizationId).catch(() => null),
    getProcessingStatusForOrg(organizationId).catch(() => null),
  ]);

  const tikaReachable = !!proc?.tika?.reachable;
  const ediscoveryConnected = !!deleg?.configured && !deleg?.expired;

  return {
    m365: {
      connected: !!m365?.configured,
      mode: m365?.mode ?? "mock",
      tenantIdMasked: m365?.tenantIdMasked ?? null,
    },
    ediscovery: {
      connected: ediscoveryConnected,
      accountUpn: deleg?.accountUpn ?? null,
      expired: !!deleg?.expired,
    },
    processing: {
      configuredMode: proc?.configuredMode ?? "auto",
      effectiveMode: proc?.mode ?? "native",
      tikaReachable,
      tikaVersion: proc?.tika?.version ?? null,
    },
    engines: deriveEngines({ ediscoveryConnected, tikaReachable }),
  };
}
