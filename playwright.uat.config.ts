import { defineConfig, devices } from "@playwright/test";

require("dotenv").config({ path: ".env" });

export default defineConfig({
  testDir: "./apps/web/playwright/uat/auth",
  outputDir: "artifacts/uat/auth/test-results",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 15_000 },
  reporter: [
    ["list"],
    ["html", { outputFolder: "artifacts/uat/auth/playwright-report", open: "never" }],
    ["junit", { outputFile: "artifacts/uat/auth/junit.xml" }],
    ["json", { outputFile: "artifacts/uat/auth/results.json" }],
  ],
  use: {
    baseURL: process.env.UAT_BASE_URL ?? "http://localhost:3000",
    launchOptions: { slowMo: 250 },
    trace: "on",
    screenshot: "on",
    video: "on",
    permissions: ["clipboard-read", "clipboard-write"],
  },
  projects: [
    {
      name: "uat-auth-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
