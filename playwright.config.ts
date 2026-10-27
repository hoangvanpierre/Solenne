import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end configuration.
 *
 * The target is always explicit: `SOLENNE_E2E_BASE_URL` must be set, and it
 * must be a staging deployment or a locally started dev server. There is no
 * default and no implicit fallback, so a run can never silently hit production
 * and cannot report "0 tests passed" as a green result.
 *
 *   Staging:  SOLENNE_E2E_BASE_URL=https://<staging-host> pnpm test:e2e
 *   Local:    see docs/quality/production-readiness.md (start the server first)
 *
 * This suite is NOT part of the PR CI workflow; see the same document.
 */

const baseUrl = process.env.SOLENNE_E2E_BASE_URL?.trim();

if (!baseUrl) {
  throw new Error(
    [
      "E2E tests need an explicit target; SOLENNE_E2E_BASE_URL is not set.",
      "",
      "  Staging: SOLENNE_E2E_BASE_URL=https://<staging-host> pnpm test:e2e",
      "  Local:   start the dev server first, then",
      "           SOLENNE_E2E_BASE_URL=http://localhost:3000 pnpm test:e2e",
      "",
      "Production is not an acceptable target for this suite.",
      "See docs/quality/production-readiness.md.",
    ].join("\n")
  );
}

export default defineConfig({
  testDir: "tests/e2e",
  // Generous on purpose: a cold `next dev` compiles a route on first request,
  // and the locale switch triggers a full document load.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"]],
  use: {
    baseURL: baseUrl,
    trace: "retain-on-failure",
    video: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
