---
name: contracts-india-commercial-contract
description: >-
  Checks whether a commercial contract will be valid, admissible and enforceable under Indian law: Contract Act
  validity and void clauses, specific relief, stamp duty and execution, e-signature, arbitration seat/venue,
  Commercial Courts pre-institution mediation and FEMA issues with foreign parties. Use when a party is Indian,
  the contract is signed or performed in India, or disputes go to Indian courts/seat. Not for clause-by-clause
  playbook review → contracts/contract-review; designing the dispute clause → contracts/dispute-resolution-clause.
module: contracts
version: 1.0.0
jurisdictions: [IN]
risk_tier: review-required
inputs:
  - name: document
    required: true
    description: The contract (draft or executed), including schedules and any arbitration agreement in a separate document.
  - name: our_party
    required: true
    description: Our entity and role; whether we are resident in India for FEMA purposes.
  - name: execution_facts
    required: false
    description: Where and how each party signs (state, wet ink / e-sign / DSC / Aadhaar e-sign), date, signatory and authority document.
  - name: counterparty_profile
    required: false
    description: Residency, ownership (incl. land-border country owners), MSME registration, government / PSU status.
  - name: stage
    required: false
    description: pre-signing | executed | dispute-contemplated. Changes which checks are urgent.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [contracts/contract-review, contracts/dispute-resolution-clause, contracts/redline-generator, corporate/fdi-fema-assessment, corporate/board-minutes-resolutions, disputes/legal-notice-drafter, disputes/arbitration-strategy, disputes/deadline-calendar, research/india-legal-research, research/citation-verification, privacy/dpdpa-compliance]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# India Commercial Contract Enforceability

Indian law rewards a contract that is valid, properly stamped, properly executed and routed to the right forum — and punishes small formal failures at the worst time, usually when you need to sue. This skill runs the Indian-law enforceability layer on top of the commercial review: which clauses are void or will be read down, whether the document will be admitted in evidence, whether the arbitration or court route will work, and what FEMA requires when money or guarantees cross the border. Output is a ranked list of fixes before signing, or a cure plan for an executed contract.

## When to use / not use

- Use: any contract with an Indian party, Indian place of execution or performance, Indian governing law, or Indian seat/courts. Run alongside `contracts/contract-review`.
- Hand off: arbitration clause design → `contracts/dispute-resolution-clause`; foreign investment or share issuance → `corporate/fdi-fema-assessment`; board approvals / related-party transactions → `corporate/board-minutes-resolutions`; limitation computation → `disputes/deadline-calendar`; statutory notice (e.g. s.138 NI Act) → `disputes/legal-notice-drafter`.

## Inputs to collect first

1. **Stage** — pre-signing (fix drafting), executed (cure stamping/execution), or dispute contemplated (admissibility, s.12A, limitation are urgent).
2. **State(s) of execution** and where the original is first received in India — drives stamp duty.
3. **Residency** of each party (FEMA) and whether any owner is from a country sharing a land border with India (Press Note 3 / procurement restrictions).
4. **Counterparty type** — government / PSU (arbitrator appointment, procurement rules), MSME (payment terms), listed (related-party, disclosure).
5. **Signatory authority** — board resolution, power of attorney, delegation.

## Method

1. **Validity screen (ICA 1872 s.10).** Free consent of competent parties, lawful consideration and object, not expressly declared void. Any party a minor or of unsound mind → void (s.11). Consent obtained by coercion, undue influence, fraud or misrepresentation → voidable (ss.14–19A). Mistake of fact by both parties → void (s.20). Decision: failure on any limb is S1 pre-signing; for executed contracts, route to `disputes/early-case-assessment`.
2. **Void-clause sweep.** Run the Checks table. A void clause is not fatal to the contract if severable; check for a severability clause and whether the void term goes to the root.
3. **Remedies sanity check.** Damages (s.73 remoteness; s.74 LD ceiling), specific performance (SRA 1963 as amended 2018), injunctions, and whether the clause set gives us a remedy we can actually obtain.
4. **Stamp and admissibility.** Identify each instrument (main agreement, guarantee, indemnity bond, power of attorney, arbitration agreement if separate), the state law and article. Decide: stamp before or at execution (Indian Stamp Act 1899 s.17), or within three months of first receipt in India for instruments executed outside India (s.18) — state acts may differ. Never quote a rate without the state schedule (`IN-STAMP-01`, [verify current]).
5. **Execution and authority.** Signatory authority, company execution formalities, e-signature validity, registration needs.
6. **Dispute route.** Seat vs venue, institutional rules, arbitrator appointment validity, interim relief, Commercial Courts jurisdiction and s.12A mediation.
7. **Cross-border overlay.** FEMA (payment currency, advances, guarantees, set-off), tax withholding, Press Note 3, sanctions, data localisation for regulated sectors.
8. **Score and decide** (severity scale): S1 → do not sign / urgent cure; S2 → fix before signing or cure within the statutory window; S3/S4 → note.

## Checks

| Issue | Test / good position | Default severity | Fix / action |
|---|---|---|---|
| Post-term non-compete | Void under ICA s.27 except sale-of-goodwill exception; negative covenant operating *during* the term can be enforced (*Niranjan Shankar Golikari v Century Spinning* AIR 1967 SC 1098); post-term restraint struck down (*Percept D'Mark v Zaheer Khan* (2006) 4 SCC 227) | S2 if we rely on it | Replace with confidentiality + non-solicit of customers/staff during term; consider in-term exclusivity |
| Clause barring legal remedies or shortening time to sue | Void under s.28 (as amended 1997); also void if it extinguishes rights / discharges liability on expiry of a period shorter than limitation; exception for bank guarantees with claim period ≥ 1 year (2013 amendment) | S2 | Use notice-of-claim procedure that does not extinguish the right; rely on Limitation Act 1963 (generally 3 years, Art. 55) |
| Arbitration clause | Saved by s.28 Exception 1; must be in writing (A&C Act 1996 s.7), may be by exchange of emails | Info | — |
| Object / consideration against public policy, law, or defeating law | Void (s.23); e.g. payments to influence officials, tax-evasion structures, circumvention of FEMA | S1 | Remove; escalate → `regulatory/anti-bribery` |
| Uncertain terms ("to be agreed", undefined price) | Void for uncertainty (s.29) unless capable of being made certain | S3 | Add mechanism (index, expert determination) |
| Liquidated damages | s.74: court awards reasonable compensation not exceeding the stated sum; legal injury still required, actual loss proof may be dispensed with where loss is hard to prove (*ONGC v Saw Pipes* (2003) 5 SCC 705; *Kailash Nath Associates v DDA* (2015) 4 SCC 136) | S3 | Record the pre-estimate rationale in recitals or schedule; do not treat LD as an exclusive cap unless stated |
| Indemnity | Statutory indemnity (ss.124–125) is narrow (loss caused by promisor's conduct or another person); contractual wording governs scope and trigger | S3 | State that indemnity covers third-party claims and own losses, and is payable on demand / on incurring liability |
| Guarantee | Surety liability co-extensive (s.128); discharge by variation without consent (s.133) | S2 if we hold a guarantee | Add consent-to-variation and continuing-guarantee language |
| Specific performance | Post-2018 SRA: s.10 makes specific performance the rule subject to ss.11(2), 14, 16; s.14 lists unenforceable contracts (where substituted performance obtained, continuous supervision, personal qualifications, determinable); s.20 substituted performance on 30 days' written notice; 2018 amendment applies prospectively (*Katta Sujatha Reddy v Siddamsetty Infra Projects*, 2022) `[unverified]` | S3 | For supply-critical contracts, add express substituted-performance rights and cost recovery |
| Injunction against infrastructure projects | SRA s.20A and s.41(ha) restrict injunctions that impede infrastructure projects (Schedule) | S3 if we are a contractor | Rely on damages/LD and arbitration |
| Frustration / force majeure | s.56 frustration is narrow (*Satyabrata Ghose v Mugneeram Bangur* AIR 1954 SC 44); express FM governs under s.32 | S3 | Draft express FM with list, notice, termination |
| MSME counterparty (we pay) | Pay within agreed period ≤ 45 days, else compound interest at 3× RBI bank rate (MSMED Act 2006 ss.15–16); disputes may go to MSE Facilitation Council (s.18) | S3 | Align payment terms; check tax deductibility rule (`IN-TAX-01`) |
| Unilateral arbitrator appointment | Person ineligible under A&C Act s.12(5) / Seventh Schedule cannot appoint a sole arbitrator either (*Perkins Eastman v HSCC* (2020) 20 SCC 760); for PSU contracts, unilateral appointment clauses violate equality — *CORE v ECI SPIC SMO MCML (JV)*, 2024 INSC 857 (Constitution Bench), prospective (`IN-ARB-01`) | S2 | Mutual appointment or institutional appointment |
| Seat vs venue | Part I applies where seat is in India (s.2(2)); seat = juridical home and exclusive supervisory court (*BALCO v Kaiser Aluminium* (2012) 9 SCC 552); a named "venue" with no contrary indicia is the seat (*BGS SGS Soma JV v NHPC* (2020) 4 SCC 234) | S2 if ambiguous | Use "The seat (legal place) of arbitration shall be ___" and name the court with supervisory jurisdiction |
| Two Indian parties, foreign seat | Permitted; award enforceable as a foreign award (*PASL Wind Solutions v GE Power Conversion India*, 2021, SC) `[unverified]`; two Indian parties choosing foreign *governing law* is contested — `[general principle — verify]` | S3 | Prefer Indian law; foreign seat only with reason |
| Emergency arbitrator | Award of an emergency arbitrator in an India-seated arbitration enforceable under s.17(2) (*Amazon.com NV Investment Holdings v Future Retail*, 2021, SC) `[unverified]`; foreign-seated emergency awards not directly enforceable — seek s.9 relief | Info | Plan interim relief route |
| Arbitral timeline | Award within 12 months of completion of pleadings, extendable 6 months by consent, then court (s.29A) | Info | Calendar |
| Stamp duty unpaid / deficient | Not void; inadmissible in evidence until duty + penalty paid (Stamp Act s.35; s.42 endorsement); liable to impounding (s.33) | S2 executed; S3 pre-signing | Stamp at or before execution in the right state; for executed docs, pay deficit + penalty via adjudication before any litigation |
| Unstamped arbitration agreement | Not void and not a bar at referral stage; objection is for the tribunal; defect curable (*In re: Interplay between Arbitration Agreements under the A&C Act 1996 and the Indian Stamp Act 1899*, 2023 INSC 1066, 7-judge bench, 13 Dec 2023, overruling *N.N. Global* (2023) and *SMS Tea Estates* (2011)) | S3 | Still stamp: the tribunal and the enforcement court will need an admissible instrument |
| Electronic signature | Valid under IT Act 2000 ss.3A, 5, 10A, except First Schedule documents (negotiable instruments other than cheques, powers of attorney, trusts, wills, contracts for sale/conveyance of immovable property) | S2 for excluded documents | Wet-ink / registered execution for excluded instruments; e-stamping available in most states |
| Proof of electronic records | Certificate under Bharatiya Sakshya Adhiniyam 2023 s.63 (replacing Evidence Act s.65B from 1 Jul 2024) | S4 | Keep signing-platform audit trail and hash |
| Company execution | Signed by authorised person (Companies Act 2013 s.21); common seal optional; board resolution or PoA; related-party transaction approvals (s.188); loans/guarantees limits (ss.185–186) | S2 if authority unclear | Obtain certified board resolution; → `corporate/board-minutes-resolutions` |
| Registration | Leases > 1 year and documents creating interests in immovable property require registration (Registration Act 1908 s.17); unregistered → not admissible as evidence of the transaction (s.49) | S2 | Register within 4 months of execution (s.23) |
| Commercial Courts route | Commercial dispute (Commercial Courts Act 2015 s.2(1)(c)) of specified value ≥ ₹3 lakh (s.12; `IN-COMM-01`); pre-institution mediation mandatory unless urgent interim relief sought (s.12A), suits filed without it after 20 Aug 2022 liable to rejection (*Patil Automation v Rakheja Engineers* (2022) 10 SCC 1) | S2 at dispute stage | Build s.12A step into the dispute plan; mediation period excluded from limitation |

## FEMA and cross-border checks (foreign counterparty)

- **Currency and payment.** Current-account payments to non-residents are freely permitted except as restricted by the FEM (Current Account Transactions) Rules 2000; capital-account transactions need a permitted route. Check invoicing currency, AD bank documentation, and that advance payments for imports and export realisation follow RBI Master Directions (Import / Export of Goods and Services) `[verify current]`.
- **Deferred payment > short-term trade-credit limits** may be an external commercial borrowing or trade credit requiring compliance → `corporate/fdi-fema-assessment`.
- **Guarantees** by an Indian resident for a non-resident's obligation, or vice versa, are regulated under FEMA guarantee regulations `[verify current]`; flag any parent guarantee crossing the border.
- **Set-off / netting** of import payables against export receivables needs AD bank / RBI permission conditions `[verify current]`.
- **Equity-linked terms** (warrants, convertibles, options to acquire shares) → FDI rules and pricing guidelines → `corporate/fdi-fema-assessment`.
- **Land-border countries.** FDI by entities whose beneficial owner is in a country sharing a land border with India needs government approval (Press Note 3 (2020)); public-procurement bidders from such countries need registration under GFR Rule 144(xi) orders `[verify current]`.
- **Withholding tax** on payments to non-residents under the Income-tax Act 2025 (in force 1 Apr 2026, `IN-TAX-01`; old s.195 obligations re-numbered) — clauses should allocate gross-up, require TRC and Form 10F-equivalent, and treaty eligibility `[verify current]`.
- **Enforcement abroad / in India.** Foreign awards from New York Convention reciprocating territories enforceable under Part II; foreign court decrees from reciprocating territories executable under CPC s.44A; non-reciprocating decrees need a fresh suit — prefer arbitration for foreign counterparties.

## Output

Line one: `Enforceability: SOUND | FIXABLE | AT RISK — <reason>` then `Draft — requires lawyer review`. Follow `_shared/output-contract.md`. Add between Findings and Actions:

1. **Stamp & execution plan** — instrument, state, applicable act/article (from schedule, not memory), who pays, timing, e-stamp availability, signatory and authority document.
2. **Dispute route map** — seat, institution, appointment mechanism, interim-relief court, s.12A step, limitation start.
3. **FEMA notes** — transactions flagged and the bank/RBI step each needs.

## Edge cases & pitfalls

- "Venue: Mumbai; seat: Singapore" vs "arbitration in Mumbai" — the second makes Mumbai the seat by default (*BGS SGS Soma*).
- Stamp duty is assessed on the instrument as executed in the state where executed or first brought; a contract signed in two states by e-sign can attract a "brought into the state" liability later. Record where each signature occurred.
- Unstamped documents can still be impounded when produced before any authority, including in arbitration; the penalty can reach multiples of the deficit under state acts.
- Contracts with government require compliance with Article 299 of the Constitution (expressed to be made by the President/Governor and executed by an authorised officer); non-compliance makes the contract unenforceable against the government `[general principle — verify]`.
- A "governing law: Indian law" clause does not choose courts; add exclusive jurisdiction or arbitration expressly.
- Do not call s.27 satisfied because the restraint is "reasonable" — Indian law has no general reasonableness exception for post-term restraints.
- Case citations here are from memory unless marked as checked; run `research/citation-verification` before external use.

## References

- `references/india-execution-checklist.md` — signing-day checklist and state stamp-act map.
- Volatile facts: `IN-STAMP-01`, `IN-DPDP-03`, proposed `IN-TAX-01`, `IN-ARB-01`, `IN-COMM-01`.
