/**
 * KMS provider abstraction for envelope encryption (F-7).
 *
 * `crypto.ts` uses these providers to implement the v3 ("v3km") storage
 * format: a per-secret random data key (DEK) encrypts the plaintext with
 * AES-256-GCM locally, and the DEK itself is *wrapped* by a key-encryption
 * key (KEK) that a KMS owns. The wrapped DEK travels with the ciphertext;
 * the raw DEK never touches disk.
 *
 * This is the production replacement for the v2 scheme, where the AES key
 * lived directly in `AEGIS_ENCRYPTION_KEY`. With v3 the sensitive key
 * material is a KMS-managed KEK — rotation, access policy, and audit live
 * in the KMS, not in an env var.
 *
 * Two providers ship:
 *
 *   - `local`  — KEK comes from `AEGIS_KMS_LOCAL_KEK` (or, as a fallback,
 *     the existing `AEGIS_ENCRYPTION_KEY`). No network. Real envelope
 *     wrapping, used for dev / CI and as the zero-dependency default.
 *
 *   - `aws`    — KEK is an AWS KMS key (`AEGIS_KMS_KEY_ID` / ARN). Wrap and
 *     unwrap are AWS KMS `Encrypt` / `Decrypt` calls. `@aws-sdk/client-kms`
 *     is imported lazily so deployments that don't use AWS never load it.
 *
 * Adding another cloud KMS (GCP, Azure Key Vault, Vault Transit) is one new
 * `KmsProvider` and one `registerKmsProvider` call — the v3 payload records
 * the provider id so decrypt routes to the right one.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const WRAP_IV_BYTES = 12;
const WRAP_TAG_BYTES = 16;

/**
 * A key-management backend that wraps (encrypts) and unwraps (decrypts) a
 * 32-byte data key with a KEK it owns. Both directions are async because a
 * real KMS is a network service.
 */
export interface KmsProvider {
  /** Stable id recorded in the v3 payload so decrypt selects this provider. */
  readonly id: string;
  /** Encrypt a raw data key under the KEK. Returns opaque wrapped bytes. */
  wrapDataKey(dataKey: Buffer): Promise<Buffer>;
  /** Decrypt a previously-wrapped data key back to the raw 32-byte key. */
  unwrapDataKey(wrapped: Buffer): Promise<Buffer>;
}

export class KmsConfigError extends Error {
  constructor(reason: string) {
    super(`KMS is misconfigured: ${reason}`);
    this.name = "KmsConfigError";
  }
}

// ────────────────────────────────────────────────────────────────────
// Registry
// ────────────────────────────────────────────────────────────────────

const REGISTRY = new Map<string, KmsProvider>();

/**
 * Register (or override) a provider by its id. Built-in providers (`local`,
 * `aws`) register themselves lazily; tests and future cloud backends use
 * this to add their own.
 */
export function registerKmsProvider(provider: KmsProvider): void {
  REGISTRY.set(provider.id, provider);
}

/** Look up a provider by id, materialising a built-in one on first use. */
export function getKmsProvider(id: string): KmsProvider | null {
  const existing = REGISTRY.get(id);
  if (existing) return existing;
  const built = buildBuiltinProvider(id);
  if (built) {
    REGISTRY.set(built.id, built);
    return built;
  }
  return null;
}

/**
 * The provider to encrypt NEW secrets with, selected by
 * `AEGIS_KMS_PROVIDER` (`local` | `aws`). Returns null when unset — the
 * caller then falls back to the v1/v2 (non-KMS) path, so a deployment that
 * hasn't adopted KMS keeps working unchanged.
 */
export function getActiveKmsProvider(): KmsProvider | null {
  const id = (process.env.AEGIS_KMS_PROVIDER ?? "").trim().toLowerCase();
  if (!id) return null;
  const provider = getKmsProvider(id);
  if (!provider) {
    throw new KmsConfigError(
      `AEGIS_KMS_PROVIDER='${id}' is not a known provider (expected 'local' or 'aws', or a registered custom provider).`,
    );
  }
  return provider;
}

/** Test/util: forget materialised built-ins so env changes take effect. */
export function resetKmsProvidersForTest(): void {
  REGISTRY.clear();
}

function buildBuiltinProvider(id: string): KmsProvider | null {
  if (id === "local") return new LocalKmsProvider();
  if (id === "aws") return new AwsKmsProvider();
  return null;
}

// ────────────────────────────────────────────────────────────────────
// local provider — AES-256-GCM KEK from env, no network
// ────────────────────────────────────────────────────────────────────

/**
 * Wraps data keys with a local AES-256-GCM KEK. The KEK is read from
 * `AEGIS_KMS_LOCAL_KEK`, falling back to `AEGIS_ENCRYPTION_KEY` (so a
 * deployment already carrying the v2 key can turn on envelope encryption
 * without provisioning a new secret). base64 or hex, decoding to 32 bytes.
 *
 * The wrapped-key layout mirrors a KMS ciphertext blob: a 4-byte key id
 * (so a future KEK rotation is detectable) ‖ iv(12) ‖ tag(16) ‖ ciphertext.
 */
export class LocalKmsProvider implements KmsProvider {
  readonly id = "local";

  private resolveKek(): Buffer {
    const raw = (
      process.env.AEGIS_KMS_LOCAL_KEK ??
      process.env.AEGIS_ENCRYPTION_KEY ??
      ""
    ).trim();
    if (!raw) {
      throw new KmsConfigError(
        "local KMS provider needs AEGIS_KMS_LOCAL_KEK (or AEGIS_ENCRYPTION_KEY) — 32 bytes, base64 or hex.",
      );
    }
    const kek = /^[0-9a-fA-F]{64}$/.test(raw)
      ? Buffer.from(raw, "hex")
      : Buffer.from(raw, "base64");
    if (kek.length !== 32) {
      throw new KmsConfigError(
        "local KMS KEK must decode to 32 bytes (e.g. `openssl rand -base64 32`).",
      );
    }
    return kek;
  }

  private kekId(kek: Buffer): Buffer {
    return createHash("sha256").update(kek).digest().subarray(0, 4);
  }

  async wrapDataKey(dataKey: Buffer): Promise<Buffer> {
    const kek = this.resolveKek();
    const iv = randomBytes(WRAP_IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", kek, iv);
    const ct = Buffer.concat([cipher.update(dataKey), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([this.kekId(kek), iv, tag, ct]);
  }

  async unwrapDataKey(wrapped: Buffer): Promise<Buffer> {
    const kek = this.resolveKek();
    const idStart = 0;
    const ivStart = idStart + 4;
    const tagStart = ivStart + WRAP_IV_BYTES;
    const ctStart = tagStart + WRAP_TAG_BYTES;
    if (wrapped.length < ctStart) {
      throw new KmsConfigError("wrapped local data key is truncated.");
    }
    const storedId = wrapped.subarray(idStart, ivStart);
    if (!storedId.equals(this.kekId(kek))) {
      throw new KmsConfigError(
        "data key was wrapped with a different local KEK (rotation without re-encrypt).",
      );
    }
    const iv = wrapped.subarray(ivStart, tagStart);
    const tag = wrapped.subarray(tagStart, ctStart);
    const ct = wrapped.subarray(ctStart);
    const decipher = createDecipheriv("aes-256-gcm", kek, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  }
}

// ────────────────────────────────────────────────────────────────────
// aws provider — AWS KMS Encrypt/Decrypt, SDK imported lazily
// ────────────────────────────────────────────────────────────────────

type AwsKmsModule = typeof import("@aws-sdk/client-kms");
type AwsKmsClient = InstanceType<AwsKmsModule["KMSClient"]>;

/**
 * Wraps data keys with an AWS KMS key. `wrapDataKey` is a KMS `Encrypt`
 * (plaintext = the DEK, up to 4 KB — a 32-byte key is well under), and
 * `unwrapDataKey` is a KMS `Decrypt`. The KMS key id/ARN comes from
 * `AEGIS_KMS_KEY_ID` (or `AEGIS_KMS_KEY_ARN`); region from
 * `AEGIS_KMS_REGION` or the standard `AWS_REGION`. Credentials resolve
 * through the AWS default provider chain (IAM role, env, shared config).
 *
 * `@aws-sdk/client-kms` is imported lazily so a deployment that doesn't
 * use AWS never loads it.
 */
export class AwsKmsProvider implements KmsProvider {
  readonly id = "aws";
  private initPromise: Promise<{ mod: AwsKmsModule; client: AwsKmsClient }> | null = null;

  private keyId(): string {
    const id = (process.env.AEGIS_KMS_KEY_ID ?? process.env.AEGIS_KMS_KEY_ARN ?? "").trim();
    if (!id) {
      throw new KmsConfigError(
        "aws KMS provider needs AEGIS_KMS_KEY_ID (or AEGIS_KMS_KEY_ARN).",
      );
    }
    return id;
  }

  private async init(): Promise<{ mod: AwsKmsModule; client: AwsKmsClient }> {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        let mod: AwsKmsModule;
        try {
          mod = await import("@aws-sdk/client-kms");
        } catch {
          throw new KmsConfigError(
            "AEGIS_KMS_PROVIDER='aws' but @aws-sdk/client-kms is not installed. Run `pnpm add @aws-sdk/client-kms` in the deployment image.",
          );
        }
        const region = (process.env.AEGIS_KMS_REGION ?? process.env.AWS_REGION ?? "").trim();
        const client = new mod.KMSClient(region ? { region } : {});
        return { mod, client };
      })();
    }
    return this.initPromise;
  }

  async wrapDataKey(dataKey: Buffer): Promise<Buffer> {
    const { mod, client } = await this.init();
    const out = await client.send(
      new mod.EncryptCommand({ KeyId: this.keyId(), Plaintext: dataKey }),
    );
    if (!out.CiphertextBlob) {
      throw new KmsConfigError("AWS KMS Encrypt returned no CiphertextBlob.");
    }
    return Buffer.from(out.CiphertextBlob);
  }

  async unwrapDataKey(wrapped: Buffer): Promise<Buffer> {
    const { mod, client } = await this.init();
    // KeyId is optional on Decrypt (the blob records it) but passing it
    // pins the expected key so a swapped blob can't silently decrypt.
    const out = await client.send(
      new mod.DecryptCommand({ KeyId: this.keyId(), CiphertextBlob: wrapped }),
    );
    if (!out.Plaintext) {
      throw new KmsConfigError("AWS KMS Decrypt returned no Plaintext.");
    }
    return Buffer.from(out.Plaintext);
  }
}
