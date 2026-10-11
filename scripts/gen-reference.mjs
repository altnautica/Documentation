#!/usr/bin/env node
/**
 * Render the generated reference snippets in snippets/generated/ from the
 * reference JSON each source repo commits under docs/reference/.
 *
 *   node scripts/gen-reference.mjs                 fetch at the revs pinned in reference-sources.json
 *   node scripts/gen-reference.mjs --local         read ../<Repo>/docs/reference/ instead
 *   node scripts/gen-reference.mjs --root <dir>    with --local, read <dir>/<Repo>/docs/reference/
 *   node scripts/gen-reference.mjs --check         exit 1 when a committed snippet differs
 *
 * Node 20 built-ins only. With --local a source file that does not exist yet
 * is reported and its snippets are left untouched; a remote fetch failure is
 * an error.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DOCS_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(DOCS_ROOT, "snippets", "generated");
const DENYLIST = /DEC-\d|MSN-\d|Phase \d|Wave [A-Z0-9]/;

// ---------- cell and table helpers ----------

const EMPTY = "n/a";

function esc(s) {
  return String(s).replace(/\r?\n+/g, " ").replace(/\|/g, "\\|").replace(/\{/g, "\\{").replace(/\}/g, "\\}").replace(/</g, "&lt;").trim();
}

function code(s) {
  return `\`${String(s).replace(/\r?\n+/g, " ").replace(/`/g, "'").replace(/\|/g, "\\|")}\``;
}

function text(v) {
  if (v === null || v === undefined || v === "") return EMPTY;
  if (Array.isArray(v)) return v.length ? esc(v.join(", ")) : EMPTY;
  return esc(v);
}

function codes(v) {
  if (v === null || v === undefined) return EMPTY;
  const list = Array.isArray(v) ? v : [v];
  return list.length ? list.map(code).join(", ") : EMPTY;
}

function yesNo(v) {
  if (v === null || v === undefined) return EMPTY;
  return v ? "Yes" : "No";
}

function jsonCode(v) {
  return v === null || v === undefined ? EMPTY : code(JSON.stringify(v));
}

function table(columns, rows) {
  const head = `| ${columns.join(" | ")} |\n| ${columns.map(() => "---").join(" | ")} |`;
  return `${head}\n${rows.map((r) => `| ${r.join(" | ")} |`).join("\n")}\n`;
}

function kebab(s) {
  return String(s).replace(/[_\s.]+/g, "-").replace(/[^A-Za-z0-9-]/g, "").toLowerCase();
}

function byKey(list, key) {
  const groups = new Map();
  for (const item of list) {
    const k = key(item);
    if (k === null || k === undefined || k === "") continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(item);
  }
  return [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

function list(data, field, file) {
  const v = Array.isArray(data) ? data : data[field];
  if (!Array.isArray(v)) throw new Error(`${file}.json: expected an array at "${field}"`);
  return v;
}

// ---------- per-source renderers ----------

function renderCli(data) {
  const cmds = list(data, "commands", "cli").map((c) => ({ ...c, path: String(c.path).replace(/^ados\b\s*/, "") }));
  const cols = ["Command", "Arguments", "Options", "Description"];
  const rows = (items) =>
    items.map((c) => [
      code(`ados ${c.path}`.trim()),
      (c.arguments ?? []).length ? c.arguments.map((a) => `${code(a.name)}${a.required ? "" : " (optional)"}`).join(", ") : EMPTY,
      (c.options ?? []).length
        ? c.options.map((o) => (Array.isArray(o.flags) ? o.flags : [o.flags]).map(code).join(" / ")).join(", ")
        : EMPTY,
      text(c.help),
    ]);
  const out = [["agent-cli.mdx", table(cols, rows(cmds))]];
  for (const [group, items] of byKey(cmds, (c) => (c.path.includes(" ") ? c.path.split(" ")[0] : null))) {
    out.push([`agent-cli-${kebab(group)}.mdx`, table(cols, rows(items))]);
  }
  return out;
}

function renderRoutes(data) {
  const routes = list(data, "routes", "routes");
  const cols = ["Method", "Path", "Served by", "Auth", "WebSocket"];
  const rows = (items) =>
    items.map((r) => [code(r.method), code(r.path), text(r.served_by), r.public ? "Public" : "Required", yesNo(r.websocket)]);
  return [
    ["agent-rest-routes.mdx", table(cols, rows(routes))],
    ["agent-rest-routes-native.mdx", table(cols, rows(routes.filter((r) => r.served_by === "native")))],
    ["agent-rest-routes-residual.mdx", table(cols, rows(routes.filter((r) => r.served_by === "residual")))],
    ["agent-rest-routes-public.mdx", table(cols, rows(routes.filter((r) => r.public)))],
  ];
}

function allowed(k) {
  if (Array.isArray(k.enum) && k.enum.length) return k.enum.map((e) => code(JSON.stringify(e))).join(", ");
  const lo = k.minimum ?? null;
  const hi = k.maximum ?? null;
  if (lo !== null && hi !== null) return esc(`${lo} to ${hi}`);
  if (lo !== null) return esc(`>= ${lo}`);
  if (hi !== null) return esc(`<= ${hi}`);
  return EMPTY;
}

function renderConfig(data) {
  const keys = list(data, "keys", "config");
  const cols = ["Key", "Type", "Default", "Allowed", "Description"];
  const rows = (items) =>
    items.map((k) => [code(k.key), text(k.type), k.secret ? "Secret, not shown" : jsonCode(k.default), allowed(k), text(k.description)]);
  const out = [["agent-config.mdx", table(cols, rows(keys))]];
  for (const [section, items] of byKey(keys, (k) => String(k.key).split(".")[0])) {
    out.push([`agent-config-${kebab(section)}.mdx`, table(cols, rows(items))]);
  }
  return out;
}

function renderCapabilities(data) {
  const caps = list(data, "capabilities", "capabilities");
  const cols = ["Capability", "Category", "Risk", "Enforced", "Description"];
  const rows = (items) => items.map((c) => [code(c.id), text(c.category), text(c.risk), yesNo(c.enforced), text(c.description)]);
  const out = [["agent-capabilities.mdx", table(cols, rows(caps))]];
  for (const [cat, items] of byKey(caps, (c) => c.category)) {
    out.push([`agent-capabilities-${kebab(cat)}.mdx`, table(cols, rows(items))]);
  }
  return out;
}

function renderManifest(data) {
  const fields = list(data, "fields", "manifest");
  const cols = ["Field", "Type", "Required", "Default", "Description"];
  const rows = fields.map((f) => {
    const desc = Array.isArray(f.enum) && f.enum.length
      ? `${f.description ? `${text(f.description)} ` : ""}One of: ${f.enum.map((e) => code(JSON.stringify(e))).join(", ")}.`
      : text(f.description);
    return [code(f.path), text(f.type), yesNo(f.required), jsonCode(f.default), desc];
  });
  return [["plugin-manifest-fields.mdx", table(cols, rows)]];
}

function renderBoards(data) {
  const boards = list(data, "boards", "boards");
  const cols = ["Board id", "Name", "Vendor", "SoC", "Arch", "Tier", "Video codecs", "Max encode", "Manifest tokens"];
  const rows = boards.map((b) => [
    code(b.id), text(b.name), text(b.vendor), text(b.soc), text(b.arch), text(b.default_tier),
    text(b.hw_video_codecs), text(b.max_encode_resolution), codes(b.plugin_tokens),
  ]);
  return [["supported-boards.mdx", table(cols, rows)]];
}

function renderUnits(data) {
  const units = list(data, "units", "units");
  const full = table(
    ["Unit", "Description", "Category", "Profiles", "Restartable via API", "Drops link", "Memory cap"],
    units.map((u) => [code(u.name), text(u.description), text(u.category), text(u.profiles), yesNo(u.api_restartable), yesNo(u.drops_link), text(u.memory_max)]),
  );
  const out = [["agent-systemd-units.mdx", full]];
  for (const profile of ["drone", "ground-station", "workstation"]) {
    const items = units.filter((u) => Array.isArray(u.profiles) && u.profiles.some((p) => kebab(p) === profile));
    out.push([`agent-units-${profile}.mdx`, table(["Unit", "Description", "Category"], items.map((u) => [code(u.name), text(u.description), text(u.category)]))]);
  }
  return out;
}

function renderInstallerFlags(data) {
  const flags = list(data, "flags", "installer-flags");
  const rows = flags.map((f) => {
    const name = String(f.name).startsWith("-") ? f.name : `--${f.name}`;
    const names = f.short ? `${code(name)}, ${code(String(f.short).startsWith("-") ? f.short : `-${f.short}`)}` : code(name);
    return [names, f.takes_value ? code(f.value_name ? `<${f.value_name}>` : "<value>") : EMPTY, text(f.help)];
  });
  return [["agent-installer-flags.mdx", table(["Flag", "Value", "Description"], rows)]];
}

function renderDashboardRoutes(data) {
  const routes = list(data, "routes", "dashboard-routes");
  return [["agent-dashboard-routes.mdx", table(["Path", "Page", "Profiles"], routes.map((r) => [code(r.path), text(r.label), text(r.profiles)]))]];
}

function renderGcsRoutes(data) {
  const routes = list(data, "routes", "gcs-routes");
  return [["gcs-routes.mdx", table(["Path", "Dynamic"], routes.map((r) => [code(r.path), yesNo(r.dynamic)]))]];
}

function renderExtensions(data) {
  const exts = list(data, "extensions", "extensions");
  const out = [[
    "extensions-catalog.mdx",
    table(
      ["Extension", "Version", "Category", "Halves", "Boards", "Published"],
      exts.map((e) => [`${text(e.name)} (${code(e.id)})`, text(e.version), text(e.category), text(e.halves), codes(e.supported_boards), yesNo(e.published)]),
    ),
  ]];
  for (const e of exts) {
    const seg = kebab(String(e.id).split(".").pop());
    const perms = (e.permissions ?? []).length ? e.permissions.map((p) => `- ${code(p)}`).join("\n") : `- ${EMPTY}`;
    out.push([`extension-${seg}.mdx`, `**Permissions**\n\n${perms}\n\n**Boards:** ${codes(e.supported_boards)}\n`]);
  }
  return out;
}

const RENDERERS = [
  { repo: "ADOSDroneAgent", file: "cli", render: renderCli },
  { repo: "ADOSDroneAgent", file: "routes", render: renderRoutes },
  { repo: "ADOSDroneAgent", file: "config", render: renderConfig },
  { repo: "ADOSDroneAgent", file: "capabilities", render: renderCapabilities },
  { repo: "ADOSDroneAgent", file: "manifest", render: renderManifest },
  { repo: "ADOSDroneAgent", file: "boards", render: renderBoards },
  { repo: "ADOSDroneAgent", file: "units", render: renderUnits },
  { repo: "ADOSDroneAgent", file: "installer-flags", render: renderInstallerFlags },
  { repo: "ADOSDroneAgent", file: "dashboard-routes", render: renderDashboardRoutes },
  { repo: "ADOSMissionControl", file: "gcs-routes", render: renderGcsRoutes },
  { repo: "ADOSExtensions", file: "extensions", render: renderExtensions },
];

function parseArgs(argv) {
  const args = { check: false, local: false, root: resolve(DOCS_ROOT, "..") };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--check") args.check = true;
    else if (a === "--local") args.local = true;
    else if (a === "--root") args.root = resolve(argv[++i] ?? "");
    else throw new Error(`unknown argument: ${a}`);
  }
  return args;
}

async function loadSource(args, repo, rev, file) {
  if (args.local) {
    const p = join(args.root, repo, "docs", "reference", `${file}.json`);
    if (!existsSync(p)) return null;
    return JSON.parse(readFileSync(p, "utf8"));
  }
  const url = `https://raw.githubusercontent.com/altnautica/${repo}/${rev}/docs/reference/${file}.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url}: HTTP ${res.status}`);
  return res.json();
}

function headerSource(text) {
  const m = /^\{\/\* Generated by scripts\/gen-reference\.mjs from ([A-Za-z-]+)@[0-9a-f]+:docs\/reference\/([a-z-]+)\.json\./.exec(text);
  return m ? `${m[1]}:${m[2]}` : null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sources = JSON.parse(readFileSync(join(DOCS_ROOT, "reference-sources.json"), "utf8"));
  const expected = new Map();
  const rendered = new Set();
  const problems = [];

  for (const { repo, file, render } of RENDERERS) {
    const rev = sources[repo];
    if (typeof rev !== "string" || !/^[0-9a-f]{40}$/.test(rev)) {
      throw new Error(`reference-sources.json: ${repo} must be a 40-hex commit sha`);
    }
    const data = await loadSource(args, repo, rev, file);
    if (data === null) {
      console.warn(`skip ${repo}/docs/reference/${file}.json: not present locally`);
      continue;
    }
    if (data?.schema !== 1) throw new Error(`${repo}/${file}.json: schema must be 1, got ${JSON.stringify(data?.schema)}`);
    rendered.add(`${repo}:${file}`);
    const header = `{/* Generated by scripts/gen-reference.mjs from ${repo}@${rev.slice(0, 12)}:docs/reference/${file}.json. Do not edit by hand. */}`;
    for (const [name, body] of render(data)) {
      const text = `${header}\n\n${body.trimEnd()}\n`;
      const hit = DENYLIST.exec(text);
      if (hit) problems.push(`${name}: denylisted text "${hit[0]}" from ${repo}/${file}.json`);
      expected.set(name, text);
    }
  }

  if (problems.length) {
    for (const p of problems) console.error(`denylist: ${p}`);
    process.exit(1);
  }

  const existing = existsSync(OUT_DIR) ? readdirSync(OUT_DIR).filter((n) => n.endsWith(".mdx")) : [];
  const stale = existing.filter((name) => {
    if (expected.has(name)) return false;
    const src = headerSource(readFileSync(join(OUT_DIR, name), "utf8"));
    return src !== null && rendered.has(src);
  });

  if (args.check) {
    const drift = [];
    for (const [name, text] of expected) {
      const p = join(OUT_DIR, name);
      if (!existsSync(p) || readFileSync(p, "utf8") !== text) drift.push(name);
    }
    drift.push(...stale.map((n) => `${n} (no longer generated)`));
    if (drift.length) {
      console.error(`generated snippets out of date; run node scripts/gen-reference.mjs${args.local ? " --local" : ""}:`);
      for (const d of drift) console.error(`  snippets/generated/${d}`);
      process.exit(1);
    }
    console.log(`${expected.size} generated snippets are current`);
    return;
  }

  mkdirSync(OUT_DIR, { recursive: true });
  for (const [name, text] of expected) writeFileSync(join(OUT_DIR, name), text);
  for (const name of stale) unlinkSync(join(OUT_DIR, name));
  console.log(`wrote ${expected.size} snippets, removed ${stale.length}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(2);
});
