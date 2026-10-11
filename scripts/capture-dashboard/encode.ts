// ffmpeg discovery and the Lanczos-downscale PNG encode with a size budget.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import * as path from "node:path";

import { fail } from "./common.ts";

const MAX_BYTES = 400 * 1024;

function findInDir(dir: string, name: string, depth: number): string | null {
  if (depth < 0 || !existsSync(dir)) return null;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === name) return p;
    if (entry.isDirectory()) {
      const hit = findInDir(p, name, depth - 1);
      if (hit) return hit;
    }
  }
  return null;
}

/** Resolve an ffmpeg-family binary: $FFMPEG_DIR, PATH, then known Windows installs. */
export function resolveTool(tool: "ffmpeg" | "ffprobe"): string {
  const exe = process.platform === "win32" ? `${tool}.exe` : tool;
  if (process.env.FFMPEG_DIR) {
    const p = path.join(process.env.FFMPEG_DIR, exe);
    if (existsSync(p)) return p;
  }
  if (spawnSync(tool, ["-version"], { stdio: "ignore" }).status === 0) return tool;
  if (process.platform === "win32") {
    const winget = path.join(homedir(), "AppData", "Local", "Microsoft", "WinGet", "Packages");
    if (existsSync(winget)) {
      for (const pkg of readdirSync(winget).filter((d) => d.startsWith("Gyan.FFmpeg"))) {
        const hit = findInDir(path.join(winget, pkg), exe, 3);
        if (hit) return hit;
      }
    }
    const sharex = path.join("C:\\Program Files\\ShareX", exe);
    if (existsSync(sharex)) return sharex;
  }
  fail(`${tool} not found; set FFMPEG_DIR to the folder holding ${exe}`);
}

/**
 * Lanczos-downscale `src` to `width` px and write a real PNG at `dst`, trying
 * smaller encodings until it fits MAX_BYTES: full-colour at max compression,
 * then a 256-colour palette, then a palette at 1280 px.
 */
export function encodePng(ffmpeg: string, src: string, dst: string, width: number) {
  const scale = (w: number) => `scale=${w}:-2:flags=lanczos`;
  const palette = (w: number) =>
    `${scale(w)},split[a][b];[a]palettegen=max_colors=256:stats_mode=full[p];[b][p]paletteuse=dither=none`;
  const passes: Array<{ label: string; args: string[] }> = [
    { label: "rgb24", args: ["-vf", scale(width), "-pix_fmt", "rgb24"] },
    { label: "palette", args: ["-filter_complex", palette(width)] },
    { label: "palette@1280", args: ["-filter_complex", palette(Math.min(width, 1280))] },
  ];
  let bytes = 0;
  for (const pass of passes) {
    execFileSync(
      ffmpeg,
      [
        "-y", "-loglevel", "error", "-i", src, ...pass.args,
        "-compression_level", "9", "-pred", "mixed", "-frames:v", "1", "-update", "1", dst,
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    bytes = statSync(dst).size;
    if (bytes <= MAX_BYTES) return { bytes, pass: pass.label };
  }
  return { bytes, pass: `${passes.at(-1)!.label} (over ${MAX_BYTES / 1024} KB)` };
}
