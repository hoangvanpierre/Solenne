import { expect, test } from "@playwright/test";

/**
 * Public storefront journeys that need no database.
 *
 * These are the pages Solenne can serve with Supabase unreachable, which is
 * what `SOLENNE_E2E_LOCAL=1` guarantees. Catalogue, product detail, account
 * and admin journeys need a seeded staging project and are intentionally not
 * claimed here (see docs/quality/production-readiness.md).
 */

test.describe("public shell", () => {
  test("about page renders the story inside the site chrome", async ({ page }) => {
    const response = await page.goto("/about");

    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Crafted with intention. Born from nature.",
      })
    ).toBeVisible();
    await expect(page.locator("footer")).toBeVisible();
    await expect(page.locator('a[href="/journal"]').first()).toBeVisible();
  });

  test("journal index links to a published post", async ({ page }) => {
    const response = await page.goto("/journal");
    expect(response?.status()).toBe(200);

    const firstPost = page.locator('a[href^="/journal/"]').first();
    await expect(firstPost).toBeVisible();
    await firstPost.click();

    await expect(page).toHaveURL(/\/journal\/[^/]+$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("login page renders the sign-in form", async ({ page }) => {
    const response = await page.goto("/login");
    expect(response?.status()).toBe(200);

    await expect(
      page.getByRole("heading", { level: 1, name: "Welcome Back" })
    ).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in|log in/i })).toBeVisible();
  });

  test("locale toggle switches to Vietnamese without leaving the page", async ({
    page,
  }) => {
    await page.goto("/about");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");

    await page
      .getByRole("button", { name: /switch language to tiếng việt/i })
      .first()
      .click();

    // The switch performs a real page load, so assert on the reloaded document.
    await expect(page.locator("html")).toHaveAttribute("lang", "vi", {
      timeout: 15_000,
    });
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Ba mươi năm thắp sáng, tĩnh lặng và ướp hương.",
      })
    ).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/about");
  });

  test("an unknown path returns 404 rather than a redirect", async ({ page }) => {
    const response = await page.goto("/this-page-does-not-exist-e2e");
    expect(response?.status()).toBe(404);
  });
});
