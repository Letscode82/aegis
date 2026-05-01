/**
 * Microsoft 365 integration interface (sunset 4c).
 *
 * The interface ships in 4a so the caller surfaces (Matter create
 * form, document attachment panel) can be wired against a stable
 * shape. The real Graph API implementation lands in 4c — pure
 * implementation swap, no signature change.
 *
 * See CLAUDE.md "Documented exceptions" — this interface is mocked
 * in 4a with sunset = 4c. Remove the mock implementation when the
 * Graph client lands; do not extend the mock.
 */
import type { Matter } from "@aegis/db";

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
}

/** Factory; 4c will swap the implementation here. */
export function getM365Client(): M365Client {
  return new MockM365Client();
}
