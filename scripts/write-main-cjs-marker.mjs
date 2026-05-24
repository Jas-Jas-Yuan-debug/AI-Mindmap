#!/usr/bin/env node
// The root package.json sets "type": "module" so renderer/scripts/shared default
// to ESM. But the Electron main process is compiled to CommonJS (tsconfig.main.json
// "module": "CommonJS") and Node would otherwise treat dist-electron/main/*.js as
// ESM and fail with "exports is not defined".
//
// Fix: drop a sibling package.json into the main-process output that overrides
// the type to "commonjs" for that directory only. Vite uses the same trick for
// its dist output.

import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const dir = "dist-electron/main";
await mkdir(dir, { recursive: true });
await writeFile(
  join(dir, "package.json"),
  JSON.stringify({ type: "commonjs" }, null, 2) + "\n",
);
console.log(`Wrote ${dir}/package.json with type=commonjs`);
