/**
 * Deep-review document loading.
 *
 * The deep skill review reads the ACTUAL text of a document, not a summary of
 * it. When a review is launched from an analyzed upload, the console used to
 * forward only OneLegal's prior *analysis* (a short summary) as the "document"
 * — so a thin or empty analysis left the playbook with nothing but a filename,
 * and it (correctly) refused to review content it never received.
 *
 * `loadReviewDocument` pulls the document's full extracted text server-side by
 * id — the authoritative source, the same `Document.extractedText` the
 * `/analyze` route reads — scoped to the caller's org. The review endpoints
 * prepend it to any pasted documents so the playbook always sees the real
 * clauses.
 *
 * Read-only; org-scoped; never throws for a caller's benefit — a missing /
 * empty / cross-org id resolves to `null` and the review proceeds on whatever
 * pasted text it already had.
 */
import { prisma } from "@aegis/db";

/**
 * A review carries the whole document, not just its head: a deviation review
 * misses a buried clause if the tail is dropped. This cap is generous (a full
 * NDA / commercial contract fits) but still bounds the prompt so a pathological
 * upload can't blow the model's context window. Larger than `/analyze`'s 12K
 * quick-read cap by design — the deep review is the exhaustive pass.
 */
export const REVIEW_DOC_MAX_CHARS = 48000;

export interface ReviewDocument {
  name: string;
  text: string;
}

/**
 * Load one org-scoped document's extracted text for a deep review, capped.
 * Returns `null` when the id is blank, not found in the caller's org, or has
 * no extractable text — the caller then reviews whatever was pasted.
 */
export async function loadReviewDocument(
  organizationId: string,
  documentId: string | undefined | null,
): Promise<ReviewDocument | null> {
  const id = String(documentId || "").trim();
  if (!id) return null;
  const doc = await prisma.document.findFirst({
    where: { id, organizationId },
    select: { name: true, extractedText: true },
  });
  if (!doc) return null;
  const full = (doc.extractedText || "").trim();
  if (!full) return null;
  const text =
    full.length > REVIEW_DOC_MAX_CHARS
      ? `${full.slice(0, REVIEW_DOC_MAX_CHARS)}\n\n[document truncated for length]`
      : full;
  return { name: doc.name || "document", text };
}
