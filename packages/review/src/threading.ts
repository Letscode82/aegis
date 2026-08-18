/**
 * Email threading + near-duplicate detection for review sets (reviewer-parity
 * v2). Pure + deterministic so it unit-tests without a DB or Graph:
 *
 * - `threadId` groups an email conversation (Graph `conversationId` when present,
 *   else a normalized-subject hash). `isInclusive` marks the most-inclusive
 *   (latest) member of a thread — the one a reviewer must read; the rest can be
 *   thread-suppressed.
 * - `dedupKey` groups exact / near-duplicate messages (normalized subject + body
 *   prefix hash) so duplicates can be culled to one.
 *
 * Families (email + attachments) are assigned at persistence time, not here —
 * this module only reasons over message-level text.
 */
export function normalizeSubject(subject: string): string {
  return (subject || "")
    .replace(/^(\s*(re|fw|fwd|aw|wg)\s*:\s*)+/i, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Small deterministic string hash (djb2 → hex). */
export function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0");
}

export interface ThreadInput {
  id: string;
  subject: string;
  body?: string | null;
  conversationId?: string | null;
  sentAt?: string | null;
}
export interface ThreadAssignment {
  threadId: string;
  dedupKey: string;
  isInclusive: boolean;
}

function threadKey(it: ThreadInput): string {
  const cid = (it.conversationId || "").trim();
  if (cid) return `cid:${cid}`;
  const norm = normalizeSubject(it.subject);
  return norm ? `subj:${hashString(norm)}` : `msg:${it.id}`;
}
function dedupKey(it: ThreadInput): string {
  const norm = normalizeSubject(it.subject);
  const body = (it.body || "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 500);
  return hashString(`${norm}\n${body}`);
}

/** Assign threadId / dedupKey / isInclusive to every input (order-independent
 *  except stable tie-breaks). Latest `sentAt` in a thread is inclusive; a thread
 *  of one is inclusive. */
export function assignThreadingAndDedup(items: ThreadInput[]): Map<string, ThreadAssignment> {
  const out = new Map<string, ThreadAssignment>();
  const byThread = new Map<string, ThreadInput[]>();
  for (const it of items) {
    const tk = threadKey(it);
    const arr = byThread.get(tk); if (arr) arr.push(it); else byThread.set(tk, [it]);
    out.set(it.id, { threadId: tk, dedupKey: dedupKey(it), isInclusive: false });
  }
  for (const [, arr] of byThread) {
    if (arr.length === 0) continue;
    // most-inclusive = latest sentAt; ties resolved by last position (stable).
    let winner: ThreadInput = arr[0]!;
    for (const it of arr) {
      const a = it.sentAt || ""; const b = winner.sentAt || "";
      if (a >= b) winner = it;
    }
    const w = out.get(winner.id); if (w) w.isInclusive = true;
  }
  return out;
}
