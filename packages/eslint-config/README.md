# @aegis/eslint-config

Shared ESLint configuration for all packages, modules, and apps in the AEGIS
monorepo. The load-bearing rule is **module isolation**, defined in
[`module-isolation.cjs`](./module-isolation.cjs).

## Configs

| Config | Used by |
|---|---|
| `@aegis/eslint-config` (default) | `packages/*`, `modules/*` |
| `@aegis/eslint-config/next.cjs` | `apps/web` (Next.js) |
| `@aegis/eslint-config/module-isolation.cjs` | applied at the repo root via the root `.eslintrc.cjs` |

## Module-isolation rule

```
modules/<m>   CAN import from packages/*       (public package exports)
modules/<m>   CAN import from modules/<other>/api.ts   (public module API)
modules/<m>   CANNOT import from modules/<other>/internal/**  (privacy violation)
modules/<m>   CANNOT import from modules/<other>/src/**       (must go through api.ts)
apps/web      CAN import from anywhere         (composition root)
packages/<p>  CANNOT import from modules/* or apps/*           (deps point inward)
```

If you need a new public surface for a module, add it to that module's
`api.ts`. **Never** relax this rule. It is the architectural backbone that
lets modules be developed in parallel without interfering with each other.
