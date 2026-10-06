import { test, expect } from "@playwright/test";
import { VIEW, openView, assertNoCrash, shot, clickNav } from "../support/app";

/**
 * Smoke: the shell boots, auth resolves (dev-mode = seeded admin), and each of
 * the three areas under test deep-links and renders without a crash overlay.
 * Pure navigation — writes nothing. Always runs.
 */
test.describe("Shell & navigation smoke", () => {
  test("app shell loads and shows the sidebar", async ({ page }, testInfo) => {
    await openView(page, VIEW.onelegal.id);
    await assertNoCrash(page);
    // The three areas we test must be reachable from the sidebar.
    await expect(page.getByText(VIEW.onelegal.label, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(VIEW.intake.label, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(VIEW.contracts.label, { exact: true }).first()).toBeVisible();
    await shot(page, "shell", testInfo);
  });

  for (const v of Object.values(VIEW)) {
    test(`deep-link ?view=${v.id} renders ${v.label}`, async ({ page }, testInfo) => {
      await openView(page, v.id);
      await assertNoCrash(page);
      // The view container should have real content, not an empty shell.
      const bodyText = (await page.locator("body").innerText()).trim();
      expect(bodyText.length, "view rendered visible content").toBeGreaterThan(40);
      await shot(page, `view-${v.id}`, testInfo);
    });
  }

  test("sidebar click navigates between the three areas", async ({ page }, testInfo) => {
    await openView(page, VIEW.onelegal.id);
    await clickNav(page, VIEW.intake.label);
    await assertNoCrash(page);
    await clickNav(page, VIEW.contracts.label);
    await assertNoCrash(page);
    await clickNav(page, VIEW.onelegal.label);
    await assertNoCrash(page);
    await shot(page, "nav-roundtrip", testInfo);
  });
});
