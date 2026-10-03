---
name: drafting-persuasive-writing
description: >-
  Structures and edits persuasive legal writing — briefs, submissions, advocacy letters — so the argument lands:
  a clear ask and theory up front, issue-ordering by strength, CRAC/IRAC-structured argument, accurate authority,
  the other side's best point met head-on, and tight, credible prose. Use to draft or sharpen an advocacy document.
  Not for plain-language explainers to a lay reader → drafting/plain-language-explainer; not for a neutral
  internal research memo → the applicable research skill.
module: drafting
version: 1.0.0
jurisdictions: [global]
risk_tier: review-required
inputs:
  - name: mode
    required: true
    description: One of draft (produce the document), edit (restructure/sharpen a draft) or structure (produce the argument outline/skeleton before drafting).
  - name: document
    required: false
    description: The brief/submission/letter in scope or its draft, the forum/audience (judge, tribunal, regulator, opponent), and any length/format limits.
  - name: case
    required: false
    description: The outcome sought, the key facts, the strongest and weakest points, the governing authorities, and the other side's best argument.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [drafting/plain-language-explainer, disputes/legal-notice-drafter, disputes/early-case-assessment, research/statute-analysis, contracts/negotiation-prep]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Persuasive Legal Writing

Takes an advocacy document (or the case behind it) and returns writing that persuades the actual decision-maker: a clear ask and theory, issues ordered by strength, each argument structured and backed by accurate authority, the opponent's best point confronted, and prose tightened for credibility. The deliverable is a structured, persuasive draft or edit — not a neutral memo and not florid rhetoric.

## When to use / not use

- Use: drafting or sharpening a brief, court/tribunal submission, regulator response, or advocacy letter; building the argument skeleton before writing; editing a draft that buries its point or over-claims.
- Hand off: explaining something neutrally to a lay/business reader → `drafting/plain-language-explainer`; a pre-action demand/statutory notice specifically → `disputes/legal-notice-drafter`; the merits/strategy assessment that decides *what* to argue → `disputes/early-case-assessment`; the close reading of a provision you're arguing → `research/statute-analysis`; preparing negotiating arguments for a deal → `contracts/negotiation-prep`.

## Inputs to collect first

1. The **outcome sought** and the **decision-maker/audience** (judge, tribunal, regulator, opponent) — persuasion is audience-specific.
2. The **key facts**, the **strongest and weakest** points, and the governing **authorities**.
3. The **other side's best argument** — a persuasive document must anticipate it.
4. Any **length/format rules** (word limits, mandatory structure) the forum imposes.

## Method

1. **Lead with the ask and the theory.** State up front what you want the decision-maker to do and the one-line theory of why they should — the "so what". Burying the ask on page six is the commonest persuasion failure.
2. **Order issues by strength, not by the pleadings.** Put the winning argument first; lead with strength and let momentum carry the weaker points — don't march through issues in a dutiful, flat sequence.
3. **Structure each argument (CRAC/IRAC).** Conclusion → Rule → Application → Conclusion: assert the point, state the authority/rule, apply it to *these* facts, and land it. The application to the facts — not the rule recital — is where persuasion happens.
4. **Use authority accurately and candidly.** Cite real, on-point, still-good authority; quote precisely; and meet **adverse authority** you're bound to disclose rather than hoping it's missed — misciting or hiding bad law destroys credibility and can breach duties to the court.
5. **Confront the other side's best point.** Address the strongest counter-argument head-on and defuse it; ignoring it signals you can't answer it. Reframe rather than merely contradict.
6. **Make the facts tell the story.** A clear, chronological, accurate fact section framed (not distorted) toward your theory often does more work than the legal argument; never misstate a fact — it's fatal when caught.
7. **Write for credibility, not heat.** Tight, concrete, active prose; no overstatement, adjectives-as-argument, or ad hominem — measured confidence persuades, bluster doesn't. Cut every sentence that doesn't advance the ask.
8. **Respect the forum's form.** Honour word limits, required headings, and citation conventions; a well-structured document with signposting (headings, roadmap) is easier to rule in your favour.
9. **Score against the Checks table** and set a verdict: **PERSUASIVE / NEEDS WORK / NOT READY**, with the top fixes.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Ask / theory not up front | Relief + one-line theory lead the document | S1 | Move the ask and theory to the top |
| Issues ordered by pleadings, not strength | Strongest argument first | S2 | Re-order by strength |
| Argument recites rules, doesn't apply them | CRAC — application to these facts | S1 | Add the fact-application step |
| Authority misstated / not on point / stale | Accurate, on-point, good-law citations | S1 | Re-verify and correct citations |
| Adverse authority hidden | Binding adverse authority met and distinguished | S1 | Disclose and distinguish it |
| Opponent's best point ignored | Strongest counter confronted | S2 | Address and defuse it |
| Facts overstated / distorted | Accurate facts, framed not falsified | S1 | Correct any misstatement |
| Overheated / padded prose | Tight, concrete, measured | S3 | Cut and calm the prose |
| Forum format/limits breached | Word limits + required structure met | S2 | Conform to the rules |

## Output

Lead with `Verdict: PERSUASIVE | NEEDS WORK | NOT READY — <document> — <top fix>`. Then the output contract. Add:

- **Ask & theory**: the relief sought and the one-line theory.
- **Argument skeleton**: issues in strength order, each as a CRAC bullet with its authority.
- **Counter-handling**: the opponent's best point and the response.
- **Edit notes**: the specific structure/prose/citation fixes.
- One JSON finding per issue with `category: "persuasive-writing"`.

## Edge cases & pitfalls

- **Buried ask**: a reader who finishes unsure what you want hasn't been persuaded — the ask and theory go first.
- **Rule-dump without application**: reciting the law without applying it to these facts reads as a textbook, not an argument — the application is the persuasion.
- **Hiding bad law**: a court that finds the adverse authority you ignored distrusts everything else you wrote (and you may owe a disclosure duty) — meet it openly.
- **Fact spin**: one overstated or misquoted fact, once exposed, poisons the whole document — frame, never falsify.
- **Volume-as-strength**: a 40-page everything-argument buries the two winning points — lead with strength and cut the rest.

## References

- Volatile facts: generally none; cite `[verify current]` only where an argued legal position rests on a dated authority.
- Standard legal-writing craft (CRAC/IRAC, large-scale organisation, the duty of candour to the tribunal); the forum's format/citation rules; the case's own authorities and facts.
