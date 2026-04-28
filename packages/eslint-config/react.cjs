/**
 * React + react-hooks rules. Use in packages that contain React components
 * but are NOT the Next.js app — e.g. `packages/ui` and `modules/<m>`.
 *
 * apps/web does NOT extend this; it extends `./next.cjs` which pulls in
 * `eslint-config-next` (which already provides react-hooks).
 */
module.exports = {
  root: false,
  extends: [
    "./index.cjs",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended",
  ],
  plugins: ["react", "react-hooks"],
  settings: {
    react: { version: "detect" },
  },
  rules: {
    "react/prop-types": "off",
    "react/react-in-jsx-scope": "off",
  },
};
