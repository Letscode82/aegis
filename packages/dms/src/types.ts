/**
 * Document Management System sync — types (C-3).
 *
 * A DMS connector fronts an external document store (iManage, NetDocuments,
 * SharePoint) that a Fortune-50 legal department already runs as its system of
 * record for matter files. AEGIS reaches it through the shared F-8 OAuth
 * framework (`@aegis/connectors`) and reconciles its documents against the
 * shared `Document` entity so "one brain" sees the firm's real paper.
 *
 * This module is pure types — no runtime, no dependencies. Every provider
 * (real HTTP or the dev mock) implements `DmsProvider`; the reconciliation
 * planner (`sync.ts`) is pure and provider-agnostic.
 */

/** Registry ids for the DMS providers AEGIS fronts. */
export type DmsProviderId = "imanage" | "netdocuments" | "sharepoint";

/** A folder (workspace / cabinet / drive folder) in the external DMS. */
export interface DmsFolderRef {
  /** Provider-native folder id. */
  id: string;
  name: string;
  /** Human path from the DMS root, when the provider exposes one. */
  path?: string;
  /** Parent folder id, when nested. */
  parentId?: string;
}

/** A document as the external DMS describes it (metadata, not content). */
export interface DmsDocument {
  /** Provider-native document id — the stable external key. */
  externalId: string;
  name: string;
  /** Folder the document lives in. */
  folderId: string;
  mimeType?: string;
  sizeBytes?: number;
  /** Provider version label (iManage version number, Graph eTag, …). */
  version?: string;
  /** Provider-supplied content hash when available (preferred change signal). */
  contentHash?: string;
  /** Last-modified timestamp, ISO-8601. */
  modifiedAt: string;
  /** Deep link into the DMS web UI. */
  webUrl?: string;
}

/** A downloaded document: metadata plus the raw bytes. */
export interface DmsDownload {
  externalId: string;
  name: string;
  mimeType?: string;
  content: Uint8Array;
}

/** An upload request into the DMS (create, or version an existing doc). */
export interface DmsUpload {
  folderId: string;
  name: string;
  content: Uint8Array;
  mimeType?: string;
  /** When set, version the existing document rather than create a new one. */
  externalId?: string;
}

/** Paging options for a folder listing. */
export interface DmsListOptions {
  folderId: string;
  pageSize?: number;
  /** Opaque provider cursor from a prior page's `nextCursor`. */
  cursor?: string;
}

/** One page of a folder's documents. */
export interface DmsListResult {
  documents: DmsDocument[];
  /** Present when more pages remain. */
  nextCursor?: string;
}

/**
 * The provider seam. One implementation per external DMS (plus the dev mock);
 * the sync planner and every caller works against this interface, never a
 * provider SDK.
 */
export interface DmsProvider {
  readonly id: DmsProviderId;
  /** List folders under `parentId` (root when omitted). */
  listFolders(parentId?: string): Promise<DmsFolderRef[]>;
  /** List a folder's documents (one page). */
  listDocuments(opts: DmsListOptions): Promise<DmsListResult>;
  /** Fetch one document's metadata, or null if it no longer exists. */
  getDocument(externalId: string): Promise<DmsDocument | null>;
  /** Download a document's bytes. */
  downloadDocument(externalId: string): Promise<DmsDownload>;
  /** Create or version a document. */
  uploadDocument(upload: DmsUpload): Promise<DmsDocument>;
  /** Full-text search, optionally scoped to a folder. */
  search(query: string, opts?: { folderId?: string; limit?: number }): Promise<DmsDocument[]>;
}
