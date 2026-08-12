/**
 * Word-level diff (CTR-16) — true track-changes fidelity inside a clause.
 *
 * The version redline was clause-level (whole old text vs whole new text side by
 * side). This computes the intra-clause word diff so the UI can show insertions
 * and deletions inline, the way Word track-changes does. Pure, dependency-free,
 * LCS-based over word/whitespace tokens.
 */
export type WordDiffType = "equal" | "insert" | "delete";
export interface WordDiffSegment {
  type: WordDiffType;
  text: string;
}

/** Split into words and whitespace runs so spacing is preserved on both sides. */
function tokenize(s: string): string[] {
  return (s || "").match(/\s+|[^\s]+/g) ?? [];
}

// Above this token-product the O(n·m) LCS table gets expensive; a clause that
// large is better shown as a wholesale replace than a fine-grained diff.
const MAX_PRODUCT = 500_000;

/**
 * Word-level diff of `oldText` → `newText`. Returns ordered segments; consecutive
 * segments of the same type are merged so the render is compact.
 */
export function diffWords(oldText: string, newText: string): WordDiffSegment[] {
  const a = tokenize(oldText);
  const b = tokenize(newText);
  const n = a.length;
  const m = b.length;

  const out: WordDiffSegment[] = [];
  const push = (type: WordDiffType, text: string) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && last.type === type) last.text += text;
    else out.push({ type, text });
  };

  if (n === 0 && m === 0) return out;
  if (n * m > MAX_PRODUCT || n === 0 || m === 0) {
    push("delete", a.join(""));
    push("insert", b.join(""));
    return out;
  }

  // LCS length table (from the end).
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { push("equal", a[i]!); i++; j++; }
    else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) { push("delete", a[i]!); i++; }
    else { push("insert", b[j]!); j++; }
  }
  while (i < n) { push("delete", a[i]!); i++; }
  while (j < m) { push("insert", b[j]!); j++; }
  return out;
}

/** Convenience counts for a "N added / M removed words" summary. */
export function wordDiffStats(segments: WordDiffSegment[]): { added: number; removed: number } {
  const words = (t: string) => (t.match(/[^\s]+/g) ?? []).length;
  let added = 0;
  let removed = 0;
  for (const s of segments) {
    if (s.type === "insert") added += words(s.text);
    else if (s.type === "delete") removed += words(s.text);
  }
  return { added, removed };
}
