/**
 * HTTP DMS provider (C-3).
 *
 * The production implementation of `DmsProvider`: it drives a provider's REST
 * API over the global `fetch` (zero SDK, proxy-friendly) with a bearer token
 * resolved through the shared F-8 OAuth framework. The per-provider endpoint
 * shapes and response mappers live in a `DmsDialect`, so this class stays
 * generic and each provider is a small, data-driven adapter.
 *
 * The access token is injected (`getAccessToken`) — the caller wires it to
 * `@aegis/connectors.getValidAccessToken` over a `DbTokenStore`, so this
 * package never imports `@aegis/db` and never re-implements refresh.
 */
import type {
  DmsDocument,
  DmsDownload,
  DmsFolderRef,
  DmsListOptions,
  DmsListResult,
  DmsProvider,
  DmsProviderId,
  DmsUpload,
} from "./types.js";

/** A normalized request a dialect asks the provider to make. */
export interface DmsRequest {
  method: "GET" | "POST" | "PUT";
  /** Path appended to the dialect's `baseUrl`. */
  path: string;
  query?: Record<string, string | number | undefined>;
  headers?: Record<string, string>;
  /** JSON body (serialized) — mutually exclusive with `rawBody`. */
  body?: unknown;
  /** Raw bytes for an upload. */
  rawBody?: Uint8Array;
  /** When true the response is read as bytes, not JSON. */
  binary?: boolean;
}

/**
 * Per-provider adapter: builds requests and maps raw responses to the
 * normalized DMS shapes. Every method is pure (no I/O) — the provider does the
 * fetching.
 */
export interface DmsDialect {
  readonly id: DmsProviderId;
  readonly baseUrl: string;
  listFolders(parentId?: string): DmsRequest;
  mapFolders(raw: unknown): DmsFolderRef[];
  listDocuments(opts: DmsListOptions): DmsRequest;
  mapDocuments(raw: unknown): DmsListResult;
  getDocument(externalId: string): DmsRequest;
  mapDocument(raw: unknown): DmsDocument | null;
  downloadDocument(externalId: string): DmsRequest;
  uploadDocument(upload: DmsUpload): DmsRequest;
  mapUploaded(raw: unknown): DmsDocument;
  search(query: string, opts: { folderId?: string; limit?: number }): DmsRequest;
  mapSearch(raw: unknown): DmsDocument[];
}

/** Injected HTTP transport (defaults to global `fetch`). */
export type DmsFetch = typeof fetch;

export interface HttpDmsProviderOptions {
  dialect: DmsDialect;
  /** Resolve a valid bearer token (refreshing through F-8 as needed). */
  getAccessToken: () => Promise<string>;
  /** Inject a fetch implementation (tests). Defaults to global fetch. */
  fetchImpl?: DmsFetch;
}

/** Thrown when a DMS API call returns a non-2xx status. */
export class DmsHttpError extends Error {
  constructor(
    readonly status: number,
    readonly providerId: DmsProviderId,
    readonly detail: string,
  ) {
    super(`DMS ${providerId} returned ${status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
    this.name = "DmsHttpError";
  }
}

export class HttpDmsProvider implements DmsProvider {
  readonly id: DmsProviderId;
  private readonly dialect: DmsDialect;
  private readonly getAccessToken: () => Promise<string>;
  private readonly doFetch: DmsFetch;

  constructor(opts: HttpDmsProviderOptions) {
    this.dialect = opts.dialect;
    this.id = opts.dialect.id;
    this.getAccessToken = opts.getAccessToken;
    this.doFetch = opts.fetchImpl ?? fetch;
  }

  private buildUrl(req: DmsRequest): string {
    const url = new URL(this.dialect.baseUrl.replace(/\/$/, "") + req.path);
    if (req.query) {
      for (const [k, v] of Object.entries(req.query)) {
        if (v !== undefined) url.searchParams.set(k, String(v));
      }
    }
    return url.toString();
  }

  private async send(req: DmsRequest): Promise<unknown> {
    const token = await this.getAccessToken();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: req.binary ? "application/octet-stream" : "application/json",
      ...req.headers,
    };
    let body: BodyInit | undefined;
    if (req.rawBody) {
      body = req.rawBody as unknown as BodyInit;
    } else if (req.body !== undefined) {
      headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
      body = JSON.stringify(req.body);
    }
    const res = await this.doFetch(this.buildUrl(req), { method: req.method, headers, body });
    if (res.status < 200 || res.status >= 300) {
      const detail = await res.text().catch(() => "");
      throw new DmsHttpError(res.status, this.id, detail);
    }
    if (req.binary) {
      const buf = await res.arrayBuffer();
      return new Uint8Array(buf);
    }
    return res.json().catch(() => ({}));
  }

  async listFolders(parentId?: string): Promise<DmsFolderRef[]> {
    return this.dialect.mapFolders(await this.send(this.dialect.listFolders(parentId)));
  }

  async listDocuments(opts: DmsListOptions): Promise<DmsListResult> {
    return this.dialect.mapDocuments(await this.send(this.dialect.listDocuments(opts)));
  }

  async getDocument(externalId: string): Promise<DmsDocument | null> {
    try {
      return this.dialect.mapDocument(await this.send(this.dialect.getDocument(externalId)));
    } catch (err) {
      if (err instanceof DmsHttpError && err.status === 404) return null;
      throw err;
    }
  }

  async downloadDocument(externalId: string): Promise<DmsDownload> {
    const bytes = (await this.send(this.dialect.downloadDocument(externalId))) as Uint8Array;
    return { externalId, name: externalId, content: bytes };
  }

  async uploadDocument(upload: DmsUpload): Promise<DmsDocument> {
    return this.dialect.mapUploaded(await this.send(this.dialect.uploadDocument(upload)));
  }

  async search(query: string, opts: { folderId?: string; limit?: number } = {}): Promise<DmsDocument[]> {
    return this.dialect.mapSearch(await this.send(this.dialect.search(query, opts)));
  }
}

/* ------------------------------------------------------------------ *
 * Dialects. Defensive mappers (typeof-guarded, like the F-8 OAuth
 * parser) so a surprising provider payload degrades to empty rather
 * than throwing deep in a sync pass.
 * ------------------------------------------------------------------ */

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}
function num(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

/** Microsoft SharePoint (Graph drives API). */
export function sharePointDialect(driveId: string): DmsDialect {
  const base = "https://graph.microsoft.com/v1.0";
  const mapItem = (raw: unknown): DmsDocument | null => {
    const r = obj(raw);
    const id = str(r.id);
    if (!id) return null;
    const file = obj(r.file);
    const parent = obj(r.parentReference);
    return {
      externalId: id,
      name: str(r.name) ?? id,
      folderId: str(parent.id) ?? "",
      mimeType: str(file.mimeType),
      sizeBytes: num(r.size),
      version: str(r.eTag),
      contentHash: str(obj(file.hashes).quickXorHash) ?? str(r.eTag),
      modifiedAt: str(r.lastModifiedDateTime) ?? new Date(0).toISOString(),
      webUrl: str(r.webUrl),
    };
  };
  return {
    id: "sharepoint",
    baseUrl: base,
    listFolders: (parentId) => ({
      method: "GET",
      path: `/drives/${driveId}/items/${parentId ?? "root"}/children`,
      query: { $filter: "folder ne null" },
    }),
    mapFolders: (raw) =>
      arr(obj(raw).value)
        .map((v): DmsFolderRef | null => {
          const r = obj(v);
          const id = str(r.id);
          if (!id) return null;
          return { id, name: str(r.name) ?? id, parentId: str(obj(r.parentReference).id) };
        })
        .filter((f): f is DmsFolderRef => f !== null),
    listDocuments: (opts) => ({
      method: "GET",
      path: `/drives/${driveId}/items/${opts.folderId}/children`,
      query: { $top: opts.pageSize, $skiptoken: opts.cursor },
    }),
    mapDocuments: (raw) => {
      const r = obj(raw);
      const documents = arr(r.value)
        .map(mapItem)
        .filter((d): d is DmsDocument => d !== null && d.folderId !== "");
      const next = str(r["@odata.nextLink"]);
      return { documents, nextCursor: next ? new URL(next).searchParams.get("$skiptoken") ?? undefined : undefined };
    },
    getDocument: (externalId) => ({ method: "GET", path: `/drives/${driveId}/items/${externalId}` }),
    mapDocument: mapItem,
    downloadDocument: (externalId) => ({ method: "GET", path: `/drives/${driveId}/items/${externalId}/content`, binary: true }),
    uploadDocument: (upload) => ({
      method: "PUT",
      path: upload.externalId
        ? `/drives/${driveId}/items/${upload.externalId}/content`
        : `/drives/${driveId}/items/${upload.folderId}:/${encodeURIComponent(upload.name)}:/content`,
      headers: { "Content-Type": upload.mimeType ?? "application/octet-stream" },
      rawBody: upload.content,
    }),
    mapUploaded: (raw) => mapItem(raw) ?? { externalId: "", name: "", folderId: "", modifiedAt: new Date(0).toISOString() },
    search: (query, opts) => ({
      method: "GET",
      path: `/drives/${driveId}/root/search(q='${encodeURIComponent(query)}')`,
      query: { $top: opts.limit },
    }),
    mapSearch: (raw) =>
      arr(obj(raw).value)
        .map(mapItem)
        .filter((d): d is DmsDocument => d !== null),
  };
}

/** iManage Work REST API (v2). */
export function imanageDialect(host: string, library: string): DmsDialect {
  const base = `https://${host}/api/v2`;
  const mapDoc = (raw: unknown): DmsDocument | null => {
    const r = obj(raw);
    const id = str(r.id) ?? str(r.document_id);
    if (!id) return null;
    return {
      externalId: id,
      name: str(r.name) ?? str(r.document_name) ?? id,
      folderId: str(r.folder_id) ?? str(r.workspace_id) ?? "",
      mimeType: str(r.type),
      sizeBytes: num(r.size),
      version: str(r.version) ?? (num(r.version) !== undefined ? String(r.version) : undefined),
      contentHash: str(r.hash),
      modifiedAt: str(r.edit_date) ?? str(r.last_user_edit_date) ?? new Date(0).toISOString(),
      webUrl: str(r.url),
    };
  };
  return {
    id: "imanage",
    baseUrl: base,
    listFolders: (parentId) => ({
      method: "GET",
      path: parentId ? `/folders/${parentId}/children` : `/libraries/${library}/workspaces`,
    }),
    mapFolders: (raw) =>
      arr(obj(raw).data)
        .map((v) => {
          const r = obj(v);
          const id = str(r.id);
          if (!id) return null;
          return { id, name: str(r.name) ?? id };
        })
        .filter((f): f is DmsFolderRef => f !== null),
    listDocuments: (opts) => ({
      method: "GET",
      path: `/folders/${opts.folderId}/documents`,
      query: { limit: opts.pageSize, offset: opts.cursor },
    }),
    mapDocuments: (raw) => {
      const r = obj(raw);
      const documents = arr(r.data)
        .map(mapDoc)
        .filter((d): d is DmsDocument => d !== null);
      return { documents, nextCursor: str(obj(r.pagination).next) };
    },
    getDocument: (externalId) => ({ method: "GET", path: `/documents/${externalId}` }),
    mapDocument: (raw) => mapDoc(obj(raw).data ?? raw),
    downloadDocument: (externalId) => ({ method: "GET", path: `/documents/${externalId}/download`, binary: true }),
    uploadDocument: (upload) => ({
      method: upload.externalId ? "PUT" : "POST",
      path: upload.externalId ? `/documents/${upload.externalId}` : `/folders/${upload.folderId}/documents`,
      headers: { "Content-Type": upload.mimeType ?? "application/octet-stream", "X-Filename": upload.name },
      rawBody: upload.content,
    }),
    mapUploaded: (raw) => mapDoc(obj(raw).data ?? raw) ?? { externalId: "", name: "", folderId: "", modifiedAt: new Date(0).toISOString() },
    search: (query, opts) => ({
      method: "GET",
      path: `/libraries/${library}/documents/search`,
      query: { q: query, limit: opts.limit, folder_id: opts.folderId },
    }),
    mapSearch: (raw) =>
      arr(obj(raw).data)
        .map(mapDoc)
        .filter((d): d is DmsDocument => d !== null),
  };
}

/** NetDocuments REST API (v1). */
export function netDocumentsDialect(cabinetId: string): DmsDialect {
  const base = "https://api.vault.netvoyage.com/v1";
  const mapDoc = (raw: unknown): DmsDocument | null => {
    const r = obj(raw);
    const id = str(r.id) ?? str(r.envId);
    if (!id) return null;
    return {
      externalId: id,
      name: str(r.name) ?? id,
      folderId: str(r.parent) ?? cabinetId,
      mimeType: str(r.ext),
      sizeBytes: num(r.size),
      version: str(r.version),
      contentHash: str(r.hash),
      modifiedAt: str(r.modified) ?? new Date(0).toISOString(),
      webUrl: str(r.url),
    };
  };
  return {
    id: "netdocuments",
    baseUrl: base,
    listFolders: (parentId) => ({ method: "GET", path: `/folder/${parentId ?? cabinetId}/children`, query: { type: "folder" } }),
    mapFolders: (raw) =>
      arr(obj(raw).list ?? raw)
        .map((v) => {
          const r = obj(v);
          const id = str(r.id);
          if (!id) return null;
          return { id, name: str(r.name) ?? id };
        })
        .filter((f): f is DmsFolderRef => f !== null),
    listDocuments: (opts) => ({ method: "GET", path: `/folder/${opts.folderId}/children`, query: { type: "document", max: opts.pageSize, skip: opts.cursor } }),
    mapDocuments: (raw) => {
      const r = obj(raw);
      const documents = arr(r.list ?? raw)
        .map(mapDoc)
        .filter((d): d is DmsDocument => d !== null);
      return { documents, nextCursor: str(r.next) };
    },
    getDocument: (externalId) => ({ method: "GET", path: `/document/${externalId}/info` }),
    mapDocument: (raw) => mapDoc(raw),
    downloadDocument: (externalId) => ({ method: "GET", path: `/document/${externalId}`, binary: true }),
    uploadDocument: (upload) => ({
      method: upload.externalId ? "PUT" : "POST",
      path: upload.externalId ? `/document/${upload.externalId}` : `/folder/${upload.folderId}/document`,
      headers: { "Content-Type": upload.mimeType ?? "application/octet-stream", Slug: upload.name },
      rawBody: upload.content,
    }),
    mapUploaded: (raw) => mapDoc(raw) ?? { externalId: "", name: "", folderId: cabinetId, modifiedAt: new Date(0).toISOString() },
    search: (query, opts) => ({ method: "GET", path: `/search`, query: { q: query, cabinet: cabinetId, max: opts.limit } }),
    mapSearch: (raw) =>
      arr(obj(raw).list ?? raw)
        .map(mapDoc)
        .filter((d): d is DmsDocument => d !== null),
  };
}
