import { type Locator, type Page, type TestInfo, expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

export type TBrowserAnswer = Readonly<{
  questionCode: string;
  questionLabel: string;
  kind: "singleChoice" | "rating";
  answerValue: string | number;
  range: number;
}>;

export type TBrowserRoute = Readonly<{
  routeCase: {
    Case_ID: string;
    Bank: string;
    Profile_Selection: string;
    Target_Route: string;
    Expected_Result_Question: string;
  };
  browserAnswers: TBrowserAnswer[];
  expectedResultText: string;
}>;

const fixtureStatePath = ".playwright-full-route-fixture.json";
export const getSurveyId = (): string | undefined => {
  if (existsSync(fixtureStatePath)) {
    return (JSON.parse(readFileSync(fixtureStatePath, "utf8")) as { surveyId: string }).surveyId;
  }
  return process.env.PLAYWRIGHT_PRODUCTION_SURVEY_ID;
};
const fullRoutesEnabled = process.env.PLAYWRIGHT_PRODUCTION_FULL_ROUTES === "1";
export const { routes } = JSON.parse(
  execFileSync(process.execPath, ["scripts/run-full-testbank-oracle.mjs"], { encoding: "utf8" })
) as { routes: TBrowserRoute[] };

const advanceButtonSelector = 'button.border-submit-button-border:not([tabindex="-1"])';
const bankLabels: Record<string, string> = {
  B1: "VSAIC Readiness",
  B2: "VSAIC Competency theo năm học",
  B3: "VSAIG Sinh viên",
  B4: "WAIC-VN Readiness theo vai trò",
  B5: "WAIC-VN Test Nhà quản lý",
  B6: "WAIC-VN Test Nhân viên",
  B7: "AIX-SME Readiness",
  B8: "DSAIG SME Governance",
};
export const activeCard = (page: Page): Locator =>
  page
    .locator('[id^="questionCard-"]')
    .filter({ has: page.locator(advanceButtonSelector) })
    .first();

export const clickControl = async (control: Locator): Promise<void> => {
  const label = control.locator("xpath=ancestor::label[1]");
  if ((await label.count()) > 0) await label.click();
  else await control.click();
};

export const advance = async (page: Page, card: Locator): Promise<boolean> => {
  const previousText = (await card.innerText()).trim();
  const button = card.locator(advanceButtonSelector);
  const finishesSurvey = /Finish|Hoàn thành/i.test(await button.innerText());
  await button.click();
  if (finishesSurvey) {
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 15_000 });
    return true;
  }
  await expect
    .poll(async () => (await activeCard(page).innerText()).trim(), { timeout: 15_000 })
    .not.toBe(previousText);
  return false;
};

const selectRadio = async (card: Locator, questionLabel: string, answerLabel: string): Promise<boolean> => {
  const group = card.getByRole("radiogroup", { name: questionLabel, exact: true });
  if (!(await group.isVisible().catch(() => false))) return false;
  const radio = group.getByRole("radio", { name: answerLabel, exact: true });
  await clickControl(radio);
  await expect(radio).toBeChecked();
  return true;
};

const selectBank = async (page: Page, card: Locator, bank: string): Promise<boolean> => {
  if (await selectRadio(card, "Bạn muốn thực hiện bộ đánh giá nào?", bankLabels[bank])) return true;
  const trigger = card.getByRole("button", { name: /Bạn muốn thực hiện bộ đánh giá nào\?/ });
  if (!(await trigger.isVisible().catch(() => false))) return false;
  await trigger.click();
  await page.getByRole("menuitemradio", { name: bankLabels[bank], exact: true }).click();
  return true;
};

const answerUnmappedCard = async (card: Locator, useInvalidEmail = false): Promise<boolean> => {
  let answered = false;
  const cardText = await card.innerText();
  const textInputs = card.locator(
    'input:not([type="hidden"]):not([type="file"]):not([type="radio"]):not([type="checkbox"]):not([type="button"]):not([type="submit"]), textarea'
  );
  for (let index = 0; index < (await textInputs.count()); index++) {
    const input = textInputs.nth(index);
    if (!(await input.isVisible().catch(() => false))) continue;
    const type = (await input.getAttribute("type")) ?? "text";
    const accessibleName = await input.getAttribute("aria-label");
    await input.fill(
      type === "email" || /email/i.test(accessibleName ?? "") || /Email nhận báo cáo/i.test(cardText)
        ? useInvalidEmail
          ? "invalid-email"
          : "qa@example.com"
        : type === "number"
          ? "5"
          : "Playwright QA"
    );
    answered = true;
  }

  const radios = card.locator('input[type="radio"]');
  const names = await radios.evaluateAll((elements) => [
    ...new Set(elements.map((element) => (element as HTMLInputElement).name)),
  ]);
  for (const name of names) {
    const checked = card.locator(`input[type="radio"][name="${name}"]:checked`);
    if ((await checked.count()) > 0) continue;
    await clickControl(card.locator(`input[type="radio"][name="${name}"]`).first());
    answered = true;
  }

  const checkboxes = card.getByRole("checkbox");
  if ((await checkboxes.count()) > 0) {
    await clickControl(checkboxes.first());
    answered = true;
  }
  const rankingButtons = card.getByRole("button", { name: /^Add .+ to ranking$/ });
  while ((await rankingButtons.count()) > 0) {
    await rankingButtons.first().click();
    answered = true;
  }
  const day = card.getByRole("gridcell").locator("button:not([disabled])").nth(10);
  if (await day.isVisible().catch(() => false)) {
    await day.click();
    answered = true;
  }
  return answered;
};

const stableResultText = (text: string): string => {
  const [beforeMarker = "", afterMarker = ""] = text.split(/Điểm:|Kết quả:/i);
  if (beforeMarker.trim()) return beforeMarker.trim().slice(0, 70);
  return afterMarker
    .replace(/^\s*\/100\.?\s*/, "")
    .split(".")[0]
    .trim()
    .slice(0, 70);
};
const normalizeText = (text: string): string => text.replace(/\s+/g, " ").trim();

export type TRouteEvidence = Readonly<{
  calculationCards: string[];
  renderedQuestionCodes: string[];
  visitedCards: string[];
}>;

export const runRoute = async (
  page: Page,
  route: TBrowserRoute,
  testInfo: TestInfo,
  options: Readonly<{ preview?: boolean; stopAtResult?: boolean; expectInvalidEmail?: boolean }> = {}
): Promise<TRouteEvidence> => {
  const preview = options.preview ?? true;
  const stopAtResult = options.stopAtResult ?? true;
  const pending = new Map(route.browserAnswers.map((answer) => [answer.questionCode, answer]));
  const calculationCards: string[] = [];
  const renderedQuestionCodes: string[] = [];
  const visitedCards: string[] = [];
  await page.setExtraHTTPHeaders({ "Cache-Control": "no-cache", Pragma: "no-cache" });
  await expect(async () => {
    await page.goto(`/s/${getSurveyId()}?${preview ? "preview=true&" : ""}qaBuild=${Date.now()}`, {
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    });
    await expect(activeCard(page)).toBeVisible({ timeout: 30_000 });
  }).toPass({ intervals: [1_000, 2_000], timeout: 180_000 });
  let card = activeCard(page);
  await advance(page, card);
  let resultSeen = false;
  let finished = false;

  try {
    for (let step = 0; step < 220; step++) {
      card = activeCard(page);
      const cardText = await card.innerText();
      visitedCards.push(normalizeText(cardText));
      if (/Điểm nhóm|Điểm tổng|0–100/i.test(cardText)) calculationCards.push(normalizeText(cardText));
      const resultFragment = stableResultText(route.expectedResultText);
      if (resultFragment && normalizeText(cardText).includes(normalizeText(resultFragment))) {
        resultSeen = true;
        if (stopAtResult) break;
      }
      if (/Mức L[1-4]|Chưa đủ độ phủ để xếp mức/i.test(cardText)) {
        expect(
          normalizeText(cardText),
          `${route.routeCase.Case_ID}: browser selected an unexpected result route`
        ).toContain(normalizeText(resultFragment));
      }

      let answered = false;
      answered =
        (await selectRadio(
          card,
          "Bạn đồng ý tham gia bài đánh giá và sử dụng câu trả lời để tính kết quả?",
          route.routeCase.Case_ID === "E2E-CONSENT-NO" ? "Không" : "Có"
        )) || answered;
      if (route.routeCase.Bank !== "-")
        answered = (await selectBank(page, card, route.routeCase.Bank)) || answered;

      const year = route.routeCase.Profile_Selection.match(/YEAR=(\d)/)?.[1];
      if (year) {
        answered = (await selectRadio(card, "Bạn đang là sinh viên năm mấy?", `Năm ${year}`)) || answered;
      }
      const role = route.routeCase.Profile_Selection.match(/ROLE=([EM])/)?.[1];
      if (role) {
        answered =
          (await selectRadio(
            card,
            "Vai trò hiện tại của Anh/Chị?",
            role === "E" ? "Nhân viên thừa hành / Chuyên viên" : "Nhân viên quản lý / Lãnh đạo"
          )) || answered;
      }

      for (const [questionCode, answer] of pending) {
        const group = card.getByRole("radiogroup", { name: answer.questionLabel, exact: true });
        if (!(await group.isVisible().catch(() => false))) continue;
        const name =
          answer.kind === "rating"
            ? `Rate ${answer.answerValue} out of ${answer.range}`
            : String(answer.answerValue);
        const control = group.getByRole("radio", { name, exact: true });
        await clickControl(control);
        await expect(control).toBeChecked();
        pending.delete(questionCode);
        renderedQuestionCodes.push(questionCode);
        answered = true;
      }

      if (!answered) answered = await answerUnmappedCard(card, options.expectInvalidEmail);

      const next = card.locator(advanceButtonSelector);
      expect(await next.isVisible(), `${route.routeCase.Case_ID}: no Next button at step ${step}`).toBe(true);
      const interactiveControls = card.locator("input:not([type='hidden']), textarea, [role='radiogroup']");
      if ((await interactiveControls.count()) > 0) {
        expect(answered, `${route.routeCase.Case_ID}: unmapped card at step ${step}: ${cardText}`).toBe(true);
      }
      if (options.expectInvalidEmail && /Email nhận báo cáo/i.test(cardText)) {
        await next.click();
        await expect(card.getByText("Please enter a valid email address", { exact: true })).toBeVisible();
        return { calculationCards, renderedQuestionCodes, visitedCards };
      }
      finished = await advance(page, card);
      if (finished) break;
    }

    expect([...pending.keys()], `${route.routeCase.Case_ID}: recipe questions not rendered`).toEqual([]);
    expect(resultSeen, `${route.routeCase.Case_ID}: expected result was not rendered`).toBe(true);
    if (stopAtResult) {
      const resultFragment = stableResultText(route.expectedResultText);
      await expect
        .poll(async () => normalizeText(await activeCard(page).innerText()))
        .toContain(normalizeText(resultFragment));
    } else {
      expect(finished, `${route.routeCase.Case_ID}: survey did not reach its ending`).toBe(true);
    }
    return { calculationCards, renderedQuestionCodes, visitedCards };
  } catch (error) {
    await testInfo.attach(`${route.routeCase.Case_ID}-failure.json`, {
      body: Buffer.from(
        JSON.stringify(
          {
            caseId: route.routeCase.Case_ID,
            remainingQuestions: [...pending.keys()],
            calculationCards,
            visitedCards,
            activeCardText: await activeCard(page)
              .innerText()
              .catch(() => "unavailable"),
            url: page.url(),
          },
          null,
          2
        )
      ),
      contentType: "application/json",
    });
    throw error;
  }
};

export const registerFullTestbankBrowserTests = (): void => {
  test.describe("AI LAB production browser routes", () => {
    test.skip(!fullRoutesEnabled, "Set PLAYWRIGHT_PRODUCTION_FULL_ROUTES=1 to run all route journeys");
    test.skip(!getSurveyId(), "PLAYWRIGHT_PRODUCTION_SURVEY_ID or isolated fixture is required");

    for (const route of routes) {
      test(`[browser-ui] ${route.routeCase.Case_ID}: selects ${route.routeCase.Target_Route}`, async ({
        page,
      }, testInfo) => {
        test.setTimeout(300_000);
        await runRoute(page, route, testInfo);
      });
    }
  });
};
