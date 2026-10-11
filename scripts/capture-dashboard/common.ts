// Shared types, settings and helpers for capture-dashboard-screenshots.ts.
import type { Page } from "playwright";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DOCS_ROOT = path.resolve(__dirname, "..", "..");
export const DEFAULT_OUT = path.join(DOCS_ROOT, "images");
const AGENT_REPO = process.env.ADOS_AGENT_REPO ?? path.resolve(DOCS_ROOT, "..", "ADOSDroneAgent");
export const ROUTE_TABLE = path.join(AGENT_REPO, "dashboard", "src", "route-table.json");

export const AGENT_URL = (process.env.AGENT_URL ?? "http://127.0.0.1:18080").replace(/\/+$/, "");
export const DASHBOARD_VIEWPORT = { width: 1440, height: 900 };
export const KIOSK_VIEWPORT = { width: 1280, height: 720 };
export const SCALE = 2;

export type Profile = "drone" | "ground_station";
export type GroundRole = "direct" | "relay" | "receiver";

export interface RouteEntry {
  key: string;
  path: string;
  label: string;
  profiles: Profile[] | null;
  roles: GroundRole[] | null;
}

export interface NodeInfo {
  profile: string;
  role: GroundRole;
  paired: boolean;
  fcConnected: boolean;
  identity: Record<string, string>;
}

export interface Shot {
  /** Name used by --only. */
  name: string;
  /** Output path under the images root. */
  target: string;
  /** Dashboard route key in route-table.json. */
  route?: string;
  /** Raw agent path for pages outside the dashboard SPA. */
  url?: string;
  /** `gate` expects the profile-mismatch panel instead of the page. */
  expect?: "page" | "gate";
  viewport?: { width: number; height: number };
  outWidth?: number;
  /** Text that must be visible before the shot. */
  ready?: string | RegExp;
  /** UI steps before the shot. Never saves or applies. */
  prep?: (page: Page) => Promise<void>;
  /** Visible text that means the node cannot show the captioned state. */
  caveats?: Array<{ text: string | RegExp; note: string }>;
  /** Visible text that means the main panel is blank: the shot is omitted. */
  omitIf?: Array<{ text: string | RegExp; note: string }>;
  /** Each returns a flag note when the node cannot show the captioned state. */
  checks?: Array<(page: Page, node: NodeInfo) => Promise<string | null>>;
}

export function fail(message: string, code = 2): never {
  console.error(`error: ${message}`);
  process.exit(code);
}

export async function isVisible(page: Page, text: string | RegExp): Promise<boolean> {
  const loc = page.getByText(text).first();
  return (await loc.count()) > 0 && (await loc.isVisible());
}
