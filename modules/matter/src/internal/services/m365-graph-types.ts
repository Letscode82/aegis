/**
 * Subset of Graph response types we actually consume. We don't import
 * @microsoft/microsoft-graph-types directly into the implementation
 * because the SDK's runtime client returns plain objects matched to
 * an `unknown` cast — pulling in the type package keeps the type
 * surface explicit, but at the boundary we trust only the shapes
 * documented here.
 */
import type * as MicrosoftGraph from "@microsoft/microsoft-graph-types";

export type GraphUser = MicrosoftGraph.User;
export type GraphGroup = MicrosoftGraph.Group;
export type GraphSite = MicrosoftGraph.Site;
export type GraphTeam = MicrosoftGraph.Team;
export type GraphChannel = MicrosoftGraph.Channel;
export type GraphDrive = MicrosoftGraph.Drive;
export type GraphChat = MicrosoftGraph.Chat;
export type GraphMailFolder = MicrosoftGraph.MailFolder;

/**
 * eDiscovery resource types — the `microsoft.graph.security`
 * namespace. The SDK 3.x doesn't ship typed accessors for these;
 * we describe the shape we rely on.
 */
export interface GraphEdiscoveryCase {
  id: string;
  displayName?: string | null;
  description?: string | null;
  status?:
    | "active"
    | "pendingDelete"
    | "closing"
    | "closed"
    | "closedWithError"
    | string;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
}

export interface GraphEdiscoveryCustodian {
  id: string;
  email?: string | null;
  displayName?: string | null;
  status?:
    | "active"
    | "released"
    | "applied"
    | "applying"
    | "partial"
    | "failed"
    | string;
  holdStatus?: "applied" | "applying" | "partial" | "notApplied" | string;
  createdDateTime?: string;
}

export interface GraphEdiscoveryUserSource {
  id: string;
  email?: string | null;
  includedSources?: ("mailbox" | "site")[];
  createdDateTime?: string;
}

export interface GraphEdiscoverySiteSource {
  id: string;
  site?: { webUrl?: string };
  createdDateTime?: string;
}

export interface GraphEdiscoveryHoldPolicy {
  id: string;
  displayName?: string;
  status?: "applied" | "applying" | "partial" | "removed" | string;
}

/**
 * Connection-mode summary returned by `getM365ConnectionStatus`.
 * Surfaced on /admin/m365 and /api/_health/m365.
 */
export interface M365ConnectionStatus {
  organizationId: string;
  /** "real" = M365GraphClient backing; "mock" = MockM365Client fallback. */
  mode: "real" | "mock";
  /** True iff a credential resolves (env or per-org row). */
  configured: boolean;
  /** Tenant id, redacted for display. */
  tenantIdMasked: string | null;
  /** Last time `verifyM365Credentials` round-tripped successfully. */
  lastVerifiedAt: string | null;
  /** Last error (truncated) from a verify or live call, if any. */
  lastErrorMessage: string | null;
}

export interface M365VerifyResult {
  ok: boolean;
  /** Round-trip duration in milliseconds. */
  durationMs: number;
  /** Tenant id observed via Graph during verification. */
  tenantId: string | null;
  /** Error class + message when ok=false. */
  error: { name: string; message: string } | null;
}
