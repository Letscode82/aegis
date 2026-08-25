/**
 * dedup-persons — clean up duplicate / non-Entra custodian Person rows.
 *
 * Two operations, DRY-RUN by default (pass --apply to mutate):
 *
 *   1. MERGE  — collapse Person rows that share the same email into one keeper,
 *               repointing every foreign key (with unique-constraint collision
 *               handling) and deleting the losers. Always safe; no Graph needed.
 *   2. PRUNE  — (opt-in: --prune-non-entra) remove *custodian* Person rows whose
 *               email does NOT resolve in the M365/Entra directory. Scoped hard
 *               to custodians with only hold/party references — so legitimate
 *               external people (counterparty contacts, DSAR subjects, external
 *               counsel) who are intentionally not in your tenant are never
 *               touched. Requires a real M365 connection (skipped in mock mode).
 *
 * Usage (from repo root):
 *   pnpm --filter @aegis/db exec tsx scripts/dedup-persons.ts                 # dry run, merge only
 *   pnpm --filter @aegis/db exec tsx scripts/dedup-persons.ts --prune-non-entra
 *   pnpm --filter @aegis/db exec tsx scripts/dedup-persons.ts --apply --prune-non-entra
 *   ...optionally --org <organizationId>
 */
import { prisma } from "../src/client";
// NOTE: the M365 client is imported LAZILY (only for --prune-non-entra), from
// narrow service paths — importing modules/matter/api here would transitively
// pull @aegis/ai-review, which isn't resolvable from inside packages/db.

const APPLY = process.argv.includes("--apply");
const PRUNE = process.argv.includes("--prune-non-entra");
function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

type PersonRow = { id: string; name: string; email: string | null; userId: string | null; type: string; createdAt: Date };

// Reference tallies per person id.
interface Refs { total: number; custodial: number; external: number; detail: Record<string, number> }

async function tallyRefs(ids: string[]): Promise<Map<string, Refs>> {
  const m = new Map<string, Refs>();
  const bump = (id: string, key: string, external: boolean, custodial: boolean) => {
    const r = m.get(id) ?? { total: 0, custodial: 0, external: 0, detail: {} };
    r.total += 1; r.detail[key] = (r.detail[key] ?? 0) + 1;
    if (external) r.external += 1;
    if (custodial) r.custodial += 1;
    m.set(id, r);
  };
  // (table, personColumn, isExternalData, isCustodial)
  const specs: Array<[keyof typeof prisma, string, string, boolean, boolean]> = [
    ["matterParty", "personId", "matterParty", false, true],
    ["legalHoldCustodian", "personId", "legalHoldCustodian", false, true],
    ["departedCustodianRetention", "personId", "departedRetention", false, true],
    ["intakeTicketParty", "personId", "intakeTicketParty", false, true],
    ["intakeTicket", "requesterId", "intakeRequester", true, false],
    ["timekeeper", "personId", "timekeeper", true, false],
    ["invoiceLineItem", "timekeeperId", "invoiceLineItem", true, false],
    ["dataSubjectRequest", "requesterPersonId", "dsarRequest", true, false],
    ["consentRecord", "dataSubjectPersonId", "consentRecord", true, false],
    ["contractReviewToken", "personId", "contractReviewToken", true, false],
  ];
  for (const [table, col, key, external, custodial] of specs) {
    const groups = await (prisma[table] as unknown as { groupBy: (a: unknown) => Promise<Array<Record<string, unknown>>> }).groupBy({
      by: [col], where: { [col]: { in: ids } }, _count: { _all: true },
    });
    for (const g of groups) {
      const id = g[col] as string | null;
      if (!id) continue;
      const count = (g._count as { _all: number })._all;
      for (let i = 0; i < count; i++) bump(id, key, external, custodial);
    }
  }
  // Document polymorphic owner (raw).
  const docRows = await prisma.$queryRaw<Array<{ ownerId: string; n: bigint }>>`
    SELECT "ownerId", COUNT(*)::bigint AS n FROM "Document"
    WHERE "ownerType" = 'Person' AND "ownerId" = ANY(${ids}) GROUP BY "ownerId"`;
  for (const d of docRows) for (let i = 0; i < Number(d.n); i++) bump(d.ownerId, "document", false, false);
  return m;
}

function chooseKeeper(group: PersonRow[], onEntra: (email: string | null) => boolean, refs: Map<string, Refs>): PersonRow {
  return [...group].sort((a, b) => {
    if (!!a.userId !== !!b.userId) return a.userId ? -1 : 1;           // linked login wins
    const ea = onEntra(a.email), eb = onEntra(b.email);
    if (ea !== eb) return ea ? -1 : 1;                                  // real Entra user wins
    const ra = refs.get(a.id)?.total ?? 0, rb = refs.get(b.id)?.total ?? 0;
    if (ra !== rb) return rb - ra;                                      // most-referenced wins
    return a.createdAt.getTime() - b.createdAt.getTime();               // oldest wins
  })[0]!;
}

async function repointAndDelete(loserId: string, keeperId: string): Promise<void> {
  // Unique-constrained tables: delete loser rows that would collide, then repoint.
  // LegalHoldCustodian @@unique(legalHoldId, personId)
  const kHolds = (await prisma.legalHoldCustodian.findMany({ where: { personId: keeperId }, select: { legalHoldId: true } })).map((r) => r.legalHoldId);
  await prisma.legalHoldCustodian.deleteMany({ where: { personId: loserId, legalHoldId: { in: kHolds } } });
  await prisma.legalHoldCustodian.updateMany({ where: { personId: loserId }, data: { personId: keeperId } });
  // MatterParty @@unique(matterId, personId, role)
  const kParties = await prisma.matterParty.findMany({ where: { personId: keeperId }, select: { matterId: true, role: true } });
  for (const p of kParties) await prisma.matterParty.deleteMany({ where: { personId: loserId, matterId: p.matterId, role: p.role } });
  await prisma.matterParty.updateMany({ where: { personId: loserId }, data: { personId: keeperId } });
  // Timekeeper @@unique(vendorId, personId)
  const kVendors = (await prisma.timekeeper.findMany({ where: { personId: keeperId }, select: { vendorId: true } })).map((r) => r.vendorId);
  await prisma.timekeeper.deleteMany({ where: { personId: loserId, vendorId: { in: kVendors } } });
  await prisma.timekeeper.updateMany({ where: { personId: loserId }, data: { personId: keeperId } });
  // Plain repoints (no compound-unique).
  await prisma.departedCustodianRetention.updateMany({ where: { personId: loserId }, data: { personId: keeperId } });
  await prisma.intakeTicketParty.updateMany({ where: { personId: loserId }, data: { personId: keeperId } });
  await prisma.intakeTicket.updateMany({ where: { requesterId: loserId }, data: { requesterId: keeperId } });
  await prisma.invoiceLineItem.updateMany({ where: { timekeeperId: loserId }, data: { timekeeperId: keeperId } });
  await prisma.dataSubjectRequest.updateMany({ where: { requesterPersonId: loserId }, data: { requesterPersonId: keeperId } });
  await prisma.consentRecord.updateMany({ where: { dataSubjectPersonId: loserId }, data: { dataSubjectPersonId: keeperId } });
  await prisma.contractReviewToken.updateMany({ where: { personId: loserId }, data: { personId: keeperId } });
  await prisma.$executeRaw`UPDATE "Document" SET "ownerId" = ${keeperId} WHERE "ownerType" = 'Person' AND "ownerId" = ${loserId}`;
  await prisma.person.delete({ where: { id: loserId } });
}

async function main() {
  const mode = APPLY ? "APPLY (mutating)" : "DRY RUN (no changes)";
  console.log(`\n=== dedup-persons — ${mode}${PRUNE ? " · prune-non-entra ON" : ""} ===\n`);
  const org = argValue("--org") || (await prisma.organization.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } }))?.id;
  if (!org) { console.log("No organization found."); return; }

  const persons = await prisma.person.findMany({ where: { organizationId: org }, select: { id: true, name: true, email: true, userId: true, type: true, createdAt: true } });
  console.log(`Org ${org}: ${persons.length} Person rows.`);
  const refs = await tallyRefs(persons.map((p) => p.id));

  // Entra directory check (unique emails). Skipped/untrusted in mock mode.
  // The M365 client is loaded lazily via narrow paths (see import note above).
  const emails = Array.from(new Set(persons.map((p) => (p.email || "").toLowerCase()).filter(Boolean)));
  const entra = new Set<string>();
  let entraKnown = false;
  if (PRUNE && emails.length > 0) {
    try {
      const [{ getM365ClientForOrg }, { getM365ConnectionStatus }] = await Promise.all([
        import("../../../modules/matter/src/internal/services/m365-factory"),
        import("../../../modules/matter/src/internal/services/m365-graph-auth"),
      ]);
      const status = await getM365ConnectionStatus(org).catch(() => ({ mode: "mock" as const }));
      if (status.mode !== "real") {
        console.log("⚠ M365 is in mock/simulated mode — cannot verify Entra membership; PRUNE will be skipped.\n");
      } else {
        const client = await getM365ClientForOrg(org);
        for (const email of emails) {
          const cands = await client.discoverCustodians({ description: email }).catch(() => []);
          if (cands.some((c: { email?: string | null }) => (c.email || "").toLowerCase() === email)) entra.add(email);
        }
        entraKnown = true;
        console.log(`Entra directory: ${entra.size}/${emails.length} distinct emails resolve to real users.\n`);
      }
    } catch (e) {
      console.log(`⚠ Could not reach the M365 directory (${String((e as Error).message || e)}); PRUNE will be skipped.\n`);
    }
  }
  const onEntra = (email: string | null) => !!email && entra.has(email.toLowerCase());

  // ---- 1. MERGE same-email duplicates ----
  const byEmail = new Map<string, PersonRow[]>();
  for (const p of persons) { if (!p.email) continue; const k = p.email.toLowerCase(); byEmail.set(k, [...(byEmail.get(k) ?? []), p]); }
  let mergedGroups = 0, mergedRows = 0;
  for (const [email, group] of Array.from(byEmail.entries())) {
    if (group.length < 2) continue;
    const keeper = chooseKeeper(group, onEntra, refs);
    const losers = group.filter((p) => p.id !== keeper.id);
    mergedGroups += 1; mergedRows += losers.length;
    console.log(`MERGE ${email}: keep ${keeper.id} (${keeper.name}${keeper.userId ? ", has login" : ""}${onEntra(keeper.email) ? ", on Entra" : ""}) ← ${losers.map((l) => l.id).join(", ")}`);
    if (APPLY) for (const l of losers) await repointAndDelete(l.id, keeper.id);
  }

  // ---- 2. PRUNE non-Entra custodian personas ----
  let pruned = 0, prunedSkipped = 0;
  if (PRUNE && entraKnown) {
    const survivors = await prisma.person.findMany({ where: { organizationId: org }, select: { id: true, name: true, email: true, type: true } });
    const refs2 = await tallyRefs(survivors.map((p) => p.id));
    for (const p of survivors) {
      const r = refs2.get(p.id) ?? { total: 0, custodial: 0, external: 0, detail: {} };
      const isCustodian = (r.detail.legalHoldCustodian ?? 0) > 0 || p.type === "CUSTODIAN";
      if (!isCustodian) continue;                 // only touch custodians
      if (onEntra(p.email)) continue;             // keep real Entra users
      if (r.external > 0) { prunedSkipped += 1; console.log(`SKIP prune ${p.id} (${p.name}) — has external data refs (${Object.keys(r.detail).join(",")}); not removing.`); continue; }
      pruned += 1;
      console.log(`PRUNE ${p.id} (${p.name} · ${p.email || "no email"}) — not on Entra; cascade removes ${r.custodial} hold/party link(s).`);
      if (APPLY) await prisma.person.delete({ where: { id: p.id } });
    }
  }

  console.log(`\n--- Summary ---`);
  console.log(`Merged groups: ${mergedGroups} (removed ${mergedRows} duplicate rows)`);
  if (PRUNE) console.log(`Pruned non-Entra custodians: ${pruned}${prunedSkipped ? ` (skipped ${prunedSkipped} with external data)` : ""}`);
  console.log(APPLY ? "\n✓ Applied." : "\nDry run only — re-run with --apply to make these changes.\n");
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
