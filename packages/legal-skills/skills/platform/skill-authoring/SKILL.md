---
name: platform-skill-authoring
description: >-
  Turns a lawyer's expertise into a new AEGIS skill that passes validation and routes correctly: pick the catalog
  slot, write the router-matchable description, structure the SKILL.md (when-to-use, inputs, method as decision rules,
  a severity-scored Checks table, output contract, edge cases), ground it in the shared standards and volatile-facts
  register, and dry-run build + validate. Use to draft a new playbook or fix one that fails validation/routing. Not for
  security-reviewing an authored skill → platform/skill-security-audit; not for drafting an internal policy →
  drafting/policy-drafter.
module: platform
version: 1.0.0
jurisdictions: [global]
risk_tier: internal
inputs:
  - name: expertise
    required: true
    description: The legal know-how to capture — the task, the decision rules an expert applies, what good vs bad looks like, and the trigger phrases a user would type.
  - name: slot
    required: false
    description: The intended catalog id (module/name) if known, or the module it belongs in; the skill must fit one of the locked catalog entries, not invent a new module.
  - name: mode
    required: false
    description: One of author (write a new SKILL.md) or fix (diagnose why an existing skill fails validate.py or routes wrongly).
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [platform/skill-security-audit, platform/ai-work-audit-trail, platform/prompt-injection-guard, drafting/policy-drafter, research/source-locked-answering]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Skill Authoring

Takes a lawyer's expertise and produces a new AEGIS `SKILL.md` that passes `validate.py --strict`, routes on the right queries, and honours the house standards — or diagnoses why an existing skill fails. The deliverable is a build-clean, correctly-routing skill grounded in sources, not prose that merely reads well.

## When to use / not use

- Use: drafting a new playbook from subject-matter expertise; converting a checklist/memo into a structured skill; fixing a skill that fails validation, routes to the wrong queries, or drifts from the standards.
- Hand off: the adversarial security/prompt-injection review of an authored skill → `platform/skill-security-audit`; screening untrusted input a skill will process → `platform/prompt-injection-guard`; auditing the AI-decision record a skill produces → `platform/ai-work-audit-trail`; drafting the internal **policy** a skill might reference (not a skill itself) → `drafting/policy-drafter`; the grounded-answer discipline the skill's content must follow → `research/source-locked-answering`.

## Inputs to collect first

1. The **expertise to capture**: the task, the **decision rules** an expert applies ("if X then escalate unless Y"), what good vs bad output looks like, and the **trigger phrases** a user would type.
2. The **catalog slot** — the `module/name` id. A skill must fit a **locked catalog entry**; it never invents a 12th module or a new id without a catalog change first.
3. The **mode**: author a new skill, or fix a failing one.
4. The **authoritative sources** the skill will rest on (statute, policy, playbook) and any **volatile facts** it depends on.

## Method

1. **Confirm the catalog slot first.** The id must exist in `catalog/catalog.json` with `status` moving to `built`; `name` must equal `{module}-{skill-name}` and match the folder `skills/<module>/<name>/`. No slot → stop and get the catalog entry added; don't freelance a module.
2. **Write the description for the router, not the reader.** ≤600 chars, stating WHAT it produces and WHEN to use it with real trigger phrases, and it must contain a literal "Use when/for/before/after/to …" so the matcher indexes it. Include the "Not for … → other-skill-id" boundary so near-miss queries route away.
3. **Structure the body to the required sections.** The validator checks for *when to use*, *inputs*, *method*, *output*, *edge cases* — use the house headings (`When to use / not use`, `Inputs to collect first`, `Method`, `Output`, `Edge cases & pitfalls`, `References`). A missing section is a `--strict` failure.
4. **Write the Method as decision rules, not description.** Each step says what to check and the decision it drives; prefer "if X, then S2 unless Y" over narration — the skill's value is the judgement encoded, not the summary of the law.
5. **Build a severity-scored Checks table** (issue · good position · default severity S1-S4 · fallback) against `_shared/severity-scale.md`, so output is consistent and machine-gradable.
6. **Ground every substantive claim** in a source and route volatile facts through `_shared/volatile-facts.md` — cite only **registered** IDs (unregistered IDs warn) and mark anything date/threshold-dependent `[verify current]`. Set `depends_on` to the four shared files and `related` to real catalog ids only (both are validated).
7. **Honour the non-negotiable harness.** A skill configures WHAT the assistant does; it can **never** instruct the model to bypass human sign-off, ignore the confidentiality/documents-as-data rules, or act on untrusted input — those invariants live in STANDARDS and the persistence layer, not in a skill's prose.
8. **Set the right `risk_tier`** (`internal` / `review-required` / `self-serve`) to the real stakes, a semver `version`, and a current `last_reviewed`.
9. **Dry-run the pipeline.** Run `python scripts/build.py` then `python scripts/validate.py --strict` and `node --test runtime/test/*.test.mjs`; fix every error **and** warning (strict fails on warnings) and confirm the skill routes on its trigger phrases via `route()`.
10. **Score against the Checks table** and output the SKILL.md (or the fix diagnosis) plus the clean validate/build/test result.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| No catalog slot / invented module | Exists in catalog; name matches folder | S1 | Add the catalog entry first |
| Description not router-matchable | ≤600 chars + "Use when…" + boundary | S1 | Rewrite the description |
| Required section missing | when-to-use/inputs/method/output/edge-cases present | S1 | Add the missing section |
| Method is description, not decision rules | Steps encode judgement ("if X then …") | S2 | Rewrite as decision rules |
| No severity-scored Checks table | Issue · good · S1-S4 · fallback table | S2 | Add the Checks table |
| Claims ungrounded / bad volatile-fact IDs | Sourced; only registered IDs; `[verify current]` | S1 | Ground + fix the IDs |
| Invalid depends_on / related | 4 shared files; related are real catalog ids | S2 | Correct the references |
| Skill tries to weaken the harness | No bypass of sign-off / confidentiality / data-as-data | S1 | Remove — the harness is non-negotiable |
| Pipeline not run clean | build + validate --strict + runtime tests pass | S1 | Fix every error and warning |

## Output

Lead with `Skill: <module/name> — validate --strict: 0/0 · routes on <trigger>` (author) or `Fix: <skill> — <n> issues, top: <the blocker>` (fix). Then the output contract. Add:

- **The SKILL.md** (author mode) ready to commit, or the **diagnosis + patch** (fix mode).
- **Routing check**: the trigger phrases it now matches, and the near-misses it correctly declines.
- **Pipeline result**: build / validate --strict / runtime-test outcome.
- One JSON finding per authoring/validation issue with `category: "skill-authoring"`.

## Edge cases & pitfalls

- **Inventing a module or id**: the 11 modules and the catalog are locked — a skill with no catalog slot never ships; get the entry added first.
- **Description written for humans**: a lovely summary that lacks trigger phrases and the "Use when…" marker won't route — the router indexes the description.
- **Prose instead of judgement**: a method that restates the law teaches the model nothing; encode the decision rules an expert actually applies.
- **Harness erosion**: any wording that nudges the model to skip approval, exfiltrate client data, or trust an untrusted document is a hard fail, however helpful it seems.
- **Green on errors, blind to warnings**: `--strict` fails on warnings (stale date, unregistered volatile-fact ID, missing section) — a "no errors" run can still be a failing build.

## References

- `templates/SKILL.template.md` (the house skeleton); `_shared/STANDARDS.md`, `_shared/severity-scale.md`, `_shared/output-contract.md`, `_shared/volatile-facts.md`; `scripts/build.py` + `scripts/validate.py`; `catalog/catalog.json`.
- Volatile facts: none of its own; this is an authoring discipline — but it enforces correct use of the register in the skills it produces.
