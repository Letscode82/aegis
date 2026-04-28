/**
 * ESLint config for the Next.js app (apps/web).
 *
 * Extends only `next/core-web-vitals`. The repo-root `.eslintrc.cjs` already
 * applies the base config + module-isolation rules to the entire tree;
 * extending the base here too would double-load the `react-hooks` plugin
 * (next-config-next also declares it) and ESLint errors on plugin conflicts.
 *
 * The composition root has permission to import from anywhere, so the
 * module-isolation `no-restricted-paths` rule has no effect on apps/web —
 * the `target` zones only cover `modules/*` and `packages/*`.
 */
module.exports = {
  root: false,
  extends: ["next/core-web-vitals"],
  rules: {
    // Pre-existing v8 demo views use smart quotes in JSX copy. Stylistic
    // rule — not part of our architectural discipline.
    "react/no-unescaped-entities": "off",
  },
};
