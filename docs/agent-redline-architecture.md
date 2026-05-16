# Agent Redline Workflow — Architecture

> **Load-bearing architectural document.** Future Claude Code
> sessions and human contributors MUST read this before touching
> the documents, playbook, or agent-review surfaces. This sits
> alongside [CLAUDE.md](../CLAUDE.md) and
> [PRODUCT.md](../PRODUCT.md) in the durable-architectural-
> commitment tier.
>
> The roadmap that sequences PRs against this architecture lives
> in [agent-redline-roadmap.md](./agent-redline-roadmap.md). When
> the two documents disagree, **this one wins** — the roadmap is
> derived.

## Why this document exists

Document-aware intake — where each agent reviews uploaded
documents against a configurable playbook and produces structured
redlines for attorney review — is AEGIS's **hero feature**. It is
used by the entire legal department of every customer firm. It
handles privileged communications. It carries evidentiary weight.
**It cannot fail quietly, lose documents, leak across tenants, or
make unauthorised changes to legal records.**

A demo can paper over reliability gaps. A production system for
Fortune 50 GCs cannot. This document is the explicit contract for
what "production-grade" means for this surface.

The Dani McGarry framing — *"AI & data is not all you need"* —
is the design lens: AI is one of six spokes around a hub of
strategy and culture. Process re-engineering, workflow
digitization, data setup, intelligent automation, and the AI
itself all have to work together for the autonomous-enterprise
endpoint to mean anything. This document plans all six.

## Assumptions — flag for sign-off before any code lands

These are the operating-environment assumptions baked into every
decision below. If any is wrong, **the architecture changes
materially**. The user signs off (or overrides) before
implementation begins.

| # | Assumption | If overridden, what changes |
|---|---|---|
| **A1** | **Multi-tenant deploy.** One AEGIS deployment serves multiple law firms / GC offices. Strict per-org isolation is enforced at every layer. | Single-tenant (one firm per deploy): RLS becomes belt-and-suspenders rather than load-bearing; cross-tenant tests downgrade to advisory. Per-org rate limits relax. |
| **A2** | **Volume target: 1,000 reviews/day across all tenants at year-1, 10,000/day at year-3.** Largest single document ≤25 MB / ≤200K extracted-text tokens. | Higher: queue depth, autoscale, and Claude budget all increase. Lower: simpler architecture, single-process queue possible. |
| **A3** | **Regulatory regime: US + EU GDPR.** No HIPAA, no FINRA, no FedRAMP at MVP. State-bar professional-responsibility rules apply (privileged communications, work-product doctrine). | Adding HIPAA: requires BAA with cloud vendors, more encryption strictness. Adding FedRAMP: limits cloud choices, requires audit log immutability proof beyond chain. |
| **A4** | **AI vendor strategy: Claude is primary, GPT-4 is fallback for business continuity (not response diversity).** Both vendors see the same redacted content. | Multi-LLM-by-design (ensemble): different prompts per vendor, output reconciliation logic, different cost model. Vendor-independence-first: more abstraction, higher complexity. |
| **A5** | **Hosting: Vercel (Edge + Serverless) + Neon Postgres + Vercel Blob primary + AWS S3 secondary.** | On-prem / customer-cloud: storage/queue abstractions stay the same, deployment topology changes substantially. |
| **A6** | **Privileged-communication handling: documents may contain attorney-client privileged content. Vendor (Anthropic / OpenAI) is treated as an authorised contractor under appropriate DPAs — but PII is redacted before vendors see content.** | Stricter: privileged docs never leave AEGIS-controlled infra (would require self-hosted LLM, e.g. Llama). Looser: simpler architecture, more vendor exposure. |
| **A7** | **Document retention: default infinite. Per-matter override possible. Legal-hold release does NOT trigger deletion.** | Retention-by-default: scheduled deletion, retention-policy editor, defensible-deletion certificates. |
| **A8** | **Attorney accept/reject is required for every redline that affects the final document. "Approve all" exists but requires paranoia type-to-confirm when ≥3 BLOCKER-severity redlines remain PENDING.** | More aggressive automation: auto-accept by severity threshold (e.g., LOW severity auto-accepts after 24h with no attorney action). Less: every redline requires explicit decision, no bulk. |

**If any of these is wrong, stop and tell me — I'll revise the
architecture before we proceed.** The default sign-off is "all
assumptions as stated."

## Threat model

These are the failure modes the architecture defends against.
Each dimension below maps to one or more entries here.

| # | Threat | Severity | Likelihood |
|---|---|---|---|
| T1 | Anthropic API outage | High | Medium (multi-hour outages happen ~quarterly) |
| T2 | Vercel Blob outage | Critical | Low |
| T3 | Neon Postgres outage | Critical | Low |
| T4 | Document content leaks across tenants | Catastrophic | Low (if RLS works) / Medium (if RLS forgotten) |
| T5 | Malicious file upload (virus, malformed, decompression bomb, MIME spoof) | High | Medium |
| T6 | Rate-limit abuse (runaway loop, bad actor, billing attack) | High | Medium |
| T7 | Document loss (storage corruption, accidental delete, replication lag) | Catastrophic | Low |
| T8 | Concurrent edits on same redline review producing wrong final document | High | High (multiple attorneys in firm) |
| T9 | Privileged communication leaks to vendor in prompt | Catastrophic | Medium (if PII redaction is weak) |
| T10 | Audit chain tamper or break | Catastrophic | Low (chain trigger guards this) |
| T11 | Insider threat — rogue employee exfiltrates documents | High | Low |
| T12 | Credential compromise — Auth0 / Anthropic key / Vercel Blob token leaks | Critical | Medium |
| T13 | GDPR right-to-erasure conflict with legal hold | High | Medium |
| T14 | Latency / queue depth breaches SLO during surge | Medium | High |
| T15 | Bar association / regulator demands eDiscovery export under tight deadline | High | Medium |
| T16 | Backup corruption discovered during DR drill | Critical | Low |

## Mission-critical commitments — non-negotiable

Every architectural decision below preserves these. **An
implementation that breaks any of these is not shippable, no
matter how feature-complete it is.**

1. **Zero document loss.** Once a Document row exists and the
   storage backend acknowledged the upload, the bytes are
   recoverable. Period. No "best-effort" path can write a
   Document row.
2. **Zero unauthorised document access.** Every retrieve goes
   through the permission gate. Cross-tenant access is impossible
   at the database level, not just app level.
3. **Zero unattended AI mutations.** Every change to a legal
   record (final document, attorney decision, accepted redline)
   requires explicit human approval. The audit chain proves this.
4. **Audit chain stays intact during incident response.** No
   incident-recovery path writes raw SQL against `AuditLog`.
   Period. (CLAUDE.md non-negotiable inherited.)
5. **Strict multi-tenant isolation.** No tenant can see another
   tenant's documents, redlines, playbooks, or audit log. Tested
   pre-merge in CI.
6. **< 5 minute recovery** from any single-vendor failure (Claude
   down, Vercel Blob down, Neon read-replica down — primary
   continues serving with degraded mode).
7. **Privileged communications stay within the customer firm's
   control envelope.** PII redacted before vendor sees content;
   document classification respected; opt-out path for firms
   that won't allow vendor processing of privileged content.
8. **No silent compliance drift.** Retention, residency, audit-
   export, and chain-verification commitments are machine-checked
   in CI — not aspirational.

## SLOs and error budgets

These are the production commitments. Breaching one triggers an
incident; sustained breach triggers a postmortem + roadmap
adjustment.

| Metric | Target | Error budget |
|---|---|---|
| Availability (any agent reachable, even degraded) | 99.9% | 43 min/month |
| Availability (full-quality reviews — primary LLM tier) | 99.5% | 3.6 hr/month |
| NDA review p50 latency | 10 s | — |
| NDA review p95 latency | 30 s | — |
| MSA review p95 latency | 90 s | — |
| DSAR review p95 latency | 20 s | — |
| Document upload p95 latency | 3 s | — |
| Attorney accept/reject UI response p95 | 200 ms | — |
| Attorney accuracy (top-3-severity accept rate) | ≥ 85% monthly | < 85% = playbook + prompt tuning sprint |
| Cost per NDA review | ≤ $1.50 | — |
| Cost per MSA review | ≤ $5.00 | — |
| RTO (recovery time objective, full-region failover) | 4 hours | — |
| RPO (recovery point objective, max data loss in DR) | 15 minutes | — |
| Cross-tenant access incidents | **0** | **Zero tolerance** |
| Document loss incidents | **0** | **Zero tolerance** |
| Audit chain break incidents | **0** | **Zero tolerance** |

## The 10 dimensions

### Dimension 1 — Reliability: AI vendor outage tolerance (T1)

**Problem.** Anthropic API has multi-hour outages, sometimes
quarterly. Without a plan, every agent review queues up and
attorneys can't act.

**Architecture — four-tier degradation chain:**

| Tier | Engine | Trigger | UX |
|---|---|---|---|
| A | Claude Sonnet 4.6 (primary) | Healthy | Normal — full quality |
| B | Claude Sonnet 4.5 (fallback) | Tier A circuit-open OR 3 consecutive failures | Normal — slight quality dip noted in metadata |
| C | GPT-4 Turbo (cross-vendor fallback) | Tiers A + B both circuit-open | Yellow banner: "Reviewing with backup AI — quality may vary." Audit row: `agent.fallback.engaged` |
| D | Deterministic regex/keyword playbook checker (always available) | Tiers A-C all unavailable, queue depth > 100 | Red banner: "AI unavailable. Showing keyword-only deviation check. Click to re-review when AI is restored." All redlines flagged confidence=null. |

**Implementation pattern:**

```typescript
// packages/ai/src/redline-pipeline.ts (new)
async function runReview(
  doc: DocumentText,
  playbook: Playbook,
  agentType: AgentType,
): Promise<AgentReview> {
  for (const tier of TIER_CHAIN) {
    const breaker = circuitBreakers.get(tier.id);
    if (breaker.isOpen()) continue;
    try {
      const review = await tier.execute(doc, playbook, agentType);
      await logAudit({ action: "agent.review.produced", metadata: { tier: tier.id } });
      return review;
    } catch (err) {
      breaker.recordFailure();
      await logAudit({ action: "agent.tier.failed", metadata: { tier: tier.id, error: err.name } });
      // continue to next tier
    }
  }
  // Tier D — deterministic fallback. Always succeeds.
  return runDeterministicReview(doc, playbook, agentType);
}
```

**Circuit breaker config (per tier):**
- 5 consecutive failures in 60s window → open
- Open state: 5 minutes before half-open probe
- Half-open: single test request; success → close, failure → re-open

**Retry policy within a tier:**
- 3 attempts max
- Exponential backoff: 1s, 4s, 9s (jitter ±25%)
- Idempotency key per attempt so the vendor dedupes

**Status page integration:** AEGIS pulls Anthropic + OpenAI
status pages every 60s. A vendor-declared incident pre-opens that
tier's circuit breaker without waiting for our own failures to
trigger it.

**Observability:**
- Metric `agent.tier.engaged{tier}` counter per invocation
- Alert: tier A engagement rate < 95% over 1 hour → page on-call
- Alert: tier D engagement at all → page on-call (means all
  vendor AI is down)

**ADR-001 (recorded below): Multi-LLM business-continuity over
single-vendor.**

---

### Dimension 2 — Failover: storage backend redundancy (T2, T7)

**Problem.** If Vercel Blob has an incident, every uploaded
document becomes inaccessible. Documents are evidence — losing
them or having them temporarily unavailable during a regulator
deadline is unacceptable.

**Architecture — dual-write with content-hash verification:**

```
Upload request
     │
     ▼
Compute SHA-256
     │
     ├──── Write to Vercel Blob (primary) ─────┐
     │                                          │
     └──── Write to AWS S3 (secondary) ────────┤
                                                │
                                                ▼
                                  Both succeed: Document row created
                                  One fails: Document row created
                                              with degraded=true
                                  Both fail: Upload rejected (4xx)
```

**Read path:**
```
Read request
     │
     ▼
Try Vercel Blob with timeout 2s
     │
     ├── Success: verify SHA-256 matches Document.contentHash
     │       │
     │       ├── Match: return bytes
     │       └── Mismatch: critical incident — page on-call,
     │                     try S3, audit `document.hash_mismatch`
     │
     └── Failure / timeout: fall to S3
             │
             ├── Success: verify hash, audit `document.failover_read`
             └── Failure: 503 to client, audit `document.read_failed`
```

**Schema (`Document` extensions in `@aegis/db`):**

```prisma
model Document {
  // ... existing polymorphic fields ...

  // Storage descriptors — dual-write
  primaryBackend          String        // "vercel-blob"
  primaryKey              String        // backend-specific opaque id
  secondaryBackend        String?       // "s3" — null if upload-time second-write failed
  secondaryKey            String?
  contentHash             String        // SHA-256 hex
  sizeBytes               Int
  mimeType                String

  // Health
  degraded                Boolean       @default(false)  // true when one of the two backends failed at write time
  lastIntegrityCheckAt    DateTime?     // last time we verified hash matches both backends
  lastIntegrityCheckPassed Boolean?

  // ... rest unchanged ...
}
```

**Reconciliation:**
- Nightly job lists every Document with `degraded=true`, retries
  the failed backend write. Clears flag on success.
- Weekly job samples 1% of all Documents, downloads from both
  backends, recomputes hash, compares to `contentHash`. Any
  mismatch → page.
- Quarterly DR drill: restore-from-secondary runbook executed in
  staging. Audit chain verified post-restore. Pass/fail
  documented.

**Backup retention:**
- 7 years for production documents (legal-records-retention
  floor — many state bars require this)
- Cross-region replication for S3 (us-east-1 primary, us-west-2
  replica)
- Vercel Blob is single-region but the S3 replica covers the
  cross-region requirement
- On EU-residency tenants: eu-west-1 primary, eu-central-1
  replica — never replicates to US

**ADR-002 (recorded below): Dual-write storage with content-hash
verification on every read.**

**Out-of-scope:**
- Real-time block-level replication (Postgres-style streaming
  replication for object storage). Object stores don't generally
  expose this; eventual-consistency-with-reconciliation is the
  industry pattern.

---

### Dimension 3 — Concurrency: multi-attorney on the same review (T8)

**Problem.** In a firm, multiple attorneys may open the same
ticket simultaneously. Attorney A accepts a redline; Attorney B
rejects it. Without a plan, last-write-wins and one decision
silently disappears.

**Architecture — optimistic locking + real-time presence:**

**Schema:**

```prisma
model Redline {
  // ... existing fields ...
  version           Int       @default(1)
  // Bumped on every state transition. Mutation rejects if the
  // client's expected version doesn't match.
}

model AgentReview {
  // ... existing fields ...
  reviewLockedBy    String?   // User.id holding the doc-generation lock
  reviewLockedAt    DateTime?
  // Cleared once the revised document is produced (or after
  // 10 min idle — auto-release).
}
```

**API contract:**

```typescript
// PATCH /api/agent/redlines/[id]
{
  expectedVersion: 7,
  decision: "ACCEPTED" | "REJECTED" | "EDITED",
  editedText?: string,
}
// 200: { redline: <new>, version: 8 }
// 409: { error: "version_conflict", current: <server state>, yourExpected: 7 }
```

UI on 409: shows "Lena Pérez also reviewed this redline 30s ago
and ACCEPTED it. Do you want to override with REJECT?" — explicit
conflict resolution, never silent.

**Presence indicator:**
- Per-ticket SSE channel keyed on `AgentReview.id`
- Each connected client posts a heartbeat every 15s with userId
- Cockpit shows "Lena Pérez is also reviewing this" badge
- Doesn't prevent concurrent action — informational

**Doc-generation lock:**
- Before generating a revised document, attempt to acquire
  `reviewLockedBy` via row-level `UPDATE ... WHERE
  reviewLockedBy IS NULL` (atomic).
- If lock fails → 409 with current locker
- Auto-release after 10 min idle
- Explicit release on success or attorney cancel
- Audit on lock/unlock

**Idempotency for the final-document generation:**
- Each generation has a `generationId` UUID set by the client
- Server stores `(reviewId, generationId) → result` for 24h
- Retry with same generationId returns same result (doesn't
  re-call Claude, doesn't re-write Document)

**ADR-003 (recorded below): Optimistic concurrency with explicit
conflict resolution UI.**

---

### Dimension 4 — Rate limiting + cost control (T6)

**Problem.** Claude Sonnet 4.6 costs ~$3/M input + $15/M output
tokens. A 50-page MSA review ≈ 50K tokens ≈ $1 per review. A
1,000-reviews/day firm = $1K/day. A bug, a runaway loop, or a bad
actor could 10x that overnight. Without explicit limits, the
billing is unbounded.

**Architecture — three layers of cost control:**

**Layer 1: per-org daily token budget.**

```prisma
model OrganizationAgentBudget {
  organizationId      String   @id
  dailyTokenLimit     Int      // default 1_000_000 (~ $7 / day at current Claude prices)
  dailyTokensUsedToday Int     @default(0)
  resetAt             DateTime // start of next UTC day
  alertedAt50         DateTime?
  alertedAt80         DateTime?
  alertedAt100        DateTime?
}
```

- Every Claude call decrements available budget atomically
  (`UPDATE ... WHERE dailyTokensUsedToday + estimate <= dailyTokenLimit`).
- 0 available → reject with 429, audit `agent.budget.exhausted`,
  email org admin
- 50% used → email admin (warning)
- 80% used → email admin + Cockpit banner

**Layer 2: per-user hourly request cap.**

```typescript
// In-memory or Redis (depending on scale)
// Default: 10 reviews per user per hour
// Configurable per-role: requesters 5/hour, attorneys 20/hour, admin unlimited
```

**Layer 3: pre-flight token estimate.**

```typescript
function estimateTokens(doc: DocumentText, playbook: Playbook): number {
  return Math.ceil(doc.charCount / 4) + playbook.entries.length * 200 + 1500;
}
// UI shows: "This review will use approximately 12,400 tokens (~$0.18)."
// Submit button disabled if exceeds remaining daily budget.
```

**Hard cutoffs:**
- Document size > 25 MB upload → reject
- Document text > 200 K extracted tokens → reject, suggest splitting
- Single review estimated > 100 K tokens → require admin approval

**Audit on every Claude call:**
- `agent.claude.called` with `inputTokens`, `outputTokens`,
  `estimatedCostUsd`, `tier` (A/B/C), `agentType`
- Daily rollup job aggregates into `OrganizationAgentSpend` view
- Admin dashboard shows real-time spend

**ADR-004 (recorded below): Hard token budgets per org with
admin alerting and pre-flight estimation.**

---

### Dimension 5 — Observability (T1-T16 incident response)

**Problem.** When something breaks at 2 AM, the on-call needs to
know: what failed, for whom, how widespread, and what to do. The
current `console.error` JSON line pattern (from PR #53) is the
right shape, but a single-tier sink isn't enough for a firm-wide
production system.

**Architecture — three-pillar observability:**

**Pillar 1: logs (Sentry + Vercel Log Drains → Logtail).**
- Structured JSON via `@aegis/log` helper (new — single
  chokepoint)
- Sentry captures errors, exceptions, and warnings
- Logtail (or equivalent) captures structured log lines
- Both stripped of document content / PII before send
- Retention: 30 days hot, 1 year cold (compressed)

```typescript
// packages/log/src/index.ts (new package)
export function logEvent(level, source, event, fields) {
  // Strips known PII keys, never accepts a `documentContent` field
  const safe = sanitizePII(fields);
  console.log(JSON.stringify({ level, source, event, ...safe, timestamp: Date.now() }));
}
```

**Pillar 2: metrics (Vercel Analytics + custom counters).**
- Per-agent metrics: success/fail/latency-histogram/tokens/cost
- Per-document metrics: size, extract-time, upload-duration
- Per-redline metrics: accepted/rejected/edited counts
- Per-org metrics: budget-burn-rate, queue-depth
- Exported via `/api/metrics` (Prometheus-format) for any sink

**Pillar 3: tracing (OpenTelemetry via `@vercel/otel`).**
- Every API request gets a trace
- Every Claude call is a span (with token counts as span
  attributes)
- Every Storage operation is a span
- Every DB query > 100 ms is a span
- Sampled at 10% by default, 100% for errors
- Sink: Datadog APM, Honeycomb, or open-source Jaeger

**Alerting (SLO-based, not threshold-based):**

| Alert | Burn rate | Action |
|---|---|---|
| Latency p95 > 30s NDA | 14× of monthly budget over 1h | Page |
| Error rate > 1% | 14× burn over 1h | Page |
| Tier A engagement rate < 95% | 6× burn over 6h | Page on-call |
| Tier D engagement at all | Immediate | Page on-call, P0 |
| Cross-tenant access detected | Immediate | Page CTO, P0, isolate tenant |
| Daily budget breach (any org) | Immediate | Email admin (not page) |
| Document hash mismatch | Immediate | Page on-call, P0 |

**Runbook integration:**
- Each alert links to a `docs/runbooks/<name>.md`
- Runbook structure: symptoms → likely causes → mitigation steps
  → escalation contacts
- Runbooks live in this repo, versioned with code

**ADR-005 (recorded below): SLO-based alerting via burn-rate, not
threshold-based.**

---

### Dimension 6 — Security: privileged communications (T4, T5, T9, T11, T12)

**Problem.** Documents in this workflow contain:
- Attorney-client privileged communications (federal evidentiary
  protection)
- Trade secrets (state-law trade-secret protection)
- PII / PHI (GDPR / state-privacy-law protection)
- Material non-public information (securities-law concern)

A leak of any of these is a catastrophic event for the customer
firm. Their bar reputation, their client relationships, and
potentially their existence depend on AEGIS not leaking.

**Architecture — defense in depth:**

**Layer 1: at rest.**
- Vercel Blob: AES-256-GCM (managed by Vercel)
- AWS S3: AES-256 with KMS-managed keys (KMS key per tenant in
  enterprise tier)
- Neon: AES-256 at rest (default)
- Documented in the customer DPA

**Layer 2: in transit.**
- TLS 1.3 enforced on every endpoint
- HSTS with `includeSubDomains; preload`
- Internal service-to-service calls use mutual TLS (Vercel
  internal network)

**Layer 3: upload validation.**

```typescript
async function validateUpload(req: UploadRequest): Promise<ValidatedUpload> {
  // Size check (before reading body)
  if (req.contentLength > MAX_UPLOAD_BYTES) throw new TooLarge();

  // Magic-bytes MIME sniff — do NOT trust the client's MIME header
  const sniffed = await sniffMimeType(req.bodyStream);  // file-type npm
  if (!ALLOWED_MIME_TYPES.has(sniffed)) throw new UnsupportedMimeType();

  // Decompression-bomb check (ZIP/Office files are ZIP archives)
  if (sniffed === "application/vnd.openxmlformats-...") {
    const ratio = await getCompressionRatio(req.bodyStream);
    if (ratio > 100) throw new DecompressionBombSuspected();
  }

  // Virus scan — Cloudflare Workers AV (sync) or AWS Lambda + ClamAV (async)
  const scanResult = await virusScan(req.bodyStream);
  if (scanResult.infected) {
    await logEvent("warn", "documents.upload", "virus_detected", { ... });
    throw new VirusDetected();
  }

  return { sniffed, scanResult };
}
```

**Layer 4: document classification.**

```prisma
model Document {
  // ... existing ...
  classification    DocumentClassification    // see enum below
  classifiedAt      DateTime
  classifiedBy      String  // "USER" | "AGENT" | "DEFAULT"
}

enum DocumentClassification {
  PRIVILEGED       // attorney-client privileged content (highest)
  WORK_PRODUCT     // attorney work product (federal Rule 26(b)(3))
  BUSINESS_RECORD  // ordinary business record
  PUBLIC           // can be shared without restriction
}
```

- Default classification: WORK_PRODUCT (defensive)
- Requester can elect PRIVILEGED at upload
- Attorney can reclassify later
- PRIVILEGED + WORK_PRODUCT classifications restrict who can read

**Layer 5: PII redaction before AI vendor sees content.**

```typescript
function redactPIIForVendor(text: string): { redacted: string; map: RedactionMap } {
  const patterns = [
    { kind: "SSN", regex: /\b\d{3}-\d{2}-\d{4}\b/g },
    { kind: "CREDIT_CARD", regex: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g },
    { kind: "EMAIL", regex: /[\w.+-]+@[\w-]+\.[\w.-]+/g },
    { kind: "PHONE", regex: /\b\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g },
    { kind: "DOB", regex: /\b\d{1,2}\/\d{1,2}\/\d{4}\b/g },
    // ... extensible per-org via PIIPattern table
  ];
  // Replace with stable tokens (e.g., [SSN_001], [SSN_002]) so the
  // agent can still see structure. Re-inflate redlines server-side
  // before showing to attorney.
}
```

- Out-of-the-box patterns cover US PII
- Per-org extension table (`PIIPattern`) for industry-specific
  patterns (e.g., medical record numbers for life-sciences firms)
- Redaction map stored server-side, never sent to vendor, applied
  in reverse when displaying redlines to attorney
- Vendor sees structure, not content — redaction is loss-less for
  agent function

**Layer 6: per-document access control.**

```prisma
model DocumentAccessGrant {
  documentId        String
  userId            String  // OR `roleName` for role-based grants
  permission        DocumentPermission  // READ | WRITE | DELETE
  grantedAt         DateTime
  grantedBy         String
}

enum DocumentPermission { READ WRITE DELETE }
```

- Default: requester + assigned-attorney + assigned-team can READ
- Reassignments grant access (and audit)
- Explicit revocation possible
- PRIVILEGED docs require explicit grant — not inherited from
  team membership

**Layer 7: zero document content in logs.**
- `@aegis/log` rejects any field named `documentContent`,
  `documentBytes`, `extractedText`, or matching a content-shape
  heuristic at build time
- ESLint rule enforces this at lint time too
- Audit row for a document op records: id, size, hash,
  classification, action — never content

**Layer 8: document download audit.**

```prisma
model DocumentDownloadEvent {
  id                String   @id @default(cuid())
  documentId        String
  downloadedBy      String
  downloadedAt      DateTime
  ipAddress         String
  userAgent         String
  // Linked to the AuditLog row for cryptographic chain seal
  auditLogId        String   @unique
}
```

Every download writes an audit row. Per-firm "who has seen what"
report available in admin UI.

**Layer 9: vendor-opt-out for PRIVILEGED documents.**

- Per-org config: "PRIVILEGED documents bypass AI vendors —
  manual review only."
- When set, PRIVILEGED docs never hit Claude / GPT — the Cockpit
  shows them with empty agent review and a "manual review only —
  AI vendor opt-out" banner.
- Default off (most firms accept vendor processing under DPA);
  opt-in for the strict ones.

**Layer 10: secrets rotation.**
- Anthropic API key, Vercel Blob token, AWS S3 access key, Auth0
  secret all rotated quarterly
- Rotation runbook in `docs/runbooks/secrets-rotation.md`
- New secrets deployed via env-var update; old secrets remain
  valid for 1-hour overlap window for in-flight requests
- Audit of every secret rotation

**ADR-006 (recorded below): PII redaction before AI vendor sees
content; per-doc classification; vendor-opt-out for PRIVILEGED.**

---

### Dimension 7 — Compliance: bar / regulator scrutiny (T13, T15)

**Problem.** Bar associations audit GC tooling. SEC and EU DPAs
do too. Retention, residency, defensible deletion, and eDiscovery
export all have specific shapes that auditors expect.

**Architecture:**

**Retention policy (configurable, defensible):**

```prisma
model RetentionPolicy {
  id                String    @id
  organizationId    String
  scope             String    // "Document" | "AgentReview" | "AuditLog"
  retentionYears    Int       // 0 = infinite
  triggerCondition  String?   // SQL-ish: e.g., "matter.closedAt IS NOT NULL"
  legalHoldOverride Boolean   @default(true)  // legal hold blocks deletion
}
```

- Default: infinite retention
- Per-matter override: when the matter closes + 7 years +
  no-legal-hold → defensible deletion
- Defensible deletion certificate generated (PDF + JSON, signed
  with org's key)
- Pre-deletion eDiscovery export to archive backup
- Audit row `document.retention.deleted` references the
  certificate id

**Data residency:**

```prisma
model Organization {
  // ... existing ...
  dataRegion          String  // "us" | "eu" | "uk"  
  ediscoveryRegion    String  // where exports are staged
}
```

- US-region orgs: storage in us-east-1 + us-west-2; Claude calls
  routed to us endpoints
- EU-region orgs: storage in eu-west-1 + eu-central-1; Claude
  calls routed to eu endpoints (Anthropic added EU region 2025);
  no replication outside EU
- Module-load guard: `RegionMismatchError` if a request handler
  loads an org's documents from the wrong region

**eDiscovery export shape:**

```typescript
interface EDiscoveryExport {
  $schema: "aegis.intake.ediscovery.v1";
  exportedAt: string;
  exportedBy: string;
  organizationId: string;
  scope: { matterId?: string; ticketIds?: string[]; dateRange?: { from: string; to: string } };
  documents: Array<{
    id: string;
    contentSha256: string;
    classification: DocumentClassification;
    bytes: Buffer | string;  // base64 inline; large docs as URL
    metadata: { ... };
    downloadHistory: DocumentDownloadEvent[];
  }>;
  agentReviews: AgentReview[];
  redlines: Redline[];
  agentDecisions: AgentDecision[];
  auditChain: {
    rows: AuditLog[];
    canonicalContentTexts: string[];  // verbatim, for off-DB hash verify
    chainVerificationReport: VerifyAuditChainResult;
  };
  signatureChain: { ... };  // export integrity signature
}
```

- PDF rendering for human-readable summary
- JSON for machine-readable evidence
- Both signed with org's key
- Hash of export bundle written to audit chain so the export
  itself is anchored

**GDPR right-to-erasure:**
- Erasure request creates an `ErasureRequest` row
- Job collects every Document, AgentReview, Redline,
  AgentDecision referencing the data subject
- Conflict with legal hold: erasure blocked, written to audit,
  requester notified ("your data is preserved under legal hold;
  resume erasure post-release")
- Without conflict: cryptographic erasure of subject's PII
  (replace with deterministic tokens), retain structure for audit
- Erasure certificate generated

**SOC 2 readiness:**
- Annual SOC 2 Type II audit (assumed Year 2)
- Controls catalog mapped to dimensions 1-10 in this doc
- Quarterly internal control review
- Customer DPA template references SOC 2 controls

**ADR-007 (recorded below): Defensible deletion + signed
eDiscovery export with anchored chain seal.**

---

### Dimension 8 — Performance: large documents under surge (T14)

**Problem.** A real MSA might be 80 pages / 200KB text. A surge
of 50 simultaneous filings would overwhelm a synchronous
architecture. UX must remain responsive.

**Architecture — async pipeline with streaming:**

```
Form submit
     │
     ▼
POST /api/intake/tickets ─── 202 Accepted ────► UI: "Reviewing…"
     │
     ▼
Enqueue AgentReviewJob (DB-backed, not Redis)
     │
     ▼
Worker (Vercel Cron + pg-boss-style queue) ────► Pulls job
     │
     ├─── Extract text (mammoth/pdf-parse) ────► AuditLog
     ├─── Redact PII                          
     ├─── Stream Claude with redline parser ───► On each redline parsed,
     │                                            INSERT into Redline table
     │                                            + SSE push to UI
     ├─── Generate revised document
     └─── Mark AgentReview COMPLETED
                │
                ▼
       UI Cockpit receives SSE: "Review done, 5 redlines found"
```

**Async patterns:**
- Submit returns 202 + reviewId immediately
- Worker processes async
- UI subscribes to SSE channel `/api/agent/reviews/[id]/stream`
- Each redline emitted as found → UI updates incrementally
- Attorney can start reviewing the first 2 redlines before the
  agent finishes the rest
- Final document available once all redlines emitted

**Chunking strategy for large documents:**
- Documents > 80K tokens are chunked
- Each chunk reviewed in parallel (max 4 concurrent per doc)
- Chunk boundaries respect semantic structure (section breaks,
  paragraph breaks)
- Cross-chunk concerns (e.g., "term defined in §1 used in §15
  inconsistently") handled by a final unification pass

**Queue management:**
- Max queue depth per agent type: 100 (configurable per org tier)
- Above threshold: new submissions get "queue full" 429 with
  Retry-After
- Below 70% threshold: alert auto-resolves
- Above 90%: alert + admin notification

**Surge capacity:**
- Vercel Serverless auto-scales the API handlers
- Workers are Vercel Cron-triggered every 30s, with max
  concurrency 20 per region
- Claude rate limit: 50 RPM per key (Anthropic Tier 3). Per-org
  Claude keys (BYOK) increase the parallel ceiling.

**ADR-008 (recorded below): Async streaming pipeline; chunked
parallel review for large documents.**

---

### Dimension 9 — Disaster recovery (T2, T3, T7, T16)

**Problem.** A regional outage, a database corruption, or a
backup verification failure are low-probability / catastrophic-
impact events. Plan or be ruined.

**Architecture:**

**RTO/RPO targets (committed):**
- RTO: 4 hours for full-region failover (degraded mode within
  15 min)
- RPO: 15 minutes — max acceptable data loss

**Recovery scenarios:**

| Scenario | Recovery |
|---|---|
| Vercel function failure | Vercel auto-retry + healthy regions; RTO < 1 min |
| Single Neon region outage | Failover to read replica (when Neon Multi-Region GA); RTO < 15 min |
| Neon database corruption | Point-in-time restore from last good snapshot; RTO < 4 hr; RPO 15 min |
| Vercel Blob outage | Reads served from S3 secondary; writes queued until restored; RTO 0 (degraded mode) |
| AWS S3 region outage | Reads served from Vercel Blob primary; reconciliation paused until restored |
| Both storage backends fail simultaneously | Reads fail with 503; uploads rejected; ops page; very rare |
| Anthropic API outage | Cascade through tiers B → C → D; agent reviews degrade in quality but never fail |
| Auth0 outage | Sessions expire normally; logins fail; AUTH0_SECRET fallback to dev-mode-admin **only in dev** (production fail-loud, no degraded login) |

**Backup strategy:**
- Neon PITR: 7-day window (longer with enterprise tier)
- Daily logical dump → S3 cross-region (90-day retention)
- Documents: dual-write covers (Vercel Blob + S3 + S3 cross-region replication)
- Audit chain: full snapshot weekly, used to verify chain
  integrity post-restore

**Quarterly DR drill:**
- Drill #1 (Q1): full Neon PITR restore to staging, run audit
  chain verifier, run full test suite
- Drill #2 (Q2): restore-from-S3-secondary documents in staging
- Drill #3 (Q3): simulated Anthropic outage — verify tier
  cascade works
- Drill #4 (Q4): simulated EU-region partition — verify region
  isolation
- Pass/fail logged in `docs/dr-drill-log.md`

**Runbooks:**
- `docs/runbooks/neon-pitr-restore.md`
- `docs/runbooks/storage-secondary-restore.md`
- `docs/runbooks/anthropic-outage.md`
- `docs/runbooks/region-failover.md`
- `docs/runbooks/audit-chain-divergence.md`

**On-call rotation:**
- 24/7 primary + secondary
- Tier-D (regex fallback) means even unmanned weekends don't
  fail customers — only quality degrades

---

### Dimension 10 — Multi-tenancy: strict isolation (T4)

**Problem.** Today, app-level `where: { organizationId }` filters
are the only isolation. A single forgotten filter is a cross-
tenant data leak. For Fortune 50 GCs this is a P0 incident with
contractual penalties.

**Architecture — defense in depth:**

**Layer 1: app-layer org filters (current).**
- Every Prisma query for an org-scoped table includes
  `organizationId`
- Code review enforces this manually today

**Layer 2: Postgres Row-Level Security (new).**
- RLS enabled on every org-scoped table:
  ```sql
  ALTER TABLE "Document" ENABLE ROW LEVEL SECURITY;
  CREATE POLICY org_isolation ON "Document"
    USING (organizationId = current_setting('app.org_id')::text);
  ```
- Connection-level `SET app.org_id = '<orgId>'` on every request
- Middleware (`packages/db/src/with-org-context.ts`) wraps every
  request handler
- Forgotten app-layer filter still gets blocked by RLS — defense
  in depth
- Tested in CI: a deliberately-broken query (omitted org filter)
  must return zero rows under RLS

**Layer 3: per-org document storage prefix.**
- Vercel Blob keys: `orgs/{orgId}/docs/{docId}/{version}.bin`
- S3 keys: `orgs/{orgId}/docs/{docId}/{version}.bin`
- Backend retrieval includes orgId in path — wrong-org request
  fails with 404 at the backend level, never reaches app layer

**Layer 4: per-org Claude API keys (enterprise tier).**
- BYOK: enterprise customers provide their own Anthropic key
- Claude routing uses the org's key
- Compromise of one org's key doesn't expose others
- Default tier: shared AEGIS-owned key (with stricter PII
  redaction + DPA coverage)

**Layer 5: per-org playbooks.**
- Playbook IDs are org-scoped
- A playbook ID referencing a different org's row → access denied
- Tested in CI: deliberately constructed cross-org reference must
  fail

**Layer 6: per-org rate limits.**
- Budget exhaustion in org A doesn't affect org B
- Queue isolation: per-org queue keys

**Cross-tenant isolation test (CI required check):**
- New `packages/db/tests/multi-tenant-isolation.test.ts`
- Spins up Postgres, seeds two orgs with overlapping data
- Runs every public endpoint with cross-org credentials
- Expects: zero rows leaked across tenants
- **Blocks merge if any test fails**

**Annual penetration test:**
- Third-party pentest focused on tenant isolation
- Findings tracked in `docs/security/pentest-reports/`
- Critical findings = release blockers

**Audit on cross-org attempts:**
- Any request that triggers an RLS-blocked query writes
  `security.cross_tenant.blocked` audit row
- Page on-call: this should never happen in normal operation;
  appearing means either a bug or an attack

---

## Cross-cutting infrastructure

### `@aegis/log` (new package)

Single chokepoint for structured logging. Strips known PII keys.
Rejects document-content shapes at runtime. ESLint rule rejects
banned field names at lint time.

### `@aegis/queue` (new package, lightweight)

DB-backed job queue (Postgres `SELECT FOR UPDATE SKIP LOCKED`
pattern). No Redis dependency. pg-boss-compatible API so we can
swap if scale demands.

### `@aegis/metrics` (new package)

Counter / histogram / gauge primitives. Exported via Prometheus
endpoint. Per-agent + per-org + per-tenant labels.

### `@aegis/log-redaction` (new package)

PII pattern library. Used by both `@aegis/log` (to strip from
logs) and the AI pipeline (to redact before Claude). Shared
configuration source of truth.

### Module-load assertions (new)

| Guard | Triggers |
|---|---|
| Storage backend selection (PR-B) | Production without `BLOB_READ_WRITE_TOKEN` AND `AWS_S3_BUCKET` → throw |
| Multi-LLM fallback config | Production without `OPENAI_API_KEY` (for Tier C) → warn, not throw — single-vendor is acceptable but logged |
| RLS policy presence | Build-time check: every model marked `@@org-scoped` must have an RLS policy |
| PII pattern set | Module load: required patterns present (SSN, CC, EMAIL, PHONE) |
| Audit action enumeration | All new audit actions registered in canonical action set |

### CI required checks (new for this surface)

| Check | What |
|---|---|
| `multi-tenant-isolation` | Cross-org access tests pass |
| `audit-chain-integrity` | Chain canary still passes with new actions |
| `pii-redaction-coverage` | Test cases for SSN/CC/EMAIL/PHONE/DOB all redact correctly |
| `storage-backend-contract` | Both Vercel Blob + S3 + local-FS implementations satisfy interface tests |
| `claude-prompt-regression` | Sample documents produce expected redline shapes (within tolerance) |
| `rls-coverage` | Every `@@org-scoped` model has an RLS policy |
| `dr-runbook-presence` | Every documented failure mode has a runbook |

---

## Architectural Decision Records (ADRs)

Concrete decisions worth pinning. Each has a date, status, and
revisit trigger.

### ADR-001 — Multi-LLM business-continuity, not response diversity

**Date:** 2026-05-16
**Status:** Proposed (pending sign-off)
**Decision:** Claude is the primary review engine. GPT-4 Turbo is
the cross-vendor fallback. Both vendors see the same redacted
content. We do NOT ensemble (run both and reconcile) — too
expensive, too complex, and quality gain is marginal.
**Revisit trigger:** Claude or OpenAI changes pricing 2× upward,
OR a self-hostable model reaches Claude Sonnet 4.6 quality.

### ADR-002 — Dual-write storage with content-hash verification

**Date:** 2026-05-16
**Status:** Proposed
**Decision:** Every document write goes to two backends (Vercel
Blob + S3) concurrently. Every read verifies SHA-256 against the
stored hash. Reconciliation job nightly.
**Revisit trigger:** A single backend reaches contractual 99.99%
SLA with full geo-replication that satisfies legal retention.

### ADR-003 — Optimistic concurrency with explicit conflict UI

**Date:** 2026-05-16
**Status:** Proposed
**Decision:** Redline state changes use version-checked PATCH.
Conflicts surface explicitly in the UI for attorney resolution.
No last-write-wins; no pessimistic locking.
**Revisit trigger:** Telemetry shows > 5% of state changes hit
409 — would imply we need real-time collaboration (Y.js / Yjs).

### ADR-004 — Hard token budgets per org with pre-flight estimation

**Date:** 2026-05-16
**Status:** Proposed
**Decision:** Per-org daily token budget with hard cutoff at
100%, alerts at 50%/80%. Pre-flight token estimate shown in UI
before submission.
**Revisit trigger:** Customer demand for usage-based pricing.

### ADR-005 — SLO-based alerting via burn-rate

**Date:** 2026-05-16
**Status:** Proposed
**Decision:** Alerts fire on multi-window burn-rate exceeding
SLO budget, not raw thresholds. Reduces false positives during
expected traffic patterns.
**Revisit trigger:** On-call fatigue or missed incidents.

### ADR-006 — PII redaction before AI vendor sees content

**Date:** 2026-05-16
**Status:** Proposed
**Decision:** Documents pass through PII redaction (SSN, CC,
email, phone, DOB, plus org-extensible patterns) before any AI
vendor call. Redaction map server-side only. Redlines re-inflated
with original PII before showing to attorney.
**Revisit trigger:** Self-hosted LLM makes redaction unnecessary.

### ADR-007 — Defensible deletion + signed eDiscovery export

**Date:** 2026-05-16
**Status:** Proposed
**Decision:** Retention policies are first-class. Deletion
generates a defensible certificate. eDiscovery exports include
canonical-content text + audit chain so they're independently
verifiable off-DB.
**Revisit trigger:** Regulatory change requiring different
export format.

### ADR-008 — Async streaming pipeline with chunked parallel review

**Date:** 2026-05-16
**Status:** Proposed
**Decision:** All agent reviews are async via DB-backed queue.
SSE streams redlines to UI as found. Documents > 80K tokens are
chunked + reviewed in parallel + unified.
**Revisit trigger:** Latency targets miss consistently or Claude
context window grows enough to make chunking unnecessary.

### ADR-009 — Postgres RLS as defense-in-depth for multi-tenancy

**Date:** 2026-05-16
**Status:** Proposed
**Decision:** Every org-scoped table has an RLS policy. Connection
sets `app.org_id` via middleware. App-layer org filters remain
(performance + readability) but RLS catches forgotten filters.
**Revisit trigger:** Migration to non-Postgres data store.

### ADR-010 — DB-backed job queue (not Redis)

**Date:** 2026-05-16
**Status:** Proposed
**Decision:** Use `SELECT FOR UPDATE SKIP LOCKED` Postgres
pattern. No Redis dependency. pg-boss-compatible API so swap is
cheap if scale demands.
**Revisit trigger:** Job throughput exceeds 100 jobs/sec
sustained.

---

## What this doesn't cover (intentionally deferred)

These are real concerns, but defer them past the 9-agent MVP:

- Real-time collaboration on redlines (Google-Docs-style cursors)
- OCR for scanned PDFs (Tesseract / AWS Textract)
- E-signature integration (DocuSign / Adobe Sign / built-in)
- Playbook auto-learning from attorney accept/reject patterns
- Counterparty negotiation chains (multi-round redline tracking)
- AI-generated playbook suggestions from past matters
- Self-hosted LLM option for highest-strictness firms
- Multi-region active-active (vs active-passive)
- BYOK Claude key UI (enterprise tier; could ship before MVP if
  signed customer demands)

Each will become a future architecture doc or roadmap line item.

---

## Sign-off process

Before any code lands against this surface:

1. **Architecture sign-off (this doc).** Operator reads and either
   approves or pushes back on Assumptions A1-A8, the dimensions,
   and the ADRs. Sign-off captured in the merge commit message of
   the PR that lands this document.
2. **Per-PR architecture compliance.** Every PR against this
   surface includes a checklist line: "Does this PR honor the
   architecture commitments in `docs/agent-redline-architecture.md`?
   If not, what's the documented exception?"
3. **Architecture revisions.** Substantive changes (a new
   Assumption, a new ADR, removal of a commitment) require a
   dedicated PR with operator sign-off — not a sneaky addition
   inside a feature PR.

---

## Roadmap derived from this architecture

See [`agent-redline-roadmap.md`](./agent-redline-roadmap.md) for
the PR sequence. **The roadmap is derived from this document.**
If the roadmap proposes work that violates this architecture, the
architecture wins and the roadmap is wrong.

---

## Open questions for operator sign-off

These are the calls I need explicit answers on before
implementation begins. Until answered, the assumption-table
defaults govern.

1. **Multi-tenant vs single-tenant deploy?** (A1)
2. **Volume target?** (A2)
3. **Regulatory scope?** (A3)
4. **AI vendor strategy — Claude-only acceptable, or require
   GPT-4 fallback for business continuity?** (A4)
5. **Hosting topology — Vercel + Neon + Blob, or anything
   different?** (A5)
6. **Privileged-content handling — vendor-under-DPA OK, or
   need self-hosted LLM option?** (A6)
7. **Retention default — infinite, or per-jurisdiction floor?** (A7)
8. **Bulk-accept behaviour — paranoia-confirm at ≥3 BLOCKERS, or
   stricter?** (A8)
9. **Initial Anthropic Tier (1 / 2 / 3 / 4)? Affects RPM caps and
   thus surge capacity.**
10. **BYOK (bring-your-own-key) Claude in scope for MVP or post-MVP?**
11. **PII pattern library — do we have org-specific patterns to
    seed beyond the US default (SSN, CC, email, phone, DOB)?**
12. **Customer pen-test cadence — annual sufficient, or quarterly
    required by an existing customer?**

Answer these and I'll revise the architecture to lock in the
specifics, then derive the roadmap, then start the foundation
PR. Until then, no code lands.
