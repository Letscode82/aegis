import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

/**
 * OneLegal end-to-end test harness.
 *
 * Safety model (see e2e/README.md):
 *  - The suite is READ-ONLY by default. Tests that create/modify data are
 *    tagged `@mutation` and are SKIPPED unless E2E_ALLOW_MUTATIONS=1.
 *  - Mutations are refused entirely unless E2E_TARGET=test, so the live
 *    demo database can never be written to by accident.
 *  - Auth: if E2E_STORAGE_STATE points at a saved Playwright storage-state
 *    file it is loaded; otherwise the suite assumes the app is running in
 *    dev-mode auth (no AUTH0_* env → every visitor resolves to the seeded
 *    admin), which needs no login.
 *
 * Config via env:
 *   E2E_BASE_URL        app under test            (default http://localhost:5173)
 *   E2E_START_SERVER=1  boot `next dev` ourselves (local only; needs a test DB)
 *   E2E_STORAGE_STATE   path to a saved auth state (deployed app w/ Auth0)
 *   E2E_TARGET=test     declare the target is a throwaway/test DB (unlocks mutations)
 *   E2E_ALLOW_MUTATIONS=1  run @mutation tests (requires E2E_TARGET=test)
 */

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5173";
const START_SERVER = process.env.E2E_START_SERVER === "1";
const STORAGE_STATE = process.env.E2E_STORAGE_STATE || undefined;
const REPORT_DIR = path.join(__dirname, "e2e-report");

export default defineConfig({
  testDir: "./e2e/tests",
  outputDir: path.join(REPORT_DIR, "artifacts"),
  // Feature flows can be slow (AI calls, server rendering). Generous but bounded.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  // Never retry locally in a way that hides flakiness; one retry in CI.
  retries: process.env.CI ? 1 : 0,
  // Serial by default: the app is a single shared instance and some flows
  // share navigation state. Bump with --workers=N against a test DB if wanted.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  reporter: [
    ["line"],
    ["html", { outputFolder: path.join(REPORT_DIR, "html"), open: "never" }],
    ["./e2e/reporter/summary-reporter.ts", { outFile: path.join(REPORT_DIR, "summary.md") }],
    ["json", { outputFile: path.join(REPORT_DIR, "results.json") }],
  ],
  use: {
    baseURL: BASE_URL,
    storageState: STORAGE_STATE,
    // A screenshot on every test so the report shows each feature's state,
    // not just failures.
    screenshot: "on",
    trace: "retain-on-failure",
    video: "retain-on-failure",
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Container ships Chromium at this path; PLAYWRIGHT_BROWSERS_PATH is set.
        // Leaving channel unset lets Playwright find its bundled/located Chromium.
      },
    },
  ],
  webServer: START_SERVER
    ? {
        command: "pnpm --filter @aegis/web dev",
        url: BASE_URL,
        timeout: 180_000,
        reuseExistingServer: !process.env.CI,
        cwd: path.join(__dirname, "..", ".."),
      }
    : undefined,
});
