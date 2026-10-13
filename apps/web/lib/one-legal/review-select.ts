/**
 * ONE Legal review playbook selection.
 *
 * Both review routes (buffered + streamed) pick which `@aegis/legal-skills`
 * playbook to run. The selection must never dead-end on a skill that is
 * catalogued but not yet built — that produced an empty review with a jargon
 * note ("catalogued but not yet built"). This picks the best BUILT playbook so
 * the user always gets a real review, falling back through: an explicit (built)
 * skillId → the document-type playbook → the best built text-route match.
 *
 * Shared here so the two routes stay in lock-step (one source of truth) and the
 * invariant — the returned skill is always `status: "built"`, or null when no
 * built playbook matches — is unit-tested.
 */
import { route, getSkill } from "@aegis/legal-skills";
import { preferredReviewSkill } from "./review-playbook";

type Registry = Parameters<typeof getSkill>[0];
type ReviewSkill = NonNullable<ReturnType<typeof getSkill>>;

export interface ReviewSkillInput {
  /** An explicit skill the caller pinned (only honored when it is built). */
  skillId?: string | null;
  /** The first reviewed document's name + text, for document-type routing. */
  docName?: string | null;
  docText?: string | null;
  /** The task text. */
  text: string;
  /** The normalized review jurisdiction. */
  jurisdiction: string;
}

/**
 * Pick the review playbook, never returning an unbuilt skill:
 *   1. an explicit `skillId` — only when it resolves to a BUILT skill;
 *   2. else the playbook the document's TYPE calls for (an NDA → nda-triage);
 *   3. else the best BUILT text-route match.
 * Returns null only when no built playbook matches at all (the caller then
 * offers a graceful "file it as a request" exit instead of an empty review).
 */
export function selectBuiltReviewSkill(registry: Registry, input: ReviewSkillInput): ReviewSkill | null {
  const { skillId, docName, docText, text, jurisdiction } = input;

  // 1. An explicit, built skill wins. An unbuilt or unknown id falls through so
  //    a review never dead-ends on it.
  const explicit = skillId ? getSkill(registry, String(skillId)) : null;
  if (explicit && explicit.status === "built") return explicit;

  // 2. The document-type playbook, when it's built.
  const preferId = preferredReviewSkill(docName, docText, text);
  const preferred = preferId ? getSkill(registry, preferId) : null;
  if (preferred && preferred.status === "built") return preferred;

  // 3. The first BUILT result from text routing.
  for (const r of route(registry, text, { jurisdiction })) {
    const s = getSkill(registry, r.id);
    if (s && s.status === "built") return s;
  }

  return null;
}
