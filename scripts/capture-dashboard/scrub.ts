// Redaction: SCRUB_PAIRS parsing, the in-page scrubber, the dark-theme init
// script and the leak check that refuses a shot with identifiers still visible.
import type { Page } from "playwright";

import { fail, type NodeInfo } from "./common.ts";

export function parseScrubPairs(raw: string | undefined): Array<[string, string]> {
  if (!raw || !raw.trim()) {
    fail("SCRUB_PAIRS is required: real=>placeholder;real2=>placeholder2");
  }
  const pairs: Array<[string, string]> = [];
  for (const item of raw.split(";")) {
    if (!item.trim()) continue;
    const at = item.indexOf("=>");
    if (at < 0) fail(`SCRUB_PAIRS entry ${pairs.length + 1} has no "=>"`);
    const real = item.slice(0, at).trim();
    const placeholder = item.slice(at + 2).trim();
    if (!real) fail(`SCRUB_PAIRS entry ${pairs.length + 1} has an empty real value`);
    if (placeholder.includes(real)) {
      fail(`SCRUB_PAIRS entry ${pairs.length + 1}: the placeholder contains the real value`);
    }
    pairs.push([real, placeholder]);
  }
  // Longest first, so a hostname inside an FQDN is not replaced piecemeal.
  return pairs.sort((a, b) => b[0].length - a[0].length);
}

const PUBLIC_IPS: Record<string, true> = {
  "127.0.0.1": true,
  "192.168.4.1": true,
  "192.168.7.1": true,
  "0.0.0.0": true,
};

declare global {
  interface Window {
    /** Installed by the scrubber init script. */
    __adosScrub?: () => number;
  }
}

/** Runs in the page before any app script; keeps every render scrubbed. */
export function installScrubber(pairs: Array<[string, string]>) {
  const ATTRS = ["title", "placeholder", "alt", "aria-label", "value"];
  const fix = (s: string) => {
    let out = s;
    for (const [real, placeholder] of pairs) {
      if (out.includes(real)) out = out.split(real).join(placeholder);
    }
    return out;
  };
  const scrubRoot = (root: Document | ShadowRoot): number => {
    let n = 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      const v = t.nodeValue ?? "";
      const f = fix(v);
      if (f !== v) {
        t.nodeValue = f;
        n++;
      }
    }
    root.querySelectorAll("*").forEach((el) => {
      for (const a of ATTRS) {
        const v = el.getAttribute(a);
        if (v === null) continue;
        const f = fix(v);
        if (f !== v) {
          el.setAttribute(a, f);
          n++;
        }
      }
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        const f = fix(el.value);
        if (f !== el.value) {
          el.value = f;
          n++;
        }
      }
      if (el.shadowRoot) n += scrubRoot(el.shadowRoot);
    });
    return n;
  };
  const scrubAll = () => {
    let n = scrubRoot(document);
    const title = fix(document.title);
    if (title !== document.title) {
      document.title = title;
      n++;
    }
    return n;
  };
  window.__adosScrub = scrubAll;
  const start = () => {
    scrubAll();
    new MutationObserver(scrubAll).observe(document, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ATTRS,
    });
    // Input values change without a mutation record.
    setInterval(scrubAll, 250);
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
}

/** Force the dark theme the dashboard reads from its persisted UI store. */
export function forceDarkTheme() {
  try {
    localStorage.setItem(
      "ados.ui",
      JSON.stringify({ state: { theme: "dark", sidebarCollapsed: false }, version: 0 }),
    );
  } catch {
    // Storage blocked (about:blank): nothing to set.
  }
}

/** Every visible string a reader could see: text, input values, labels. */
export async function visibleStrings(page: Page): Promise<string> {
  return page.evaluate(() => {
    const parts: string[] = [document.title, document.body?.innerText ?? ""];
    document.querySelectorAll("input, textarea").forEach((el) => {
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) parts.push(el.value);
    });
    document.querySelectorAll("[title], [placeholder], [alt], [aria-label]").forEach((el) => {
      for (const a of ["title", "placeholder", "alt", "aria-label"]) {
        const v = el.getAttribute(a);
        if (v) parts.push(v);
      }
    });
    return parts.join("\n");
  });
}

const IPV4 = /(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])/g;
const MAC = /(?<![0-9a-f:])(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}(?![0-9a-f:])/gi;

export function findLeaks(text: string, pairs: Array<[string, string]>, node: NodeInfo): string[] {
  const leaks: string[] = [];
  const placeholders = new Set(pairs.map(([, p]) => p.toLowerCase()));
  for (const [real] of pairs) {
    if (text.includes(real)) leaks.push(`a SCRUB_PAIRS value is still visible: ${real}`);
  }
  for (const [field, value] of Object.entries(node.identity)) {
    if (text.includes(value)) leaks.push(`node ${field} is visible; add it to SCRUB_PAIRS`);
  }
  for (const ip of new Set(text.match(IPV4) ?? [])) {
    const octets = ip.split(".").map(Number);
    if (octets.some((o) => o > 255) || PUBLIC_IPS[ip] || placeholders.has(ip)) continue;
    leaks.push(`IPv4 address ${ip} is visible; add it to SCRUB_PAIRS`);
  }
  for (const mac of new Set(text.match(MAC) ?? [])) {
    if (placeholders.has(mac.toLowerCase())) continue;
    leaks.push(`MAC address ${mac} is visible; add it to SCRUB_PAIRS`);
  }
  return leaks;
}
