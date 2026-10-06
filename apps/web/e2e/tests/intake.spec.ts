import { test, expect } from "@playwright/test";
import { VIEW, openView, assertNoCrash, shot } from "../support/app";
import { requireMutationsEnabled, e2eTag } from "../support/safety";

/**
 * Legal Intake coverage.
 * Read-only tests verify the cockpit, tab surfaces and the New Request picker
 * load and render. The single @mutation test files a ticket end-to-end and is
 * skipped unless E2E_TARGET=test + E2E_ALLOW_MUTATIONS=1.
 */
test.describe("Legal Intake", () => {
  test.beforeEach(async ({ page }) => {
    await openView(page, VIEW.intake.id);
  });

  test("intake workspace loads (cockpit / mission control)", async ({ page }, testInfo) => {
    await expect(
      page.getByText("Mission control for every legal request", { exact: false }),
    ).toBeVisible({ timeout: 30_000 });
    await assertNoCrash(page);
    await shot(page, "intake-landing", testInfo);
  });

  test("intake section tabs are present", async ({ page }, testInfo) => {
    const tabBar = page.locator('nav[aria-label="Intake sections"]');
    await expect(tabBar).toBeVisible({ timeout: 30_000 });
    // Staff (seeded admin) sees the full tab set.
    for (const label of ["Inbox", "Triage Cockpit", "New Request", "SLA Dashboard"]) {
      await expect(tabBar.getByText(label, { exact: true }).first()).toBeVisible();
    }
    await shot(page, "intake-tabs", testInfo);
  });

  test("each intake tab opens without a contained crash", async ({ page }, testInfo) => {
    const tabBar = page.locator('nav[aria-label="Intake sections"]');
    await expect(tabBar).toBeVisible();
    for (const label of ["Inbox", "Triage Cockpit", "My Requests", "Self-Service", "SLA Dashboard"]) {
      const tab = tabBar.getByText(label, { exact: true }).first();
      if ((await tab.count()) === 0) continue;
      await tab.click();
      await page.waitForTimeout(400); // let the panel swap + fetch settle
      await assertNoCrash(page);
    }
    await shot(page, "intake-last-tab", testInfo);
  });

  test("New Request shows the file-a-request picker", async ({ page }, testInfo) => {
    await page.locator('nav[aria-label="Intake sections"]').getByText("New Request", { exact: true }).first().click();
    await expect(page.getByText("How would you like to file this?", { exact: false })).toBeVisible({
      timeout: 20_000,
    });
    // A couple of request-type tiles should be offered.
    await expect(page.getByText("NDA Request", { exact: false }).first()).toBeVisible();
    await assertNoCrash(page);
    await shot(page, "intake-new-request-picker", testInfo);
  });

  test("@mutation file an NDA request through the form", async ({ page }, testInfo) => {
    requireMutationsEnabled();
    await page.locator('nav[aria-label="Intake sections"]').getByText("New Request", { exact: true }).first().click();
    await expect(page.getByText("How would you like to file this?", { exact: false })).toBeVisible();

    // Pick the fast-path structured form via the NDA tile.
    await page.getByText("NDA Request", { exact: true }).first().click();

    const name = page.getByPlaceholder("Jane Smith");
    await expect(name).toBeVisible({ timeout: 15_000 });
    await name.fill("E2E Test Filer");

    const desc = page.getByPlaceholder(/Mutual NDA for discussions/i);
    await desc.fill(`${e2eTag("NDA")} — automated e2e submission, safe to delete.`);

    await page.getByRole("button", { name: "Submit request" }).click();

    await expect(page.getByText("REQUEST SUBMITTED", { exact: false })).toBeVisible({ timeout: 45_000 });
    await assertNoCrash(page);
    await shot(page, "intake-ticket-filed", testInfo);
  });
});
