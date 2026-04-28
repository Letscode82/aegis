# @aegis/identity-graph

**Status: STUB.** Empty in Step 1. This README is an architectural commitment.

## What this package will do
The graph layer over the `Person` and `Counterparty` shared entities. It
answers questions that span modules: "show me everything connected to
Acme Corp," "is this person a custodian on any active hold AND a data
subject in any open DSAR?", "what's our full relationship with this law
firm?"

`Person` is **polymorphic** by design (an entity can simultaneously be an
Employee, a Custodian, a Data Subject, and a Counterparty Contact, all
under one `Person.id`). `Counterparty` has hierarchy
(`parentId` for entity groups). This package is the place where those
relationships are traversed; modules consume answers, not relations.

## When it will be implemented
**Phase: Step 7+ (after the foundation is in place).** First trigger is
the **Insights** module's risk graph view — that's a graph problem, not a
list problem. Privacy and Legal Hold also benefit early (DSAR + custodian
overlap detection).

## Public API surface (planned)

```ts
import {
  resolvePerson,
  mergePeople,
  getCounterpartyHierarchy,
  getPersonAffiliations,
  getEntitiesRelatedTo,
  detectDuplicates,
  screenSanctions,
} from "@aegis/identity-graph";

// "Same person across systems" — returns a single canonical Person record
// even though the input has email-only, employee-id-only, etc.
const person = await resolvePerson({
  organizationId,
  email: "j.doe@acme.com",
  externalRef: "workday:E12345",
});

// "Show me everywhere this counterparty appears" — matters, contracts,
// invoices, DSARs, custodians, etc.
const graph = await getEntitiesRelatedTo({
  organizationId,
  rootType: "Counterparty",
  rootId: acmeId,
  depth: 2,
});
```

## Entities owned/managed
- `Person` (defined in `@aegis/db`, mutated only via this package's
  `resolvePerson` / `mergePeople` / `splitPerson`).
- `Counterparty` hierarchy traversal (parent/child queries).
- `IdentityResolutionRule` (org-configurable matching policy: email +
  name fuzzy match, employee-id authoritative, etc.).
- `SanctionsScreening` records (cached results from external screening
  service).

## Why a shared service vs. a module
- Identity resolution is one of the hardest problems in legal ops
  (people change names/jobs/affiliations) and must be done once, well.
- Multiple modules need the same answer to "are these two records the
  same person?"
- Sanctions screening must apply uniformly — modules cannot opt out.
- The Insights module's risk graph IS this package, presented visually.

## Out of scope
- Sanctions vendor integrations (this package wraps them; the actual API
  clients live alongside).
- Person UI / counterparty CRM screens (those live in the **Entity
  Management** module).
- Authentication identities (those are `User` records, owned by `@aegis/auth`).
