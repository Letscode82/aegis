# @aegis/documents

**Status: STUB.** Empty in Step 1. This README is an architectural commitment.

## What this package will do
The single API every module uses to upload, version, retrieve, encrypt, and
audit documents. It owns the `Document` entity defined in `@aegis/db` (see
Step 2) and is the only code path that touches blob storage.

A matter has documents. A contract has documents. A DSAR response has
documents. A board pack is assembled from documents. If each module rolled
its own storage layer, we'd have N different versioning, retention, and
encryption stories — and the "one brain" search across modules
(`@aegis/search`) would have to integrate against N backends.

## When it will be implemented
**Phase: late Step 4 / early Step 6.** First real consumer is Matter's
"upload a document and link to a matter or hold." Spend then needs LEDES
invoice attachments. After that, Contracts and DSAR.

## Public API surface (planned)

```ts
import {
  uploadDocument,
  getDocument,
  getDocumentContent,
  listDocumentsForOwner,
  createDocumentVersion,
  setDocumentRetention,
  redactDocument,
  attachToMultipleOwners,
} from "@aegis/documents";

await uploadDocument({
  organizationId,
  ownerType: "MATTER",
  ownerId: matterId,
  file,
  uploadedBy: actor.id,
});
```

The package returns `Document` records keyed by id. Modules **never** see
storage URLs directly — they request short-lived signed URLs through
`getDocumentContent()`.

## Entities owned/managed
- `Document` (id, organizationId, name, mimeType, sizeBytes, storageUrl,
  version, parentDocumentId, ownerType, ownerId, uploadedBy, uploadedAt,
  encryptedAt) — defined in `@aegis/db`, mutated only through this package.
- `DocumentRetentionPolicy` (organizationId, ownerType, retentionDays,
  legalHoldOverride boolean)
- `DocumentVersion` (logical view over `Document.parentDocumentId`)

## Why a shared service vs. a module
- Storage backend (S3, Azure Blob, encrypted local) must be configurable
  centrally.
- Versioning and immutability are platform concerns, not module concerns.
- Encryption-at-rest, retention, and legal-hold preservation must apply
  uniformly — modules cannot opt out.
- Cross-module search (`@aegis/search`) indexes documents through this
  package, so there's one extraction pipeline.

## Out of scope
- Document editing UI (each module brings its own viewer; this package is
  storage + metadata).
- AI extraction / summarization (lives in `@aegis/ai` consumers — they fetch
  content through this package).
