-- CLM Phase 6b: structured key terms on Contract. Additive + nullable.
ALTER TABLE "Contract" ADD COLUMN "paymentTerms" TEXT;
ALTER TABLE "Contract" ADD COLUMN "scopeOfServices" TEXT;
