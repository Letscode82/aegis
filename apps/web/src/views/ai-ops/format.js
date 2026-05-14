/**
 * Pure formatting helpers for the AgentScorecard tiles.
 *
 * Kept as a separate module (no React imports) so the unit tests in
 * modules/intake/tests/ can exercise them directly without rendering.
 *
 * Unit-clarity contract (all human-readable, no bare single-letter
 * abbreviations — "m" alone could be minutes or months):
 *
 *   formatPercent — null → "—" · 0.836 → "84%"
 *   formatCount   — null → "—" · 0..999 → "42" · 1_000+ → "1.2k"
 *   formatDuration — null → "—"
 *                  · < 60 sec        → "42 sec"
 *                  · < 60 min        → "1.6 min"
 *                  · < 24 hr         → "2.5 hr"
 *                  · ≥ 24 hr         → "1.8 days"
 *
 * The duration cutoffs use the natural unit boundary so a value that
 * sits exactly on the boundary (e.g. 60_000 ms = 60.0 sec) reads in
 * the larger unit ("1.0 min") rather than the smaller ("60 sec").
 */

export function formatPercent(v){
  if (v === null || v === undefined) return "—";
  return `${Math.round(v * 100)}%`;
}

export function formatCount(n){
  if (n === null || n === undefined) return "—";
  if (n >= 1000) return `${(n/1000).toFixed(1)}k`;
  return String(n);
}

export function formatDuration(ms){
  if (ms === null || ms === undefined) return "—";
  if (ms < 0) return "—";
  const sec = ms / 1000;
  if (sec < 60) return `${Math.round(sec)} sec`;
  const min = sec / 60;
  if (min < 60) return `${min.toFixed(1)} min`;
  const hr = min / 60;
  if (hr < 24) return `${hr.toFixed(1)} hr`;
  const days = hr / 24;
  return `${days.toFixed(1)} days`;
}
