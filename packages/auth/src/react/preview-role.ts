/**
 * Preview-as-role (admin-only, read-only) — Auth0-safe.
 *
 * The dev "View as role" switcher impersonates a seeded user via a
 * cookie and is disabled under Auth0 (you can't act as someone else in a
 * real auth environment). This is the production-safe sibling: it changes
 * only what the CLIENT renders (nav, gated affordances, "would this role
 * act here"), computed from the previewed role's permission bundle. It
 * NEVER changes who a mutation runs as — the server resolves the real
 * user and enforces the real permissions, so every write is still the
 * admin, fully audited. Preview only takes effect when the real user is
 * an admin (enforced in useCurrentUser); the server ignores it entirely.
 *
 * A tiny module-level store (not React context) so every useCurrentUser
 * call site reflects the preview without wrapping the tree in a provider.
 */
import type { RoleName } from "../index";

const KEY = "aegis:preview_as_role";
type Listener = () => void;
const listeners = new Set<Listener>();

function readInitial(): RoleName | null {
  if (typeof window === "undefined") return null;
  try {
    return (window.localStorage.getItem(KEY) as RoleName | null) || null;
  } catch {
    return null;
  }
}

let previewRole: RoleName | null = readInitial();

export function getPreviewRole(): RoleName | null {
  return previewRole;
}

export function setPreviewRole(role: RoleName | null): void {
  previewRole = role;
  try {
    if (role) window.localStorage.setItem(KEY, role);
    else window.localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable — in-memory only */
  }
  listeners.forEach((l) => l());
}

export function subscribePreviewRole(cb: Listener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
