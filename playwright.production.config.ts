import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_PRODUCTION_BASE_URL ?? "https://formailab.royalai.dev";
const target = new URL(baseURL);
const mutationEnabled = process.env.PLAYWRIGHT_PRODUCTION_MUTATION === "1";

if (target.protocol !== "https:" || target.hostname !== "formailab.royalai.dev") {
  throw new Error("Production smoke tests may only target https://formailab.royalai.dev");
}

export default defineConfig({
  testDir: "./apps/web/playwright/production",
  outputDir: "test-results/production",
  fullyParallel: false,
  workers: 1,
  retries: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report/production", open: "never" }],
    ["junit", { outputFile: "test-results/production/junit.xml" }],
    ["json", { outputFile: "test-results/production/results.json" }],
  ],
  projects: [
    {
      name: "production-browser",
      testIgnore: [
        "**/full-testbank-oracle.spec.ts",
        ...(!mutationEnabled ? ["**/ai-lab-import-production.spec.ts"] : []),
      ],
      use: {
        ...devices["Desktop Chrome"],
        baseURL,
        trace: "on",
        screenshot: "on",
        video: "on",
        ignoreHTTPSErrors: false,
      },
    },
    {
      name: "testbank-node-oracle",
      testMatch: "**/full-testbank-oracle.spec.ts",
    },
  ],
});
