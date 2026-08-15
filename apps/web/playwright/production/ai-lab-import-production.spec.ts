import { type Page, type TestInfo, expect } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { test } from "../lib/fixtures";

const mutationEnabled = process.env.PLAYWRIGHT_PRODUCTION_MUTATION === "1";
const retainForFullRoutes = mutationEnabled && process.env.PLAYWRIGHT_PRODUCTION_FULL_ROUTES === "1";
const fixtureStatePath = ".playwright-full-route-fixture.json";
const fixturePath =
  process.env.PLAYWRIGHT_PRODUCTION_CSV_PATH ??
  "/work/Testbank/00_AILAB_LimeSurvey_Adaptive_v2_FULL_READY_QA_NOTED.csv";

const attachScreenshot = async (page: Page, testInfo: TestInfo, name: string): Promise<void> => {
  const screenshot = await page.screenshot({ fullPage: true });
  await testInfo.attach(name, { body: screenshot, contentType: "image/png" });
};

test.describe("AI LAB production import mutation", () => {
  test.skip(!mutationEnabled, "Set PLAYWRIGHT_PRODUCTION_MUTATION=1 to run isolated production writes");

  test("[browser-ui] SYS-IMPORT-001: validates and commits the full adaptive CSV with isolated cleanup", async ({
    page,
    users,
  }, testInfo) => {
    test.setTimeout(180_000);
    const runId = `pw-prod-${Date.now()}`;
    const user = await users.create({
      name: runId,
      email: `${runId}@example.com`,
      organizationName: `Playwright Production QA ${runId}`,
      workspaceName: `Playwright Production QA ${runId}`,
      skipSurveySeed: true,
    });

    try {
      expect(user.workspaceId).toBeTruthy();
      await user.login();
      await page.goto(`/workspaces/${user.workspaceId}/ai-lab-survey`, { waitUntil: "networkidle" });
      await expect(page).toHaveTitle(/AI LAB survey import/i);

      await page.locator("#ai-lab-survey-csv").setInputFiles(fixturePath);
      await expect(page.getByRole("heading", { name: "Canonical preview" })).toBeVisible({
        timeout: 120_000,
      });
      await expect(page.getByText("No import diagnostics.")).toBeVisible();
      await expect(page.getByText("Validated", { exact: true }).first()).toBeVisible();
      await expect(page.getByText("112", { exact: true }).first()).toBeVisible();
      await expect(page.getByText("508", { exact: true }).first()).toBeVisible();
      await attachScreenshot(page, testInfo, "full-csv-validation.png");

      const commitButton = page.getByRole("button", { name: "Create Formbricks draft" });
      await expect(commitButton).toBeEnabled();
      await commitButton.click();
      await expect(page).toHaveURL(new RegExp(`/workspaces/${user.workspaceId}/surveys/[^/]+/edit`), {
        timeout: 120_000,
      });
      const surveyId = page.url().match(/\/surveys\/([^/]+)\/edit/)?.[1];
      expect(surveyId).toBeTruthy();
      if (retainForFullRoutes && surveyId) {
        const { prisma } = await import("@formbricks/database");
        await prisma.survey.update({ where: { id: surveyId }, data: { status: "inProgress" } });
        writeFileSync(
          fixtureStatePath,
          JSON.stringify(
            {
              surveyId,
              userId: user.id,
              organizationId: user.organizationId,
              workspaceId: user.workspaceId,
            },
            null,
            2
          )
        );
      }
      await attachScreenshot(page, testInfo, "committed-formbricks-draft.png");

      await testInfo.attach("production-import-run.json", {
        body: Buffer.from(
          JSON.stringify(
            {
              runId,
              workspaceId: user.workspaceId,
              finalUrl: page.url(),
              fixture: fixturePath.split("/").pop(),
            },
            null,
            2
          )
        ),
        contentType: "application/json",
      });
    } finally {
      if (!retainForFullRoutes) {
        const { prisma } = await import("@formbricks/database");
        if (user.organizationId) {
          await prisma.organization.delete({ where: { id: user.organizationId } }).catch(() => undefined);
        }
        await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
      }
    }
  });
});
