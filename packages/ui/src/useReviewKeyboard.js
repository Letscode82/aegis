import { useEffect, useRef } from "react";

/**
 * useReviewKeyboard — the one keyboard-navigation hook shared by every AEGIS
 * review surface (eDiscovery coding, invoice review, intake triage, …). It
 * replaces the per-surface duplicates.
 *
 * `bindings` is a list of `{ keys, run, label? }`:
 *   - keys:  array of KeyboardEvent.key values (case-insensitive), e.g.
 *            ["j", "ArrowDown"].
 *   - run:   handler invoked with the event when a key matches.
 *   - label: optional, for rendering a legend (see ReviewCockpit).
 *
 * It attaches a single window keydown listener that:
 *   - ignores events from text inputs / textareas / selects / contentEditable
 *     so typing a rejection reason never fires a shortcut;
 *   - ignores modifier chords (⌘/Ctrl/Alt) so browser shortcuts still work;
 *   - matches case-insensitively and calls preventDefault on a hit.
 *
 * Bindings are read through a ref so callers can pass fresh closures each
 * render without re-subscribing. Pass `{ enabled: false }` to suspend (e.g.
 * while a modal is layered above the cockpit).
 */
export function useReviewKeyboard(bindings, options = {}) {
  const enabled = options.enabled !== false;
  const ref = useRef(bindings);
  ref.current = bindings;

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return undefined;
    function onKey(e) {
      const el = e.target;
      const tag = el && el.tagName ? String(el.tagName).toLowerCase() : "";
      if (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        (el && el.isContentEditable)
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = String(e.key || "").toLowerCase();
      for (const b of ref.current || []) {
        if (!b || !b.keys) continue;
        if (b.keys.some((k) => String(k).toLowerCase() === key)) {
          e.preventDefault();
          b.run(e);
          return;
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}
