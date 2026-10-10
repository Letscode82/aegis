/**
 * Unified intake create path.
 *
 * The command-bar front doors (`/api/intake/request` and the streaming
 * `/api/intake/request-stream`) used to each hand-build an identical v8
 * ticket object and persist it through the storage chokepoint. That
 * duplicated the ticket shape, the REQ-number reservation, and the
 * spawned-result unwrapping in two places that had to be kept in lock-step.
 *
 * `fileIntakeTicket` is the single typed create entry both routes now call:
 * it mints the sequential per-org REQ number, assembles the canonical v8
 * ticket, and persists it through `intakeStorageSet` — so routing rules and
 * the chain-sealed audit fire exactly as before (behaviour-neutral; the
 * ticket shape is byte-identical to what the two routes built inline).
 *
 * Server-only. Reached from the composition root (apps/web) via the narrow
 * public entry `@aegis/intake/create`; never imported by another module's
 * internals.
 */
import { assignRequestNumber } from "@aegis/db";
import { intakeStorageSet, type RequestContext } from "../storage/server";

/** The storage key the v8 tickets array lives under (mirrors the polyfill). */
const TICKETS_KEY = "aegis:tickets:v1";

/** The classifier output both routes already compute, in its wire shape. */
export interface IntakeTriage {
  cat: string;
  priority: string;
  team: string;
  sla: string;
  slaHours: number;
  rule: string;
  conf: number;
  risk: string;
  note: string;
  hrs: number;
  source?: string;
}

export interface FileIntakeTicketInput {
  /** The acting user — supplies the org (for numbering) and the filer name. */
  user: { organizationId: string; name?: string | null };
  /** Requesting department (free text); defaults to "Unspecified". */
  dept?: string;
  /** Explicit request type; falls back to the triage category. */
  type?: string;
  /** The (already-trimmed, already-capped) request description. */
  desc: string;
  /** The resolved classification. */
  triage: IntakeTriage;
  /** Request context so the chokepoint resolves the session org + user. */
  context: RequestContext;
}

export interface FileIntakeTicketResult {
  /** The minted "REQ-<n>" id (also the ticket's primary key). */
  ticketId: string;
  spawnedMatters: NonNullable<unknown[]>;
  spawnedContracts: NonNullable<unknown[]>;
}

/**
 * File a command-bar intake ticket end-to-end: reserve the sequential REQ
 * number, build the canonical v8 ticket, and persist it through the intake
 * chokepoint (routing rules + chain-sealed audit fire inside this call).
 */
export async function fileIntakeTicket(
  input: FileIntakeTicketInput,
): Promise<FileIntakeTicketResult> {
  const { user, triage, desc } = input;
  // Sequential per-org REQ number, reserved atomically and persisted
  // immediately by this id through the chokepoint upsert.
  const id = await assignRequestNumber(user.organizationId);
  const now = new Date();
  const ticket = {
    id,
    _source: "copilot",
    from: user.name || "(via Command Bar)",
    dept: input.dept || "Unspecified",
    type: input.type || triage.cat || "Other",
    priority: triage.priority || "Medium",
    submitted: now.toISOString().slice(0, 16).replace("T", " "),
    submittedTs: now.getTime(),
    sla: triage.sla,
    slaHours: triage.slaHours,
    slaStatus: "On Track",
    desc,
    assigned: "Cockpit Queue",
    status: "Awaiting Triage",
    stage: "new",
    seeded: false,
    workflow: [
      { label: "Submitted (Command Bar)", done: true },
      { label: "Agent Analysis", active: true },
      { label: "Attorney Review" },
      { label: "Close" },
    ],
    aiTriage: {
      category: triage.cat,
      riskFlag: `${triage.risk} — ${triage.note}`,
      suggestedAssignee: triage.team,
      estimatedHours: triage.hrs,
      similarMatters: 0,
      confidence: triage.conf,
      routingRule: `${triage.rule}: ${triage.cat}`,
      source: triage.source || "copilot",
    },
  };

  const result = await intakeStorageSet(
    TICKETS_KEY,
    JSON.stringify([ticket]),
    input.context,
  );

  return {
    ticketId: id,
    spawnedMatters: result?.spawnedMatters ?? [],
    spawnedContracts: result?.spawnedContracts ?? [],
  };
}
