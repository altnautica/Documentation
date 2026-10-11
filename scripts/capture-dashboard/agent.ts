// The agent side: the dashboard route table and the node's reported identity.
import { existsSync, readFileSync } from "node:fs";

import {
  AGENT_URL,
  ROUTE_TABLE,
  fail,
  type GroundRole,
  type NodeInfo,
  type Profile,
  type RouteEntry,
  type Shot,
} from "./common.ts";

export function loadRouteTable(): Map<string, RouteEntry> {
  if (!existsSync(ROUTE_TABLE)) {
    fail(`route table not found at ${ROUTE_TABLE}; set ADOS_AGENT_REPO to the ADOSDroneAgent checkout`);
  }
  const entries = JSON.parse(readFileSync(ROUTE_TABLE, "utf8")) as RouteEntry[];
  return new Map(entries.map((e) => [e.key, e]));
}

/** Resolve every shot's route against the table before any capture runs. */
export function resolveRoutes(shots: Shot[], table: Map<string, RouteEntry>, profile: Profile) {
  const errors: string[] = [];
  for (const shot of shots) {
    if (!shot.route) continue;
    const entry = table.get(shot.route);
    if (!entry) {
      errors.push(`${shot.name}: route "${shot.route}" is not in ${ROUTE_TABLE}`);
      continue;
    }
    const served = !entry.profiles || entry.profiles.includes(profile);
    if (shot.expect === "gate" && served) {
      errors.push(`${shot.name}: route ${entry.path} is no longer gated off the ${profile} profile`);
    }
    if (shot.expect !== "gate" && !served) {
      errors.push(`${shot.name}: route ${entry.path} is not served on the ${profile} profile`);
    }
  }
  if (errors.length) fail(`route table mismatch:\n  ${errors.join("\n  ")}`);
}

// --------------------------------------------------------------------- node

export async function readNode(): Promise<NodeInfo> {
  let res: Response;
  try {
    res = await fetch(`${AGENT_URL}/api/pairing/info`, { signal: AbortSignal.timeout(15_000) });
  } catch (err) {
    fail(`agent unreachable at ${AGENT_URL} (${err instanceof Error ? err.message : err}); is the tunnel up?`);
  }
  if (!res.ok) fail(`GET ${AGENT_URL}/api/pairing/info answered ${res.status}`);
  const info = (await res.json()) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const role = str(info.role);
  const identity: Record<string, string> = {};
  for (const key of ["device_id", "mdns_host", "owner_id", "pairing_code"]) {
    const v = str(info[key]);
    if (v) identity[key] = v;
  }
  const mdnsStem = (identity.mdns_host ?? "").replace(/\.local$/, "");
  if (mdnsStem) identity["mdns_host (stem)"] = mdnsStem;
  return {
    // The wire spells the ground profile `ground-station`.
    profile: str(info.profile).replace("-", "_"),
    role: role === "relay" || role === "receiver" ? role : "direct",
    paired: info.paired === true,
    fcConnected: info.fc_connected === true,
    identity,
  };
}
