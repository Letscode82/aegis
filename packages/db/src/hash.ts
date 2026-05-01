/**
 * Content-hashing helper for chain-sealed artifacts.
 *
 * Used by `HoldNoticeTemplate.bodyHash` (sub-PR 4b) and any future
 * artifact whose stored content needs a cryptographic snapshot at
 * write time so consumers can detect tampering or template drift.
 *
 * SHA-256 hex digest matches the canonical form used by the AuditLog
 * cryptographic chain (`audit_log_compute_hash`) — same algorithm,
 * same encoding, so the audit-export tooling can reason about both
 * surfaces with one hash function.
 */
import { createHash } from "node:crypto";

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** Alias surfaced for callers in the legal-hold sub-domain. */
export const bodyHash = sha256Hex;
