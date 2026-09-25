/**
 * ONE Legal tool registry (OL-2) — the declarative catalog of governed
 * actions the console can execute across the modules.
 *
 * Each tool wraps a module's public `api.ts` function behind a `Permission`.
 * ONE Legal never mutates directly: it *proposes* a tool for a task; the
 * human clicks Approve in the console; only then does `/api/one-legal/act`
 * run the tool, write an `AgentDecision` (the evidence record) and a
 * chain-sealed `AuditLog` row. Args are derived server-side from the request
 * text (never trusted from the client) and re-validated inside the module.
 *
 * Server-only (imports module `api.ts`). apps/web is the composition root, so
 * importing across modules here is allowed.
 *
 * Adding a tool = one entry. This first cut ships `matter.create`
 * (create-only, reversible via the matter close/archive lifecycle). Legal
 * hold, DSAR, contract-draft tools follow the same shape.
 */
import { Permission } from "@aegis/auth";
import { createMatter, type MatterType } from "@aegis/matter";
import { createContract } from "@aegis/contracts";

export interface OneLegalUser { id: string; organizationId: string }
export interface ToolResult { resourceId: string; resourceLabel: string; label: string; navigate: string }
export interface OneLegalTool<A> {
  id: string;
  label: string;
  kind: "write" | "read";
  permission: Permission;
  resourceType: string;
  deriveArgs: (text: string) => A;
  summary: (args: A) => string;
  run: (args: A, user: OneLegalUser) => Promise<ToolResult>;
}

function inferTitle(text: string): string {
  const s = text.replace(/\s+/g, " ").trim();
  const cap = s.charAt(0).toUpperCase() + s.slice(1);
  return cap.slice(0, 120);
}

const MATTER_TYPE_RULES: Array<[RegExp, MatterType]> = [
  [/\b(sued|lawsuit|litigat|dispute|claim|subpoena|demand letter)\b/i, "LITIGATION"],
  [/\b(harass|discriminat|termination|employee|employment|wrongful)\b/i, "EMPLOYMENT"],
  [/\b(patent|trademark|copyright|\bip\b|inventorship|open.?source)\b/i, "IP"],
  [/\b(merger|acquisition|m&a|divestiture)\b/i, "MA"],
  [/\b(investigat|whistleblow|misconduct)\b/i, "INVESTIGATION"],
  [/\b(regulat|compliance|sanction)\b/i, "REGULATORY"],
  [/\b(contract|vendor|msa|nda|transaction|deal|procurement|saas)\b/i, "TRANSACTIONAL"],
];
function inferMatterType(text: string): MatterType {
  for (const [re, ty] of MATTER_TYPE_RULES) if (re.test(text)) return ty;
  return "ADVISORY";
}

interface MatterArgs { title: string; type: MatterType }

const matterCreate: OneLegalTool<MatterArgs> = {
  id: "matter.create",
  label: "Open a matter",
  kind: "write",
  permission: Permission.MatterCreate,
  resourceType: "Matter",
  deriveArgs: (text) => ({ title: inferTitle(text), type: inferMatterType(text) }),
  summary: (args) => `Open a ${args.type} matter — "${args.title}"`,
  run: async (args, user) => {
    const m = await createMatter({ title: args.title, type: args.type }, { id: user.id, organizationId: user.organizationId });
    return { resourceId: m.id, resourceLabel: m.matterNumber || m.title || m.id, label: `Matter · ${args.type}`, navigate: "matters" };
  },
};

// Contract type is a free string on the Contract entity ("NDA" | "MSA" | …),
// so there's no enum to violate — infer a sensible label from the request.
function inferContractType(text: string): string {
  const t = text.toLowerCase();
  if (/\bnda\b|non.?disclos|confidential/.test(t)) return "NDA";
  if (/\bmsa\b|master service/.test(t)) return "MSA";
  if (/\bsow\b|statement of work/.test(t)) return "SOW";
  if (/\bdpa\b|data processing/.test(t)) return "DPA";
  if (/licen[cs]/.test(t)) return "License";
  if (/supply|supplier/.test(t)) return "Supply";
  return "Agreement";
}

interface ContractArgs { title: string; type: string }

const contractDraft: OneLegalTool<ContractArgs> = {
  id: "contracts.draft",
  label: "Draft a contract",
  kind: "write",
  permission: Permission.ContractsCreate,
  resourceType: "Contract",
  deriveArgs: (text) => ({ title: inferTitle(text), type: inferContractType(text) }),
  summary: (args) => `Draft a ${args.type} — "${args.title}" (starts in DRAFT)`,
  run: async (args, user) => {
    const c = await createContract(user.organizationId, { title: args.title, type: args.type }, { id: user.id, type: "USER" });
    return { resourceId: c.id, resourceLabel: c.title || c.id, label: `Contract · ${args.type}`, navigate: "contracts" };
  },
};

// The registry. Keyed by tool id.
export const TOOLS: Record<string, OneLegalTool<unknown>> = {
  [matterCreate.id]: matterCreate as OneLegalTool<unknown>,
  [contractDraft.id]: contractDraft as OneLegalTool<unknown>,
};

export function getTool(id: string): OneLegalTool<unknown> | undefined {
  return TOOLS[id];
}

/** Deterministic tool selection from request text — conservative, so most
 *  requests fall through to the normal governed intake pipeline. */
export function selectToolId(text: string): string | null {
  const t = text.toLowerCase();
  if (/\b(open|start|create|file|spin up)\b[^.]*\bmatter\b/.test(t) || /\bmatter\b[^.]*\b(for|on)\b/.test(t) || /\b(sued|lawsuit|litigation matter)\b/.test(t)) return "matter.create";
  // Draft-a-contract: needs an authoring verb so "review a third-party MSA"
  // (a review, not a create) falls through to the intake pipeline.
  if (/\b(draft|create|prepare|author|generate|write|new)\b[^.]*\b(nda|msa|sow|dpa|contract|agreement|licen[cs]e)\b/.test(t)) return "contracts.draft";
  return null;
}

/** A display-only proposal for the console (no execution). */
export function toolProposalFor(text: string): { id: string; label: string; argsSummary: string } | null {
  const id = selectToolId(text);
  if (!id) return null;
  const tool = TOOLS[id];
  if (!tool) return null;
  const args = tool.deriveArgs(text);
  return { id, label: tool.label, argsSummary: tool.summary(args) };
}
