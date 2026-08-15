import { Page, Response, expect } from "@playwright/test";
import { prisma } from "@formbricks/database";
import { test } from "../../lib/fixtures";
import authTestCases from "./auth-test-cases.json";

type AuthTestCase = (typeof authTestCases)[number];

const RUN_ID = `${Date.now()}-${process.pid}`;
const TEST_PASSWORD = "UatAuth123!";
const INVALID_PASSWORD = "WrongPass999!";
const createdEmails = new Set<string>();
const EMAIL_LOGIN_BUTTON = /^(Log in with Email|Đăng nhập bằng Email)$/;
const RESET_PASSWORD_BUTTON = /^(Reset password|Đặt lại mật khẩu)$/i;
const LOGOUT_MENU_ITEM = /^(Log out|Đăng xuất)$/;
const INVALID_RESET_LINK_MESSAGE =
  /^(The link you used is no longer valid\.|Liên kết bạn đã sử dụng không còn hợp lệ nữa\.)$/;

const getTestCase = (id: string): AuthTestCase => {
  const testCase = authTestCases.find((candidate) => candidate.id === id);
  if (!testCase) throw new Error(`Missing UAT metadata for ${id}`);
  return testCase;
};

const escapeHtml = (value: string): string =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

const details = (id: string) => {
  const testCase = getTestCase(id);
  return {
    tag: ["@uat", "@auth", `@${id}`],
    annotation: [
      { type: "test-case-id", description: testCase.id },
      { type: "test-type", description: testCase.type },
      { type: "requirement", description: testCase.expected },
    ],
  };
};

const emailFor = (id: string): string => {
  const email = `uat-auth-${RUN_ID}-${id.toLowerCase()}@example.com`;
  createdEmails.add(email);
  return email;
};

interface MailHogMessage {
  Content?: {
    Body?: string;
    Headers?: Record<string, string[]>;
  };
  Raw?: {
    Data?: string;
    From?: string;
    To?: string[];
  };
  To?: Array<{ Mailbox?: string; Domain?: string }>;
}

const openEmailLogin = async (page: Page): Promise<void> => {
  await page.getByRole("button", { name: EMAIL_LOGIN_BUTTON }).click();
  await expect(page.getByPlaceholder("work@email.com")).toBeVisible();
};

const submitEmailLogin = async (page: Page, email: string, password: string): Promise<Response> => {
  await openEmailLogin(page);
  await page.getByPlaceholder("work@email.com").fill(email);
  await page.getByPlaceholder("*******").fill(password);
  const responsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/auth/sign-in/email") && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: EMAIL_LOGIN_BUTTON }).click();
  return responsePromise;
};

const openEmailSignup = async (page: Page): Promise<boolean> => {
  const response = await page.goto("/auth/signup");
  if (response?.status() === 404) return false;
  const signupButton = page.getByTestId("signup-show-login");
  const signupAvailable = await signupButton.isVisible({ timeout: 5_000 }).catch(() => false);
  if (!signupAvailable) return false;
  await signupButton.click();
  await expect(page.getByTestId("signup-name")).toBeVisible();
  return true;
};

const fillSignup = async (page: Page, name: string, email: string, password: string): Promise<void> => {
  await page.getByTestId("signup-name").fill(name);
  await page.getByTestId("signup-email").fill(email);
  await page.getByTestId("signup-password").fill(password);
};

const waitForSignupOutcome = async (page: Page): Promise<void> => {
  await page.getByTestId("signup-submit").click();
  await page.waitForURL(/\/auth\/(verification-requested|signup-without-verification-success)/, {
    timeout: 30_000,
  });
};

const getLoginError = async (page: Page): Promise<string> => {
  const toast = page.getByRole("status").filter({ hasText: /\S/ }).last();
  await expect(
    toast,
    "Credential rejection must show a clear, enumeration-safe error to the end user"
  ).toBeVisible({ timeout: 5_000 });
  return (await toast.innerText()).trim();
};

const decodeQuotedPrintableForAssertion = (value: string): string =>
  value
    .replace(/=\r?\n/g, "")
    .replace(/=3D/gi, "=")
    .replace(/%2F/gi, "/");

const getMailHogUrl = (): string => process.env.UAT_MAILHOG_URL ?? "http://127.0.0.1:8025";

const isMailHogAvailable = async (): Promise<boolean> => {
  try {
    const response = await fetch(`${getMailHogUrl()}/api/v2/messages`);
    return response.ok;
  } catch {
    return false;
  }
};

const purgeMailHog = async (): Promise<void> => {
  await fetch(`${getMailHogUrl()}/api/v1/messages`, { method: "DELETE" });
};

const getMailHogMessages = async (): Promise<MailHogMessage[]> => {
  const response = await fetch(`${getMailHogUrl()}/api/v2/messages`);
  if (!response.ok) return [];
  const body = (await response.json()) as { items?: MailHogMessage[] };
  return body.items ?? [];
};

const waitForPasswordResetEmail = async (email: string): Promise<MailHogMessage> => {
  await expect
    .poll(
      async () => {
        const messages = await getMailHogMessages();
        return messages.find((message) =>
          JSON.stringify(message).toLowerCase().includes(email.toLowerCase())
        );
      },
      { timeout: 20_000 }
    )
    .not.toBeUndefined();

  const messages = await getMailHogMessages();
  const message = messages.find((candidate) =>
    JSON.stringify(candidate).toLowerCase().includes(email.toLowerCase())
  );
  if (!message) throw new Error(`MailHog did not retain the reset email for ${email}`);
  return message;
};

test.describe("UT01 - Xác thực và phiên đăng nhập", () => {
  test.afterEach(async ({ page }, testInfo) => {
    const id = testInfo.title.match(/AUTH-\d{3}/)?.[0];
    if (!id) return;

    const testCase = getTestCase(id);
    const status =
      testInfo.status === "skipped" ? "Blocked" : testInfo.status === "passed" ? "Passed" : "Failed";
    const finalUrl = page.isClosed() ? "Browser closed" : page.url();
    const error = testInfo.errors[0]?.message ?? "";
    const evidence = [
      `Test case: ${testCase.id} - ${testCase.title}`,
      `Type: ${testCase.type}`,
      `Status: ${status}`,
      `Expected: ${testCase.expected}`,
      `Checkpoint: ${testCase.checkpoint}`,
      `Final URL: ${finalUrl}`,
      ...(error ? [`Error: ${error}`] : []),
    ].join("\n");

    await testInfo.attach("UAT result", {
      body: Buffer.from(evidence),
      contentType: "text/plain",
    });
    if (page.isClosed()) return;

    await testInfo.attach("Actual UI evidence", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });

    const statusColor = status === "Passed" ? "#15803d" : status === "Blocked" ? "#a16207" : "#b91c1c";
    await page.setContent(`
      <main style="font-family:Arial,sans-serif;max-width:1100px;margin:40px auto;padding:36px;color:#172033">
        <header style="display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid ${statusColor};padding-bottom:20px">
          <div><small>AILAB SURVEY AUTH UAT</small><h1 style="margin:8px 0 0">${escapeHtml(testCase.id)} - ${escapeHtml(testCase.title)}</h1></div>
          <strong style="font-size:28px;color:white;background:${statusColor};padding:12px 22px;border-radius:8px">${status}</strong>
        </header>
        <section style="display:grid;grid-template-columns:180px 1fr;gap:16px;margin-top:28px;font-size:18px;line-height:1.5">
          <strong>Test type</strong><span>${escapeHtml(testCase.type)}</span>
          <strong>Expected result</strong><span>${escapeHtml(testCase.expected)}</span>
          <strong>Checkpoint</strong><span>${escapeHtml(testCase.checkpoint)}</span>
          <strong>Actual result</strong><span>${status === "Passed" ? "All automated assertions and database checkpoints passed." : status === "Blocked" ? "Test prerequisite is unavailable on this deployment." : "One or more automated assertions failed."}</span>
          <strong>Final URL</strong><code style="overflow-wrap:anywhere">${escapeHtml(finalUrl)}</code>
          ${error ? `<strong>Error / reason</strong><pre style="white-space:pre-wrap;margin:0;color:${statusColor}">${escapeHtml(error)}</pre>` : ""}
        </section>
        <footer style="margin-top:32px;padding-top:18px;border-top:1px solid #cbd5e1;color:#475569">Generated by Playwright UAT automation</footer>
      </main>
    `);
    await testInfo.attach("UAT verdict", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
    await page.waitForTimeout(2_000);
  });

  test.afterAll(async () => {
    const users = await prisma.user.findMany({
      where: { email: { in: [...createdEmails] } },
      select: { id: true, memberships: { select: { organizationId: true } } },
    });
    const organizationIds = [
      ...new Set(users.flatMap((user) => user.memberships.map((m) => m.organizationId))),
    ];
    if (organizationIds.length > 0) {
      await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
    }
    if (users.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
    }
  });

  test("AUTH-001 | đăng nhập đúng email và mật khẩu", details("AUTH-001"), async ({ page, users }) => {
    const email = emailFor("AUTH-001");
    const user = await users.create({ name: TEST_PASSWORD, email, workspaceName: "AUTH-001 Private" });
    const callbackPath = `/workspaces/${user.workspaceId}`;

    await page.goto(`/auth/login?callbackUrl=${encodeURIComponent(callbackPath)}`);
    const response = await submitEmailLogin(page, email, TEST_PASSWORD);

    expect(response.ok()).toBeTruthy();
    await expect(page).toHaveURL(new RegExp(`${callbackPath.replaceAll("/", "\\/")}(?:[/?#]|$)`));
    await expect(page).not.toHaveURL(/\/auth\/login/);
    await expect.poll(() => prisma.session.count({ where: { userId: user.id } })).toBe(1);
  });

  test("AUTH-002 | sai mật khẩu", details("AUTH-002"), async ({ page, users }) => {
    const email = emailFor("AUTH-002");
    const user = await users.create({ name: TEST_PASSWORD, email });

    await page.goto("/auth/login");
    const response = await submitEmailLogin(page, email, INVALID_PASSWORD);
    const errorText = await getLoginError(page);

    expect(response.ok()).toBeFalsy();
    expect(errorText).toMatch(/invalid|incorrect|credential|email|password/i);
    await expect(page).toHaveURL(/\/auth\/login/);
    await expect.poll(() => prisma.session.count({ where: { userId: user.id } })).toBe(0);
  });

  test("AUTH-003 | email chưa đăng ký", details("AUTH-003"), async ({ page }) => {
    const email = emailFor("AUTH-003");
    await prisma.user.deleteMany({ where: { email } });
    const sessionCountBefore = await prisma.session.count();

    await page.goto("/auth/login");
    const response = await submitEmailLogin(page, email, INVALID_PASSWORD);
    const errorText = await getLoginError(page);

    expect(response.ok()).toBeFalsy();
    expect(errorText).toMatch(/invalid|incorrect|credential|email|password/i);
    expect(errorText.toLowerCase()).not.toContain(email.toLowerCase());
    await expect(page).toHaveURL(/\/auth\/login/);
    expect(await prisma.session.count()).toBe(sessionCountBefore);
    expect(await prisma.user.count({ where: { email } })).toBe(0);
  });

  test("AUTH-004 | bỏ trống trường bắt buộc", details("AUTH-004"), async ({ page }) => {
    let signInRequests = 0;
    page.on("request", (request) => {
      if (request.url().includes("/api/auth/sign-in/email") && request.method() === "POST") {
        signInRequests += 1;
      }
    });

    await page.goto("/auth/login");
    await openEmailLogin(page);
    await page.getByPlaceholder("*******").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: EMAIL_LOGIN_BUTTON }).click();
    await expect(page.locator("#email:invalid")).toBeVisible();

    await page.getByPlaceholder("work@email.com").fill("required@example.com");
    await page.getByPlaceholder("*******").fill("");
    await page.getByRole("button", { name: EMAIL_LOGIN_BUTTON }).click();
    await expect(page.locator("#password:invalid")).toBeVisible();
    expect(signInRequests).toBe(0);
  });

  test("AUTH-005 | đăng xuất", details("AUTH-005"), async ({ page, users }) => {
    const email = emailFor("AUTH-005");
    const user = await users.create({ name: TEST_PASSWORD, email, workspaceName: "AUTH-005 Private" });
    await user.login();
    const protectedPath = `/workspaces/${user.workspaceId}`;
    await page.goto(protectedPath);
    await expect(page).not.toHaveURL(/\/auth\/login/);

    await page.locator("#userDropdownTrigger").click();
    const signOutResponsePromise = page.waitForResponse(
      (response) => response.url().includes("/api/auth/sign-out") && response.request().method() === "POST"
    );
    await page.getByRole("menuitem", { name: LOGOUT_MENU_ITEM }).click();
    expect((await signOutResponsePromise).ok()).toBeTruthy();
    await expect(page).toHaveURL(/\/auth\/login/);
    await expect.poll(() => prisma.session.count({ where: { userId: user.id } })).toBe(0);

    await page.goto(protectedPath);
    await expect(page).toHaveURL(/\/auth\/login(?:\?callbackUrl=|$)/);
  });

  test("AUTH-006 | đăng ký tài khoản hợp lệ", details("AUTH-006"), async ({ page }) => {
    const email = emailFor("AUTH-006");
    test.skip(!(await openEmailSignup(page)), "Blocked: public signup is disabled on this deployment");
    await fillSignup(page, "UAT AUTH 006", email.toUpperCase(), "UatAuth006!");
    await waitForSignupOutcome(page);

    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    expect(user).not.toBeNull();
    expect(await prisma.user.count({ where: { email } })).toBe(1);
    expect(await prisma.account.count({ where: { userId: user?.id, provider: "credential" } })).toBe(1);
    expect(await prisma.session.count({ where: { userId: user?.id } })).toBe(0);
  });

  test("AUTH-007 | đăng ký bằng email đã tồn tại", details("AUTH-007"), async ({ page, users }) => {
    const email = emailFor("AUTH-007");
    const user = await users.create({ name: TEST_PASSWORD, email });
    const userCountBefore = await prisma.user.count({ where: { email } });
    const accountCountBefore = await prisma.account.count({ where: { userId: user.id } });

    test.skip(!(await openEmailSignup(page)), "Blocked: public signup is disabled on this deployment");
    await fillSignup(page, "UAT AUTH Duplicate", email.toUpperCase(), "UatAuth007!");
    await waitForSignupOutcome(page);

    expect(await prisma.user.count({ where: { email } })).toBe(userCountBefore);
    expect(await prisma.account.count({ where: { userId: user.id } })).toBe(accountCountBefore);
  });

  test("AUTH-008 | mật khẩu không đạt yêu cầu", details("AUTH-008"), async ({ page }) => {
    const email = emailFor("AUTH-008");
    let signupRequests = 0;
    page.on("request", (request) => {
      if (request.url().includes("/api/auth/sign-up/email") && request.method() === "POST") {
        signupRequests += 1;
      }
    });

    test.skip(!(await openEmailSignup(page)), "Blocked: public signup is disabled on this deployment");
    await fillSignup(page, "UAT AUTH 008", email, "weak");
    await expect(page.getByTestId("signup-submit")).toBeDisabled();
    expect(signupRequests).toBe(0);
    expect(await prisma.user.count({ where: { email } })).toBe(0);

    await page.getByTestId("signup-password").fill("UatAuth008!");
    await expect(page.getByTestId("signup-submit")).toBeEnabled();
  });

  test("AUTH-009 | yêu cầu quên mật khẩu", details("AUTH-009"), async ({ page, users }) => {
    const mailHogAvailable = await isMailHogAvailable();
    test.skip(!mailHogAvailable, `Blocked: MailHog unavailable at ${getMailHogUrl()}`);
    await purgeMailHog();

    const email = emailFor("AUTH-009");
    await users.create({ name: TEST_PASSWORD, email });
    await page.goto("/auth/forgot-password");
    await page.locator('input[name="email"]').fill(email);
    await page.getByRole("button", { name: RESET_PASSWORD_BUTTON }).click();
    await expect(page).toHaveURL(/\/auth\/forgot-password\/email-sent/);

    const message = await waitForPasswordResetEmail(email);
    const recipient =
      message.To?.map(({ Mailbox, Domain }) => `${Mailbox}@${Domain}`) ?? message.Raw?.To ?? [];
    const decodedMessage = decodeQuotedPrintableForAssertion(
      message.Content?.Body ?? message.Raw?.Data ?? ""
    );
    expect(recipient.map((value) => value.toLowerCase())).toContain(email.toLowerCase());
    expect(decodedMessage).toContain("/api/auth/reset-password/");
    expect(decodedMessage).toContain("/auth/forgot-password/reset");
  });

  test("AUTH-010 | reset link không hợp lệ", details("AUTH-010"), async ({ page, users }) => {
    const email = emailFor("AUTH-010");
    const user = await users.create({ name: TEST_PASSWORD, email });
    const accountBefore = await prisma.account.findFirstOrThrow({
      where: { userId: user.id, provider: "credential" },
      select: { password: true },
    });

    await page.goto("/auth/forgot-password/reset?token=uat-invalid-reset-token");
    await page.locator("#password").fill("UatAuth010New!");
    await page.locator("#confirmPassword").fill("UatAuth010New!");
    await page.getByRole("button", { name: RESET_PASSWORD_BUTTON }).click();
    await expect(page.getByText(INVALID_RESET_LINK_MESSAGE)).toBeVisible();

    const accountAfter = await prisma.account.findFirstOrThrow({
      where: { userId: user.id, provider: "credential" },
      select: { password: true },
    });
    expect(accountAfter.password).toBe(accountBefore.password);
  });

  test("AUTH-011 | đăng nhập OAuth thành công", details("AUTH-011"), async ({ page }) => {
    const buttonName = process.env.UAT_OAUTH_BUTTON_NAME;
    const username = process.env.UAT_OAUTH_USERNAME;
    const password = process.env.UAT_OAUTH_PASSWORD;
    const expectedEmail = process.env.UAT_OAUTH_EXPECTED_EMAIL?.toLowerCase();
    test.skip(
      !buttonName || !username || !password || !expectedEmail,
      "Blocked: set UAT_OAUTH_BUTTON_NAME, UAT_OAUTH_USERNAME, UAT_OAUTH_PASSWORD and UAT_OAUTH_EXPECTED_EMAIL"
    );

    const oauthEmail = expectedEmail!;
    const userCountBefore = await prisma.user.count({ where: { email: oauthEmail } });
    await page.goto("/auth/login");
    await page.getByRole("button", { name: buttonName, exact: true }).click();
    await page.locator(process.env.UAT_OAUTH_USERNAME_SELECTOR ?? 'input[name="username"]').fill(username!);
    await page.locator(process.env.UAT_OAUTH_PASSWORD_SELECTOR ?? 'input[name="password"]').fill(password!);
    await page.locator(process.env.UAT_OAUTH_SUBMIT_SELECTOR ?? 'button[type="submit"]').click();
    if (process.env.UAT_OAUTH_CONSENT_SELECTOR) {
      await page.locator(process.env.UAT_OAUTH_CONSENT_SELECTOR).click();
    }
    await page.waitForURL(
      (url) => url.origin === "http://localhost:3000" && !url.pathname.startsWith("/auth"),
      {
        timeout: 60_000,
      }
    );

    const mappedUsers = await prisma.user.findMany({
      where: { email: oauthEmail },
      select: { id: true, accounts: { select: { provider: true } } },
    });
    expect(mappedUsers).toHaveLength(1);
    expect(mappedUsers[0].accounts.some((account) => account.provider !== "credential")).toBeTruthy();
    expect(mappedUsers.length).toBe(Math.max(1, userCountBefore));
  });

  test("AUTH-012 | route bảo vệ khi chưa đăng nhập", details("AUTH-012"), async ({ page, users }) => {
    const email = emailFor("AUTH-012");
    const privateWorkspaceName = `AUTH-012 PRIVATE ${RUN_ID}`;
    const user = await users.create({ name: TEST_PASSWORD, email, workspaceName: privateWorkspaceName });
    const protectedPath = `/workspaces/${user.workspaceId}`;

    await page.goto(protectedPath);
    await expect(page).toHaveURL(/\/auth\/login(?:\?callbackUrl=|$)/);
    await expect(page.getByText(privateWorkspaceName)).toHaveCount(0);

    await page.reload();
    await expect(page).toHaveURL(/\/auth\/login/);
    await expect(page.getByText(privateWorkspaceName)).toHaveCount(0);
  });
});
