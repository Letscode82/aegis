/**
 * Secret encryption helpers (sub-PR 4c — dev-only plaintext).
 *
 * The `encryptSecret` / `decryptSecret` interface is the stable
 * shape callers must use to write / read encrypted secret material —
 * primarily `OrganizationM365Credential.encryptedClientSecret` for now,
 * extensible to any future per-org secret.
 *
 * Sub-PR 4c ships a **dev-only plaintext implementation**: the bytes
 * stored are just UTF-8 of the secret with a 4-byte version prefix.
 * This is documented in CLAUDE.md "Documented exceptions" with sunset
 * = before first paying customer. The interface stays the same when
 * the implementation switches to KMS-backed envelope encryption — no
 * caller moves.
 *
 * Why "v1" version prefix: the upgrade path from plaintext to envelope
 * encryption needs to distinguish stored ciphertext shape so the
 * future v2 helper can refuse to "decrypt" a plaintext-era row by
 * reading random bytes as an IV. The version prefix is the discriminator.
 */

const VERSION_V1_PLAINTEXT = Buffer.from([0x76, 0x31, 0x70, 0x6c]); // "v1pl"
// Reserved for future revisions; kept here so the constant lives in
// one place when KMS-backed encryption ships.
// const VERSION_V2_KMS_AES256_GCM = Buffer.from([0x76, 0x32, 0x6b, 0x6d]);

export class SecretDecryptError extends Error {
  constructor(reason: string) {
    super(`Refusing to decrypt secret material: ${reason}`);
    this.name = "SecretDecryptError";
  }
}

/**
 * Encrypt a plaintext secret for at-rest storage.
 *
 * 4c implementation: prepend the v1 marker, append UTF-8 of the
 * secret. The output is the bytes you write to
 * `OrganizationM365Credential.encryptedClientSecret`.
 */
export function encryptSecret(plaintext: string): Buffer {
  return Buffer.concat([VERSION_V1_PLAINTEXT, Buffer.from(plaintext, "utf8")]);
}

/**
 * Decrypt a previously-stored secret. Throws SecretDecryptError if
 * the version prefix is unknown — guards against misreading future
 * envelope-encrypted rows after the v2 implementation ships without
 * the migration step having run.
 */
export function decryptSecret(stored: Buffer | Uint8Array): string {
  const buf = Buffer.isBuffer(stored) ? stored : Buffer.from(stored);
  if (buf.length < 4) {
    throw new SecretDecryptError("missing version prefix");
  }
  const prefix = buf.subarray(0, 4);
  if (prefix.equals(VERSION_V1_PLAINTEXT)) {
    return buf.subarray(4).toString("utf8");
  }
  throw new SecretDecryptError(
    `unknown version prefix 0x${prefix.toString("hex")} — refusing to decrypt`,
  );
}

/**
 * Stable hash of plaintext for cache-invalidation comparisons. Used by
 * the M365 client cache to detect env-var rotation without storing the
 * secret itself.
 */
import { createHash } from "node:crypto";

export function secretFingerprint(plaintext: string | undefined | null): string {
  if (!plaintext) return "empty";
  return createHash("sha256")
    .update(plaintext, "utf8")
    .digest("hex")
    .slice(0, 16);
}
