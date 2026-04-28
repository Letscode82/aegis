/**
 * Root ESLint config. Applies the shared base + module-isolation rules to
 * the entire monorepo. Individual packages/apps may extend with their own
 * `.eslintrc.cjs` (e.g. apps/web extends @aegis/eslint-config/next.cjs).
 */
module.exports = {
  root: true,
  extends: [
    "@aegis/eslint-config",
    "@aegis/eslint-config/module-isolation.cjs",
  ],
  ignorePatterns: [
    "node_modules",
    "dist",
    ".next",
    ".turbo",
    "coverage",
    "reference/**",
  ],
};
