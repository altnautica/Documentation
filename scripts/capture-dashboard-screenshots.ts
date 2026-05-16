/**
 * Capture screenshots of every ADOS dashboard route on a live agent.
 *
 * Usage:
 *   pnpm capture                 # both targets in turn
 *   pnpm capture:drone           # skynode only
 *   pnpm capture:ground          # groundnode only
 *
 * Output: ../images/dashboard/{drone,ground,shared,setup}/<route>-<variant>.png
 *
 * Auth: sets X-ADOS-Key on every browser request via setExtraHTTPHeaders.
 * Keys come from .env.local (gitignored). Both nodes must be reachable
 * on the local network at the URLs in .env.local.
 */
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import * as dotenv from "dotenv";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, ".env.local") });

interface RouteCapture {
  path: string;
  name: string;
  /** Optional click / setup step before the screenshot. */
  prep?: (page: Page) => Promise<void>;
  /** Optional secondary captures keyed off CSS selectors. */
  panels?: Array<{ selector: string; name: string }>;
  /** Skip the full-page capture (only do panels). */
  fullPageOnly?: boolean;
  /** Default true. Override with false for off-profile routes that should
   *  not network-idle. */
  waitForNetworkIdle?: boolean;
}

const DRONE_ROUTES: RouteCapture[] = [
  { path: "/home", name: "home" },
  {
    path: "/telemetry",
    name: "telemetry",
    panels: [{ selector: "[data-testid=params-virtual-list]", name: "params" }],
  },
  { path: "/video", name: "video" },
  { path: "/ros", name: "ros" },
  { path: "/pairing", name: "pairing" },
  { path: "/peripherals", name: "peripherals" },
  { path: "/plugins", name: "plugins" },
  { path: "/suites", name: "suites" },
  { path: "/ota", name: "ota" },
  { path: "/logs", name: "logs" },
  { path: "/diagnostics", name: "diagnostics" },
  { path: "/settings/profile", name: "settings-profile" },
  { path: "/settings/network", name: "settings-network" },
  { path: "/settings/cloud", name: "settings-cloud" },
  { path: "/settings/display", name: "settings-display" },
  { path: "/settings/advanced", name: "settings-advanced" },
  // Profile-mismatch panels (drone hitting ground-only routes).
  { path: "/receive", name: "mismatch-receive" },
  { path: "/mesh", name: "mismatch-mesh" },
  { path: "/sources", name: "mismatch-sources" },
  { path: "/io", name: "mismatch-io" },
];

const GROUND_ROUTES: RouteCapture[] = [
  { path: "/home", name: "home" },
  { path: "/receive", name: "receive" },
  { path: "/mesh", name: "mesh-direct" },
  { path: "/sources", name: "sources-direct" },
  { path: "/io", name: "io" },
  { path: "/pairing", name: "pairing" },
  { path: "/peripherals", name: "peripherals" },
  { path: "/suites", name: "suites" },
  { path: "/ota", name: "ota" },
  { path: "/logs", name: "logs" },
  { path: "/diagnostics", name: "diagnostics" },
  { path: "/settings/profile", name: "settings-profile" },
  // Profile-mismatch panels (ground hitting drone-only routes).
  { path: "/telemetry", name: "mismatch-telemetry" },
  { path: "/video", name: "mismatch-video" },
  { path: "/ros", name: "mismatch-ros" },
];

const IMG_ROOT = path.resolve(__dirname, "..", "images", "dashboard");

async function captureRoute(
  page: Page,
  baseUrl: string,
  outDir: string,
  route: RouteCapture,
) {
  const url = `${baseUrl}${route.path}`;
  console.log(`  → ${route.name} (${route.path})`);
  // Use `commit` waitUntil so we don't block on heavy data-fetch panels
  // (video pipeline, FC params, ROS topics) — those keep the network
  // busy and trip the SPA-friendly `domcontentloaded` event handlers in
  // ways that race with React Query. Fixed-time settle below is more
  // predictable for screenshot capture.
  await page
    .goto(url, { waitUntil: "commit", timeout: 60_000 })
    .catch((err) => {
      console.warn(`    ! goto warning: ${err.message}`);
    });
  // Initial paint + first-tier React Query results.
  await page.waitForTimeout(1_500);
  if (route.waitForNetworkIdle !== false) {
    await page
      .waitForLoadState("networkidle", { timeout: 6_000 })
      .catch(() => undefined);
  }
  // Second settle for ring-buffered panels that paint after first data tick.
  await page.waitForTimeout(800);

  if (route.prep) await route.prep(page);

  if (!route.fullPageOnly) {
    await page.screenshot({
      path: path.join(outDir, `${route.name}-full.png`),
      fullPage: true,
    });
  }

  for (const panel of route.panels ?? []) {
    const el = await page.$(panel.selector);
    if (!el) {
      console.warn(`    ! panel ${panel.name} selector miss: ${panel.selector}`);
      continue;
    }
    await el.screenshot({
      path: path.join(outDir, `${route.name}-${panel.name}.png`),
    });
  }
}

async function captureTarget(
  browser: Browser,
  target: "drone" | "ground",
  baseUrl: string,
  apiKey: string,
  routes: RouteCapture[],
) {
  console.log(`\n[${target}] capturing ${routes.length} routes against ${baseUrl}`);
  const outDir = path.join(IMG_ROOT, target);
  mkdirSync(outDir, { recursive: true });

  const context: BrowserContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: "dark",
    extraHTTPHeaders: {
      "X-ADOS-Key": apiKey,
    },
  });
  const page = await context.newPage();

  for (const route of routes) {
    try {
      await captureRoute(page, baseUrl, outDir, route);
    } catch (err) {
      console.error(`  ! ${route.name} failed:`, err);
    }
  }

  await context.close();
}

async function main() {
  const args = process.argv.slice(2);
  const onlyTarget = (() => {
    const i = args.indexOf("--target");
    return i >= 0 && i < args.length - 1
      ? (args[i + 1] as "drone" | "ground")
      : null;
  })();

  const sky = process.env.SKYNODE_URL ?? "http://skynode.local:8080";
  const gnd = process.env.GROUNDNODE_URL ?? "http://groundnode.local:8080";
  const skyKey = process.env.SKYNODE_KEY ?? "";
  const gndKey = process.env.GROUNDNODE_KEY ?? "";

  if ((!onlyTarget || onlyTarget === "drone") && !skyKey) {
    throw new Error("SKYNODE_KEY missing in scripts/.env.local");
  }
  if ((!onlyTarget || onlyTarget === "ground") && !gndKey) {
    throw new Error("GROUNDNODE_KEY missing in scripts/.env.local");
  }

  const browser = await chromium.launch({ headless: true });

  if (!onlyTarget || onlyTarget === "drone") {
    await captureTarget(browser, "drone", sky, skyKey, DRONE_ROUTES);
  }
  if (!onlyTarget || onlyTarget === "ground") {
    await captureTarget(browser, "ground", gnd, gndKey, GROUND_ROUTES);
  }

  await browser.close();
  console.log("\nDone. Screenshots under images/dashboard/{drone,ground}/");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
