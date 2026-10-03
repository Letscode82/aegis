/**
 * Mock DMS provider (C-3).
 *
 * The zero-infra implementation of `DmsProvider` — an in-memory document store
 * that backs tests and local dev where no DMS credentials exist, so the demo
 * walks end-to-end without iManage / NetDocuments / SharePoint. Deterministic:
 * ids and timestamps are derived from the seed so a given seed always produces
 * the same tree. Mirrors the `MockM365Client` pattern already in the matter
 * module.
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

export interface MockDmsSeed {
  folders?: DmsFolderRef[];
  documents?: DmsDocument[];
}

const EPOCH = "2026-01-01T00:00:00.000Z";

function defaultSeed(): Required<MockDmsSeed> {
  const folders: DmsFolderRef[] = [
    { id: "root", name: "Matters", path: "/Matters" },
    { id: "f-acme", name: "Acme v. AEGIS", path: "/Matters/Acme v. AEGIS", parentId: "root" },
  ];
  const documents: DmsDocument[] = [
    {
      externalId: "doc-1",
      name: "Complaint.pdf",
      folderId: "f-acme",
      mimeType: "application/pdf",
      sizeBytes: 182_400,
      version: "1",
      contentHash: "hash-doc-1-v1",
      modifiedAt: EPOCH,
      webUrl: "https://dms.example/doc-1",
    },
    {
      externalId: "doc-2",
      name: "Engagement Letter.docx",
      folderId: "f-acme",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      sizeBytes: 44_800,
      version: "3",
      contentHash: "hash-doc-2-v3",
      modifiedAt: EPOCH,
      webUrl: "https://dms.example/doc-2",
    },
  ];
  return { folders, documents };
}

export class MockDmsProvider implements DmsProvider {
  readonly id: DmsProviderId;
  private folders: DmsFolderRef[];
  private docs: Map<string, DmsDocument>;
  private seq = 0;

  constructor(opts: { id?: DmsProviderId; seed?: MockDmsSeed } = {}) {
    this.id = opts.id ?? "imanage";
    const seed = { ...defaultSeed(), ...opts.seed };
    this.folders = [...(seed.folders ?? [])];
    this.docs = new Map((seed.documents ?? []).map((d) => [d.externalId, { ...d }]));
  }

  async listFolders(parentId?: string): Promise<DmsFolderRef[]> {
    return this.folders.filter((f) => (parentId ? f.parentId === parentId : f.parentId === undefined));
  }

  async listDocuments(opts: DmsListOptions): Promise<DmsListResult> {
    const all = [...this.docs.values()].filter((d) => d.folderId === opts.folderId);
    const size = opts.pageSize ?? all.length;
    const start = opts.cursor ? Number(opts.cursor) || 0 : 0;
    const page = all.slice(start, start + size);
    const next = start + size;
    return { documents: page, nextCursor: next < all.length ? String(next) : undefined };
  }

  async getDocument(externalId: string): Promise<DmsDocument | null> {
    return this.docs.get(externalId) ?? null;
  }

  async downloadDocument(externalId: string): Promise<DmsDownload> {
    const doc = this.docs.get(externalId);
    if (!doc) throw new Error(`Mock DMS: document ${externalId} not found`);
    return {
      externalId,
      name: doc.name,
      mimeType: doc.mimeType,
      content: new TextEncoder().encode(`mock-content:${externalId}:${doc.contentHash ?? doc.version ?? ""}`),
    };
  }

  async uploadDocument(upload: DmsUpload): Promise<DmsDocument> {
    const now = new Date(EPOCH).getTime() + ++this.seq * 1000;
    const modifiedAt = new Date(now).toISOString();
    if (upload.externalId) {
      const existing = this.docs.get(upload.externalId);
      if (!existing) throw new Error(`Mock DMS: cannot version missing document ${upload.externalId}`);
      const next: DmsDocument = {
        ...existing,
        name: upload.name,
        mimeType: upload.mimeType ?? existing.mimeType,
        sizeBytes: upload.content.byteLength,
        version: String(Number(existing.version ?? "0") + 1),
        contentHash: `hash-${upload.externalId}-v${Number(existing.version ?? "0") + 1}`,
        modifiedAt,
      };
      this.docs.set(next.externalId, next);
      return next;
    }
    const externalId = `doc-${this.docs.size + 1 + this.seq}`;
    const created: DmsDocument = {
      externalId,
      name: upload.name,
      folderId: upload.folderId,
      mimeType: upload.mimeType,
      sizeBytes: upload.content.byteLength,
      version: "1",
      contentHash: `hash-${externalId}-v1`,
      modifiedAt,
      webUrl: `https://dms.example/${externalId}`,
    };
    this.docs.set(externalId, created);
    return created;
  }

  async search(query: string, opts: { folderId?: string; limit?: number } = {}): Promise<DmsDocument[]> {
    const q = query.toLowerCase();
    const hits = [...this.docs.values()].filter(
      (d) => (!opts.folderId || d.folderId === opts.folderId) && d.name.toLowerCase().includes(q),
    );
    return opts.limit ? hits.slice(0, opts.limit) : hits;
  }
}
