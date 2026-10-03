/**
 * Secret encryption (crypto.ts). v1 plaintext (dev) ↔ v2 AES-256-GCM
 * (production), with backward-compatible decrypt. Pure — no DB needed
 * (runs in the db-integrity vitest stage alongside the chain tests).
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  encryptSecret,
  decryptSecret,
  encryptSecretEnvelope,
  decryptSecretEnvelope,
  SecretDecryptError,
  SecretEncryptError,
} from "../src/crypto";
import {
  registerKmsProvider,
  resetKmsProvidersForTest,
  LocalKmsProvider,
  KmsConfigError,
  type KmsProvider,
} from "../src/kms";

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

  it("directs a v3 payload to the async envelope decryptor", async () => {
    installFakeKms();
    const v3 = await encryptSecretEnvelope("kms-secret");
    expect(v3.subarray(0, 4).toString("latin1")).toBe("v3km");
    expect(() => decryptSecret(v3)).toThrow(SecretDecryptError);
  });
});

/**
 * In-memory KMS provider standing in for a cloud KMS — wraps the data key
 * under a fixed KEK with XOR, enough to prove the envelope round-trips
 * without a network or the AWS SDK.
 */
const FAKE_KEK = Buffer.alloc(32, 0x5a);
function xorKek(buf: Buffer): Buffer {
  const out = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = buf[i] ^ FAKE_KEK[i % FAKE_KEK.length];
  return out;
}
const fakeProvider: KmsProvider = {
  id: "fake",
  wrapDataKey: async (dek) => xorKek(dek),
  unwrapDataKey: async (wrapped) => xorKek(wrapped),
};

const savedProviderEnv = process.env.AEGIS_KMS_PROVIDER;
function installFakeKms(): void {
  resetKmsProvidersForTest();
  registerKmsProvider(fakeProvider);
  process.env.AEGIS_KMS_PROVIDER = "fake";
}

describe("encryptSecretEnvelope / decryptSecretEnvelope (v3 KMS)", () => {
  beforeEach(() => {
    delete process.env.AEGIS_ENCRYPTION_KEY;
    process.env.NODE_ENV = "test";
    installFakeKms();
  });
  afterEach(() => {
    resetKmsProvidersForTest();
    if (savedProviderEnv === undefined) delete process.env.AEGIS_KMS_PROVIDER;
    else process.env.AEGIS_KMS_PROVIDER = savedProviderEnv;
  });

  it("writes v3 (envelope) and round-trips through the KMS provider", async () => {
    const secret = "m365-client-secret-xyz";
    const out = await encryptSecretEnvelope(secret);
    expect(out.subarray(0, 4).toString("latin1")).toBe("v3km");
    expect(out.toString("utf8")).not.toContain(secret); // truly encrypted
    expect(out.toString("utf8")).not.toContain("fake-wrong"); // sanity
    expect(await decryptSecretEnvelope(out)).toBe(secret);
  });

  it("records the provider id so decrypt routes to the right backend", async () => {
    const out = await encryptSecretEnvelope("abc");
    // byte 4 is the provider-id length; bytes after are the id
    const idLen = out[4];
    expect(out.subarray(5, 5 + idLen).toString("utf8")).toBe("fake");
  });

  it("uses a fresh data key per encryption (distinct ciphertexts)", async () => {
    const a = await encryptSecretEnvelope("same-input");
    const b = await encryptSecretEnvelope("same-input");
    expect(Buffer.compare(a, b)).not.toBe(0);
    expect(await decryptSecretEnvelope(a)).toBe("same-input");
    expect(await decryptSecretEnvelope(b)).toBe("same-input");
  });

  it("detects tampering of the v3 ciphertext via the GCM auth tag", async () => {
    const out = await encryptSecretEnvelope("secret");
    out[out.length - 1] ^= 0xff;
    await expect(decryptSecretEnvelope(out)).rejects.toThrow(SecretDecryptError);
  });

  it("fails when the provider that sealed a row is not registered", async () => {
    const out = await encryptSecretEnvelope("secret");
    resetKmsProvidersForTest(); // drop the 'fake' provider
    await expect(decryptSecretEnvelope(out)).rejects.toThrow(/no KMS provider 'fake'/);
  });

  it("the envelope decryptor still reads legacy v1 and v2 rows", async () => {
    // v1 (no KMS, no key)
    delete process.env.AEGIS_KMS_PROVIDER;
    const v1 = await encryptSecretEnvelope("legacy-plain");
    expect(v1.subarray(0, 4).toString("latin1")).toBe("v1pl");
    expect(await decryptSecretEnvelope(v1)).toBe("legacy-plain");
    // v2 (single AES key, no KMS)
    process.env.AEGIS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const v2 = await encryptSecretEnvelope("legacy-aes");
    expect(v2.subarray(0, 4).toString("latin1")).toBe("v2gc");
    expect(await decryptSecretEnvelope(v2)).toBe("legacy-aes");
  });

  it("throws on an unknown AEGIS_KMS_PROVIDER value", async () => {
    process.env.AEGIS_KMS_PROVIDER = "nope";
    await expect(encryptSecretEnvelope("x")).rejects.toThrow();
  });
});

describe("LocalKmsProvider (shipped envelope KEK)", () => {
  const savedKek = process.env.AEGIS_KMS_LOCAL_KEK;
  afterEach(() => {
    if (savedKek === undefined) delete process.env.AEGIS_KMS_LOCAL_KEK;
    else process.env.AEGIS_KMS_LOCAL_KEK = savedKek;
  });

  it("wraps and unwraps a data key with the local KEK", async () => {
    process.env.AEGIS_KMS_LOCAL_KEK = Buffer.alloc(32, 3).toString("base64");
    const provider = new LocalKmsProvider();
    const dek = Buffer.alloc(32, 42);
    const wrapped = await provider.wrapDataKey(dek);
    expect(Buffer.compare(wrapped, dek)).not.toBe(0); // actually wrapped
    expect(Buffer.compare(await provider.unwrapDataKey(wrapped), dek)).toBe(0);
  });

  it("refuses to unwrap a key sealed under a different KEK", async () => {
    process.env.AEGIS_KMS_LOCAL_KEK = Buffer.alloc(32, 3).toString("base64");
    const wrapped = await new LocalKmsProvider().wrapDataKey(Buffer.alloc(32, 1));
    process.env.AEGIS_KMS_LOCAL_KEK = Buffer.alloc(32, 9).toString("base64");
    await expect(new LocalKmsProvider().unwrapDataKey(wrapped)).rejects.toThrow(KmsConfigError);
  });

  it("requires a configured KEK", async () => {
    delete process.env.AEGIS_KMS_LOCAL_KEK;
    delete process.env.AEGIS_ENCRYPTION_KEY;
    await expect(new LocalKmsProvider().wrapDataKey(Buffer.alloc(32))).rejects.toThrow(
      KmsConfigError,
    );
  });
});
