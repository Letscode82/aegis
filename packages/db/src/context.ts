/**
 * Multi-tenancy context.
 *
 * Two resolution paths, picked at call time:
 *
 *   1. With (req, res) — request-scoped resolution. Dynamically imports
 *      @aegis/auth/server.getResolvedUser, which honours an Auth0 session
 *      cookie when AUTH0_* env vars are set, OR falls back to the seeded
 *      demo user (Alex by default; override via DEV_USER_EMAIL).
 *
 *   2. Without arguments — script-scoped resolution. Looks up the seed
 *      demo org / demo user by name+email. Used by seed scripts, tests,
 *      and any context that doesn't carry an HTTP request.
 *
 * The dynamic import is deliberate: @aegis/auth depends on @aegis/db
 * (for the prisma singleton). A static import here would create a
 * package-graph cycle. Lazy resolution at call time defers @aegis/auth
 * loading to runtime, when the cycle is harmless.
 */
import { prisma } from "./client";

const DEMO_ORG_NAME = "AEGIS Demo Corp";
const DEMO_USER_EMAIL = "alex.nguyen@aegis-demo.example";

export interface CurrentUser {
  id: string;
  organizationId: string;
  email: string;
  name: string;
  roleId: string | null;
}

export interface CurrentOrganization {
  id: string;
  name: string;
  tier: string;
  region: string;
}

/**
 * Minimal request shape — accepts NextApiRequest or any object with
 * `headers`. We don't import Next types here to keep @aegis/db
 * framework-agnostic; @aegis/auth/server narrows from this.
 */
type RequestLike = { headers: Record<string, string | string[] | undefined> };
type ResponseLike = unknown;

/**
 * Local declaration of the @aegis/auth/server export we use. Importing
 * the package directly here would close the dependency cycle at
 * compile time (@aegis/auth depends on @aegis/db). The dynamic import
 * is resolved at runtime — apps/web has @aegis/auth installed, so the
 * lookup succeeds whenever a request-scoped caller invokes us.
 */
type AuthServerModule = {
  getResolvedUser(
    req: RequestLike,
    res?: ResponseLike,
  ): Promise<{
    id: string;
    organizationId: string;
    email: string;
    name: string;
    roleName: string | null;
    permissions: readonly string[];
  } | null>;
};

async function loadAuthServer(): Promise<AuthServerModule> {
  // Webpack / SWC see this as a dynamic import; type-only declaration
  // above lets us call it without a static dep edge.
  const mod = await import("@aegis/auth/server" as never);
  return mod as unknown as AuthServerModule;
}

export async function getCurrentOrganization(
  req?: RequestLike,
  res?: ResponseLike,
): Promise<CurrentOrganization> {
  // Request-scoped: defer to @aegis/auth, then look up the org by id.
  if (req) {
    const { getResolvedUser } = await loadAuthServer();
    const authUser = await getResolvedUser(req, res as never);
    if (authUser) {
      const org = await prisma.organization.findUnique({
        where: { id: authUser.organizationId },
      });
      if (org) {
        return {
          id: org.id,
          name: org.name,
          tier: org.tier,
          region: org.region,
        };
      }
    }
    // Auth0 returned null OR the resolved user's org row is missing.
    // Fall through to demo-org resolution rather than 500ing the demo.
  }

  const org = await prisma.organization.findFirst({
    where: { name: DEMO_ORG_NAME },
  });
  if (!org) {
    throw new Error(
      `[@aegis/db] Demo organization "${DEMO_ORG_NAME}" not found. Run \`pnpm --filter @aegis/db db:seed\` before starting the app.`,
    );
  }
  return {
    id: org.id,
    name: org.name,
    tier: org.tier,
    region: org.region,
  };
}

export async function getCurrentUser(
  req?: RequestLike,
  res?: ResponseLike,
): Promise<CurrentUser> {
  // Request-scoped: defer to @aegis/auth (Auth0 session OR dev fallback).
  if (req) {
    const { getResolvedUser } = await loadAuthServer();
    const authUser = await getResolvedUser(req, res as never);
    if (authUser) {
      // The CurrentUser shape carries `roleId` (Prisma FK), AuthUser
      // carries the resolved `roleName` instead. Re-derive roleId from
      // the User row so callers that need the FK still work.
      const dbUser = await prisma.user.findUnique({
        where: { id: authUser.id },
        select: { roleId: true },
      });
      return {
        id: authUser.id,
        organizationId: authUser.organizationId,
        email: authUser.email,
        name: authUser.name,
        roleId: dbUser?.roleId ?? null,
      };
    }
    // No session, no resolution — fall through.
  }

  const user = await prisma.user.findFirst({
    where: { email: DEMO_USER_EMAIL },
  });
  if (!user) {
    throw new Error(
      `[@aegis/db] Demo user "${DEMO_USER_EMAIL}" not found. Run \`pnpm --filter @aegis/db db:seed\`.`,
    );
  }
  return {
    id: user.id,
    organizationId: user.organizationId,
    email: user.email,
    name: user.name,
    roleId: user.roleId,
  };
}
