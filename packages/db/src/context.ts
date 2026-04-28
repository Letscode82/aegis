/**
 * Multi-tenancy context — placeholders until Step 3.
 *
 * After Step 3 lands, getCurrentUser() and getCurrentOrganization() will
 * read from the Auth0 session via @aegis/auth. Until then, the demo runs
 * single-tenant and these helpers return the seeded demo org / demo user.
 *
 * The seed file (prisma/seed.ts) tags the demo org and user with stable
 * external refs so these helpers can resolve them without a session.
 */
import { prisma } from "./client.js";

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

export async function getCurrentOrganization(): Promise<CurrentOrganization> {
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

export async function getCurrentUser(): Promise<CurrentUser> {
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
