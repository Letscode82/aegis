/**
 * AEGIS module-isolation rules.
 *
 * Architectural commitment (do not relax once added):
 *
 *   - modules/<m>     CAN import from packages/* (public exports)
 *   - modules/<m>     CAN import from another module's api.ts ONLY
 *   - modules/<m>     CANNOT import from another module's internal/** or src/**
 *   - apps/web        CAN import from anywhere (composition root)
 *   - packages/<p>    CANNOT import from modules/* or apps/*  (deps point inward)
 *
 * Implementation: eslint-plugin-import's `no-restricted-paths`. The "zones"
 * below apply to absolute project paths AFTER ESLint resolves the import.
 *
 * To extend with a new module: nothing to change here. New modules under
 * modules/<name>/ are picked up automatically by the glob targets.
 */

const path = require("path");

// Resolve relative to the consuming repo root.
const ROOT = process.cwd();
const ABS = (p) => path.resolve(ROOT, p);

module.exports = {
  rules: {
    // Disallow modules importing each other's internals.
    "import/no-restricted-paths": [
      "error",
      {
        zones: [
          // 1. Modules CANNOT import another module's internal/**
          {
            target: ABS("modules"),
            from: ABS("modules"),
            except: ["./*/api.ts", "./*/api.js", "./*/api/index.ts"],
            message:
              "Modules may only import from another module's api.ts. " +
              "Importing from internal/, src/, or anywhere else is a privacy violation. " +
              "If you need a new public surface, add it to that module's api.ts.",
          },
          // 2. packages/* CANNOT import from modules/* (dependency direction).
          {
            target: ABS("packages"),
            from: ABS("modules"),
            message:
              "packages/* are shared infrastructure and cannot depend on modules/*. " +
              "Move the shared code into a package, or invert the dependency.",
          },
          // 3. packages/* CANNOT import from apps/* (dependency direction).
          {
            target: ABS("packages"),
            from: ABS("apps"),
            message:
              "packages/* cannot depend on apps/*. Apps are the composition root.",
          },
        ],
      },
    ],
  },
};
