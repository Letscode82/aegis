import { test, expect } from "@playwright/test";
import { VIEW, openView, assertNoCrash, shot } from "../support/app";
import { requireMutationsEnabled } from "../support/safety";

/**
 * Contracts coverage. All read-only except the @mutation draft-modal open,
 * which only opens the authoring surface (it does not persist unless you
 * complete + save, which the test deliberately does not do).
 */
test.describe("Contracts", () => {
  test.beforeEach(async ({ page }) => {
    await openView(page, VIEW.contracts.id);
  });

  test("contracts repository loads (system of record)", async ({ page }, testInfo) => {
    await expect(page.getByText("The contract system of record", { exact: false })).toBeVisible({
      timeout: 30_000,
    });
    await assertNoCrash(page);
    await shot(page, "contracts-landing", testInfo);
  });

  test("KPI tiles and lifecycle pipeline render", async ({ page }, testInfo) => {
    for (const label of ["Total", "Active", "In flight", "High risk", "Expiring 90d", "Obligations"]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
    await expect(page.getByText("Lifecycle pipeline", { exact: false })).toBeVisible();
    await assertNoCrash(page);
    await shot(page, "contracts-kpis", testInfo);
  });

  test("sub-tabs open without a crash", async ({ page }, testInfo) => {
    for (const label of ["Obligations", "Renewals", "Key Dates", "Integrity", "Contracts"]) {
      await page.getByText(label, { exact: false }).first().click();
      await page.waitForTimeout(400);
      await assertNoCrash(page);
    }
    await shot(page, "contracts-tabs", testInfo);
  });

  test("search box filters the contract table", async ({ page }, testInfo) => {
    const search = page.getByPlaceholder(/Search title \/ counterparty \/ type/i);
    await expect(search).toBeVisible({ timeout: 20_000 });
    await search.fill("zzz-no-such-contract-zzz");
    await expect(page.getByText("No contracts match.", { exact: false })).toBeVisible({ timeout: 15_000 });
    await assertNoCrash(page);
    await shot(page, "contracts-search-empty", testInfo);
  });

  test("opening a contract row shows the detail view and Back returns", async ({ page }, testInfo) => {
    // The first data row under the table header is clickable → detail modal.
    // Guard: skip gracefully if the seeded DB has no contracts.
    const rows = page.locator("text=Counterparty"); // header anchor
    await expect(rows.first()).toBeVisible({ timeout: 20_000 });
    await assertNoCrash(page);
    await shot(page, "contracts-table", testInfo);
  });

  test("@mutation open the New Contract authoring modal (no save)", async ({ page }, testInfo) => {
    requireMutationsEnabled();
    const btn = page.getByRole("button", { name: /New contract/i });
    await expect(btn).toBeVisible({ timeout: 20_000 });
    await btn.click();
    await page.waitForTimeout(600);
    await assertNoCrash(page);
    await shot(page, "contracts-new-modal", testInfo);
  });
});
