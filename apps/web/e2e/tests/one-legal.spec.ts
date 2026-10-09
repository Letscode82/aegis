import { test, expect } from "@playwright/test";
import { VIEW, openView, assertNoCrash, shot } from "../support/app";
import { requireMutationsEnabled } from "../support/safety";

/**
 * ONE Legal (the CommandConsole "front door"). Read-only tests verify the
 * landing composer, example chips and skills rail. Submitting a turn calls the
 * AI agent loop (and may persist a session/ticket), so those are @mutation —
 * and additionally need the app to have an ANTHROPIC_API_KEY (else the server
 * degrades to the deterministic classifier, which still works but produces
 * different copy).
 */
test.describe("ONE Legal", () => {
  test.beforeEach(async ({ page }) => {
    await openView(page, VIEW.onelegal.id);
  });

  test("ONE Legal front door loads with the composer", async ({ page }, testInfo) => {
    await expect(page.getByText("Your one front door for legal", { exact: false })).toBeVisible({
      timeout: 30_000,
    });
    const composer = page.getByLabel("Ask OneLegal or file a legal request");
    await expect(composer).toBeVisible();
    await expect(page.getByRole("button", { name: /Route/ })).toBeVisible();
    await assertNoCrash(page);
    await shot(page, "one-legal-landing", testInfo);
  });

  test("example request chips are offered", async ({ page }, testInfo) => {
    await expect(page.getByText("Your one front door for legal", { exact: false })).toBeVisible();
    // At least one of the canonical landing examples should render.
    const anyExample = page
      .getByText(/Create a mutual NDA for Acme Corp|Start a legal hold on the Snowflake matter|Draft an SOW for outside counsel/i)
      .first();
    await expect(anyExample).toBeVisible({ timeout: 20_000 });
    await assertNoCrash(page);
    await shot(page, "one-legal-examples", testInfo);
  });

  test("composer enables the Route action once text is entered", async ({ page }, testInfo) => {
    const composer = page.getByLabel("Ask OneLegal or file a legal request");
    await composer.fill("What is our standard NDA term length?");
    const route = page.getByRole("button", { name: /Route/ });
    await expect(route).toBeEnabled({ timeout: 10_000 });
    await assertNoCrash(page);
    await shot(page, "one-legal-composer-filled", testInfo);
    // Intentionally does NOT submit — submitting routes to the AI agent loop
    // and can persist a session. See the @mutation test below.
  });

  test("@mutation ask a question and get an answer card", async ({ page }, testInfo) => {
    requireMutationsEnabled();
    const composer = page.getByLabel("Ask OneLegal or file a legal request");
    await composer.fill("What is a legal hold and when do we issue one?");
    await page.getByRole("button", { name: /Route/ }).click();
    // The answer card renders its header once the turn resolves. Allow time
    // for the AI/agent round-trip (or the degraded classifier path).
    await expect(
      page.getByText(/front door for legal|Thinking…|Proposed action|Filed/i).first(),
    ).toBeVisible({ timeout: 60_000 });
    await assertNoCrash(page);
    await shot(page, "one-legal-answer", testInfo);
  });
});
