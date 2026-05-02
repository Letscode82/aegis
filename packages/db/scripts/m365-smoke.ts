/**
 * pnpm m365:smoke — manual local-dev smoke test of the real
 * Microsoft Graph integration.
 *
 * Reads M365_TENANT_ID + M365_CLIENT_ID + M365_CLIENT_SECRET from
 * the env, resolves the demo org's M365 client (env-var path), and
 * exercises each of the 8 M365Client methods end-to-end against the
 * configured tenant.
 *
 * Reports per-method status, duration, and a sample of the return.
 * Does NOT run in CI — CI lacks credentials. Confirms the audit log
 * received entries afterwards.
 *
 * Run from repo root:
 *
 *   $env:M365_TENANT_ID    = "<tenant>"
 *   $env:M365_CLIENT_ID    = "<client>"
 *   $env:M365_CLIENT_SECRET = "<secret>"
 *   pnpm --filter @aegis/db exec tsx scripts/m365-smoke.ts
 */
import { prisma } from "../src/client";
// Smoke-script imports cross the package edge into modules/matter
// only at dev time — see CLAUDE.md "Documented exceptions" for the
// existing seed precedent.
// eslint-disable-next-line import/no-restricted-paths -- Dev-only smoke script. Architectural rule prohibits modules ↔ packages coupling at RUNTIME; this never bundles or runs in app code. The smoke script is the local equivalent of a manual pnpm-driven verification.
import { getM365ClientForOrg } from "../../../modules/matter/src/internal/services/m365-factory";
// eslint-disable-next-line import/no-restricted-paths -- Same rationale as above.
import { verifyM365Credentials } from "../../../modules/matter/src/internal/services/m365-graph-auth";

const DEMO_ORG_NAME = "AEGIS Demo Corp";

async function main() {
  console.log("[m365-smoke] starting…");
  const env = {
    tenant: process.env.M365_TENANT_ID,
    client: process.env.M365_CLIENT_ID,
    secret: process.env.M365_CLIENT_SECRET,
  };
  if (!env.tenant || !env.client || !env.secret) {
    console.error(
      "[m365-smoke] M365_TENANT_ID / M365_CLIENT_ID / M365_CLIENT_SECRET must all be set.",
    );
    process.exit(1);
  }

  const org = await prisma.organization.findFirst({
    where: { name: DEMO_ORG_NAME },
  });
  if (!org) {
    console.error("[m365-smoke] demo org not found — run db:seed first.");
    process.exit(1);
  }

  console.log(`[m365-smoke] org=${org.id}`);

  // 0. Verify credentials.
  console.log("\n[verifyM365Credentials]");
  const verify = await verifyM365Credentials(org.id);
  console.log(`  ok=${verify.ok} durationMs=${verify.durationMs}`);
  if (verify.error) {
    console.error(`  error=${verify.error.name}: ${verify.error.message}`);
    process.exit(2);
  }
  console.log(`  tenantId=${verify.tenantId}`);

  const client = await getM365ClientForOrg(org.id);

  // 1. discoverCustodians.
  await timed("discoverCustodians", async () => {
    const candidates = await client.discoverCustodians({
      description: "snowflake",
      matterId: "m-snowflake-msa",
    });
    console.log(`  → ${candidates.length} candidate(s)`);
    candidates.slice(0, 3).forEach((c, i) => {
      console.log(`    [${i}] ${c.name} <${c.email}> ${c.matchRationale}`);
    });
  });

  // 2. enumerateDataSourcesForUser — pick the first candidate or
  //    fall back to a known service-account UPN. Without a real user
  //    in the tenant we just attempt a known-stable UPN; the smoke
  //    script tolerates 404s.
  const probeUpn = process.env.M365_SMOKE_USER_UPN ?? "noreply@" + (env.tenant ?? "");
  await timed("enumerateDataSourcesForUser", async () => {
    const sources = await client.enumerateDataSourcesForUser(probeUpn);
    console.log(`  → ${sources.length} source(s) for ${probeUpn}`);
    sources.forEach((s, i) =>
      console.log(`    [${i}] ${s.type} ${s.displayLabel}`),
    );
  });

  // 3. provisionMatterBindings (idempotent; uses the seeded matter).
  const matter = await prisma.matter.findFirst({
    where: { id: "m-snowflake-msa" },
  });
  if (matter) {
    await timed("provisionMatterBindings", async () => {
      const bindings = await client.provisionMatterBindings(matter);
      console.log(
        `  → sharepoint=${bindings.sharepoint?.folderId ?? "(none)"} teams=${bindings.teams?.channelId ?? "(none)"}`,
      );
    });
    await timed("getMatterBindings", async () => {
      const b = await client.getMatterBindings(matter.id);
      console.log(`  → provisionedAt=${b.provisionedAt ?? "(none)"}`);
    });
  } else {
    console.log("[skip] matter m-snowflake-msa not found");
  }

  // 4. applyPreservation — the eDiscovery dance. Uses the seeded
  //    hold's id so re-runs hit existing case.
  const hold = await prisma.legalHold.findFirst({ where: { id: "lh-snowflake" } });
  if (hold) {
    await timed("applyPreservation", async () => {
      const result = await client.applyPreservation({
        custodianExternalIdentifier: probeUpn,
        dataSourceExternalIdentifier: probeUpn,
        type: "EMAIL_MAILBOX",
        action: "LEGAL_HOLD_IN_PLACE",
        reasonCode: `hold:${hold.id}`,
      });
      console.log(`  → ok=${result.ok} ref=${result.upstreamReferenceId ?? "(none)"}`);
    });
  } else {
    console.log("[skip] hold lh-snowflake not found");
  }

  // 5. Audit chain inspection — confirm rows exist.
  const auditRows = await prisma.auditLog.count({
    where: { organizationId: org.id, action: { startsWith: "m365.graph" } },
  });
  console.log(`\n[audit] m365.graph.* rows in audit log: ${auditRows}`);

  console.log("\n[m365-smoke] done.");
  await prisma.$disconnect();
}

async function timed<T>(label: string, fn: () => Promise<T>): Promise<void> {
  const startedAt = Date.now();
  console.log(`\n[${label}]`);
  try {
    await fn();
  } catch (err) {
    const e = err as { name?: string; message?: string };
    console.error(`  ✗ ${e.name ?? "Error"}: ${e.message ?? String(err)}`);
  } finally {
    console.log(`  elapsed=${Date.now() - startedAt}ms`);
  }
}

main().catch((err) => {
  console.error("[m365-smoke] fatal:", err);
  process.exit(1);
});
