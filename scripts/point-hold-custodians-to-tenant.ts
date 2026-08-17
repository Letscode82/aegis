/**
 * point-hold-custodians-to-tenant.ts — repoint demo Legal Hold custodians
 * from the non-routable `@aegis-demo.example` addresses onto real M365 tenant
 * mailboxes, so the Hold → Collection flow (which now enumerates each
 * custodian's own mailbox / OneDrive via the per-user Graph endpoints) returns
 * real seeded mail instead of zero hits.
 *
 * Run:
 *   pnpm --filter @aegis/db exec tsx scripts/point-hold-custodians-to-tenant.ts --tenant 6bs6wq.onmicrosoft.com
 *   # optionally map a demo custodian with no matching tenant user:
 *   #   --map "rhea.malhotra=lena.perez"
 *   # preview without writing:
 *   #   --verify-only
 *
 * A custodian is repointed when its current email local-part matches a real
 * tenant user (read from scripts/seed-data/users.json — the single source of
 * truth for the provisioned mailboxes) OR is listed in an explicit --map.
 *
 * Idempotent: re-running rewrites the same rows to the same tenant UPNs.
 * Dev-only tooling — it constructs its own PrismaClient the same way
 * prisma/seed.ts and seed-aegis-from-m365.ts do (build-time, not runtime app
 * code).
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient, PersonType } from "@prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEMO_DOMAIN = "aegis-demo.example";

// ── argv ──────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
function flag(name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}
const tenant = flag("tenant");
const verifyOnly = argv.includes("--verify-only");
if (!tenant) {
  console.error("Missing --tenant <domain>  (e.g. --tenant 6bs6wq.onmicrosoft.com)");
  process.exit(1);
}

// Explicit demo-local-part → tenant-local-part overrides.
const overrides = new Map<string, string>();
for (const pair of (flag("map") || "").split(",").map((s) => s.trim()).filter(Boolean)) {
  const [from, to] = pair.split("=").map((s) => s.trim());
  if (from && to) overrides.set(from.toLowerCase(), to.toLowerCase());
}

// Real tenant local-parts from the single source of truth.
const usersPath = join(__dirname, "seed-data", "users.json");
const tenantLocalParts = new Set<string>();
try {
  const doc = JSON.parse(readFileSync(usersPath, "utf8")) as { users?: Array<{ upnLocalPart?: string }> };
  for (const u of doc.users ?? []) if (u.upnLocalPart) tenantLocalParts.add(u.upnLocalPart.toLowerCase());
} catch {
  console.warn(`(could not read ${usersPath} — relying on --map only)`);
}

const prisma = new PrismaClient();

function localPart(email: string): string {
  return (email.split("@")[0] || "").toLowerCase();
}

async function main() {
  // Every custodian Person still on a demo-domain address.
  const custodians = await prisma.person.findMany({
    where: { type: PersonType.CUSTODIAN, email: { endsWith: `@${DEMO_DOMAIN}` } },
    select: { id: true, name: true, email: true },
  });

  if (custodians.length === 0) {
    console.log(`No custodians on @${DEMO_DOMAIN} — nothing to repoint (already done?).`);
    return;
  }

  let changed = 0;
  for (const c of custodians) {
    const lp = localPart(c.email || "");
    const targetLp = overrides.get(lp) || (tenantLocalParts.has(lp) ? lp : null);
    if (!targetLp) {
      console.log(`  skip  ${c.name.padEnd(20)} ${c.email}  (no matching tenant user; add via --map)`);
      continue;
    }
    const newEmail = `${targetLp}@${tenant}`;
    if (newEmail === c.email) continue;
    console.log(`  ${verifyOnly ? "would " : ""}point ${c.name.padEnd(20)} ${c.email}  →  ${newEmail}`);
    if (!verifyOnly) {
      await prisma.person.update({ where: { id: c.id }, data: { email: newEmail } });
      changed += 1;
    }
  }

  console.log(verifyOnly ? "\nVerify-only — no changes written." : `\nRepointed ${changed} custodian(s) onto @${tenant}.`);
  console.log("Next: seed those mailboxes (scripts/seed-investigation-mailbox.ps1), then run Hold → Collection → Preview.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
