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
 * `SOLENNE_E2E_START_SERVER=1` lets Playwright start the local dev server
 * itself instead of using a second terminal. It only works for a loopback
 * base URL, and it inherits whatever Supabase environment the caller set -
 * CI points that at a closed port so the run cannot touch a real project.
 *
 * Browsers must be installed once: `pnpm exec playwright install chromium`.
 *
 * The `public shell` suite runs in PR CI (database-free); staging-dependent
 * journeys do not. See the same document.
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

const target = new URL(baseUrl);
const startServer = process.env.SOLENNE_E2E_START_SERVER === "1";
const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1"]);

if (startServer && !loopbackHosts.has(target.hostname)) {
  throw new Error(
    `SOLENNE_E2E_START_SERVER is only supported for a loopback base URL; got ${baseUrl}.`
  );
}

// The browser must use `localhost` (Next 16 rejects `127.0.0.1` dev assets),
// but the readiness probe uses the loopback literal so it never resolves to
// the other address family.
const serverPort = target.port || "3000";
const readinessUrl = `http://127.0.0.1:${serverPort}/about`;

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
  webServer: startServer
    ? {
        command: `pnpm exec next dev --port ${serverPort}`,
        url: readinessUrl,
        timeout: 180_000,
        reuseExistingServer: !process.env.CI,
      }
    : undefined,
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
