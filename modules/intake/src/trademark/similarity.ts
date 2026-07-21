/**
 * Deterministic trademark knock-out similarity — the real first-pass a
 * clearance paralegal runs: phonetic (sound-alike), visual (look-alike),
 * and NICE-class overlap. Pure + unit-tested; no DB, no AI. This is what
 * makes the Trademark agent "functional" — a genuine conflict screen over
 * real marks data, not a qualitative guess.
 *
 * NOT a substitute for a formal registry clearance + counsel sign-off; a
 * knock-out screen surfaces obvious conflicts, it does not certify a mark.
 */

/** Lowercase, strip to alphanumerics — the match key (mirrors normalizedMark). */
export function normalizeMark(s: string): string {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Classic Soundex — the standard phonetic key for name/mark matching. */
export function soundex(s: string): string {
  const a = String(s || "").toUpperCase().replace(/[^A-Z]/g, "");
  if (!a) return "";
  const code = (c: string): string => {
    if ("BFPV".includes(c)) return "1";
    if ("CGJKQSXZ".includes(c)) return "2";
    if ("DT".includes(c)) return "3";
    if (c === "L") return "4";
    if ("MN".includes(c)) return "5";
    if (c === "R") return "6";
    return "0"; // vowels + H,W,Y
  };
  const first = a.charAt(0);
  let prev = code(first);
  let out = "";
  for (let i = 1; i < a.length && out.length < 3; i++) {
    const ch = a.charAt(i);
    const c = code(ch);
    if (c !== "0" && c !== prev) out += c;
    // H and W do not reset the "previous code" adjacency rule; vowels do.
    if (ch !== "H" && ch !== "W") prev = c;
  }
  return (first + out + "000").slice(0, 4);
}

/** Levenshtein edit distance. */
export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur: number[] = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
      cur[j] = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    prev = cur;
  }
  return prev[n] ?? 0;
}

/** 0..1 visual similarity (1 = identical). */
export function visualRatio(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  if (!max) return 0;
  return 1 - levenshtein(a, b) / max;
}

export interface MarkLike {
  wordMark: string;
  normalizedMark: string;
  niceClasses: number[];
  status?: string;
}

export interface Conflict {
  wordMark: string;
  score: number; // 0..1 severity
  basis: string[]; // ["identical"] | ["phonetic"] | ["visual"] | ["contains"]
  classOverlap: boolean;
  classes: number[];
  status: string;
}

const VISUAL_THRESHOLD = 0.8;

/**
 * Score a candidate mark against ONE reference mark. Returns a Conflict or
 * null if below the knock-out threshold. Class overlap boosts severity;
 * unknown candidate classes assume overlap (conservative). DEAD marks are
 * de-weighted but still surfaced (they can be revived / show a crowded field).
 */
export function scoreMark(candidateNorm: string, candidateSoundex: string, candidateClasses: number[], mark: MarkLike): Conflict | null {
  if (!candidateNorm || !mark.normalizedMark) return null;
  const basis: string[] = [];
  let score = 0;

  if (candidateNorm === mark.normalizedMark) {
    basis.push("identical");
    score = 1;
  } else {
    const vr = visualRatio(candidateNorm, mark.normalizedMark);
    const phon = candidateSoundex && candidateSoundex === soundex(mark.normalizedMark);
    const contains =
      (candidateNorm.length >= 4 && mark.normalizedMark.includes(candidateNorm)) ||
      (mark.normalizedMark.length >= 4 && candidateNorm.includes(mark.normalizedMark));
    if (vr >= VISUAL_THRESHOLD) { basis.push("visual"); score = Math.max(score, vr); }
    if (phon) { basis.push("phonetic"); score = Math.max(score, 0.72); }
    if (contains) { basis.push("contains"); score = Math.max(score, 0.75); }
    if (basis.length === 0) return null;
  }

  const classOverlap = candidateClasses.length === 0 || mark.niceClasses.length === 0
    ? true // unknown → assume overlap (conservative)
    : candidateClasses.some((c) => mark.niceClasses.includes(c));
  if (!classOverlap) score *= 0.6; // different field of use → lower risk
  if ((mark.status || "LIVE").toUpperCase() === "DEAD") score *= 0.7;

  return { wordMark: mark.wordMark, score: Math.round(score * 100) / 100, basis, classOverlap, classes: mark.niceClasses, status: mark.status || "LIVE" };
}

/** Screen a candidate against many marks; returns conflicts sorted worst-first. */
export function screenAgainstMarks(candidate: string, candidateClasses: number[], marks: MarkLike[]): Conflict[] {
  const norm = normalizeMark(candidate);
  const snd = soundex(norm);
  const conflicts: Conflict[] = [];
  for (const m of marks) {
    const c = scoreMark(norm, snd, candidateClasses, m);
    if (c && c.score >= 0.6) conflicts.push(c);
  }
  return conflicts.sort((a, b) => b.score - a.score);
}
