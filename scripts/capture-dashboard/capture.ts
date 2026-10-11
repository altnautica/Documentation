// One shot end to end: load, wait for the resolved dashboard, check the
// state, scrub, refuse leaks, screenshot and encode.
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import * as path from "node:path";

import {
  AGENT_URL,
  DASHBOARD_VIEWPORT,
  SCALE,
  fail,
  isVisible,
  type NodeInfo,
  type RouteEntry,
  type Shot,
} from "./common.ts";
import { encodePng } from "./encode.ts";
import { findLeaks, visibleStrings } from "./scrub.ts";

export interface Result {
  shot: string;
  status: "ok" | "flagged" | "omitted" | "failed";
  file?: string;
  detail?: string;
}

async function settle(page: Page) {
  // Live panels poll, so the network never idles for long: cap the wait.
  await page.waitForLoadState("networkidle", { timeout: 6_000 }).catch(() => undefined);
  await page.waitForTimeout(1_500);
}

export async function captureShot(
  context: BrowserContext,
  shot: Shot,
  table: Map<string, RouteEntry>,
  node: NodeInfo,
  pairs: Array<[string, string]>,
  tools: { ffmpeg: string; ffprobe: string },
  outRoot: string,
  workDir: string,
): Promise<Result> {
  const entry = shot.route ? table.get(shot.route)! : null;
  if (entry && shot.expect !== "gate" && entry.roles && !entry.roles.includes(node.role)) {
    return {
      shot: shot.name,
      status: "omitted",
      detail: `${entry.path} needs the ${entry.roles.join(" or ")} role; node is ${node.role}`,
    };
  }
  const urlPath = entry ? entry.path : shot.url!;
  const viewport = shot.viewport ?? DASHBOARD_VIEWPORT;
  const page = await context.newPage();
  try {
    await page.setViewportSize(viewport);
    const res = await page.goto(`${AGENT_URL}${urlPath}`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    if (!res || !res.ok()) {
      throw new Error(`GET ${urlPath} answered ${res?.status() ?? "nothing"}`);
    }
    const pinSplash = page.getByText(/to unlock this dashboard/);
    if (entry) {
      // Wait out the access probe, the page chunk and the profile probe. Until
      // the agent answers /api/pairing/info the header badge reads `auto` and
      // every route renders ungated, so the badge must show the real profile.
      await pinSplash.or(page.locator("main h1")).first().waitFor({ timeout: 60_000 });
      if (await pinSplash.isVisible()) {
        fail(`the agent showed the access-PIN splash: ${AGENT_URL} is not a trusted loopback caller`);
      }
      await page
        .locator("header")
        .getByText(new RegExp(`^${node.profile}( · \\w+)?$`))
        .waitFor({ timeout: 60_000 });
      await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), null, {
        timeout: 60_000,
      });
      // Panels still loading their first data show skeletons; give them time.
      await page
        .waitForFunction(() => !document.querySelector("main .animate-pulse"), null, { timeout: 20_000 })
        .catch(() => undefined);
    }
    await settle(page);

    if (await isVisible(page, "Page not found")) {
      throw new Error(`${urlPath} rendered "Page not found"`);
    }
    const gated = await isVisible(page, "Not available on this profile");
    if (shot.expect === "gate" && !gated) {
      throw new Error(`${urlPath} did not render the profile gate`);
    }
    if (shot.expect !== "gate" && gated) {
      throw new Error(`${urlPath} rendered the profile gate`);
    }
    if (shot.ready) {
      await page.getByText(shot.ready).first().waitFor({ timeout: 30_000 });
    }
    if (shot.prep) {
      await shot.prep(page);
      await settle(page);
    }

    for (const o of shot.omitIf ?? []) {
      if (await isVisible(page, o.text)) {
        return { shot: shot.name, status: "omitted", detail: o.note };
      }
    }
    const flags: string[] = [];
    for (const c of shot.caveats ?? []) {
      if ((await isVisible(page, c.text)) && !flags.includes(c.note)) flags.push(c.note);
    }
    for (const check of shot.checks ?? []) {
      const note = await check(page, node);
      if (note) flags.push(note);
    }

    // Scrub once more right before the shot; the screenshot paints a fresh frame.
    const scrubbed = await page.evaluate(() => typeof window.__adosScrub?.() === "number");
    if (!scrubbed) throw new Error("the scrubber did not install in the page");
    const leaks = findLeaks(await visibleStrings(page), pairs, node);
    if (leaks.length) {
      throw new Error(`not written, unscrubbed values on page:\n      ${leaks.join("\n      ")}`);
    }

    const raw = path.join(workDir, `${shot.name}.raw.png`);
    await page.screenshot({ path: raw, animations: "disabled", caret: "hide" });
    const dst = path.join(outRoot, ...shot.target.split("/"));
    mkdirSync(path.dirname(dst), { recursive: true });
    const width = Math.min(shot.outWidth ?? DASHBOARD_VIEWPORT.width, viewport.width * SCALE);
    const enc = encodePng(tools.ffmpeg, raw, dst, width);
    const dims = String(
      execFileSync(tools.ffprobe, [
        "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=width,height", "-of", "csv=s=x:p=0", dst,
      ]),
    ).trim();
    return {
      shot: shot.name,
      status: flags.length ? "flagged" : "ok",
      file: dst,
      detail: [`${dims}, ${(enc.bytes / 1024).toFixed(0)} KB, ${enc.pass}`, ...flags].join("; "),
    };
  } finally {
    // Closing without beforeunload leaves any dirty form unsaved.
    await page.close({ runBeforeUnload: false });
  }
}

export async function launchBrowser(): Promise<Browser> {
  // Installed Chrome carries the H.264 decoder the live video needs; the
  // bundled Chromium does not, so it is only the fallback.
  try {
    return await chromium.launch({ channel: "chrome", headless: true });
  } catch {
    console.warn("Chrome not found; using bundled Chromium (no H.264: video panels will not play)");
    return chromium.launch({ headless: true });
  }
}
