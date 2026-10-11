/**
 * Capture the ADOS agent dashboard screenshots used by the docs.
 *
 * Usage:
 *   npm run capture:drone                       # drone shot set
 *   npm run capture:ground                      # ground_station shot set
 *   npm run capture -- --profile drone --out /tmp/shots --only=home,video
 *
 * Arguments:
 *   --profile drone|ground_station   shot set; must match the node's profile
 *   --out <dir>                      output root (default ../images); each shot
 *                                    keeps its path under it, for example
 *                                    <dir>/drone-agent/dashboard/home.png
 *   --only=a,b                       capture only the named shots
 *
 * Environment:
 *   AGENT_URL    agent base URL (default http://127.0.0.1:18080). Reach the
 *                node through a loopback tunnel, for example
 *                `ssh -N -L 18080:127.0.0.1:8080 <node>`. A loopback caller
 *                with no forwarding header is trusted on-box, so no key or PIN
 *                is needed. Any other address shows the access-PIN splash and
 *                the run stops.
 *   SCRUB_PAIRS  required. `real=>placeholder;real2=>placeholder2`. Every real
 *                value is replaced in each text node, input value and
 *                title/placeholder/alt/aria-label attribute before and during
 *                every shot. List the node's hostname, .local name, device id,
 *                owner id, pairing code, MAC addresses, LAN IPs and any
 *                configured endpoint you do not want published.
 *   ADOS_AGENT_REPO  ADOSDroneAgent checkout (default ../../ADOSDroneAgent);
 *                the dashboard route table is read from it at run time, so a
 *                renamed route fails the run instead of capturing a 404.
 *   FFMPEG_DIR   folder holding ffmpeg/ffprobe when they are not on PATH.
 *
 * Each shot is taken at 2x device scale, Lanczos-downscaled with ffmpeg and
 * re-encoded as a real PNG under ~400 KB. After scrubbing, a shot is refused
 * (not written) if the page still shows a SCRUB_PAIRS value, the node's
 * device id, .local name, owner id or pairing code, or any MAC or IPv4
 * address other than 127.0.0.1, 192.168.4.1, 192.168.7.1. Pixels drawn into a
 * canvas or video (charts, QR codes, the camera feed) cannot be scrubbed:
 * check those by eye.
 *
 * The run never saves, applies, pairs or restarts anything. Settings → Cloud
 * selects Self-hosted in the form without saving; Display & Joystick runs a
 * Bluetooth discovery scan (read-only) so the results card is populated.
 *
 * Modules under ./capture-dashboard/: shots (the shot set), agent (route
 * table, node identity), scrub (redaction), capture (one shot), encode (ffmpeg).
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";

import { loadRouteTable, readNode, resolveRoutes } from "./capture-dashboard/agent.ts";
import { captureShot, launchBrowser, type Result } from "./capture-dashboard/capture.ts";
import {
  AGENT_URL,
  DASHBOARD_VIEWPORT,
  DEFAULT_OUT,
  SCALE,
  fail,
  type Profile,
} from "./capture-dashboard/common.ts";
import { resolveTool } from "./capture-dashboard/encode.ts";
import { forceDarkTheme, installScrubber, parseScrubPairs } from "./capture-dashboard/scrub.ts";
import { SHOTS } from "./capture-dashboard/shots.ts";

interface Args {
  profile: Profile;
  out: string;
  only: Set<string> | null;
}

function parseArgs(argv: string[]): Args {
  const values = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) fail(`unexpected argument "${arg}"`);
    const eq = arg.indexOf("=");
    if (eq >= 0) {
      values.set(arg.slice(2, eq), arg.slice(eq + 1));
    } else {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) fail(`${arg} needs a value`);
      values.set(arg.slice(2), next);
      i++;
    }
  }
  for (const key of values.keys()) {
    if (!["profile", "out", "only"].includes(key)) fail(`unknown option --${key}`);
  }
  const profile = values.get("profile");
  if (profile !== "drone" && profile !== "ground_station") {
    fail("--profile drone|ground_station is required");
  }
  const onlyRaw = values.get("only");
  const only = onlyRaw
    ? new Set(onlyRaw.split(",").map((s) => s.trim()).filter(Boolean))
    : null;
  if (only) {
    const known = new Set(SHOTS[profile].map((s) => s.name));
    const unknown = [...only].filter((n) => !known.has(n));
    if (unknown.length) {
      fail(`unknown shot(s) for ${profile}: ${unknown.join(", ")}. Known: ${[...known].join(", ")}`);
    }
  }
  return { profile, out: path.resolve(values.get("out") ?? DEFAULT_OUT), only };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pairs = parseScrubPairs(process.env.SCRUB_PAIRS);
  const table = loadRouteTable();
  const shots = SHOTS[args.profile].filter((s) => !args.only || args.only.has(s.name));
  resolveRoutes(shots, table, args.profile);
  const tools = { ffmpeg: resolveTool("ffmpeg"), ffprobe: resolveTool("ffprobe") };

  const node = await readNode();
  if (node.profile !== args.profile) {
    fail(
      `node at ${AGENT_URL} reports profile "${node.profile || "unknown"}", not "${args.profile}". ` +
        `Run the ${node.profile || "matching"} set or capture from a ${args.profile} node.`,
    );
  }
  console.log(
    `[${args.profile}${args.profile === "ground_station" ? `/${node.role}` : ""}] ` +
      `${shots.length} shot(s) from ${AGENT_URL} into ${args.out}`,
  );

  const workDir = mkdtempSync(path.join(tmpdir(), "ados-dash-capture-"));
  const browser = await launchBrowser();
  const context = await browser.newContext({
    viewport: DASHBOARD_VIEWPORT,
    deviceScaleFactor: SCALE,
    colorScheme: "dark",
    reducedMotion: "reduce",
  });
  // tsx compiles with esbuild keepNames, which wraps named inner functions in
  // `__name(...)`; the page has no such helper, so the init scripts below
  // would throw before scrubbing anything without this no-op.
  await context.addInitScript({ content: "globalThis.__name ??= (fn) => fn;" });
  await context.addInitScript(forceDarkTheme);
  await context.addInitScript(installScrubber, pairs);

  const results: Result[] = [];
  try {
    for (const shot of shots) {
      let result: Result;
      try {
        result = await captureShot(context, shot, table, node, pairs, tools, args.out, workDir);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result = { shot: shot.name, status: "failed", detail: message.split("\nCall log")[0] };
      }
      results.push(result);
      console.log(`  ${result.status.padEnd(7)} ${result.shot}${result.detail ? `: ${result.detail}` : ""}`);
    }
  } finally {
    await context.close();
    await browser.close();
    rmSync(workDir, { recursive: true, force: true });
  }

  const count = (s: Result["status"]) => results.filter((r) => r.status === s).length;
  console.log(
    `\n${count("ok")} ok, ${count("flagged")} flagged, ${count("omitted")} omitted, ${count("failed")} failed`,
  );
  if (count("failed")) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
