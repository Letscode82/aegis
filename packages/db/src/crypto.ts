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
 *   v2 ("v2gc") — AES-256-GCM envelope encryption. Layout after the
 *     prefix: keyId(4) ‖ iv(12) ‖ authTag(16) ‖ ciphertext. The data
 *     key comes from `AEGIS_ENCRYPTION_KEY` (32 bytes, base64 or hex).
 *     This is the production format.
 *
 * Selection:
 *   - `AEGIS_ENCRYPTION_KEY` set  → encrypt writes v2 (production).
 *   - unset                       → encrypt writes v1 plaintext (dev),
 *     UNLESS `NODE_ENV=production`, where a missing key throws (fail-loud
 *     — never silently store plaintext secrets in production).
 *
 * decrypt reads either format, so a deployment can rotate from v1 → v2
 * with no migration: existing rows decrypt as v1, new writes are v2.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const VERSION_V1_PLAINTEXT = Buffer.from([0x76, 0x31, 0x70, 0x6c]); // "v1pl"
const VERSION_V2_GCM = Buffer.from([0x76, 0x32, 0x67, 0x63]); // "v2gc"
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

  throw new SecretDecryptError(
    `unknown version prefix 0x${prefix.toString("hex")} — refusing to decrypt`,
  );
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
