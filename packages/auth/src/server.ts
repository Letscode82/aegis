/**
 * Server-only Auth0 wiring.
 *
 * Two modes, decided at runtime by checking AUTH0_SECRET:
 *
 *   1. Configured  — AUTH0_SECRET + AUTH0_BASE_URL + AUTH0_ISSUER_BASE_URL
 *                    + AUTH0_CLIENT_ID + AUTH0_CLIENT_SECRET all set.
 *                    Real auth flow: handleAuth() routes login/logout/
 *                    callback/me; getResolvedSession reads the encrypted
 *                    cookie + upserts a User row keyed by email.
 *
 *   2. Disabled   — any required env var missing.
 *                    Local-dev mode: the demo runs as the seeded
 *                    admin (Alex Nguyen) with no login flow. Useful
 *                    for `pnpm dev` against a fresh sandbox where
 *                    setting up an Auth0 tenant is overkill.
 *
 * The mode flips silently — nothing crashes when keys are absent. The
 * route protection middleware in apps/web checks isAuth0Configured()
 * and short-circuits to "let everyone in as the demo admin" when off.
 *
 * The seed admin in Step 2 has every Permission. Step 3's seeded
 * test users let local dev preview the demo as different roles by
 * editing the .env.local override (DEV_USER_EMAIL).
 */

import type { NextApiRequest, NextApiResponse } from "next";
import {
  prisma,
  type User as DbUser,
  type Organization as DbOrganization,
  type Role as DbRole,
} from "@aegis/db";
import {
  type AuthUser,
  type RoleName,
  ROLE_PERMISSIONS,
  ALL_ROLES,
  Permission,
} from "./index";

const REQUIRED_ENV_VARS = [
  "AUTH0_SECRET",
  "AUTH0_BASE_URL",
  "AUTH0_ISSUER_BASE_URL",
  "AUTH0_CLIENT_ID",
  "AUTH0_CLIENT_SECRET",
] as const;

/**
 * True iff every Auth0 env var is set with a non-empty value. Cached
 * once per process — env vars don't change at runtime in serverless,
 * and this is read on every request so the cache matters.
 */
let _configured: boolean | null = null;
export function isAuth0Configured(): boolean {
  if (_configured !== null) return _configured;
  _configured = REQUIRED_ENV_VARS.every(
    (k) => typeof process.env[k] === "string" && process.env[k]!.length > 0,
  );
  return _configured;
}

/**
 * Default email for dev-mode resolution. Override with DEV_USER_EMAIL
 * to preview the app as one of the seeded test users.
 */
const DEMO_USER_EMAIL =
  process.env.DEV_USER_EMAIL ?? "alex.nguyen@aegis-demo.example";

/**
 * Resolve the current user from the request context.
 *
 * Configured mode: read the Auth0 session cookie, upsert a User row
 *                  keyed by `email`, return the resolved AuthUser.
 * Disabled mode:   look up DEMO_USER_EMAIL (Alex by default) and
 *                  return that user. Same `AuthUser` shape — modules
 *                  don't branch on the auth state.
 *
 * Returns null only if (a) Auth0 is configured, (b) no session, AND
 * (c) caller didn't already redirect — middleware should normally
 * have handled the no-session case.
 */
export async function getResolvedUser(
  req: NextApiRequest | { headers: Record<string, string | string[] | undefined> },
  res?: NextApiResponse,
): Promise<AuthUser | null> {
  if (!isAuth0Configured()) {
    return resolveByEmail(DEMO_USER_EMAIL);
  }

  // Real Auth0 path. Imported lazily so dev mode without keys doesn't
  // pay the SDK init cost.
  const { getSession } = await import("@auth0/nextjs-auth0");
  // The 3.x SDK's getSession accepts (req, res) for Pages Router.
  // Cast through `unknown` because @types are awkward across Pages /
  // App Router shape variants.
  const session = await getSession(req as never, (res ?? {}) as never);
  if (!session?.user?.email) return null;

  return resolveByEmail(session.user.email, {
    name: session.user.name as string | undefined,
  });
}

/** Look up (or upsert) a User by email and assemble the AuthUser. */
async function resolveByEmail(
  email: string,
  hint?: { name?: string },
): Promise<AuthUser | null> {
  const dbUser = await prisma.user.findFirst({
    where: { email },
    include: { role: true, organization: true },
  });
  if (!dbUser) {
    // In configured mode, the first login from an unknown email would
    // upsert a User row here. In Step 3 we keep this strict — the seed
    // owns the canonical user list — and only return null. Step 4+ may
    // add an "auto-provision on first login" branch, gated behind a
    // tenant-level setting.
    return null;
  }
  return assembleAuthUser(dbUser, hint?.name);
}

interface DbUserWithRole extends DbUser {
  role: DbRole | null;
  organization: DbOrganization;
}

function assembleAuthUser(
  dbUser: DbUserWithRole,
  nameHint?: string,
): AuthUser {
  // Role resolution: prefer the User.role row's permissions JSON.
  // If the role name matches a known canonical RoleName and the
  // Role.permissions JSON is empty/missing, fall back to the
  // ROLE_PERMISSIONS default set so a stub Role row still produces
  // a working user.
  const dbRoleName = dbUser.role?.name;
  const isCanonical =
    typeof dbRoleName === "string" &&
    (ALL_ROLES as readonly string[]).includes(dbRoleName);
  const roleName = (isCanonical ? dbRoleName : null) as RoleName | null;

  const persistedPerms = dbUser.role?.permissions;
  const permissions =
    Array.isArray(persistedPerms) && persistedPerms.length > 0
      ? (persistedPerms as Permission[])
      : roleName
        ? Array.from(ROLE_PERMISSIONS[roleName])
        : [];

  return {
    id: dbUser.id,
    organizationId: dbUser.organizationId,
    email: dbUser.email,
    name: nameHint ?? dbUser.name,
    roleName,
    permissions,
  };
}

/** Convenience for non-API contexts (server components, scripts). */
export async function resolveDemoUser(): Promise<AuthUser | null> {
  return resolveByEmail(DEMO_USER_EMAIL);
}

// Re-export the catch-all handler factory from the same `./server`
// subpath so apps/web has one server-only entry point.
export { makeAuthHandler } from "./api-handler";
