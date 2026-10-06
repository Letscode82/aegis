import { useReviewKeyboard } from "@aegis/ui";

// Intake keyboard shortcuts — a thin adapter over the shared
// `useReviewKeyboard` hook (@aegis/ui) so there is ONE keyboard-navigation
// implementation across every AEGIS review surface (eDiscovery coding,
// invoice + contract cockpits, intake triage). This preserves the intake
// cockpit's existing API — a `{ key: handler }` map plus an `enabled` flag —
// and its exact behavior: skip typing in inputs / textareas / selects /
// contenteditable, ignore modifier chords, match keys case-insensitively
// (letters, arrows, "?", "/", " ", "Escape"). null / non-function handlers
// are ignored, matching the previous `if (handler)` guard.
export function useKeyboardShortcuts(handlers, enabled = true) {
  const bindings = Object.entries(handlers || {})
    .filter(([, run]) => typeof run === "function")
    .map(([key, run]) => ({ keys: [key], run }));
  useReviewKeyboard(bindings, { enabled });
}
