---
name: employment-termination-risk
description: >-
  Assesses a proposed dismissal, redundancy or exit for legal risk and process defects, flags retaliation and
  discrimination red flags, and produces a compliant exit plan with dues, documents and settlement terms. Use
  when HR or a manager wants to terminate, "let someone go", run a performance exit, layoff or retrenchment,
  or asks "can we fire X" or "what do we owe". Not for running the underlying misconduct inquiry →
  employment/workplace-investigation; not for non-compete enforceability → employment/restrictive-covenants.
module: employment
version: 1.0.0
jurisdictions: [IN, UK, US]
risk_tier: review-required
inputs:
  - name: employee_profile
    required: true
    description: Role, location (country/state), entity, start date, salary/wages, category (worker vs managerial/supervisory, fixed-term, probationer, contract labour), contract and appointment letter.
  - name: reason
    required: true
    description: Stated reason (misconduct, performance, redundancy/retrenchment, restructuring, end of fixed term, probation) and the evidence for it.
  - name: history
    required: true
    description: Recent complaints, grievances, protected disclosures, leave (maternity, medical), POSH involvement, performance records, warnings.
  - name: numbers
    required: false
    description: For group exits — how many, which establishment, headcount there over the last 12 months.
  - name: policies
    required: false
    description: Certified standing orders / service rules, disciplinary policy, severance policy, bonus/ESOP plans.
  - name: timing
    required: false
    description: Proposed exit date and any business deadlines.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md]
related: [employment/workplace-investigation, employment/posh-compliance, employment/restrictive-covenants, employment/india-labour-codes, disputes/litigation-hold, disputes/settlement-agreement, regulatory/whistleblower-programme]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Termination Risk

Most wrongful-termination claims are won or lost on process and timing, not on the reason itself. This skill tests a proposed exit against the employee's protected status, the applicable statutory regime and internal rules, identifies retaliation and discrimination signals, and returns a go/fix/stop decision with a step-by-step exit plan and settlement terms. The outcome is an exit that is lawful, documented, and costed.

## When to use / not use

- Use for individual terminations (misconduct, performance, probation, role elimination), group redundancies/retrenchments, end of fixed-term contracts, and negotiated exits.
- Hand off: misconduct facts not yet established → `employment/workplace-investigation`; POSH complaint involved → `employment/posh-compliance`; restrictive covenants post-exit → `employment/restrictive-covenants`; settlement deed drafting → `disputes/settlement-agreement`; claim already threatened → `disputes/litigation-hold` + `disputes/early-case-assessment`.

## Inputs to collect first

1. **Country and state** of work (not of the employing contract) — Indian Shops & Establishments and state labour rules vary.
2. **Category**: is the person a "worker" under the Industrial Relations Code 2020 (IR Code) s.2(zr)? Managerial/administrative roles and supervisors earning above the notified wage ceiling (₹18,000/month [verify current]) are outside "worker" — this decides whether retrenchment law applies.
3. **Protected-status signals** in the last 12 months: protected disclosure, grievance or complaint, POSH complaint or witness role, pregnancy/maternity, sick leave/disability, union activity, request for statutory rights.
4. **Reason and evidence**: is the evidence documented and contemporaneous?
5. **Numbers**: group exits — establishment headcount drives prior-permission and standing-order thresholds.

## Method

1. **Fix the regime** — country, state, category, contract terms, standing orders/service rules. Indian labour codes are in force (`IN-LAB-01`) [verify current]; check whether the relevant state rules are notified and which transitional provisions apply.
2. **Classify the exit** — misconduct (dismissal), performance/capability, retrenchment (termination for any reason other than punishment — IR Code s.2(zh) [verify]), end of fixed term, probation, closure, mutual separation.
3. **Retaliation and discrimination screen** (run before anything else). If any protected-status signal is within 12 months of the decision, or the decision-maker is the subject of the employee's complaint → **S1 — STOP** until counsel reviews timing, evidence and decision-maker independence. Indicators: adverse decision soon after protected act; reason first documented after the protected act; inconsistent treatment of comparators; shifting reasons.
4. **Process check** by exit type (Checks table). Missing step → S2 (S1 if it voids the termination, e.g. retrenchment without statutory compensation in an establishment where the conditions are mandatory).
5. **Compute dues** — notice/pay in lieu, statutory compensation, gratuity, leave encashment, bonus, re-skilling fund contribution, full-and-final timing, plus contractual/ESOP items.
6. **Decide**: **PROCEED** (no S1/S2), **FIX THEN PROCEED** (S2s curable before exit date), **STOP / RESTRUCTURE** (any S1, or exit cannot be made lawful on current facts — consider negotiated exit).
7. **Plan the exit** — sequence, documents, communications, data and access, holds, settlement terms.

## Checks / issue list — India

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Worker status | Determined on actual duties, not designation | S2 if unclear | Treat as worker for process purposes |
| Retrenchment conditions (worker with ≥1 year continuous service) | One month's written notice stating reasons (or pay in lieu); compensation of 15 days' average pay per completed year of service (or part over six months); notice to appropriate government — IR Code s.70 | S1 if any condition missed | Comply before exit date |
| Last-come-first-go | Followed within category, or reasons recorded for departure (IR Code s.71 [verify]); re-employment preference later (s.72 [verify]) | S2 | Record reasons |
| Re-skilling fund | 15 days' last-drawn wages per retrenched worker credited to the fund (IR Code s.83) | S2 | Pay with F&F |
| Prior permission (Chapter X) | Establishments with ≥300 workers (state may raise) need government permission for layoff, retrenchment, closure (IR Code ss.77–80 [verify]) | S1 | Apply; do not retrench before permission |
| Misconduct dismissal | Charge-sheet, reply opportunity, domestic inquiry consistent with natural justice and standing orders; proportionate penalty | S2 (S1 if no hearing at all) | Run inquiry → `employment/workplace-investigation` |
| Standing orders | Certified/model standing orders applicable at ≥300 workers (IR Code Chapter IV) followed | S2 | Apply model standing orders |
| Shops & Establishments Act | State Act notice/termination provisions for non-workers in commercial establishments (e.g. notice, appeal rights) checked | S2 | State-specific check |
| Contractual notice | Notice per appointment letter; garden leave if needed | S3 | Pay in lieu if contract permits |
| Gratuity | Payable at ≥5 years' continuous service; ≥1 year for fixed-term employees (pro rata) — Code on Social Security 2020 s.53; ceiling `IN-GRAT-01` [verify current]; forfeiture only on grounds in the Code | S2 if withheld | Pay within statutory time |
| Wage definition | Gratuity/compensation computed on Code "wages" with the 50% add-back rule (Code on Wages 2019 s.2(y)) | S2 | Recompute |
| Full and final settlement | Wages due paid within two working days of removal/dismissal/retrenchment/resignation (Code on Wages 2019 s.17(2)) [verify] | S2 | Diary payroll |
| POSH interplay | Termination of a complainant or witness during or after a POSH inquiry; or of a respondent without following IC recommendation process (POSH Act 2013 ss.13, 19) | S1 (complainant/witness) | Counsel review; document independent reason |
| Maternity | Dismissal during maternity leave is prohibited except gross misconduct (Code on Social Security 2020, maternity chapter; previously Maternity Benefit Act 1961 s.12) [verify section] | S1 | Defer |
| Whistleblower | Vigil mechanism protection (Companies Act 2013 s.177(9)–(10); LODR Reg 22 for listed) | S1 | Independent decision-maker; counsel |
| Disability | RPwD Act 2016 s.20(4): no dispensing with or reduction in rank of an employee who acquires a disability during service | S1 | Shift/supernumerary post analysis |
| Non-compete in exit papers | Post-employment non-compete void under Contract Act s.27; confidentiality and non-solicit of clients enforceable more readily [general principle — verify] | S3 | Use confidentiality + garden leave |
| Forced resignation | Resignation obtained under pressure = termination | S2 | Offer genuine mutual separation with consideration |

## Other jurisdictions

**UK**
- Unfair dismissal: employee needs qualifying service — currently 2 years (Employment Rights Act 1996 s.108), falling to **6 months from 1 January 2027** with the compensatory-award cap removed (Employment Rights Act 2025) (`UK-ERA-01` [verify current]). Automatically unfair reasons (whistleblowing s.103A, pregnancy, health & safety, trade union) need no qualifying service.
- Fair reason (s.98: capability, conduct, redundancy, statutory illegality, SOSR) + fair procedure (Acas Code of Practice on Disciplinary and Grievance Procedures; unreasonable failure can uplift awards up to 25%).
- Redundancy: statutory redundancy pay at 2 years' service; collective consultation for 20+ redundancies at one establishment within 90 days (TULRCA 1992 s.188) with HR1 notification (s.193); protective award risk.
- Discrimination (Equality Act 2010) — no qualifying service, uncapped.
- Settlement agreements must meet ERA 1996 s.203 conditions (independent adviser) to waive statutory claims.

**US**
- At-will by default (Montana is the main statutory exception) [verify]; risk sits in exceptions: discrimination (Title VII, ADEA — 20+ employees, ADA — 15+ employees), FMLA interference/retaliation, whistleblower statutes (SOX §806 for public companies; Dodd-Frank), public-policy and implied-contract exceptions under state law.
- WARN Act: 60 days' notice for plant closings/mass layoffs at covered employers (100+ employees); state mini-WARN laws can be stricter [verify state].
- Releases of age claims for 40+ must meet OWBPA: 21 days to consider (45 for group programmes), 7-day revocation, disclosures for group exits.
- Final pay timing is state-specific (some states require same day) [verify state].

## Exit plan (output component)

1. Decision record: reason, evidence index, decision-maker (independent of any complaint), comparator check.
2. Pre-exit steps: any inquiry, notices to government, permissions, consultation; diarised.
3. Meeting script outline (neutral, no new reasons), attendees, location/time.
4. Documents: termination letter (stating reason accurately; for retrenchment, statutory notice content), F&F computation, relieving and experience letters, statutory forms.
5. Access and data: revoke access at meeting time; device return; litigation hold check before wiping any device or mailbox.
6. Settlement offer (if used): consideration above statutory dues; mutual release with carve-outs for non-waivable statutory rights (gratuity, PF, accrued wages cannot be waived in India); confidentiality; non-disparagement; return of property; cooperation; tax treatment.
7. Communications: internal message, client handover, regulator notifications if a regulated role (e.g. SEBI/RBI-registered key personnel).

## Output

Follow `_shared/output-contract.md`. Lead with `Decision: PROCEED | FIX THEN PROCEED | STOP — <main reason>; risk <Red/Amber/Green>`. Add the **Dues computation** table (head · basis · authority · amount · due date) and the **Exit plan**. Any retaliation/whistleblower/POSH/maternity signal → escalation line per STANDARDS §8 to employment counsel.

## Edge cases & pitfalls

- **Labels do not decide status**: a "manager" doing clerical work may be a worker; a "consultant" may be an employee.
- **Probationers** still get contractual notice and natural justice where the termination is stigmatic (based on misconduct) [general principle — verify].
- **Fixed-term non-renewal** is not retrenchment if it follows the contract's terms, but repeated renewals to avoid permanency invite challenge.
- **Group exits split across months** to stay under thresholds are aggregated by tribunals and regulators — count over 12 months.
- **Cross-border employees**: the place of work's mandatory law applies even with a foreign governing-law clause.
- **Public-sector or government-controlled employers**: Article 14/16 constraints and service rules apply — escalate.
- Volatile items: `IN-LAB-01`, `IN-GRAT-01`, `UK-ERA-01` — check before relying.
