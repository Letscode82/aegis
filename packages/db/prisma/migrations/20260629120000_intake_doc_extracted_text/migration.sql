-- Intake document upload (P4a follow-up): store the plain-text
-- extraction of an uploaded .txt/.docx inline on the shared Document
-- entity. Demo-grade until @aegis/documents wires real blob storage.
-- Additive + nullable, so existing rows are unaffected.
ALTER TABLE "Document" ADD COLUMN "extractedText" TEXT;
