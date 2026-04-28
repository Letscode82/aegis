# @aegis/types

Cross-cutting TypeScript types shared across the AEGIS monorepo.

## Scope
- Branded ID types (`Id<"Matter">`, `Id<"User">`, …) to prevent cross-module ID confusion.
- Pagination envelopes (`Page<T>`).
- `Result<T, E>` discriminated unions for explicit error handling.
- (Step 2) Shared entity types re-exported from `@aegis/db` for ergonomic imports.

Domain-specific types **stay with their module** — for example, `Matter` and
`LegalHold` types are exported from `modules/matter/api.ts`, not from here.
