import { spawnSync } from "node:child_process";
import fs from "node:fs";
import process from "node:process";

fs.rmSync("artifacts/uat/auth/results.json", { force: true });

const playwright = spawnSync(
  process.platform === "win32" ? "pnpm.cmd" : "pnpm",
  ["exec", "playwright", "test", "-c", "playwright.uat.config.ts"],
  { cwd: process.cwd(), env: process.env, stdio: "inherit" }
);

const workbook = spawnSync(process.execPath, ["scripts/uat/update-auth-workbook.mjs"], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
});

if (workbook.status !== 0) process.exit(workbook.status ?? 1);
process.exit(playwright.status ?? 1);
