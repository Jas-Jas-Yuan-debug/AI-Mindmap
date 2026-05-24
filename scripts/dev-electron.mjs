#!/usr/bin/env node
// Concurrent Vite dev server + Electron launcher for `npm run dev:electron`.
// 1. Start Vite (electron config) on a fixed port.
// 2. Wait until the dev URL responds.
// 3. Compile main process TS (one-shot, no watch — main code is small).
// 4. Launch Electron pointed at the dev URL via AIM_DEV_URL.

import { spawn } from "node:child_process";
import { setTimeout as wait } from "node:timers/promises";

const DEV_URL = "http://localhost:5173";

function run(cmd, args, opts = {}) {
  const p = spawn(cmd, args, { stdio: "inherit", shell: false, ...opts });
  p.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      process.exit(code);
    }
  });
  return p;
}

async function waitForUrl(url, timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await wait(200);
  }
  throw new Error(`Vite dev server did not become ready at ${url}`);
}

async function main() {
  const vite = run("npx", ["vite", "--config", "vite.config.electron.ts"]);

  try {
    await waitForUrl(DEV_URL);
  } catch (err) {
    vite.kill();
    console.error(err.message);
    process.exit(1);
  }

  // Compile main process once so Electron has dist-electron/main/main.js to load.
  const tsc = run("npx", ["tsc", "-p", "tsconfig.main.json"]);
  await new Promise((resolve) => tsc.on("exit", resolve));

  const electron = run("npx", ["electron", "."], {
    env: { ...process.env, AIM_DEV_URL: DEV_URL },
  });

  const shutdown = () => {
    electron.kill();
    vite.kill();
    process.exit(0);
  };
  electron.on("exit", shutdown);
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
