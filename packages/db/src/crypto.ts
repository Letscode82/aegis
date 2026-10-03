/**
 * Secret encryption helpers.
 *
 * The `encryptSecret` / `decryptSecret` interface is the stable shape
 * callers use to write / read encrypted secret material — primarily
 * `OrganizationM365Credential.encryptedClientSecret` and
 * `.delegatedRefreshToken`.
 *
 * Two on-disk formats, distinguished by a 4-byte version prefix:
 *
 *   v1 ("v1pl") — dev-only PLAINTEXT (the original 4c shipment). The
 *     bytes after the prefix are UTF-8 of the secret. Still *readable*
 *     for backward compatibility, never *written* once a key is set.
 *
 *   v2 ("v2gc") — single-key AES-256-GCM. Layout after the prefix:
 *     keyId(4) ‖ iv(12) ‖ authTag(16) ‖ ciphertext. The AES key comes
 *     directly from `AEGIS_ENCRYPTION_KEY` (32 bytes, base64 or hex).
 *     Interim production format — the key still lives in an env var.
 *
 *   v3 ("v3km") — KMS envelope encryption (F-7, the real production
 *     format). A fresh random data key encrypts the plaintext; the data
 *     key is wrapped by a KMS-managed KEK and travels with the ciphertext.
 *     See `kms.ts`. Written by the async `encryptSecretEnvelope`; read by
 *     the async `decryptSecretEnvelope`.
 *
 * Selection (sync `encryptSecret`, v1/v2 only):
 *   - `AEGIS_ENCRYPTION_KEY` set  → encrypt writes v2.
 *   - unset                       → encrypt writes v1 plaintext (dev),
 *     UNLESS `NODE_ENV=production`, where a missing key throws (fail-loud
 *     — never silently store plaintext secrets in production).
 *
 * Selection (async `encryptSecretEnvelope`):
 *   - `AEGIS_KMS_PROVIDER` set    → encrypt writes v3 (envelope).
 *   - unset                       → delegates to the sync v1/v2 path.
 *
 * decrypt reads every earlier format, so a deployment rotates v1 → v2 → v3
 * with no migration: existing rows decrypt under their own version, new
 * writes use whichever format the env selects.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { getActiveKmsProvider, getKmsProvider } from "./kms";

const VERSION_V1_PLAINTEXT = Buffer.from([0x76, 0x31, 0x70, 0x6c]); // "v1pl"
const VERSION_V2_GCM = Buffer.from([0x76, 0x32, 0x67, 0x63]); // "v2gc"
const VERSION_V3_KMS = Buffer.from([0x76, 0x33, 0x6b, 0x6d]); // "v3km"
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_ID_BYTES = 4;

export class SecretDecryptError extends Error {
  constructor(reason: string) {
    super(`Refusing to decrypt secret material: ${reason}`);
    this.name = "SecretDecryptError";
  }
}

export class SecretEncryptError extends Error {
  constructor(reason: string) {
    super(`Cannot encrypt secret material: ${reason}`);
    this.name = "SecretEncryptError";
  }
}

/** Decode AEGIS_ENCRYPTION_KEY → a 32-byte key, or null if unset. base64
 * or hex are both accepted (generate with `openssl rand -base64 32`). */
function resolveDataKey(): Buffer | null {
  const raw = (process.env.AEGIS_ENCRYPTION_KEY ?? "").trim();
  if (!raw) return null;
  let key: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, "hex");
  } else {
    key = Buffer.from(raw, "base64");
  }
  if (key.length !== 32) {
    throw new SecretEncryptError(
      "AEGIS_ENCRYPTION_KEY must decode to 32 bytes (e.g. `openssl rand -base64 32`).",
    );
  }
  return key;
}

/** Short, non-secret id for the active key, so a future rotation can tell
 * which key sealed a row. Derived from the key, never the key itself. */
function keyId(key: Buffer): Buffer {
  return createHash("sha256").update(key).digest().subarray(0, KEY_ID_BYTES);
}

/**
 * Encrypt a plaintext secret for at-rest storage. Writes v2 (AES-256-GCM)
 * when AEGIS_ENCRYPTION_KEY is set; otherwise writes v1 plaintext in dev,
 * or throws in production (fail-loud).
 */
export function encryptSecret(plaintext: string): Buffer {
  const key = resolveDataKey();
  if (!key) {
    if ((process.env.NODE_ENV ?? "").toLowerCase() === "production") {
      throw new SecretEncryptError(
        "AEGIS_ENCRYPTION_KEY is required in production — refusing to store plaintext secrets.",
      );
    }
    return Buffer.concat([VERSION_V1_PLAINTEXT, Buffer.from(plaintext, "utf8")]);
  }
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([VERSION_V2_GCM, keyId(key), iv, tag, ciphertext]);
}

/**
 * Decrypt a previously-stored secret. Reads v1 (legacy plaintext) and v2
 * (AES-256-GCM). Throws SecretDecryptError on an unknown prefix, a
 * missing/wrong key, or a failed auth tag (tamper / wrong key).
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

  if (prefix.equals(VERSION_V2_GCM)) {
    const key = resolveDataKey();
    if (!key) {
      throw new SecretDecryptError(
        "AEGIS_ENCRYPTION_KEY is not set but the stored secret is v2 (encrypted).",
      );
    }
    const off = 4;
    const storedKeyId = buf.subarray(off, off + KEY_ID_BYTES);
    if (!storedKeyId.equals(keyId(key))) {
      throw new SecretDecryptError(
        "stored secret was sealed with a different key (key rotation without re-encrypt).",
      );
    }
    const ivStart = off + KEY_ID_BYTES;
    const tagStart = ivStart + IV_BYTES;
    const ctStart = tagStart + TAG_BYTES;
    if (buf.length < ctStart) {
      throw new SecretDecryptError("v2 payload is truncated.");
    }
    const iv = buf.subarray(ivStart, tagStart);
    const tag = buf.subarray(tagStart, ctStart);
    const ciphertext = buf.subarray(ctStart);
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    } catch {
      throw new SecretDecryptError("authentication failed (wrong key or tampered data).");
    }
  }

  if (prefix.equals(VERSION_V3_KMS)) {
    throw new SecretDecryptError(
      "secret is v3 (KMS envelope) — use the async decryptSecretEnvelope() instead.",
    );
  }

  throw new SecretDecryptError(
    `unknown version prefix 0x${prefix.toString("hex")} — refusing to decrypt`,
  );
}

// ────────────────────────────────────────────────────────────────────
// v3 — KMS envelope encryption (F-7)
// ────────────────────────────────────────────────────────────────────
//
// v3 layout after the 4-byte prefix:
//   providerIdLen(1) ‖ providerId(utf8) ‖ wrappedLen(2 BE) ‖ wrappedDEK
//     ‖ iv(12) ‖ authTag(16) ‖ ciphertext
//
// The DEK is a fresh random 32-byte key per secret; it encrypts the
// plaintext with AES-256-GCM and is itself wrapped by the KMS-managed KEK.
// The raw DEK is never stored.

/**
 * Encrypt a secret for at-rest storage using KMS envelope encryption when a
 * provider is configured (`AEGIS_KMS_PROVIDER`), otherwise falling back to
 * the synchronous v1/v2 path. This is a safe superset of `encryptSecret`:
 * callers can always use it, and the storage format is chosen by env.
 *
 * Async because wrapping the data key is a KMS (network) operation.
 */
export async function encryptSecretEnvelope(plaintext: string): Promise<Buffer> {
  const provider = getActiveKmsProvider();
  if (!provider) {
    // No KMS configured — preserve existing behaviour (v2 with a key, v1
    // plaintext in dev, throw in production without a key).
    return encryptSecret(plaintext);
  }
  const dek = randomBytes(32);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", dek, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const wrapped = await provider.wrapDataKey(dek);
  const idBuf = Buffer.from(provider.id, "utf8");
  if (idBuf.length === 0 || idBuf.length > 255) {
    throw new SecretEncryptError(
      `KMS provider id must be 1..255 bytes (got ${idBuf.length}).`,
    );
  }
  if (wrapped.length > 0xffff) {
    throw new SecretEncryptError("wrapped data key is too large to serialise (>64 KB).");
  }
  const wrappedLen = Buffer.alloc(2);
  wrappedLen.writeUInt16BE(wrapped.length);
  return Buffer.concat([
    VERSION_V3_KMS,
    Buffer.from([idBuf.length]),
    idBuf,
    wrappedLen,
    wrapped,
    iv,
    tag,
    ciphertext,
  ]);
}

/**
 * Decrypt a previously-stored secret of ANY format: v1 (legacy plaintext),
 * v2 (local AES key), or v3 (KMS envelope). Use this anywhere a row might
 * have been written under KMS; the synchronous `decryptSecret` handles only
 * v1/v2 and throws a clear error if handed a v3 payload.
 */
export async function decryptSecretEnvelope(stored: Buffer | Uint8Array): Promise<string> {
  const buf = Buffer.isBuffer(stored) ? stored : Buffer.from(stored);
  if (buf.length < 4) {
    throw new SecretDecryptError("missing version prefix");
  }
  if (!buf.subarray(0, 4).equals(VERSION_V3_KMS)) {
    // v1 / v2 need no KMS round-trip.
    return decryptSecret(buf);
  }
  let off = 4;
  const idLen = buf.readUInt8(off);
  off += 1;
  if (buf.length < off + idLen + 2) {
    throw new SecretDecryptError("v3 payload is truncated (provider id).");
  }
  const providerId = buf.subarray(off, off + idLen).toString("utf8");
  off += idLen;
  const wrappedLen = buf.readUInt16BE(off);
  off += 2;
  const wrappedEnd = off + wrappedLen;
  const ctStart = wrappedEnd + IV_BYTES + TAG_BYTES;
  if (buf.length < ctStart) {
    throw new SecretDecryptError("v3 payload is truncated.");
  }
  const wrapped = buf.subarray(off, wrappedEnd);
  const iv = buf.subarray(wrappedEnd, wrappedEnd + IV_BYTES);
  const tag = buf.subarray(wrappedEnd + IV_BYTES, ctStart);
  const ciphertext = buf.subarray(ctStart);

  const provider = getKmsProvider(providerId);
  if (!provider) {
    throw new SecretDecryptError(
      `no KMS provider '${providerId}' registered — cannot unwrap this secret.`,
    );
  }
  let dek: Buffer;
  try {
    dek = await provider.unwrapDataKey(wrapped);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new SecretDecryptError(`KMS unwrap failed: ${reason}`);
  }
  if (dek.length !== 32) {
    throw new SecretDecryptError(
      `KMS returned a ${dek.length}-byte data key (expected 32).`,
    );
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", dek, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new SecretDecryptError("authentication failed (tampered data or wrong data key).");
  }
}

/**
 * Stable hash of plaintext for cache-invalidation comparisons. Used by
 * the M365 client cache to detect env-var rotation without storing the
 * secret itself.
 */
export function secretFingerprint(plaintext: string | undefined | null): string {
  if (!plaintext) return "empty";
  return createHash("sha256")
    .update(plaintext, "utf8")
    .digest("hex")
    .slice(0, 16);
}
