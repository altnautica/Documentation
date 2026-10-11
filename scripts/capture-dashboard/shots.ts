// The docs screenshot set per profile: target path, route and the checks
// that flag a node unable to show the state each caption promises.
import type { Page } from "playwright";

import {
  KIOSK_VIEWPORT,
  isVisible,
  type NodeInfo,
  type Profile,
  type Shot,
} from "./common.ts";

const NO_SERVICES = [
  { text: "service inventory unavailable", note: "agent services list is empty" },
  { text: "services unavailable", note: "agent services list is empty" },
];

async function fcCheck(_page: Page, node: NodeInfo) {
  return node.fcConnected ? null : "no flight controller connected";
}

/** The dashboard video badge reads `live · webrtc|hls` only once a frame is presented. */
async function videoCheck(page: Page) {
  const live = await page
    .getByText(/^live · (webrtc|hls)/i)
    .first()
    .waitFor({ timeout: 20_000 })
    .then(() => true, () => false);
  return live ? null : "video is not live";
}

const DRONE_SHOTS: Shot[] = [
  {
    name: "home",
    target: "drone-agent/dashboard/home.png",
    route: "home",
    ready: "Enter Cockpit",
    caveats: NO_SERVICES,
    checks: [fcCheck, videoCheck],
  },
  {
    name: "home-setup-incomplete",
    target: "drone-agent/dashboard/home-setup-incomplete.png",
    route: "home",
    ready: "Enter Cockpit",
    checks: [
      async (page) =>
        (await page.locator('[title^="Failing required"]').count()) > 0
          ? null
          : "no required component is missing: the HW tile is not red",
    ],
  },
  {
    name: "diagnostics",
    target: "drone-agent/dashboard/diagnostics.png",
    route: "diagnostics",
    caveats: [{ text: "Inventory is unavailable", note: "agent services list is empty" }],
  },
  {
    name: "extensions",
    target: "drone-agent/dashboard/extensions.png",
    route: "extensions",
    caveats: [{ text: "No extensions installed.", note: "no installed extension rows" }],
  },
  {
    name: "logs",
    target: "drone-agent/dashboard/logs.png",
    route: "logs",
    ready: "Logger contains",
    caveats: [{ text: "no log entries buffered yet.", note: "no live log rows" }],
  },
  {
    name: "pairing",
    target: "drone-agent/dashboard/pairing.png",
    route: "pairing",
    checks: [
      async (_page, node) =>
        node.paired ? "node is paired: the caption wants an unpaired node with its pairing code" : null,
    ],
  },
  {
    name: "peripherals",
    target: "drone-agent/dashboard/peripherals.png",
    route: "peripherals",
    caveats: [{ text: "No peripherals registered.", note: "no registered peripheral card" }],
  },
  {
    name: "route-gate",
    target: "drone-agent/dashboard/route-gate.png",
    route: "receive",
    expect: "gate",
  },
  {
    name: "settings-advanced",
    target: "drone-agent/dashboard/settings-advanced.png",
    route: "settings-advanced",
    ready: "Board override",
  },
  {
    name: "settings-cloud",
    target: "drone-agent/dashboard/settings-cloud.png",
    route: "settings-cloud",
    ready: "Cloud posture",
    prep: async (page) => {
      // Select only. The form is left dirty and the page is closed unsaved.
      await page.getByRole("radio", { name: /Self-hosted/ }).click();
      await page.getByText("Self-hosted endpoints").waitFor({ timeout: 5_000 });
    },
  },
  {
    name: "settings-network",
    target: "drone-agent/dashboard/settings-network.png",
    route: "settings-network",
  },
  {
    name: "settings-profile",
    target: "drone-agent/dashboard/settings-profile.png",
    route: "settings-profile",
  },
  {
    name: "settings-security",
    target: "drone-agent/dashboard/settings-security.png",
    route: "settings-security",
  },
  {
    name: "telemetry-parameters",
    target: "drone-agent/dashboard/telemetry-parameters.png",
    route: "telemetry",
    ready: "Parameters",
    caveats: [{ text: "No parameters cached yet.", note: "no parameters cached" }],
    checks: [fcCheck],
  },
  {
    name: "telemetry-sensors",
    target: "drone-agent/dashboard/telemetry-sensors.png",
    route: "telemetry",
    prep: async (page) => {
      await page.getByRole("button", { name: "Sensors", exact: true }).click();
      await page.waitForTimeout(2_500);
    },
    checks: [fcCheck],
  },
  {
    name: "transmit",
    target: "drone-agent/dashboard/transmit.png",
    route: "transmit",
    caveats: [{ text: "WFB-tx is not running", note: "no WFB adapter: transmit card is inactive" }],
  },
  {
    name: "video",
    target: "drone-agent/dashboard/video.png",
    route: "video",
    checks: [videoCheck],
  },
  {
    name: "battery-settings",
    target: "drone-agent/battery-settings.png",
    route: "settings-battery",
    caveats: [
      { text: "Battery monitoring is off", note: "battery monitoring is off: no live pack card" },
      { text: "No battery reported", note: "no battery reported: no live pack card" },
      { text: "Could not read battery health", note: "battery health unreadable: no live pack card" },
      { text: "No fresh battery data", note: "battery data is stale" },
    ],
  },
];

const GROUND_SHOTS: Shot[] = [
  {
    name: "home",
    target: "ground-agent/dashboard/home.png",
    route: "home",
    ready: "Enter Cockpit",
    caveats: [
      ...NO_SERVICES,
      { text: "WFB-rx is not running", note: "no WFB adapter: WFB Receive panel is inactive" },
    ],
    checks: [
      videoCheck,
      async (_page, node) =>
        node.role === "direct" ? null : `node is in the ${node.role} role: the caption shows the direct role`,
    ],
  },
  {
    name: "io",
    target: "ground-agent/dashboard/io.png",
    route: "io",
    ready: "Kiosk display",
    prep: async (page) => {
      // A Bluetooth discovery scan reads nearby devices; it pairs nothing.
      await page.getByRole("button", { name: "Scan", exact: true }).click();
      await page.waitForTimeout(10_000);
    },
    caveats: [
      { text: "No game controllers attached.", note: "no gamepad attached" },
      { text: "No paired Bluetooth devices", note: "no Bluetooth devices" },
    ],
  },
  {
    name: "mesh",
    target: "ground-agent/dashboard/mesh.png",
    route: "mesh",
    omitIf: [
      { text: "No current mesh snapshot", note: "mesh service is not reporting (no mesh radio)" },
      { text: "This node is not in a mesh.", note: "node is not in a mesh" },
      { text: "Could not read the mesh state.", note: "mesh state unreadable" },
    ],
    caveats: [{ text: "No batman-adv neighbours discovered yet.", note: "no mesh neighbours" }],
  },
  {
    name: "receive",
    target: "ground-agent/dashboard/receive.png",
    route: "receive",
    omitIf: [{ text: "WFB-rx is not running", note: "no WFB adapter: WFB Receive card is empty" }],
  },
  {
    name: "sources",
    target: "ground-agent/dashboard/sources.png",
    route: "sources",
    omitIf: [
      { text: "The receive loop is not reporting", note: "receive loop is not reporting (no radio)" },
      { text: "Could not read the receiver state.", note: "receiver state unreadable" },
    ],
    caveats: [{ text: "No relay is contributing right now.", note: "no relay is contributing" }],
  },
  {
    // The HDMI kiosk loads this exact URL on the ground station.
    name: "cockpit-kiosk",
    target: "ground-agent/cockpit-kiosk.png",
    url: "/cockpit/?kiosk=1",
    viewport: KIOSK_VIEWPORT,
    outWidth: 1600,
    checks: [
      async (page) => {
        await page
          .getByText("Connecting to feed")
          .waitFor({ state: "hidden", timeout: 20_000 })
          .catch(() => undefined);
        const idle =
          (await isVisible(page, "No video source")) || (await isVisible(page, "Connecting to feed"));
        return idle ? "video is not live" : null;
      },
    ],
  },
];

export const SHOTS: Record<Profile, Shot[]> = { drone: DRONE_SHOTS, ground_station: GROUND_SHOTS };
