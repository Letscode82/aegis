/**
 * Base ESLint config for AEGIS packages. Intentionally does NOT include
 * the `react` or `react-hooks` plugins — those would conflict with
 * `eslint-config-next` when both are loaded into the same lint pass for
 * apps/web. React-using packages opt into them via `./react.cjs`.
 *
 * The load-bearing piece of the architecture is `module-isolation.cjs`,
 * applied at the repo root.
 */
module.exports = {
  root: false,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    ecmaFeatures: { jsx: true },
  },
  env: {
    browser: true,
    node: true,
    es2022: true,
  },
  plugins: ["@typescript-eslint", "import"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:import/recommended",
    "plugin:import/typescript",
  ],
  settings: {
    "import/resolver": {
      typescript: { alwaysTryTypes: true },
      node: { extensions: [".js", ".jsx", ".ts", ".tsx"] },
    },
  },
  rules: {
    "@typescript-eslint/no-unused-vars": [
      "warn",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],
    "@typescript-eslint/no-explicit-any": "warn",
    "import/no-unresolved": "off",
  },
  ignorePatterns: [
    "node_modules",
    "dist",
    ".next",
    ".turbo",
    "coverage",
    "*.config.js",
    "*.config.cjs",
  ],
};
