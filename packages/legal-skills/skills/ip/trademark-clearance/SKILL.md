---
name: ip-trademark-clearance
description: >-
  Clears a proposed trademark before adoption: a knockout screen for identical/near-identical marks, then a fuller
  search across the relevant classes and territories assessing likelihood of confusion (mark similarity, goods/services
  proximity, channels), distinctiveness/descriptiveness, and other bars (deceptive, conflicting prior rights, common-
  law use). Use to decide whether a name/logo is safe to adopt and register. Not for assessing infringement of an
  existing mark or drafting a takedown → ip/infringement-takedown; not for confirming ownership chain → ip/ip-ownership-audit.
module: ip
version: 1.0.0
jurisdictions: [global, IN]
risk_tier: review-required
inputs:
  - name: mode
    required: true
    description: One of knockout (fast identical/near-identical screen), full-clearance (fuller confusion + registrability analysis) or registrability (assess distinctiveness/absolute grounds only).
  - name: mark
    required: false
    description: The proposed mark (word/logo/combo), the goods/services and their Nice classes, and the target territories.
  - name: context
    required: false
    description: Any search results to hand, the intended use/branding, and how much risk the business will accept.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [ip/infringement-takedown, ip/ip-ownership-audit, ip/copyright-assessment, contracts/contract-review, research/multi-jurisdiction-survey]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Trademark Clearance

Takes a proposed mark and returns whether it is safe to adopt and register: a knockout screen, then a confusion and registrability analysis across the right classes and territories, with a clear risk rating and the fallbacks. The deliverable is a clearance opinion with a risk level and next steps, not a bare "the name seems free".

## When to use / not use

- Use: clearing a new brand/product name or logo before adoption; a fast knockout screen; a fuller clearance across classes and countries; assessing whether a mark is registrable (distinctive enough) at all.
- Hand off: assessing whether an existing mark infringes yours (or responding to a claim) and drafting notices → `ip/infringement-takedown`; confirming who owns a mark/chain of title → `ip/ip-ownership-audit`; copyright in a logo's artistic work → `ip/copyright-assessment`; the trademark assignment/licence terms in a contract → `contracts/contract-review`; a broad multi-country availability grid → `research/multi-jurisdiction-survey`.

## Inputs to collect first

1. The **proposed mark** (word, logo, or combined) and its exact form.
2. The **goods/services** and their **Nice classes** — clearance is class- and goods-specific, not absolute.
3. The **target territories** — rights are national; clear where you'll use/register.
4. The business's **risk appetite** and intended use/branding.

## Method

1. **Run a knockout screen first.** Search the relevant registers for **identical and near-identical** marks in the target classes/territories; an obvious senior mark kills the name cheaply before a full search. Clear the knockout before spending on the full clearance.
2. **Define the class scope correctly.** Search the classes of the actual goods/services **and** related/overlapping classes where confusion could arise — a mark free in your class can still be blocked by a confusingly similar mark in an adjacent one.
3. **Assess likelihood of confusion (the core test).** Weigh **mark similarity** (visual, phonetic, conceptual), **proximity of goods/services**, trade channels and consumer sophistication, and the senior mark's strength/reputation. Similar marks on related goods is the classic refusal/opposition ground.
4. **Test registrability (absolute grounds).** Is the mark **distinctive** or merely **descriptive/generic** (describing the goods), deceptive, or otherwise barred (geographical, laudatory, protected emblems)? A descriptive mark may be unregistrable or weak even if no one else holds it.
5. **Look beyond the register.** Check **common-law / unregistered** use and well-known marks (which can block even without registration), company/domain names, and prior use in first-to-use jurisdictions; the register isn't the whole picture.
6. **Account for territory rules.** First-to-file vs first-to-use, honest-concurrent-use, and any local specifics (in India, the Register + well-known-marks list and prior-use rights) `[verify current]`.
7. **Rate the risk and give options.** Rate **HIGH / MEDIUM / LOW** adoption risk with the reasons; where blocked, offer fallbacks — narrow the specification, coexistence/consent agreement, a design/stylised form, or choose a different mark.
8. **State the limits of the search.** Note coverage (which registers/territories searched, as-of date), that clearance reduces but doesn't eliminate risk, and that a full search/opinion may be warranted before launch.
9. **Score against the Checks table** and set a verdict: **CLEAR TO ADOPT / ADOPT WITH CONDITIONS / DO NOT ADOPT**.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| No knockout screen before full work | Identical/near-identical screened first | S2 | Run the knockout screen |
| Wrong/narrow class scope | Actual + related classes searched | S1 | Expand to overlapping classes |
| Confusion analysis superficial | Similarity × goods proximity × channels weighed | S1 | Do the full confusion analysis |
| Registrability (descriptiveness) not tested | Distinctiveness/absolute grounds assessed | S2 | Test the absolute grounds |
| Register-only search (no common law) | Unregistered/well-known/domain use checked | S1 | Search beyond the register |
| Territory rule (file vs use) ignored | First-to-file/use + local specifics applied | S2 | Apply the territory rule `[verify current]` |
| Risk not rated / no fallback | HIGH/MED/LOW + options given | S2 | Rate and offer alternatives |
| Search limits not stated | Coverage + as-of date + residual risk noted | S2 | State the scope and caveats |

## Output

Lead with `Verdict: CLEAR TO ADOPT | ADOPT WITH CONDITIONS | DO NOT ADOPT — <mark> in <classes/territories> — risk: HIGH|MED|LOW`. Then the output contract. Add:

- **Knockout**: identical/near-identical hits, if any.
- **Confusion analysis**: the closest marks and the similarity × proximity assessment.
- **Registrability**: distinctiveness / absolute-grounds result.
- **Beyond-register**: common-law / well-known / domain findings.
- **Options**: fallbacks where blocked; search scope + as-of date + caveats.
- One JSON finding per conflict/risk with `category: "trademark-clearance"`.

## Edge cases & pitfalls

- **Class blindness**: a mark free in your class can be blocked by a confusingly similar mark in an adjacent class on related goods — search the overlap, not just your class.
- **Register-only comfort**: unregistered/common-law use and well-known marks can block adoption even with a clean register — look beyond it.
- **Descriptive = weak/void**: a descriptive name may be unregistrable or nearly unenforceable even if no one else holds it — test distinctiveness.
- **Territory assumptions**: first-to-use vs first-to-file changes who wins — clearing in one country says nothing about another.
- **Over-claiming clearance**: presenting a knockout screen as a full clearance gives false comfort — state coverage and residual risk.

## References

- Volatile facts: cite `[verify current]` where a territory's first-to-file/use rule, well-known-mark treatment, or classification specifics are load-bearing.
- The relevant trademark registers and the Nice Classification; the governing trademark statute (e.g. India Trade Marks Act 1999; and target-territory law); likelihood-of-confusion and absolute-grounds case law.
