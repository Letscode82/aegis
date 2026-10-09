/**
 * Shared helpers for driving the AEGIS one-page shell.
 *
 * AppShell (apps/web/src/AppShell.jsx) is a client-only SPA. Views switch on
 * the `?view=<id>` query param on first mount, so a deep link lands directly
 * in a view. The left sidebar renders the "AEGIS" wordmark and one clickable
 * nav entry per module.
 */
import { expect, type Page } from "@playwright/test";

/** Nav ids used as `?view=` deep links, with their visible labels. */
export const VIEW = {
  onelegal: { id: "onelegal", label: "ONE Legal" },
  intake: { id: "intake", label: "Legal Intake" },
  contracts: { id: "contracts", label: "Contracts" },
} as const;

/**
 * Text/selectors that indicate a crashed render we should fail on.
 * The app has no global error boundary; per-panel `PanelBoundary` fallbacks
 * render the "hit an error and was contained" text (role="alert"), so a
 * contained panel crash is a real failure signal even though the shell lives.
 */
const ERROR_SIGNALS = [
  "text=Unhandled Runtime Error",
  "text=Build Error",
  "text=Application error",
  "text=Something went wrong",
  "text=hit an error and was contained",
  "text=hit an error.",
  "[data-nextjs-dialog]",
  "[data-nextjs-dialog-overlay]",
];

/**
 * Open a view by deep link and wait for the shell to hydrate. Returns once the
 * sidebar wordmark is visible and the network has gone idle.
 */
export async function openView(page: Page, viewId: string): Promise<void> {
  await page.goto(`/?view=${encodeURIComponent(viewId)}`, { waitUntil: "domcontentloaded" });
  // The shell is dynamic(ssr:false); wait for hydration to paint the sidebar.
  await expect(page.getByText("AEGIS", { exact: true }).first()).toBeVisible({ timeout: 30_000 });
  // Best-effort idle wait, capped: some views poll /api/auth/current-user every
  // ~1s so the page never truly goes idle — don't block the whole test on it.
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {
    /* expected on polling views */
  });
}

/**
 * Fail the test if a Next.js dev error overlay or a generic crash message is
 * on screen. Call after opening a view and after any interaction.
 */
export async function assertNoCrash(page: Page): Promise<void> {
  for (const sel of ERROR_SIGNALS) {
    const count = await page.locator(sel).count();
    expect(count, `Crash signal present: ${sel}`).toBe(0);
  }
}

/**
 * Capture a named screenshot into the report's artifacts and attach it to the
 * current test so the HTML + summary reports show it per feature.
 */
export async function shot(page: Page, name: string, testInfo: import("@playwright/test").TestInfo): Promise<void> {
  const file = testInfo.outputPath(`${name.replace(/[^a-z0-9-_]+/gi, "_")}.png`);
  await page.screenshot({ path: file, fullPage: true });
  await testInfo.attach(name, { path: file, contentType: "image/png" });
}

/** Click a left-sidebar nav entry by its visible label. */
export async function clickNav(page: Page, label: string): Promise<void> {
  await page.getByText(label, { exact: true }).first().click();
}

/**
 * Locate an Intake section tab by its label. The tabs render an icon glyph and
 * a bare text label inside one element, so an exact text match never equals
 * just the label. They are built with the `pressable()` helper, which sets
 * role="button" + aria-label="<label> section" — that's the stable selector.
 */
export function intakeTab(page: Page, label: string) {
  return page.getByRole("button", { name: `${label} section` });
}

/**
 * True if the given text is visible anywhere on the page (trimmed, non-fatal).
 * Used for soft feature-presence checks that enrich the report without making
 * the whole view-health test brittle to copy changes.
 */
export async function hasText(page: Page, text: string): Promise<boolean> {
  return (await page.getByText(text, { exact: false }).count()) > 0;
}
