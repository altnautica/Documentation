/**
 * Capture screenshots of every ADOS dashboard route on a live agent.
 *
 * Usage:
 *   pnpm capture                 # both targets in turn
 *   pnpm capture:drone           # skynode only
 *   pnpm capture:ground          # groundnode only
 *
 * Flags:
 *   --target drone|ground        one target only
 *   --theme dark|light           colour scheme the dashboard follows (default dark)
 *   --out <dir>                  output root (default ../images/dashboard)
 *   --routes home,video          capture only these route names
 *   --channel msedge|chrome      use an installed browser instead of Playwright's
 *                                bundled one (H.264 WebRTC playback was checked
 *                                with msedge)
 *
 * Output: <out>/{drone,ground}/<route>-full.png
 *
 * Auth: sets X-ADOS-Key on every browser request via setExtraHTTPHeaders.
 * Keys come from .env.local (gitignored). Both nodes must be reachable
 * on the local network at the URLs in .env.local; a hardware-free agent
 * (the sim bench) works for either profile.
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
  /** Default true. Override with false for off-profile routes that should
   *  not network-idle. */
  waitForNetworkIdle?: boolean;
  /** Capture the viewport instead of the full scroll height. */
  viewportOnly?: boolean;
}

/** Settings sub-routes every profile renders. */
const SHARED_SETTINGS = [
  "profile",
  "region",
  "network",
  "cellular",
  "mac-pin",
  "cloud",
  "self-heal",
  "security",
  "discovery",
  "display",
  "advanced",
];

/** Settings sub-routes gated to the drone profile. */
const DRONE_SETTINGS = ["battery", "mavlink", "vision", "camera", "swarm"];

const DRONE_ROUTES: RouteCapture[] = [
  // Home and video embed the WebRTC player; give it time to paint frames.
  { path: "/home", name: "home", prep: (page) => page.waitForTimeout(6_000) },
  // Parameters tab, viewport only: the category rail runs thousands of pixels
  // tall, and the Sensors tab prints the vehicle's position.
  { path: "/telemetry", name: "telemetry", viewportOnly: true },
  { path: "/video", name: "video", prep: (page) => page.waitForTimeout(6_000) },
  { path: "/transmit", name: "transmit" },
  { path: "/pairing", name: "pairing" },
  { path: "/peripherals", name: "peripherals" },
  { path: "/plugins", name: "plugins" },
  { path: "/logs", name: "logs" },
  { path: "/diagnostics", name: "diagnostics" },
  ...[...SHARED_SETTINGS, ...DRONE_SETTINGS].map((n) => ({
    path: `/settings/${n}`,
    name: `settings-${n}`,
  })),
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
  { path: "/plugins", name: "plugins" },
  { path: "/logs", name: "logs" },
  { path: "/diagnostics", name: "diagnostics" },
  ...SHARED_SETTINGS.map((n) => ({ path: `/settings/${n}`, name: `settings-${n}` })),
  // Profile-mismatch panels (ground hitting drone-only routes).
  { path: "/telemetry", name: "mismatch-telemetry" },
  { path: "/video", name: "mismatch-video" },
  { path: "/transmit", name: "mismatch-transmit" },
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
  // (video pipeline, FC params) — those keep the network busy and trip the
  // SPA-friendly `domcontentloaded` event handlers in ways that race with
  // React Query. Fixed-time settle below is more predictable for screenshot
  // capture.
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

  await page.screenshot({
    path: path.join(outDir, `${route.name}-full.png`),
    fullPage: !route.viewportOnly,
  });
}

type Theme = "dark" | "light";

async function captureTarget(
  browser: Browser,
  target: "drone" | "ground",
  outRoot: string,
  theme: Theme,
  baseUrl: string,
  apiKey: string,
  routes: RouteCapture[],
) {
  console.log(
    `\n[${target}] capturing ${routes.length} routes against ${baseUrl} (${theme})`,
  );
  const outDir = path.join(outRoot, target);
  mkdirSync(outDir, { recursive: true });

  const context: BrowserContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: theme,
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
  const flag = (name: string): string | null => {
    const i = args.indexOf(name);
    return i >= 0 && i < args.length - 1 ? args[i + 1] : null;
  };
  const onlyTarget = flag("--target") as "drone" | "ground" | null;
  const theme: Theme = flag("--theme") === "light" ? "light" : "dark";
  const outRoot = path.resolve(flag("--out") ?? IMG_ROOT);
  const channel = flag("--channel") ?? undefined;
  const only = flag("--routes")?.split(",");

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

  const browser = await chromium.launch({ headless: true, channel });

  if (!onlyTarget || onlyTarget === "drone") {
    const routes = only ? DRONE_ROUTES.filter((r) => only.includes(r.name)) : DRONE_ROUTES;
    await captureTarget(browser, "drone", outRoot, theme, sky, skyKey, routes);
  }
  if (!onlyTarget || onlyTarget === "ground") {
    const routes = only ? GROUND_ROUTES.filter((r) => only.includes(r.name)) : GROUND_ROUTES;
    await captureTarget(browser, "ground", outRoot, theme, gnd, gndKey, routes);
  }

  await browser.close();
  console.log(`\nDone. Screenshots under ${outRoot}/{drone,ground}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
