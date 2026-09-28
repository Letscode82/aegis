/**
 * Text chunking for embedding. Splits on paragraph/sentence boundaries where
 * possible, targeting ~`size` characters per chunk with `overlap` characters
 * carried between adjacent chunks so a passage split across a boundary is still
 * retrievable from either side. Pure + deterministic (unit-tested).
 */

export interface ChunkOptions {
  /** Target chunk size in characters (default 1000). */
  size?: number;
  /** Overlap between adjacent chunks in characters (default 120). */
  overlap?: number;
}

const DEFAULT_SIZE = 1000;
const DEFAULT_OVERLAP = 120;

/** Normalize whitespace without destroying paragraph structure. */
function normalize(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export function chunkText(input: string, opts: ChunkOptions = {}): string[] {
  const size = Math.max(200, opts.size ?? DEFAULT_SIZE);
  const overlap = Math.min(Math.max(0, opts.overlap ?? DEFAULT_OVERLAP), Math.floor(size / 2));
  const text = normalize(input || "");
  if (!text) return [];
  if (text.length <= size) return [text];

  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + size, text.length);
    if (end < text.length) {
      // Prefer to break on a paragraph, then sentence, then word boundary
      // within the last third of the window so chunks end cleanly.
      const window = text.slice(start, end);
      const floor = Math.floor(size * 0.6);
      const para = window.lastIndexOf("\n\n");
      const sent = Math.max(window.lastIndexOf(". "), window.lastIndexOf("? "), window.lastIndexOf("! "));
      const word = window.lastIndexOf(" ");
      const cut = para >= floor ? para + 2 : sent >= floor ? sent + 2 : word >= floor ? word + 1 : -1;
      if (cut > 0) end = start + cut;
    }
    const piece = text.slice(start, end).trim();
    if (piece) chunks.push(piece);
    if (end >= text.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
}
