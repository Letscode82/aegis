/**
 * Contract integrity — tamper-evidence for executed contracts (CTR-9).
 *
 * The fraud this prevents: an employee executes a contract, the client signs,
 * then the employee alters the pricing/terms afterward to show internal teams a
 * better margin than was actually agreed. Two mechanisms close it:
 *
 *   1. A LOCK — once EXECUTED, the material terms (pricing, term, scope,
 *      governing law) cannot be edited through `updateContract`; a change
 *      requires a formal amendment (new version → re-approval → re-signature).
 *   2. A tamper-evident FINGERPRINT — at execution we seal a SHA-256 of the
 *      material terms into `Contract.executedTermsHash`, and each signature
 *      captures the fingerprint it signed. If the live terms ever hash to a
 *      different value, the contract reads TAMPERED and the chain-sealed
 *      `contract.updated` rows since execution show exactly what changed, when,
 *      and by whom.
 *
 * The single-source-of-truth corollary: internal margin/reporting reads the
 * locked contract value — not a separately editable number — so two divergent
 * "truths" cannot exist.
 */
import { prisma, logAudit, sha256Hex, type ContractStatus } from "@aegis/db";

/** Material terms — the commercial substance a signature attests to. Editing
 *  any of these after execution is the tamper vector. */
export const MATERIAL_TERM_FIELDS = [
  "type",
  "value",
  "currency",
  "paymentTerms",
  "effectiveDate",
  "expiryDate",
  "governingLaw",
  "scopeOfServices",
] as const;

/** Statuses at or after execution — where the lock applies. */
export const LOCKED_STATUSES = new Set(["EXECUTED", "ACTIVE", "EXPIRED", "TERMINATED"]);

export class ContractLockedError extends Error {
  constructor(
    public readonly contractId: string,
    public readonly status: string,
    public readonly fields: string[],
  ) {
    super(
      `This contract is ${status} — its signed terms (${fields.join(", ")}) are locked and cannot be edited directly. ` +
        `Create an amendment (a new version that re-enters approval and re-signature) to change executed terms.`,
    );
    this.name = "ContractLockedError";
  }
}

type Actor = { id: string | null; type?: "USER" | "AGENT" | "SYSTEM" };
const actorFields = (actor: Actor) => ({ actorId: actor.id, actorType: actor.type ?? (actor.id ? "USER" : "SYSTEM") });

export interface ContractTermsInput {
  type: string;
  value: number | null;
  currency: string;
  paymentTerms: string | null;
  effectiveDate: Date | null;
  expiryDate: Date | null;
  governingLaw: string | null;
  scopeOfServices: string | null;
  draftText: string | null;
  clauses: { type: string; text: string; risk: string; deviation: boolean }[];
}

/** Canonical, deterministic serialization of the material terms (pure). Clause
 *  order is normalized so the same substance always yields the same string. */
export function contractTermsCanonical(input: ContractTermsInput): string {
  const clauses = [...input.clauses]
    .map((c) => ({ type: c.type, risk: c.risk, deviation: !!c.deviation, text: (c.text ?? "").trim() }))
    .sort((a, b) => (a.type + a.text).localeCompare(b.type + b.text));
  return JSON.stringify({
    v: 1,
    type: input.type,
    value: input.value ?? null,
    currency: input.currency,
    paymentTerms: input.paymentTerms ?? null,
    effectiveDate: input.effectiveDate ? input.effectiveDate.toISOString() : null,
    expiryDate: input.expiryDate ? input.expiryDate.toISOString() : null,
    governingLaw: input.governingLaw ?? null,
    scopeOfServices: input.scopeOfServices ?? null,
    draftText: (input.draftText ?? "").trim(),
    clauses,
  });
}

/** SHA-256 fingerprint of the material terms (pure). */
export function computeContractTermsHash(input: ContractTermsInput): string {
  return sha256Hex(contractTermsCanonical(input));
}

type ContractRow = NonNullable<Awaited<ReturnType<typeof prisma.contract.findFirst>>>;

function termsInputOf(
  contract: ContractRow,
  clauses: { type: string; text: string; risk: string; deviation: boolean }[],
): ContractTermsInput {
  return {
    type: contract.type,
    value: contract.value ?? null,
    currency: contract.currency,
    paymentTerms: contract.paymentTerms ?? null,
    effectiveDate: contract.effectiveDate ?? null,
    expiryDate: contract.expiryDate ?? null,
    governingLaw: contract.governingLaw ?? null,
    scopeOfServices: contract.scopeOfServices ?? null,
    draftText: contract.draftText ?? null,
    clauses,
  };
}

async function loadTerms(organizationId: string, contractId: string) {
  const contract = await prisma.contract.findFirst({ where: { id: contractId, organizationId } });
  if (!contract) return null;
  const clauses = await prisma.contractClause.findMany({
    where: { contractId },
    select: { type: true, text: true, risk: true, deviation: true },
  });
  return { contract, input: termsInputOf(contract, clauses) };
}

/** Recompute a contract's live terms fingerprint from the DB (used at execution
 *  to seal the baseline, and by the signature path). */
export async function computeContractTermsHashFromDb(
  organizationId: string,
  contractId: string,
): Promise<string | null> {
  const loaded = await loadTerms(organizationId, contractId);
  return loaded ? computeContractTermsHash(loaded.input) : null;
}

const isExecuted = (contract: { status: string; executedAt: Date | null }) =>
  LOCKED_STATUSES.has(contract.status) || contract.executedAt != null;

/**
 * Enforce the lock. Throws ContractLockedError when a patch would change any
 * MATERIAL term of an executed contract. `changedMaterialFields` is the subset
 * of material fields whose value actually differs. Callers pass that in so the
 * check reuses their own diff.
 */
export function assertContractEditable(
  contract: { status: string },
  changedMaterialFields: string[],
): void {
  if (LOCKED_STATUSES.has(contract.status) && changedMaterialFields.length > 0) {
    throw new ContractLockedError(
      (contract as { id?: string }).id ?? "",
      contract.status,
      changedMaterialFields,
    );
  }
}

export type IntegrityStatus = "SEALED" | "TAMPERED" | "UNSEALED" | "NOT_EXECUTED";

export interface IntegritySignature {
  party: string;
  signerName: string;
  signedAt: string;
  /** True when this signature's fingerprint still matches the live terms; null
   *  when the signature predates fingerprinting. */
  hashMatchesLive: boolean | null;
}

export interface PostExecutionChange {
  at: string;
  actorId: string | null;
  fields: string[];
  materialFields: string[];
  before: unknown;
  after: unknown;
}

export interface ContractIntegrityResult {
  contractId: string;
  title: string;
  status: string;
  integrity: IntegrityStatus;
  executedAt: string | null;
  executedTermsHash: string | null;
  currentTermsHash: string;
  signatures: IntegritySignature[];
  postExecutionChanges: PostExecutionChange[];
  /** Material fields altered since execution — the smoking gun. */
  changedFields: string[];
}

const materialOf = (fields: unknown): string[] =>
  Array.isArray(fields) ? (fields as string[]).filter((f) => (MATERIAL_TERM_FIELDS as readonly string[]).includes(f)) : [];

/**
 * Full integrity verdict for one contract: recompute the live fingerprint,
 * compare to the sealed baseline, check each signature, and list every
 * post-execution material change from the immutable audit ledger.
 */
export async function checkContractIntegrity(
  organizationId: string,
  contractId: string,
): Promise<ContractIntegrityResult> {
  const loaded = await loadTerms(organizationId, contractId);
  if (!loaded) throw new Error("Contract not found");
  const { contract, input } = loaded;
  const currentTermsHash = computeContractTermsHash(input);

  let integrity: IntegrityStatus;
  if (!isExecuted(contract)) integrity = "NOT_EXECUTED";
  else if (!contract.executedTermsHash) integrity = "UNSEALED";
  else integrity = contract.executedTermsHash === currentTermsHash ? "SEALED" : "TAMPERED";

  const sigs = await prisma.contractSignature.findMany({
    where: { contractId, organizationId },
    orderBy: { signedAt: "asc" },
  });
  const signatures: IntegritySignature[] = sigs.map((s) => ({
    party: s.party,
    signerName: s.signerName,
    signedAt: s.signedAt.toISOString(),
    hashMatchesLive: s.signedTermsHash ? s.signedTermsHash === currentTermsHash : null,
  }));

  let postExecutionChanges: PostExecutionChange[] = [];
  const fieldSet = new Set<string>();
  if (contract.executedAt) {
    const rows = await prisma.auditLog.findMany({
      where: {
        organizationId,
        resourceType: "Contract",
        resourceId: contractId,
        action: "contract.updated",
        timestamp: { gt: contract.executedAt },
      },
      orderBy: { timestamp: "asc" },
    });
    postExecutionChanges = rows.map((r) => {
      const fields = ((r.metadata as { fields?: unknown } | null)?.fields ?? []) as string[];
      const materialFields = materialOf(fields);
      for (const f of materialFields) fieldSet.add(f);
      return {
        at: r.timestamp.toISOString(),
        actorId: r.actorId,
        fields,
        materialFields,
        before: r.beforeJson,
        after: r.afterJson,
      };
    });
  }

  return {
    contractId,
    title: contract.title,
    status: contract.status,
    integrity,
    executedAt: contract.executedAt ? contract.executedAt.toISOString() : null,
    executedTermsHash: contract.executedTermsHash,
    currentTermsHash,
    signatures,
    postExecutionChanges,
    changedFields: [...fieldSet],
  };
}

export interface ContractIntegrityReportRow {
  contractId: string;
  title: string;
  status: string;
  integrity: IntegrityStatus;
  changedFields: string[];
  executedAt: string | null;
}

export interface ContractIntegrityReport {
  rows: ContractIntegrityReportRow[];
  counts: { total: number; sealed: number; tampered: number; unsealed: number };
  generatedAt: string;
}

/**
 * Portfolio-wide integrity monitor: every executed contract with its SEALED /
 * TAMPERED / UNSEALED verdict and (for tampered) the material fields changed
 * since execution. Batches clauses + audit to avoid an N+1.
 */
export async function getContractIntegrityReport(organizationId: string): Promise<ContractIntegrityReport> {
  const now = new Date();
  const contracts = await prisma.contract.findMany({
    where: {
      organizationId,
      OR: [{ status: { in: [...LOCKED_STATUSES] as ContractStatus[] } }, { executedAt: { not: null } }],
    },
  });
  const ids = contracts.map((c) => c.id);
  if (ids.length === 0) {
    return { rows: [], counts: { total: 0, sealed: 0, tampered: 0, unsealed: 0 }, generatedAt: now.toISOString() };
  }

  const [clauses, audits] = await Promise.all([
    prisma.contractClause.findMany({
      where: { contractId: { in: ids } },
      select: { contractId: true, type: true, text: true, risk: true, deviation: true },
    }),
    prisma.auditLog.findMany({
      where: { organizationId, resourceType: "Contract", resourceId: { in: ids }, action: "contract.updated" },
      select: { resourceId: true, timestamp: true, metadata: true },
    }),
  ]);
  const clausesByContract = new Map<string, { type: string; text: string; risk: string; deviation: boolean }[]>();
  for (const c of clauses) (clausesByContract.get(c.contractId) ?? clausesByContract.set(c.contractId, []).get(c.contractId)!).push(c);

  const counts = { total: contracts.length, sealed: 0, tampered: 0, unsealed: 0 };
  const rows: ContractIntegrityReportRow[] = contracts.map((c) => {
    const input = termsInputOf(c, clausesByContract.get(c.id) ?? []);
    const currentHash = computeContractTermsHash(input);
    let integrity: IntegrityStatus;
    if (!c.executedTermsHash) { integrity = "UNSEALED"; counts.unsealed += 1; }
    else if (c.executedTermsHash === currentHash) { integrity = "SEALED"; counts.sealed += 1; }
    else { integrity = "TAMPERED"; counts.tampered += 1; }

    const changed = new Set<string>();
    if (c.executedAt) {
      for (const a of audits) {
        if (a.resourceId !== c.id || a.timestamp <= c.executedAt) continue;
        for (const f of materialOf((a.metadata as { fields?: unknown } | null)?.fields)) changed.add(f);
      }
    }
    return {
      contractId: c.id,
      title: c.title,
      status: c.status,
      integrity,
      changedFields: [...changed],
      executedAt: c.executedAt ? c.executedAt.toISOString() : null,
    };
  });
  // Tampered first, then unsealed, then sealed.
  const rank = { TAMPERED: 0, UNSEALED: 1, SEALED: 2, NOT_EXECUTED: 3 } as Record<IntegrityStatus, number>;
  rows.sort((a, b) => rank[a.integrity] - rank[b.integrity]);

  return { rows, counts, generatedAt: now.toISOString() };
}

/**
 * Seal (or re-seal) an executed contract's current terms as the tamper-evidence
 * baseline. Used to adopt integrity on contracts executed before the feature
 * shipped (UNSEALED → SEALED). Chain-sealed. Gated by the caller
 * (contracts:execute) — sealing attests "these terms are the signed ones".
 */
export async function sealContractTerms(organizationId: string, contractId: string, actor: Actor) {
  const loaded = await loadTerms(organizationId, contractId);
  if (!loaded) throw new Error("Contract not found");
  const { contract, input } = loaded;
  if (!isExecuted(contract)) throw new Error("Only executed contracts can be sealed");
  const hash = computeContractTermsHash(input);
  await prisma.contract.update({ where: { id: contractId }, data: { executedTermsHash: hash } });
  await logAudit({
    organizationId,
    ...actorFields(actor),
    action: "contract.integrity.sealed",
    resourceType: "Contract",
    resourceId: contractId,
    afterJson: { termsHash: hash } as never,
    metadata: { source: "contracts" } as never,
  });
  return { contractId, executedTermsHash: hash };
}
