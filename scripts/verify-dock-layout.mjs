/**
 * Dock layout verification + screenshot script.
 *
 * Usage:  node scripts/verify-dock-layout.mjs
 *
 * Requires: puppeteer (npm install --no-save puppeteer)
 * Expects:  dev server running on http://localhost:3000
 *
 * Produces screenshots in scripts/dock-screenshots/ and prints measurement
 * results to stdout.
 */

import puppeteer from "puppeteer";
import { mkdir } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = join(__dirname, "dock-screenshots");
const BASE = "http://localhost:3000";

const VIEWPORTS = [
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1366x640", width: 1366, height: 640 },
  { name: "390x844", width: 390, height: 844 },
];

const COLOR_SCHEMES = ["light", "dark"];

await mkdir(SCREENSHOT_DIR, { recursive: true });

const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});

let allPassed = true;
const results = [];

function check(label, condition, detail = "") {
  const status = condition ? "PASS" : "FAIL";
  if (!condition) allPassed = false;
  const msg = `[${status}] ${label}${detail ? ` — ${detail}` : ""}`;
  console.log(msg);
  results.push(msg);
  return condition;
}

async function setColorScheme(page, scheme) {
  await page.emulateMediaFeatures([
    { name: "prefers-color-scheme", value: scheme },
  ]);
}

async function scrollToBottom(page) {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await new Promise((r) => setTimeout(r, 800));
}

async function scrollToTop(page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await new Promise((r) => setTimeout(r, 800));
}

async function waitForDock(page) {
  // Wait for the chat launcher to appear (it's dynamically imported)
  await page.waitForSelector('[aria-label]', { timeout: 10000 });
  // Wait a bit longer for dynamic imports to fully load
  await new Promise((r) => setTimeout(r, 2000));
}

/**
 * Get bounding rects of dock elements.
 */
async function getDockRects(page) {
  return page.evaluate(() => {
    const launcher = document.querySelector('button[aria-expanded]');
    const bttButton = document.querySelector('button[title="Return to top"], button[title="Về đầu trang"]');
    const panel = document.querySelector('[role="dialog"][aria-label]');

    const getRect = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
    };

    return {
      launcher: getRect(launcher),
      btt: getRect(bttButton),
      panel: getRect(panel),
    };
  });
}

async function openChatPanel(page) {
  const launcher = await page.$('button[aria-expanded="false"]');
  if (launcher) {
    await launcher.click();
    await new Promise((r) => setTimeout(r, 500));
  }
}

async function closeChatPanel(page) {
  const launcher = await page.$('button[aria-expanded="true"]');
  if (launcher) {
    await launcher.click();
    await new Promise((r) => setTimeout(r, 500));
  }
}

// ─── Main verification ──────────────────────────────────────────────

for (const vp of VIEWPORTS) {
  for (const scheme of COLOR_SCHEMES) {
    const tag = `${vp.name}-${scheme}`;
    console.log(`\n══════ ${tag} ══════`);

    const page = await browser.newPage();
    await page.setViewport({ width: vp.width, height: vp.height });
    await setColorScheme(page, scheme);

    await page.goto(BASE, { waitUntil: "networkidle2", timeout: 30000 });
    await waitForDock(page);

    // ── Screenshot 1: Page top, panel closed ──
    await scrollToTop(page);
    await new Promise((r) => setTimeout(r, 600));

    await page.screenshot({
      path: join(SCREENSHOT_DIR, `${tag}-top-closed.png`),
      fullPage: false,
    });
    console.log(`  📸 ${tag}-top-closed.png`);

    let rects = await getDockRects(page);

    // At the top of the page, back-to-top should NOT be visible
    check(`${tag}: BTT hidden at page top`, rects.btt === null);

    // ── Scroll down to show BTT ──
    await scrollToBottom(page);
    await new Promise((r) => setTimeout(r, 600));

    rects = await getDockRects(page);

    // BTT should now be visible
    check(`${tag}: BTT visible after scroll`, rects.btt !== null);

    if (rects.launcher && rects.btt) {
      // Launcher should be ABOVE back-to-top (smaller y = higher on screen)
      check(
        `${tag}: Launcher above BTT`,
        rects.launcher.bottom <= rects.btt.top + 1,
        `launcher.bottom=${rects.launcher.bottom.toFixed(1)}, btt.top=${rects.btt.top.toFixed(1)}`
      );

      // Both buttons should share the same centerline (within 2px)
      const launcherCenterX = rects.launcher.left + rects.launcher.width / 2;
      const bttCenterX = rects.btt.left + rects.btt.width / 2;
      check(
        `${tag}: Buttons share centerline`,
        Math.abs(launcherCenterX - bttCenterX) < 2,
        `launcher center=${launcherCenterX.toFixed(1)}, btt center=${bttCenterX.toFixed(1)}`
      );
    }

    // ── Screenshot 2: Scrolled, panel closed ──
    await page.screenshot({
      path: join(SCREENSHOT_DIR, `${tag}-scrolled-closed.png`),
      fullPage: false,
    });
    console.log(`  📸 ${tag}-scrolled-closed.png`);

    // ── Open panel ──
    await openChatPanel(page);

    rects = await getDockRects(page);

    if (rects.launcher && rects.panel) {
      // Panel bottom edge vs launcher top = 12px gap (--dock-panel-gap)
      const gap = rects.launcher.top - rects.panel.bottom;
      check(
        `${tag}: Panel gap from launcher = ~12px`,
        Math.abs(gap - 12) < 3,
        `actual gap=${gap.toFixed(1)}px`
      );

      // Panel right edge aligned with launcher right edge
      check(
        `${tag}: Panel right-aligned to launcher`,
        Math.abs(rects.panel.right - rects.launcher.right) < 2,
        `panel.right=${rects.panel.right.toFixed(1)}, launcher.right=${rects.launcher.right.toFixed(1)}`
      );
    }

    if (rects.panel && rects.btt) {
      // Panel should never intersect back-to-top
      const panelIntersectsBtt =
        rects.panel.bottom > rects.btt.top &&
        rects.panel.top < rects.btt.bottom &&
        rects.panel.right > rects.btt.left &&
        rects.panel.left < rects.btt.right;
      check(
        `${tag}: Panel does NOT intersect BTT`,
        !panelIntersectsBtt,
        `panel.bottom=${rects.panel.bottom.toFixed(1)}, btt.top=${rects.btt.top.toFixed(1)}`
      );
    }

    // ── Screenshot 3: Scrolled, panel open ──
    await page.screenshot({
      path: join(SCREENSHOT_DIR, `${tag}-scrolled-open.png`),
      fullPage: false,
    });
    console.log(`  📸 ${tag}-scrolled-open.png`);

    // ── BTT clickable with panel open ──
    if (rects.btt) {
      const bttClickable = await page.evaluate(() => {
        const btt = document.querySelector('button[title="Return to top"], button[title="Về đầu trang"]');
        if (!btt) return false;
        const r = btt.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const el = document.elementFromPoint(cx, cy);
        return btt === el || btt.contains(el);
      });
      check(`${tag}: BTT clickable with panel open (elementFromPoint)`, bttClickable);
    }

    // ── Stability: record launcher Y, scroll to top and back, check Y didn't change ──
    const launcherYBefore = rects.launcher?.top;

    // Scroll to top (which hides BTT) then back to bottom — launcher should
    // stay in place while panel is open.
    await scrollToTop(page);
    await new Promise((r) => setTimeout(r, 400));

    const rectsAtTop = await getDockRects(page);
    const launcherYAfterScrollTop = rectsAtTop.launcher?.top;

    if (launcherYBefore != null && launcherYAfterScrollTop != null) {
      check(
        `${tag}: Launcher Y stable while panel open (scroll to top)`,
        Math.abs(launcherYBefore - launcherYAfterScrollTop) < 2,
        `before=${launcherYBefore.toFixed(1)}, after=${launcherYAfterScrollTop.toFixed(1)}`
      );
    }

    await scrollToBottom(page);
    await new Promise((r) => setTimeout(r, 400));

    const rectsAfterScrollBack = await getDockRects(page);
    const launcherYAfterScrollBack = rectsAfterScrollBack.launcher?.top;

    if (launcherYBefore != null && launcherYAfterScrollBack != null) {
      check(
        `${tag}: Launcher Y stable while panel open (scroll back)`,
        Math.abs(launcherYBefore - launcherYAfterScrollBack) < 2,
        `before=${launcherYBefore.toFixed(1)}, after=${launcherYAfterScrollBack.toFixed(1)}`
      );
    }

    // ── Screenshot 4: Page top, panel open ──
    await scrollToTop(page);
    await new Promise((r) => setTimeout(r, 600));
    await page.screenshot({
      path: join(SCREENSHOT_DIR, `${tag}-top-open.png`),
      fullPage: false,
    });
    console.log(`  📸 ${tag}-top-open.png`);

    // ── Close panel ──
    await closeChatPanel(page);

    await page.close();
  }
}

// ── Checkout hidden check ──
console.log("\n══════ Checkout hidden check ══════");
const checkoutPage = await browser.newPage();
await checkoutPage.setViewport({ width: 1440, height: 900 });
// The checkout redirects to login if not authed, but the ChatWidget checks
// pathname.startsWith("/checkout") and returns null. We can still check
// by navigating to /checkout and verifying no launcher appears.
try {
  await checkoutPage.goto(`${BASE}/checkout`, {
    waitUntil: "networkidle2",
    timeout: 15000,
  });
  await new Promise((r) => setTimeout(r, 2000));
  const hasLauncher = await checkoutPage.$('button[aria-expanded]');
  // On checkout (or redirected /login?next=/checkout), the chat widget should
  // be absent. If redirected to /login, the chat widget may show (it's not
  // checkout), so we accept either.
  const isOnCheckout = await checkoutPage.evaluate(() =>
    window.location.pathname.startsWith("/checkout")
  );
  if (isOnCheckout) {
    check("Checkout: No chat launcher", !hasLauncher);
  } else {
    console.log("  (Redirected away from /checkout — skipping)");
  }
} catch {
  console.log("  (Checkout page not reachable — skipping)");
}
await checkoutPage.close();

await browser.close();

// ── Summary ──
console.log("\n══════ SUMMARY ══════");
const passed = results.filter((r) => r.startsWith("[PASS]")).length;
const failed = results.filter((r) => r.startsWith("[FAIL]")).length;
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`  Screenshots saved to: ${SCREENSHOT_DIR}`);

if (!allPassed) {
  console.log("\n⚠️  Some checks FAILED — see above.");
  process.exit(1);
} else {
  console.log("\n✅ All checks passed.");
}
