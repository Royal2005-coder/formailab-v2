import { type Page, type TestInfo, expect, test } from "@playwright/test";

const workspaceId = process.env.PLAYWRIGHT_PRODUCTION_WORKSPACE_ID;
const surveyId = process.env.PLAYWRIGHT_PRODUCTION_SURVEY_ID;

const attachScreenshot = async (page: Page, testInfo: TestInfo, name: string): Promise<void> => {
  const screenshot = await page.screenshot({ fullPage: true });
  await testInfo.attach(name, { body: screenshot, contentType: "image/png" });
};

test.describe("AI LAB production evidence", () => {
  test("health dependencies are available", async ({ request }, testInfo) => {
    const startedAt = Date.now();
    const response = await request.get("/health");
    const elapsedMs = Date.now() - startedAt;
    const body = await response.json();

    await testInfo.attach("health-response.json", {
      body: Buffer.from(JSON.stringify({ elapsedMs, status: response.status(), body }, null, 2)),
      contentType: "application/json",
    });

    expect(response.status()).toBe(200);
    expect(body).toEqual({ status: "ok" });
    expect(elapsedMs).toBeLessThan(5_000);

    const dependencyResponse = await request.get("/api/v2/health");
    const dependencyBody = await dependencyResponse.json();
    await testInfo.attach("dependency-health-response.json", {
      body: Buffer.from(JSON.stringify(dependencyBody, null, 2)),
      contentType: "application/json",
    });
    expect(dependencyResponse.status()).toBe(200);
    expect(dependencyBody).toMatchObject({
      data: { main_database: true, cache_database: true },
    });
  });

  test("protected AI LAB route redirects unauthenticated visitors", async ({ page }, testInfo) => {
    test.skip(!workspaceId, "PLAYWRIGHT_PRODUCTION_WORKSPACE_ID is required");

    await page.goto("/workspaces", { waitUntil: "networkidle" });
    await expect(page).toHaveTitle(/AILAB Survey/i);
    await attachScreenshot(page, testInfo, "workspaces.png");

    const response = await page.goto(`/workspaces/${workspaceId}/ai-lab-survey`, {
      waitUntil: "networkidle",
    });
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(/Login \| AILAB Survey/i);
    await expect(page).toHaveURL(/\/auth\/login/);
    await attachScreenshot(page, testInfo, "ai-lab-auth-guard.png");
  });

  test("production Excel template is downloadable", async ({ request }, testInfo) => {
    const response = await request.get("/sample-csv/AILAB_120Q_Advanced_Adaptive_2026_Master_Template.xlsx");
    const body = await response.body();

    await testInfo.attach("template-metadata.json", {
      body: Buffer.from(
        JSON.stringify(
          {
            status: response.status(),
            contentType: response.headers()["content-type"],
            bytes: body.length,
          },
          null,
          2
        )
      ),
      contentType: "application/json",
    });

    expect(response.status()).toBe(200);
    expect(body.length).toBeGreaterThan(100_000);
    expect(body.subarray(0, 2).toString("ascii")).toBe("PK");
  });

  test("published adaptive survey renders on desktop and mobile", async ({ page }, testInfo) => {
    test.skip(!surveyId, "PLAYWRIGHT_PRODUCTION_SURVEY_ID is required");

    const response = await page.goto(`/s/${surveyId}?preview=true`, {
      waitUntil: "networkidle",
      timeout: 120_000,
    });
    expect(response?.status()).toBe(200);
    await expect(page.locator("body")).toContainText(/AI LAB|Đánh giá|khảo sát/i);
    await attachScreenshot(page, testInfo, "adaptive-survey-desktop.png");

    const buttons = await page.getByRole("button").allTextContents();
    await testInfo.attach("visible-buttons.json", {
      body: Buffer.from(JSON.stringify(buttons, null, 2)),
      contentType: "application/json",
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator("body")).toContainText(/AI LAB|Đánh giá|khảo sát/i);
    await attachScreenshot(page, testInfo, "adaptive-survey-mobile.png");
  });

  test("CONSENT=N follows the terminal decline route", async ({ page }, testInfo) => {
    test.skip(!surveyId, "PLAYWRIGHT_PRODUCTION_SURVEY_ID is required");

    await page.goto(`/s/${surveyId}?preview=true`, { waitUntil: "networkidle", timeout: 120_000 });
    await page.getByRole("button", { name: "Next" }).click();
    await expect(
      page.getByText("Bạn đồng ý tham gia bài đánh giá và sử dụng câu trả lời để tính kết quả?")
    ).toBeVisible();

    await page.getByText("Không", { exact: true }).click();
    await page.getByRole("button", { name: "Next" }).click();

    await expect(page.getByText("Cảm ơn bạn.", { exact: false })).toBeVisible();
    await expect(page.getByText("Bạn muốn thực hiện bộ đánh giá nào?", { exact: true })).not.toBeVisible();
    await attachScreenshot(page, testInfo, "consent-decline-terminal-route.png");
  });
});
