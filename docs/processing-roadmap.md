# AEGIS Processing Engine — dual-mode (native + Purview) roadmap

> Goal: a mature, native **processing** stage (extraction → OCR → hashing/dedup/
> deNIST → container expansion → exceptions) so AEGIS can process data itself
> **and** delegate to **Purview eDiscovery** where the client's E5/eDiscovery
> Premium license allows. When native processing reaches parity, a client can
> stop paying for Purview Premium and run everything in AEGIS.

## What "processing" means in eDiscovery (industry)

Processing is the stage between **collection** and **review**. Every serious
platform (Relativity Processing/Invenio, Nuix Engine, Reveal/Brainspace,
Everlaw, Purview eDiscovery Premium "Advanced Indexing") does roughly the same
pipeline:

| Step | What it does | Market tech |
|---|---|---|
| Container / family expansion | Expand PST / MBOX / ZIP / nested containers; keep email+attachment families | Nuix, Tika, `libpff`/`readpst` |
| **Text + metadata extraction** | Full text + author/dates/headers from ~500–1000+ file types | **Apache Tika** (open-source, de-facto), Oracle Outside In, dtSearch |
| **OCR** | Text from scanned images / image-only PDFs | **Tesseract** (open-source), ABBYY, **Azure Document Intelligence** |
| **Hashing** | MD5 / SHA-1 / SHA-256 per item (identity for dedup) | standard crypto |
| **Deduplication** | Global / per-custodian dedup by hash | platform-native |
| **DeNIST** | Drop known system/software files | **NIST NSRL** hash set |
| Email threading / near-dup | Group conversations; flag near-duplicates | Relativity Analytics, Brainspace |
| Language identification | Tag document language | Tika / CLD |
| Exception handling | Password-protected / corrupt / unsupported → exception report | platform-native |

**Apache Tika** is the key insight: it's the Apache-2.0 Java toolkit that most
open-source / DIY eDiscovery stacks use for extraction. Run as **Tika Server**
(Docker, HTTP API) it detects 1000+ MIME types and wraps PDFBox (PDF), Apache
POI (Office), plus a built-in **Tesseract** integration for OCR — so ONE sidecar
gives broad extraction *and* OCR. That's the credible path to "drop Purview".

## Where AEGIS is today

- **Native, lightweight**: `text-extract.ts` handles email HTML bodies + text/
  csv/json/xml/rtf + **PDF (pdf-parse)** + **DOCX (mammoth)**. Threading, dedup
  (by `dedupKey`), family rollup, and culling are native.
- **Gaps vs. mature processing**: XLSX/PPTX/legacy-Office, OCR, real hashing +
  hash-dedup + deNIST, PST/MBOX/ZIP container expansion, exception reporting.
- Purview is used only for **preservation** (`/security/cases`) and the
  **tenant-scale estimate** — NOT for processing today.

## The design: a pluggable ProcessingEngine (mirrors the M365Client factory)

```
interface ProcessingEngine {
  extract(bytes, contentType, filename): { text, metadata, exceptions[] }
}
```

| Implementation | Engine | When selected |
|---|---|---|
| `NativeJsEngine` | pdf-parse / mammoth / (xlsx / pptx …) — no sidecar | default / zero-infra |
| `TikaEngine` | **Apache Tika Server** (+ Tesseract OCR) over HTTP | `TIKA_SERVER_URL` set — the "mature native" mode |
| `PurviewEngine` | **Purview Advanced Indexing** read-back | org has E5/eDiscovery Premium AND chose Purview mode |

`getProcessingEngineForOrg(org)` picks per-org: **Purview** where licensed and
selected; else **Tika** if a Tika server is configured; else the **native-JS**
fallback. Same factory/degrade pattern the `M365Client` already uses — no caller
change when the mode switches.

## Consolidated tracking table — everything pending

Priority: 🔴 high (before a real matter) · 🟡 medium · 🟢 later. Status: ☐ todo ·
◧ partial · ✅ done · ⏸ deferred.

| ID | Item | Delivers | Enabling tech | Pri | Status |
|---|---|---|---|---|---|
| **PROC-1** | ProcessingEngine interface + factory | Pluggable native/Tika/Purview processing per org | factory pattern (like `m365-factory`) | 🔴 | ✅ #364 |
| **PROC-2** | XLSX + PPTX native extraction | Excel/PowerPoint become reviewable text | `xlsx` (SheetJS) + `jszip` (pptx) | 🔴 | ✅ #365 |
| **PROC-3** | Apache **Tika Server** engine | 1000+ formats + metadata in one component | Tika Server (Docker sidecar), HTTP `/rmeta` | 🔴 | ◧ code done (`TikaEngine`, gated behind `TIKA_SERVER_URL`, degrades to native); needs a running sidecar |
| **PROC-4** | **OCR** (scanned images / image-PDFs) | Text from scans; closes the last extraction gap | **Tesseract** (via Tika `-full`) or Azure Doc Intelligence | 🔴 | ◧ rides PROC-3 — OCR is automatic when the sidecar is the `apache/tika:latest-full` image |
| **PROC-5** | Hashing + hash-dedup + deNIST | MD5/SHA-256 identity, global dedup, drop NSRL system files | Node crypto + NIST NSRL set | 🟡 | ◧ #367 (pure engine; per-item column + NSRL data pending) |
| **PROC-6** | Container expansion (PST/MBOX/ZIP) | Ingest exported archives, nested families | pure-JS (jszip + MBOX parser); `pst-extractor` for PST | 🟡 | ◧ **ZIP + MBOX shipped** (`ingestArchive`, workspace upload → review set); PST (pst-extractor) + large-archive worker path pending |
| **PROC-7a** | **Purview mode selection + license gate** | Per-deployment `AEGIS_PROCESSING_MODE` (native/tika/purview/auto); `purview` engages only when the delegated eDiscovery account is connected, else falls back | env switch + delegated-auth gate (4c.1) | 🟡 | ◧ mode seam + gate + health status; per-org column deferred |
| **PROC-7b** | **Purview processing read-back** | Read Purview's indexed text for items collected via an eDiscovery review set | Purview eDiscovery Premium review-set APIs + live E5 | 🟡 | ⛔ **BLOCKED by Microsoft** — export download is portal-gated (see finding below); API path works up to export, content download does not |
| **PROC-8** | Exception report + processing dashboard | Password-protected/corrupt/unsupported surfaced; processing stats | reads engine `exceptions[]` | 🟡 | ◧ #368 (classification + summarizeExceptions; per-item persistence + dashboard pending) |
| **PROC-9** | Language ID + near-dup | Per-doc language; near-duplicate flag beyond exact dedup | Tika/CLD; shingling/MinHash | 🟢 | ✅ #366 (pure + on-the-fly read; persistence pending) |
| RDY-OCR | (folded into PROC-4) | — | — | — | ↳ PROC-4 |
| HARD-1 | KMS envelope encryption for M365 secrets | Production-grade secret storage | KMS (Azure Key Vault / AWS KMS) | 🟡 | ⏸ (first paying client) |
| HARD-2 | Real hold-notice email send | Custodian notices actually delivered | Graph `sendMail` / SES / SMTP | 🟡 | ⏸ |
| HARD-3 | Live RelativityOne API push | One-click push (not just load-file export) | RelativityOne Import API + token | 🟢 | ⏸ |

## Overnight autonomous build order (no infra / creds needed)

Buildable without any external service or user action — the loop works these,
merging migration-free items and leaving any schema/infra item as an UNMERGED
PR with an apply note (never blocks on the user):

1. ✅ **PROC-1** — ProcessingEngine interface + factory + `NativeJsEngine`
   (PR #364). Migration-free.
2. ✅ **PROC-2** — XLSX (SheetJS) + PPTX (jszip) native extraction (PR #365).
   Also fixed a latent OOXML-mis-decode bug. Migration-free.
3. ✅ **PROC-9 (near-dup)** — MinHash near-dup + language-ID helpers + on-the-fly
   `/near-duplicates` read (PR #366). Per-item persistence deferred (migration).
4. ◧ **PROC-5 (pure parts)** — hashing + `deNIST` + dedup-by-hash helpers (PR
   #367). Per-item `contentHash` column + full NSRL data are the deferred parts.
5. ◧ **PROC-8 (return path)** — accurate exception classification (ENCRYPTED/
   UNSUPPORTED/EMPTY) + `summarizeExceptions` (PR #368). Per-item persistence +
   dashboard deferred (migration).

**Autonomous queue exhausted.** Remaining processing work needs the user:
per-item columns (contentHash / near-dup / language / exception) + their
dashboards are **deferred migrations**; PROC-3 (Tika Server), PROC-4 (OCR),
PROC-6 (PST/MBOX), PROC-7 (Purview) need **infrastructure/credentials**.

## Pipeline wiring (PROC-5/8/9 → real) — MIGRATION PR, apply then merge

Wires the engines into collection: adds `contentHash` / `language` /
`processingException` on `ReviewSetItem` (migration
`20260826120000_reviewsetitem_processing`), computes them at collect time
(persistReviewSet + the Graph client via `NativeJsEngine`), and adds
**content-dedup + deNIST** cull passes that use the stored hash. Apply on Neon
then merge:

```
pnpm --filter @aegis/db exec prisma migrate deploy
```

SKIP (need infra/creds/user): PROC-3 (Tika Server), PROC-4 (OCR sidecar/cloud),
PROC-6 (PST/MBOX native libs), PROC-7 (Purview APIs), all HARD-*.

## Standing up the Tika sidecar (PROC-3/4 runtime)

The `TikaEngine` is built and wired — `getProcessingEngineForOrg` returns it
whenever `TIKA_SERVER_URL` is set, and it falls back to native on any transport
failure, so a mis-set URL or a down sidecar never stalls collection. To turn it
on, run a Tika Server the app can reach and point the env var at it:

```bash
# OCR-capable image (bundles Tesseract) — required for scanned images / image-PDFs
docker run -d --name aegis-tika -p 9998:9998 apache/tika:latest-full
# then, in the app environment:
TIKA_SERVER_URL=http://localhost:9998
```

Cannot live on Vercel (no long-running containers) — run it on a machine/VM the
app can reach over a **private** network (Tika Server has no auth; never expose
9998 publicly). Health check: `GET $TIKA_SERVER_URL/version` → `Apache Tika 2.x`
(exposed in code as `tikaVersion()`).

## PROC-7b finding — Purview read-back is portal-gated (validated on a live E5 tenant)

Validated end-to-end against a connected E5 tenant (Sep 2026). Every step of
the Purview processing path works via the delegated Graph API **except the
final content download**:

- ✅ Connect delegated eDiscovery · ✅ list cases / custodians / searches /
  review sets · ✅ trigger review-set export (`POST …/reviewSets/{id}/export`)
  · ✅ poll the `contentExport` operation to `succeeded` · ✅ read
  `exportFileMetadata[]` (fileName + size + downloadUrl).
- ⛔ **Download the export package** — the `downloadUrl` points at
  `*.proxyservice.ediscovery.svc.cloud.microsoft`, a **different resource**
  than `graph.microsoft.com`. Fetching it with the delegated Graph bearer
  token returns **HTTP 200 with an Azure AD "Sign in to your account" HTML
  page** (`content-type: text/html`), not the zip. The proxy only honors an
  **interactive browser AAD session**, not the server-to-server delegated
  token the rest of the eDiscovery API accepts.

**Conclusion.** Reading Purview's processed content back into AEGIS
programmatically is **blocked by Microsoft's API design**, not by our code.
The export packages are intended for portal/browser download. Automating it
would require a token for the (undocumented) eDiscovery download resource the
service account was never consented to — and even then the URLs are
portal-oriented. Learnings also surfaced along the way: `exportOptions`
requires `originalFiles` to also emit `text`; the operation discriminator is
`action = "contentExport"` (the `@odata.type` is omitted in the operations
list); `exportFileMetadata` only appears when the operation is fetched by id.

**Product takeaway.** "Purview-as-processor kept in-app" is **not seamless**:
triggering + tracking works by API, but pulling processed content back
requires a manual portal download + re-upload. **AEGIS-native (Tika) mode has
no such seam** — collected content is extracted straight into the review set.
This is a genuine differentiator for native mode and a fair caveat for
E5 clients who want to keep Purview. PROC-7a (mode selection + license gate)
stays useful; PROC-7b full read-back is parked pending a Microsoft-supported
programmatic download path.

## Recommended sequencing

1. **PROC-1** (the factory) — cheap, unlocks everything else cleanly.
2. **PROC-2** (XLSX/PPTX) — fast native win; covers the common Office gap now.
3. **PROC-3 + PROC-4** (Tika Server + OCR) — the big leap: broad-format
   extraction + OCR in one sidecar → this is what lets you tell a client
   "you can turn Purview processing off."
4. **PROC-5** (hashing/dedup/deNIST) — defensibility + volume reduction parity.
5. **PROC-7** (Purview mode) — the dual-mode promise for E5 clients who want it.
6. **PROC-6 / PROC-8 / PROC-9** — completeness for larger, messier matters.

## "Can we tell the client to drop Purview?" — the bar

Yes, once **PROC-3 + PROC-4 + PROC-5** ship: broad-format extraction (Tika),
OCR (Tesseract), and hash-based dedup/deNIST. At that point AEGIS's native
processing covers what a mid-size matter needs without eDiscovery Premium — and
`PurviewEngine` stays available for clients who prefer to keep using their E5
processing.
