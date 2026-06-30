/**
 * Secret encryption (crypto.ts). v1 plaintext (dev) ↔ v2 AES-256-GCM
 * (production), with backward-compatible decrypt. Pure — no DB needed
 * (runs in the db-integrity vitest stage alongside the chain tests).
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  encryptSecret,
  decryptSecret,
  SecretDecryptError,
  SecretEncryptError,
} from "../src/crypto";

const KEY_B64 = Buffer.alloc(32, 7).toString("base64"); // deterministic 32-byte key
const OTHER_KEY_B64 = Buffer.alloc(32, 9).toString("base64");

const savedKey = process.env.AEGIS_ENCRYPTION_KEY;
const savedEnv = process.env.NODE_ENV;
beforeEach(() => {
  delete process.env.AEGIS_ENCRYPTION_KEY;
  process.env.NODE_ENV = "test";
});
afterEach(() => {
  if (savedKey === undefined) delete process.env.AEGIS_ENCRYPTION_KEY;
  else process.env.AEGIS_ENCRYPTION_KEY = savedKey;
  process.env.NODE_ENV = savedEnv;
});

describe("encryptSecret / decryptSecret", () => {
  it("dev (no key): writes v1 plaintext and round-trips", () => {
    const out = encryptSecret("s3cr3t-value");
    expect(out.subarray(0, 4).toString("latin1")).toBe("v1pl");
    expect(decryptSecret(out)).toBe("s3cr3t-value");
  });

  it("production (no key): refuses to write plaintext", () => {
    process.env.NODE_ENV = "production";
    expect(() => encryptSecret("x")).toThrow(SecretEncryptError);
  });

  it("with key: writes v2 (encrypted, not plaintext) and round-trips", () => {
    process.env.AEGIS_ENCRYPTION_KEY = KEY_B64;
    const secret = "refresh-token-abc123";
    const out = encryptSecret(secret);
    expect(out.subarray(0, 4).toString("latin1")).toBe("v2gc");
    expect(out.toString("utf8")).not.toContain(secret); // actually encrypted
    expect(decryptSecret(out)).toBe(secret);
  });

  it("decrypts legacy v1 rows even after a key is configured (no migration)", () => {
    const legacy = encryptSecret("old-plaintext"); // v1 (no key yet)
    process.env.AEGIS_ENCRYPTION_KEY = KEY_B64;
    expect(decryptSecret(legacy)).toBe("old-plaintext");
  });

  it("rejects a v2 row when the key is missing", () => {
    process.env.AEGIS_ENCRYPTION_KEY = KEY_B64;
    const out = encryptSecret("secret");
    delete process.env.AEGIS_ENCRYPTION_KEY;
    expect(() => decryptSecret(out)).toThrow(SecretDecryptError);
  });

  it("rejects a v2 row sealed with a different key", () => {
    process.env.AEGIS_ENCRYPTION_KEY = KEY_B64;
    const out = encryptSecret("secret");
    process.env.AEGIS_ENCRYPTION_KEY = OTHER_KEY_B64;
    expect(() => decryptSecret(out)).toThrow(SecretDecryptError);
  });

  it("detects tampering via the GCM auth tag", () => {
    process.env.AEGIS_ENCRYPTION_KEY = KEY_B64;
    const out = encryptSecret("secret");
    out[out.length - 1] ^= 0xff; // flip a ciphertext byte
    expect(() => decryptSecret(out)).toThrow(SecretDecryptError);
  });

  it("rejects a malformed encryption key", () => {
    process.env.AEGIS_ENCRYPTION_KEY = "too-short";
    expect(() => encryptSecret("x")).toThrow(SecretEncryptError);
  });

  it("rejects an unknown version prefix", () => {
    expect(() => decryptSecret(Buffer.from("zzzz-garbage"))).toThrow(SecretDecryptError);
  });
});
