-- Contract integrity (tamper-evidence). Additive: a sealed-terms fingerprint on
-- Contract (captured at execution) and a per-signature fingerprint binding each
-- signature to the content it signed. Both nullable — no backfill.
ALTER TABLE "Contract"          ADD COLUMN "executedTermsHash" TEXT;
ALTER TABLE "ContractSignature" ADD COLUMN "signedTermsHash"   TEXT;
