import { type Page, expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { prisma } from "@formbricks/database";
import {
  type TBrowserRoute,
  activeCard,
  advance,
  clickControl,
  getSurveyId,
  routes,
  runRoute,
} from "./full-testbank-browser";

const enabled = process.env.PLAYWRIGHT_PRODUCTION_SYSTEM_CASES === "1";
const route = (caseId: string): TBrowserRoute => {
  const match = routes.find((candidate) => candidate.routeCase.Case_ID === caseId);
  if (!match) throw new Error(`Missing route fixture ${caseId}`);
  return match;
};

const run = async (
  page: Page,
  testInfo: Parameters<typeof runRoute>[2],
  caseId: string,
  options?: Parameters<typeof runRoute>[3]
) => {
  test.setTimeout(300_000);
  return runRoute(page, route(caseId), testInfo, options);
};

const latestResponse = async (createdAfter: Date) => {
  const surveyId = getSurveyId();
  if (!surveyId) throw new Error("An isolated full-route fixture is required");
  await expect
    .poll(
      () => prisma.response.count({ where: { surveyId, createdAt: { gte: createdAfter }, finished: true } }),
      { timeout: 15_000 }
    )
    .toBeGreaterThan(0);
  return prisma.response.findFirstOrThrow({
    where: { surveyId, createdAt: { gte: createdAfter }, finished: true },
    orderBy: { createdAt: "desc" },
  });
};

const expectExactCodes = (actual: string[], included: RegExp, excluded: RegExp): void => {
  expect(actual.filter((code) => included.test(code))).not.toEqual([]);
  expect(actual.filter((code) => excluded.test(code))).toEqual([]);
};

test.describe("AI LAB workbook UI system cases", () => {
  test.skip(!enabled, "Set PLAYWRIGHT_PRODUCTION_SYSTEM_CASES=1 to run the 35 workbook system cases");
  test.skip(!getSurveyId(), "The isolated full-route fixture is required");

  test("[integration] SYS-DRAFT-001: canonical import replay has one survey and version", async () => {
    const state = await prisma.survey.findUniqueOrThrow({
      where: { id: getSurveyId() },
      select: { aiLabRegistry: { select: { id: true, surveyId: true } } },
    });
    expect(state.aiLabRegistry?.surveyId).toBe(getSurveyId());
    expect(await prisma.aILabSurveyVersion.count({ where: { registryId: state.aiLabRegistry?.id } })).toBe(1);
    expect(await prisma.survey.count({ where: { aiLabRegistry: { id: state.aiLabRegistry?.id } } })).toBe(1);
  });

  test("[browser-ui] SYS-CONSENT-YES: consent reveals bank and assessment", async ({ page }, testInfo) => {
    const evidence = await run(page, testInfo, "E2E-B1-L1");
    expect(evidence.renderedQuestionCodes).toContain("VR001");
    expect(evidence.visitedCards).not.toContainEqual(expect.stringMatching(/^DECLINE_END$/));
  });

  test("[browser-ui] SYS-CONSENT-NO: decline bypasses all banks", async ({ page }, testInfo) => {
    const evidence = await run(page, testInfo, "E2E-CONSENT-NO");
    expect(evidence.renderedQuestionCodes).toEqual([]);
    expect(evidence.visitedCards.join(" ")).not.toMatch(/VR001|VC001|VG001|WR001|MT001|ET001|STR1|DG01/);
  });

  test("[browser-ui] SYS-BANK-EXCLUSIVE: each bank renders only its own scored questions", async ({
    page,
  }, testInfo) => {
    const cases = [
      ["E2E-B1-L1", /^(?:VR)\d+$/],
      ["E2E-B2-Y1-L1", /^(?:VC)\d+$/],
      ["E2E-B3-L1", /^(?:VG)\d+$/],
      ["E2E-B4-E-L1", /^(?:WR)\d+$/],
      ["E2E-B5-L1", /^(?:MT)\d+$/],
      ["E2E-B6-L1", /^(?:ET)\d+$/],
      ["E2E-B7-L1", /^(?:STR|ORG|DAT|TEC|PPL|GOV)\d+$/],
      ["E2E-B8-L1", /^(?:DG)\d+$/],
    ] as const;
    for (const [caseId, expectedCodes] of cases) {
      const evidence = await run(page, testInfo, caseId);
      expect(evidence.renderedQuestionCodes.length).toBeGreaterThan(0);
      expect(evidence.renderedQuestionCodes.every((code) => expectedCodes.test(code))).toBe(true);
    }
  });

  const yearCases = [
    ["SYS-B2-YEAR-1", "E2E-B2-Y1-L1", /^VC(?:00[1-9]|0[12]\d|030)$/, /^VC0(?:3[1-9]|[45]\d|60)$/],
    ["SYS-B2-YEAR-2", "E2E-B2-Y2-L1", /^VC(?:00[1-9]|0[12]\d|03\d|040)$/, /^VC0(?:2[1-9]|4[1-9]|5\d|60)$/],
    ["SYS-B2-YEAR-3", "E2E-B2-Y3-L1", /^VC(?:00[1-9]|0[12]\d|04\d|050)$/, /^VC0(?:2[1-9]|3\d|5[1-9]|60)$/],
    ["SYS-B2-YEAR-4", "E2E-B2-Y4-L1", /^VC(?:00[1-9]|0[12]\d|05\d|060)$/, /^VC0(?:2[1-9]|[34]\d)$/],
  ] as const;
  for (const [systemId, routeId, included, excluded] of yearCases) {
    test(`[browser-ui] ${systemId}: renders the exact year question set`, async ({ page }, testInfo) => {
      const evidence = await run(page, testInfo, routeId);
      expect(evidence.renderedQuestionCodes).toHaveLength(30);
      expectExactCodes(evidence.renderedQuestionCodes, included, excluded);
    });
  }

  test("[browser-ui] SYS-B4-ROLE-E: employee route excludes manager questions", async ({
    page,
  }, testInfo) => {
    const evidence = await run(page, testInfo, "E2E-B4-E-L1");
    expect(evidence.renderedQuestionCodes).toHaveLength(44);
    expectExactCodes(
      evidence.renderedQuestionCodes,
      /^WR0(?:0[1-9]|[1-3]\d|4[0-4])$/,
      /^WR0(?:4[5-9]|5\d|60|61)$/
    );
  });

  test("[browser-ui] SYS-B4-ROLE-M: manager route excludes employee-only questions", async ({
    page,
  }, testInfo) => {
    const evidence = await run(page, testInfo, "E2E-B4-M-L1");
    expect(evidence.renderedQuestionCodes).toHaveLength(45);
    expectExactCodes(
      evidence.renderedQuestionCodes,
      /^WR0(?:0[1-9]|[12]\d|4[5-9]|5\d|60|61)$/,
      /^WR0(?:29|3\d|4[0-4])$/
    );
  });

  test("[browser-ui] SYS-MANDATORY: empty required answer blocks navigation", async ({ page }) => {
    await page.goto(`/s/${getSurveyId()}?preview=true&qaBuild=${Date.now()}`);
    await advance(page, activeCard(page));
    const card = activeCard(page);
    const before = await card.getAttribute("id");
    await card.locator('button.border-submit-button-border:not([tabindex="-1"])').click();
    await expect(activeCard(page)).toHaveAttribute("id", before ?? "");
    await expect(card.getByText("Please fill out this field", { exact: true })).toBeVisible();
  });

  test("[browser-ui] SYS-OPTIONAL: optional post-assessment answers may be skipped", async ({
    page,
  }, testInfo) => {
    const evidence = await run(page, testInfo, "E2E-B1-L1");
    expect(evidence.visitedCards.join(" ")).toMatch(/Mức L1/);
  });

  test("[browser-ui] SYS-BACK: an answer survives Back and does not duplicate the response", async ({
    page,
  }) => {
    const started = new Date();
    await page.goto(`/s/${getSurveyId()}?preview=true&qaBuild=${Date.now()}`);
    await advance(page, activeCard(page));
    const consent = activeCard(page).getByRole("radio", { name: "Có", exact: true });
    await clickControl(consent);
    await advance(page, activeCard(page));
    await page.getByRole("button", { name: /Back|Quay lại/i }).click();
    await expect(consent).toBeChecked();
    expect(
      await prisma.response.count({ where: { surveyId: getSurveyId(), createdAt: { gte: started } } })
    ).toBeLessThanOrEqual(1);
  });

  test("[browser-ui] SYS-PROGRESS: progress advances during a completed route", async ({
    page,
  }, testInfo) => {
    const widths: number[] = [];
    page.on("request", () => undefined);
    const timer = setInterval(async () => {
      const width = await page
        .locator(".progress-indicator")
        .evaluate((element) => parseFloat((element as HTMLElement).style.width))
        .catch(() => undefined);
      if (width !== undefined) widths.push(width);
    }, 100);
    try {
      await run(page, testInfo, "E2E-B1-L1");
    } finally {
      clearInterval(timer);
    }
    expect(Math.max(...widths)).toBeGreaterThan(Math.min(...widths));
  });

  const persistedCases = [
    ["SYS-MULTI", "E2E-B1-L1"],
    ["SYS-MATRIX", "E2E-B1-L1"],
    ["SYS-RANKING", "E2E-B1-L1"],
    ["SYS-DATE-TEXT", "E2E-B1-L1"],
    ["SYS-NPS-MIN", "E2E-B1-L1"],
    ["SYS-NPS-MAX", "E2E-B1-L4"],
    ["SYS-REPORT-NO", "E2E-B1-L1"],
    ["SYS-REPORT-YES", "E2E-B1-L4"],
    ["SYS-EMAIL-VALID", "E2E-B1-L4"],
  ] as const;
  for (const [systemId, routeId] of persistedCases) {
    test(`[integration] ${systemId}: browser completion persists the accepted response`, async ({
      page,
    }, testInfo) => {
      const started = new Date();
      await run(page, testInfo, routeId, { preview: false, stopAtResult: false });
      const response = await latestResponse(started);
      expect(response.finished).toBe(true);
      expect(Object.keys(response.data as object).length).toBeGreaterThan(30);
    });
  }

  test("[integration] SYS-RATING: B7 endpoint ratings persist and produce endpoint scores", async ({
    page,
  }, testInfo) => {
    for (const [routeId, score] of [
      ["E2E-B7-L1", 0],
      ["E2E-B7-L4", 100],
    ] as const) {
      const started = new Date();
      await run(page, testInfo, routeId, { preview: false, stopAtResult: false });
      const response = await latestResponse(started);
      expect(JSON.stringify(response.variables)).toContain(String(score));
    }
  });

  test("[browser-ui] SYS-EMAIL-INVALID: invalid report email blocks completion", async ({
    page,
  }, testInfo) => {
    await run(page, testInfo, "E2E-B1-L4", {
      preview: true,
      stopAtResult: false,
      expectInvalidEmail: true,
    });
  });

  test("[browser-ui] SYS-SCORE-RECALL: an L4 result renders its calculated score", async ({
    page,
  }, testInfo) => {
    const evidence = await run(page, testInfo, "E2E-B1-L4");
    expect(evidence.visitedCards.join(" ")).toMatch(/100|Mức L4/);
    expect(evidence.visitedCards.join(" ")).not.toMatch(/\{[^}]+\}/);
  });

  test("[browser-ui] SYS-ONE-RESULT: one route renders one result statement", async ({ page }, testInfo) => {
    const evidence = await run(page, testInfo, "E2E-B8-L3");
    expect(evidence.visitedCards.filter((text) => /Mức L[1-4]|Chưa đủ độ phủ/.test(text))).toHaveLength(1);
  });

  test("[integration] SYS-NO-CROSS-BANK: B2 response has no other bank score answers", async ({
    page,
  }, testInfo) => {
    const started = new Date();
    await run(page, testInfo, "E2E-B2-Y2-L1", { preview: false, stopAtResult: false });
    const payload = JSON.stringify((await latestResponse(started)).data);
    expect(payload).not.toMatch(/VR001|VG001|WR001|MT001|ET001|STR1|DG01/);
  });

  test("[browser-ui] SYS-ANALYTICS-LABEL: analysis renders readable answer labels", async ({
    page,
  }, testInfo) => {
    await run(page, testInfo, "E2E-B1-L1", { preview: false, stopAtResult: false });
    const state = JSON.parse(readFileSync(".playwright-full-route-fixture.json", "utf8")) as {
      userId: string;
      workspaceId: string;
    };
    const user = await prisma.user.findUniqueOrThrow({ where: { id: state.userId } });
    await page.context().request.post("/api/auth/sign-in/email", {
      data: { email: user.email, password: user.name },
    });
    await page.goto(`/workspaces/${state.workspaceId}/surveys/${getSurveyId()}/summary`, {
      waitUntil: "networkidle",
    });
    await expect(page.locator("body")).toContainText(/VSAIC|Readiness|Mức L1|AI/i);
    await expect(page.locator("body")).toContainText("VR001");
    await expect(page.locator("body")).not.toContainText(/alqg[0-9a-f]+g[0-9a-f]+/i);
  });

  test("[integration] SYS-DROPOFF: abandoning after an answer leaves an unfinished response", async ({
    page,
  }) => {
    const started = new Date();
    await page.goto(`/s/${getSurveyId()}?qaBuild=${Date.now()}`);
    await advance(page, activeCard(page));
    await clickControl(activeCard(page).getByRole("radio", { name: "Có", exact: true }));
    await advance(page, activeCard(page));
    await expect
      .poll(() =>
        prisma.response.count({
          where: { surveyId: getSurveyId(), createdAt: { gte: started }, finished: false },
        })
      )
      .toBe(1);
  });

  test("[integration] SYS-COMPLETE: completion persists bank, score variables and result ending", async ({
    page,
  }, testInfo) => {
    const started = new Date();
    await run(page, testInfo, "E2E-B1-L3", { preview: false, stopAtResult: false });
    const response = await latestResponse(started);
    expect(response.finished).toBe(true);
    expect(response.endingId).toBeTruthy();
    expect(JSON.stringify(response.variables)).toMatch(/B1|66/);
  });

  for (const [systemId, routeId, expected, excluded] of [
    [
      "SYS-RICH-STUDENT",
      "E2E-B2-Y1-L1",
      /Xếp hạng các mục tiêu phát triển năng lực AI/i,
      /ứng dụng AI vào những công việc nào|giai đoạn nào của hành trình AI/i,
    ],
    [
      "SYS-RICH-WORK",
      "E2E-B5-L1",
      /ứng dụng AI vào những công việc nào/i,
      /mục tiêu phát triển năng lực AI|giai đoạn nào của hành trình AI/i,
    ],
    [
      "SYS-RICH-SME",
      "E2E-B7-L1",
      /giai đoạn nào của hành trình AI/i,
      /mục tiêu phát triển năng lực AI|ứng dụng AI vào những công việc nào/i,
    ],
  ] as const) {
    test(`[browser-ui] ${systemId}: renders only its segment post-assessment group`, async ({
      page,
    }, testInfo) => {
      const text = (
        await run(page, testInfo, routeId, { preview: true, stopAtResult: false })
      ).visitedCards.join(" ");
      expect(text).toMatch(expected);
      expect(text).not.toMatch(excluded);
    });
  }
});
