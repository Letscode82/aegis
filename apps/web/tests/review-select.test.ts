import { describe, it, expect } from "vitest";
import { loadRegistryFromData } from "@aegis/legal-skills";
import { selectBuiltReviewSkill } from "../lib/one-legal/review-select";

// A synthetic registry so we can exercise the unbuilt-skill fall-through —
// the real bundled registry currently has every skill `status: "built"`, so
// the dead-end path it guards against is otherwise untestable. Shape matches
// what loadRegistryFromData / route / getSkill read (id, name, title, summary,
// description, module, status, jurisdictions, risk_tier).
function skill(over: Partial<Record<string, unknown>> & { id: string; status: string }) {
  return {
    name: over.id.split("/").pop(),
    title: "Skill " + over.id,
    summary: "",
    description: "",
    module: "contracts",
    jurisdictions: ["global"],
    risk_tier: "review-required",
    ...over,
  };
}

const registry = loadRegistryFromData({
  skills: [
    // NDA triage — BUILT. The document-type rule points here.
    skill({ id: "contracts/nda-triage", status: "built", title: "NDA triage", summary: "non-disclosure nda confidentiality review" }),
    // A generic contract review — BUILT. The text-route fallback target.
    skill({ id: "contracts/contract-review", status: "built", title: "Contract review", summary: "contract agreement review clauses" }),
    // A catalogued-but-unbuilt skill that would text-match "merger" but must
    // never be returned.
    skill({ id: "contracts/merger-review", status: "catalogued", title: "Merger review", summary: "merger acquisition review" }),
  ],
} as never);

describe("selectBuiltReviewSkill", () => {
  it("INVARIANT: never returns a skill whose status is not 'built'", () => {
    // A request whose only text match is the unbuilt merger skill must NOT
    // return it — it falls through to a built match or null.
    const picked = selectBuiltReviewSkill(registry, {
      text: "merger acquisition review",
      jurisdiction: "US",
    });
    if (picked) expect(picked.status).toBe("built");
  });

  it("honors an explicit, built skillId", () => {
    const picked = selectBuiltReviewSkill(registry, {
      skillId: "contracts/contract-review",
      text: "anything at all",
      jurisdiction: "US",
    });
    expect(picked?.id).toBe("contracts/contract-review");
  });

  it("ignores an unknown skillId and falls through to a built match", () => {
    const picked = selectBuiltReviewSkill(registry, {
      skillId: "contracts/does-not-exist",
      text: "review this contract agreement",
      jurisdiction: "US",
    });
    expect(picked?.status).toBe("built");
    expect(picked?.id).not.toBe("contracts/does-not-exist");
  });

  it("ignores an unbuilt explicit skillId and falls through to a built match", () => {
    const picked = selectBuiltReviewSkill(registry, {
      skillId: "contracts/merger-review", // catalogued, not built
      text: "review this contract agreement",
      jurisdiction: "US",
    });
    expect(picked?.status).toBe("built");
    expect(picked?.id).not.toBe("contracts/merger-review");
  });

  it("routes a document by TYPE to the built document-type playbook", () => {
    const picked = selectBuiltReviewSkill(registry, {
      docName: "Mutual NDA.pdf",
      text: "take a look at this",
      jurisdiction: "US",
    });
    expect(picked?.id).toBe("contracts/nda-triage");
  });

  it("returns null when no built playbook matches at all", () => {
    // Text matches nothing built, and route's fallback id
    // (intake/request-triage) isn't in this registry → null.
    const picked = selectBuiltReviewSkill(registry, {
      text: "zzz nothing here matches",
      jurisdiction: "US",
    });
    expect(picked).toBeNull();
  });
});
