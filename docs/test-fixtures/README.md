# AEGIS agent test fixtures

Fictional sample documents for exercising the intake agents. Everything here
is invented test data — placeholder companies (Globex, Northwind, Brightwave)
and deliberately fictional near-marks (STRYPE, ZUUM) chosen to trigger the
agents' analysis. Nothing impersonates a real entity.

## How to use

Intake → **New Request** → paste the file's body into the description (for
NDA / trademark) or the contract text (for Contract Review) → Submit. Then
open **Triage Cockpit**, review the PENDING recommendation, and **Approve /
Edit / Reject**. Every one still requires the human approve keystroke.

| File | Agent it exercises | What it should do |
|---|---|---|
| `nda/nda-clean-snowflake.txt` | NDA | Clean mutual NDA + **surfaces the executed prior NDA on file with Snowflake** → approve-and-send |
| `nda/nda-deviations-northwind.txt` | NDA | Multiple playbook deviations → **flag-for-review** (not auto-send) |
| `contracts/msa-clean-brightwave.txt` | Contract Review | Playbook-aligned MSA → few/no deviations |
| `contracts/msa-redflags-globex.txt` | Contract Review | Unlimited liability, one-way indemnity, Net 90, evergreen, foreign law → **BLOCKER/HIGH** deviations |
| `contracts/dpa-brightwave.txt` | Contract-Type Specialist | Routes to the DPA playbook |
| `trademark/tm-strype-payments.txt` | Trademark | Strong knock-out hit vs **STRIPE** (class 36/9) |
| `trademark/tm-zuum-video.txt` | Trademark | Phonetic hit vs **ZOOM** (class 9/38/42) |
| `trademark/tm-aurelix-software.txt` | Trademark | Coined mark → likely **clear**, still recommends a formal search |

Seeded reference data these rely on: the Snowflake matter + executed NDA
(prior-NDA lookup), the 10-clause 📖 Playbook (contract deviations), and the
30 registered marks in the trademark table (knock-out screen).
