/**
 * Microsoft 365 integration interface (sunset 4c).
 *
 * The interface ships in 4a so the caller surfaces (Matter create
 * form, document attachment panel) can be wired against a stable
 * shape. The real Graph API implementation lands in 4c — pure
 * implementation swap, no signature change.
 *
 * Sub-PR 4b extends the interface with legal-hold methods
 * (`discoverCustodians`, `applyPreservation`, `releasePreservation`,
 * `preserveDepartedMailbox`, `enumerateDataSourcesForUser`). The
 * 4b mock continues to return deterministic seeded data; 4c
 * replaces every method with Graph API calls.
 *
 * See CLAUDE.md "Documented exceptions" — this interface is mocked
 * in 4a with sunset = 4c.
 */
import type {
  DataSourceType,
  Matter,
  PreservationAction,
} from "@aegis/db";

export interface M365FolderRef {
  /** SharePoint site id, e.g. "tenant.sharepoint.com,siteId,webId". */
  siteId: string;
  /** Drive (document library) id. */
  driveId: string;
  /** Root folder id of the matter's document library. */
  folderId: string;
  /** Web URL for direct browser navigation. */
  webUrl: string;
}

export interface M365TeamsRef {
  channelId: string;
  channelUrl: string;
}

export interface M365MailRef {
  /** Mailbox folder id used to store matter-related correspondence. */
  folderId: string;
  /** Inbox-rule id auto-routing emails tagged with the matter number. */
  inboxRuleId: string | null;
}

export interface MatterM365Bindings {
  sharepoint: M365FolderRef | null;
  teams: M365TeamsRef | null;
  mail: M365MailRef | null;
  /** Provisioned-at timestamp; null if bindings have not been set up. */
  provisionedAt: string | null;
}

// ── Legal Hold extensions (sub-PR 4b — sunset 4c) ────────────────

export interface HoldScopeQuery {
  /** Free-text or structured scope used to discover candidate custodians. */
  description: string;
  /** Optional matter id for context-aware discovery. */
  matterId?: string;
  /** Optional jurisdiction codes to bias discovery (Schrems II, etc.). */
  jurisdictions?: string[];
}

export interface CandidateCustodian {
  /** Stable identifier from the directory (Entra/AD); maps to Person.externalRef. */
  externalIdentifier: string;
  name: string;
  email: string;
  department?: string;
  title?: string;
  /** 4d will return real model confidence; 4b returns a fixed value. */
  matchConfidence: number;
  matchRationale: string;
}

export interface EnumeratedDataSource {
  type: DataSourceType;
  /** Native ID in the source system (mailbox, drive, channel, …). */
  externalIdentifier: string;
  displayLabel: string;
  /** Native retention policy at discovery time; flagged when ephemeral. */
  retentionPolicy?: string;
  /** True when retention auto-deletes faster than the hold cadence allows. */
  retentionPolicyConflict: boolean;
}

export interface ApplyPreservationInput {
  custodianExternalIdentifier: string;
  dataSourceExternalIdentifier: string;
  type: DataSourceType;
  action: PreservationAction;
  reasonCode: string;
}

export interface ReleasePreservationInput {
  custodianExternalIdentifier: string;
  dataSourceExternalIdentifier: string;
  type: DataSourceType;
}

export interface PreserveDepartedInput {
  personExternalIdentifier: string;
  reasonCode: string;
  /** When the mailbox was disabled (or null if still active). */
  separationAt: string | null;
}

export interface PreservationResult {
  ok: boolean;
  appliedAt: string;
  /** Native id of the preservation order in the upstream system, if any. */
  upstreamReferenceId: string | null;
  failureReason: string | null;
}

export interface M365Client {
  /**
   * Provision SharePoint folder structure, Teams channel, and inbox rule
   * for a matter. Idempotent — repeat calls return the existing bindings.
   */
  provisionMatterBindings(matter: Matter): Promise<MatterM365Bindings>;

  /** Tear down provisioned resources when a matter is archived. */
  releaseMatterBindings(matter: Matter): Promise<void>;

  /** Read current bindings for a matter without provisioning. */
  getMatterBindings(matterId: string): Promise<MatterM365Bindings>;

  /** 4b — sunset 4c. Find candidate custodians for a hold scope query. */
  discoverCustodians(scopeQuery: HoldScopeQuery): Promise<CandidateCustodian[]>;

  /** 4b — sunset 4c. Apply in-place preservation to one custodian's data source. */
  applyPreservation(input: ApplyPreservationInput): Promise<PreservationResult>;

  /** 4b — sunset 4c. Release in-place preservation. */
  releasePreservation(input: ReleasePreservationInput): Promise<void>;

  /** 4b — sunset 4c. Preserve a departed user's mailbox + OneDrive (D9 prep). */
  preserveDepartedMailbox(input: PreserveDepartedInput): Promise<PreservationResult>;

  /** 4b — sunset 4c. Map an org user to their available data sources (typed). */
  enumerateDataSourcesForUser(externalIdentifier: string): Promise<EnumeratedDataSource[]>;
}

/**
 * 4a mock — returns a deterministic placeholder shape so the matter
 * detail UI can render the "M365 — coming in 4c" panel with realistic
 * field placement. The real client (4c) implements Graph API calls.
 */
export class MockM365Client implements M365Client {
  async provisionMatterBindings(matter: Matter): Promise<MatterM365Bindings> {
    return {
      sharepoint: {
        siteId: `mock-site-${matter.id}`,
        driveId: `mock-drive-${matter.id}`,
        folderId: `mock-folder-${matter.id}`,
        webUrl: `https://mock.sharepoint.example/matters/${matter.id}`,
      },
      teams: {
        channelId: `mock-channel-${matter.id}`,
        channelUrl: `https://mock.teams.example/channels/${matter.id}`,
      },
      mail: {
        folderId: `mock-mailfolder-${matter.id}`,
        inboxRuleId: null,
      },
      provisionedAt: new Date().toISOString(),
    };
  }

  async releaseMatterBindings(_matter: Matter): Promise<void> {
    return;
  }

  async getMatterBindings(_matterId: string): Promise<MatterM365Bindings> {
    return {
      sharepoint: null,
      teams: null,
      mail: null,
      provisionedAt: null,
    };
  }

  // ── Legal Hold mock implementations (sunset 4c) ────────────────
  // Deterministic — no randomness. Drives the legal-hold UI with
  // realistic-shaped data so the workflow is exercisable end-to-end
  // before the Graph client lands.

  async discoverCustodians(scopeQuery: HoldScopeQuery): Promise<CandidateCustodian[]> {
    const seed = `${scopeQuery.description.toLowerCase()} ${scopeQuery.matterId ?? ""}`;
    const all: CandidateCustodian[] = [
      {
        externalIdentifier: "custodian:vp-eng-001",
        name: "Priya Kulkarni",
        email: "priya.kulkarni@aegis-demo.example",
        department: "Engineering",
        title: "VP Engineering",
        matchConfidence: 0.92,
        matchRationale: "Directly named in scope description",
      },
      {
        externalIdentifier: "custodian:team-lead-002",
        name: "Marcus Reid",
        email: "marcus.reid@aegis-demo.example",
        department: "Engineering",
        title: "Team Lead",
        matchConfidence: 0.78,
        matchRationale: "Reports to named custodian",
      },
      {
        externalIdentifier: "custodian:finance-003",
        name: "Rhea Malhotra",
        email: "rhea.malhotra@aegis-demo.example",
        department: "Finance",
        title: "Director",
        matchConfidence: 0.61,
        matchRationale: "Counterparty negotiation correspondence",
      },
    ];
    return all.filter(
      (c) =>
        seed.includes("snowflake") ||
        seed.includes("msa") ||
        seed.includes("priya") ||
        seed.length === 0,
    );
  }

  async applyPreservation(input: ApplyPreservationInput): Promise<PreservationResult> {
    return {
      ok: true,
      appliedAt: new Date().toISOString(),
      upstreamReferenceId: `mock-pres-${input.dataSourceExternalIdentifier}`,
      failureReason: null,
    };
  }

  async releasePreservation(_input: ReleasePreservationInput): Promise<void> {
    return;
  }

  async preserveDepartedMailbox(input: PreserveDepartedInput): Promise<PreservationResult> {
    return {
      ok: true,
      appliedAt: new Date().toISOString(),
      upstreamReferenceId: `mock-departed-${input.personExternalIdentifier}`,
      failureReason: null,
    };
  }

  async enumerateDataSourcesForUser(
    externalIdentifier: string,
  ): Promise<EnumeratedDataSource[]> {
    // Returns a representative source set. The real client (4c) walks
    // Graph API to enumerate per-user sources.
    return [
      {
        type: "EMAIL_MAILBOX",
        externalIdentifier: `exchange:${externalIdentifier}`,
        displayLabel: "Exchange mailbox",
        retentionPolicy: "default-7y",
        retentionPolicyConflict: false,
      },
      {
        type: "ONEDRIVE",
        externalIdentifier: `od:${externalIdentifier}`,
        displayLabel: "OneDrive",
        retentionPolicy: "default-7y",
        retentionPolicyConflict: false,
      },
      {
        type: "TEAMS_DM",
        externalIdentifier: `teams:dm:${externalIdentifier}`,
        displayLabel: "Teams DMs",
        retentionPolicy: "30d-auto-delete",
        retentionPolicyConflict: true,
      },
    ];
  }
}
