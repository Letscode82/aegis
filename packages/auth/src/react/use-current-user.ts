/**
 * Client-side hook for the resolved current user.
 *
 * Returns { user, organization, role, permissions, loading, error }.
 * Wraps the /api/auth/me endpoint when Auth0 is configured, falling
 * back to /api/auth/dev-user (the dev-mode shim from
 * apps/web/pages/api/auth/dev-user.ts) when Auth0 is not configured.
 *
 * In both modes the shape is identical — the consumer doesn't branch
 * on the auth state.
 */

import { useEffect, useState } from "react";
import type { AuthUser, RoleName, Permission } from "../index";
import { ROLE_PERMISSIONS } from "../index";
import { getPreviewRole, subscribePreviewRole } from "./preview-role";

export interface CurrentUserState {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
}

/** Convenience accessors composed from CurrentUserState.user. */
export function useCurrentUser(): CurrentUserState & {
  has: (perm: Permission) => boolean;
  roleName: RoleName | null;
  /** The role being previewed (admin-only, read-only), or null. */
  previewRole: RoleName | null;
} {
  const [state, setState] = useState<CurrentUserState>({
    user: null,
    loading: true,
    error: null,
  });
  // Preview-as-role (admin-only, read-only). Re-render when it changes.
  const [preview, setPreview] = useState<RoleName | null>(() => getPreviewRole());
  useEffect(() => subscribePreviewRole(() => setPreview(getPreviewRole())), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/auth/current-user", {
          credentials: "include",
        });
        if (!r.ok) {
          if (cancelled) return;
          setState({
            user: null,
            loading: false,
            error: `current-user fetch failed: ${r.status}`,
          });
          return;
        }
        const data = (await r.json()) as { user: AuthUser | null };
        if (cancelled) return;
        setState({ user: data.user, loading: false, error: null });
      } catch (err) {
        if (cancelled) return;
        setState({
          user: null,
          loading: false,
          error: err instanceof Error ? err.message : "unknown error",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Preview applies only when the REAL user is an admin. It swaps the
  // rendered roleName + permission set for the previewed role; the real
  // user identity (id/name/email) is untouched, and the server enforces
  // real permissions on every mutation regardless of this.
  const realRole = state.user?.roleName ?? null;
  const previewActive = !!preview && realRole === "admin";
  const effectiveRole: RoleName | null = previewActive ? preview : realRole;
  const effectivePerms: readonly Permission[] = previewActive
    ? ROLE_PERMISSIONS[preview]
    : state.user?.permissions ?? [];

  const has = (perm: Permission): boolean => effectivePerms.includes(perm);

  return {
    ...state,
    has,
    roleName: effectiveRole,
    previewRole: previewActive ? preview : null,
  };
}
