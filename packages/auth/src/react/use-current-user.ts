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

export interface CurrentUserState {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
}

/** Convenience accessors composed from CurrentUserState.user. */
export function useCurrentUser(): CurrentUserState & {
  has: (perm: Permission) => boolean;
  roleName: RoleName | null;
} {
  const [state, setState] = useState<CurrentUserState>({
    user: null,
    loading: true,
    error: null,
  });

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

  const has = (perm: Permission): boolean =>
    !!state.user && state.user.permissions.includes(perm);

  return {
    ...state,
    has,
    roleName: state.user?.roleName ?? null,
  };
}
