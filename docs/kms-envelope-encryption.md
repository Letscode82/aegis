# KMS envelope encryption for secrets at rest (F-7)

AEGIS stores a few secrets at rest — the per-org M365 app client secret and
the delegated eDiscovery refresh token
(`OrganizationM365Credential.encryptedClientSecret` /
`.delegatedRefreshToken`). They are sealed through `@aegis/db`'s
`encryptSecretEnvelope` / `decryptSecretEnvelope`.

There are three on-disk formats, distinguished by a 4-byte version prefix.
`decryptSecretEnvelope` reads all three, so you can roll forward with **no
migration** — existing rows keep decrypting under their own version and new
writes use whichever format the environment selects.

| Version | What seals the secret | When it's written |
|---|---|---|
| `v1pl` | nothing — plaintext | dev only, no key configured (throws in `NODE_ENV=production`) |
| `v2gc` | AES-256-GCM with the key in `AEGIS_ENCRYPTION_KEY` | `AEGIS_ENCRYPTION_KEY` set, `AEGIS_KMS_PROVIDER` unset |
| `v3km` | **KMS envelope** — a random per-secret data key, itself wrapped by a KMS-managed KEK | `AEGIS_KMS_PROVIDER` set |

v3 is the production target: the sensitive key material (the KEK) lives in a
KMS with its own rotation, access policy and audit — never in an env var.

## Turning on KMS envelope encryption

Set `AEGIS_KMS_PROVIDER` to one of:

### `aws` — AWS KMS (production)

```
AEGIS_KMS_PROVIDER=aws
AEGIS_KMS_KEY_ID=arn:aws:kms:us-east-1:123456789012:key/abcd-…   # or a key id / alias
AEGIS_KMS_REGION=us-east-1          # optional; falls back to AWS_REGION
```

Credentials resolve through the AWS default provider chain (IAM role on the
runtime is preferred; env vars / shared config also work). The IAM principal
needs `kms:Encrypt` and `kms:Decrypt` on that key. `@aws-sdk/client-kms` is a
dependency of `@aegis/db` and is imported lazily — it only loads when the
`aws` provider is active.

### `local` — local KEK (dev / CI, no network)

```
AEGIS_KMS_PROVIDER=local
AEGIS_KMS_LOCAL_KEK=<32 bytes, base64 or hex>   # falls back to AEGIS_ENCRYPTION_KEY
```

Real envelope wrapping with a local AES-256-GCM KEK. Useful for exercising
the v3 path without a cloud account. Not for production — the KEK is still in
an env var.

Generate a key with `openssl rand -base64 32`.

## Rolling from v2 (or v1) to v3

1. Provision a KMS key and grant the runtime `Encrypt`/`Decrypt`.
2. Set `AEGIS_KMS_PROVIDER` (+ key id) and deploy.
3. Every subsequent secret write is v3. Old v1/v2 rows keep decrypting.
4. To re-seal existing rows as v3 eagerly, re-enter the M365 credentials in
   `/admin/m365` (app-only card) and re-run the delegated Connect — both
   write paths now produce v3. There is no data migration to run.

## Adding another KMS backend

Implement the `KmsProvider` interface (`id`, `wrapDataKey`, `unwrapDataKey`)
and register it with `registerKmsProvider(...)`; the v3 payload records the
provider `id`, so decrypt routes back to the right backend. GCP KMS, Azure
Key Vault and Vault Transit all fit this shape.
