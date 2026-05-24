#!/usr/bin/env node
// Fails if the web build output contains any reference to "electron".
// Guards against accidental Electron imports leaking into the web bundle.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const WEB_DIST = "dist-web";
const NEEDLE = "electron";

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

let offenders = [];
for await (const file of walk(WEB_DIST)) {
  // Skip source maps — they reference source file paths which legitimately
  // include "electron" (src/platform/electron.ts is the Electron-platform
  // adapter, never executed in the web bundle but still listed in the map).
  if (!/\.(js|mjs|cjs|html|css)$/.test(file)) continue;
  if (file.endsWith(".map")) continue;
  const text = await readFile(file, "utf8");
  if (text.toLowerCase().includes(NEEDLE)) offenders.push(file);
}

if (offenders.length > 0) {
  console.error(`Web bundle contains "${NEEDLE}":`);
  for (const f of offenders) console.error(`  ${f}`);
  console.error(
    "\nThis means an Electron-only module leaked into the web build.\n" +
      "Check src/renderer/main.tsx and the Platform adapters — the renderer must\n" +
      "import from src/platform/* (not src/main/* or 'electron').",
  );
  process.exit(1);
}

console.log(`OK: no "${NEEDLE}" references in ${WEB_DIST}`);
