import { chromium } from "playwright";

const email = process.env.AILAB_DEMO_EMAIL;
const password = process.env.AILAB_DEMO_PASSWORD;
const baseUrl = process.env.AILAB_DEMO_BASE_URL ?? "https://formailab.royalai.dev";
const workspaceId = process.env.AILAB_DEMO_WORKSPACE_ID;

if (!email || !password || !workspaceId) {
  throw new Error("AILAB_DEMO_EMAIL, AILAB_DEMO_PASSWORD and AILAB_DEMO_WORKSPACE_ID are required");
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ locale: "vi-VN" });
const page = await context.newPage();

try {
  const response = await context.request.post(`${baseUrl}/api/auth/sign-in/email`, {
    data: { email, password },
  });
  if (!response.ok()) {
    throw new Error(`Đăng nhập thất bại với HTTP ${response.status()}`);
  }

  await page.goto(`${baseUrl}/workspaces/${workspaceId}/surveys`, { waitUntil: "networkidle" });
  const result = {
    loginStatus: response.status(),
    finalUrl: page.url(),
    title: await page.title(),
    canAccessWorkspace: page.url().includes(`/workspaces/${workspaceId}/surveys`),
    seesSurveyList: await page.getByRole("heading", { name: "Khảo sát", exact: true }).isVisible(),
  };
  process.stdout.write(JSON.stringify(result));
} finally {
  await browser.close();
}
