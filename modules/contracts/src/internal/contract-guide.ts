/**
 * Contract execution guide (CTR-17).
 *
 * A "what do I do next to get this signed" checklist derived from live state. It
 * composes the contract status, the approval ladder, and the signatures into an
 * ordered set of steps — each marked done / current / todo, with the concrete
 * next action — so a business or legal user always knows the path to EXECUTED.
 */
import { getContractDetail } from "./reads";
import { getContractApprovalState } from "./approval";
import { getContractSignatures } from "./signatures";

export type GuideStepState = "done" | "current" | "todo" | "skipped";

export interface GuideStep {
  key: string;
  label: string;
  state: GuideStepState;
  detail: string;
  /** The concrete next action for the current step, else null. */
  action: string | null;
}

export interface ContractGuide {
  contractId: string;
  status: string;
  origin: string;
  terminated: boolean;
  steps: GuideStep[];
  currentStepKey: string | null;
  nextAction: string | null;
  percentComplete: number;
}

const ORDER = ["DRAFT", "IN_NEGOTIATION", "IN_REVIEW", "APPROVED", "EXECUTED", "ACTIVE"];

export async function getContractGuide(organizationId: string, contractId: string): Promise<ContractGuide> {
  const contract = await getContractDetail(organizationId, contractId);
  if (!contract) throw new Error("Contract not found");
  const [approval, sigs] = await Promise.all([
    getContractApprovalState(organizationId, contractId),
    getContractSignatures(organizationId, contractId),
  ]);

  const status = contract.status;
  const terminated = status === "TERMINATED" || status === "EXPIRED";
  const si = ORDER.indexOf(status); // -1 for terminated/expired
  const thirdParty = contract.origin === "THIRD_PARTY";

  // done at stageIndex: the step is complete once the contract has passed it.
  const stateFor = (doneAtIndex: number, currentAtIndex: number): GuideStepState => {
    if (terminated) return "skipped";
    if (si >= doneAtIndex) return "done";
    if (si === currentAtIndex) return "current";
    return "todo";
  };

  // 1 — Draft & finalize terms (DRAFT / IN_NEGOTIATION → done once IN_REVIEW).
  const prepDetail = contract.clauseCount > 0
    ? `${contract.clauseCount} clause(s) extracted${contract.deviationCount ? `, ${contract.deviationCount} deviating` : ""}. ${thirdParty ? "This is the counterparty's paper — review the assessment for clauses to push back on." : "Review the risk assessment and finalize the terms."}`
    : "Add the contract body / clauses (author, upload, or paste).";
  const step1: GuideStep = {
    key: "draft",
    label: thirdParty ? "Review the counterparty's paper" : "Draft & finalize terms",
    state: stateFor(2, si <= 1 ? si : 0),
    detail: prepDetail,
    action: si <= 1 ? "Open the Review Assessment for what to sign / what to negotiate; edit clauses or draft body." : null,
  };

  // 2 — Internal approval (IN_REVIEW → APPROVED).
  let step2Detail: string;
  let step2Action: string | null = null;
  if (approval.hasLadder && approval.ladderStatus === "IN_PROGRESS") {
    step2Detail = `Approval ladder in progress — current step: ${approval.currentStep?.name ?? `#${approval.currentStepOrder}`}${approval.currentStep?.kind === "AGENT" ? " (AI review)" : ""}.`;
    step2Action = si === 2 ? `Approve the current step (${approval.currentStep?.name ?? "in review"}) — or send back / reject.` : null;
  } else if (approval.canSubmit) {
    step2Detail = "Not yet submitted for approval.";
    step2Action = "Submit for approval to start the governance ladder (AI risk → legal → GC).";
  } else if (si >= 3) {
    step2Detail = "Approved by the governance ladder.";
  } else {
    step2Detail = "Awaiting the approval ladder.";
  }
  const step2: GuideStep = { key: "approve", label: "Internal approval", state: stateFor(3, 2), detail: step2Detail, action: step2Action };

  // 3 — Signatures (APPROVED → EXECUTED).
  const sigDetail = `${sigs.hasInternal ? "Internal ✓" : "Internal pending"} · ${sigs.hasCounterparty ? "Counterparty ✓" : "Counterparty pending"}.`;
  const step3: GuideStep = {
    key: "sign",
    label: "Signatures",
    state: stateFor(4, 3),
    detail: si >= 4 ? "Both parties signed — executed." : sigDetail,
    action: si === 3 ? "Request e-signatures (or record both parties' signatures). It auto-executes when both sign." : null,
  };

  // 4 — Activate (EXECUTED → ACTIVE).
  const step4: GuideStep = {
    key: "activate",
    label: "Activate (put in force)",
    state: stateFor(5, 4),
    detail: si >= 5 ? "Active — obligation clocks are running." : "Once executed, activate to put the contract in force and start obligation tracking.",
    action: si === 4 ? "Activate the contract (Lifecycle → Active)." : null,
  };

  const steps = [step1, step2, step3, step4];
  const current = steps.find((s) => s.state === "current") ?? null;
  const doneCount = steps.filter((s) => s.state === "done").length;

  return {
    contractId,
    status,
    origin: contract.origin,
    terminated,
    steps,
    currentStepKey: current?.key ?? null,
    nextAction: current?.action ?? (si >= 5 ? "Done — the contract is active." : null),
    percentComplete: terminated ? 0 : Math.round((doneCount / steps.length) * 100),
  };
}
