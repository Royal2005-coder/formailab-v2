import { describe, expect, test, vi } from "vitest";
import type { TJsWorkspaceStateSurvey } from "@formbricks/types/js";
import type { TConditionGroup } from "@formbricks/types/surveys/logic";
import { evaluateLogic } from "./logic";

vi.mock("@/lib/i18n", () => ({
  getLocalizedValue: (value: unknown, language: string) => {
    if (typeof value === "object" && value !== null) {
      const record = value as Record<string, unknown>;
      return (record[language] ?? record["default"] ?? "") as string;
    }
    return value as string;
  },
}));

describe("Score Routing & Variable Logic Evaluation", () => {
  const dummySurvey = {
    id: "survey_test_score",
    type: "link",
    title: "Test Score",
    defaultLanguage: "vi",
    languages: [
      {
        language: {
          id: "vi",
          createdAt: new Date(),
          updatedAt: new Date(),
          code: "vi",
          alias: "Vietnamese",
          workspaceId: "ws",
        },
        default: true,
        enabled: true,
      },
    ],
    blocks: [],
    variables: [
      { id: "VCSCORE", name: "VCSCORE", type: "number", value: 0 },
      { id: "GRADE", name: "GRADE", type: "text", value: "" },
    ],
    endings: [],
    welcomeCard: { enabled: false, timeToFinish: false, showResponseCount: false },
    hiddenFields: { enabled: false, fieldIds: [] },
  } as unknown as TJsWorkspaceStateSurvey;

  test("Evaluates numeric score variable against static string threshold", () => {
    const conditions: TConditionGroup = {
      id: "cg_1",
      connector: "and",
      conditions: [
        {
          id: "c_1",
          leftOperand: { type: "variable", value: "VCSCORE" },
          operator: "isGreaterThanOrEqual",
          rightOperand: { type: "static", value: "80" },
        },
      ],
    };

    const isMet = evaluateLogic(dummySurvey, {}, { VCSCORE: 85 }, conditions, "vi");
    expect(isMet).toBe(true);

    const isNotMet = evaluateLogic(dummySurvey, {}, { VCSCORE: 65 }, conditions, "vi");
    expect(isNotMet).toBe(false);
  });

  test("Evaluates equals operator when comparing numeric variable to static threshold string", () => {
    const conditions: TConditionGroup = {
      id: "cg_2",
      connector: "and",
      conditions: [
        {
          id: "c_2",
          leftOperand: { type: "variable", value: "VCSCORE" },
          operator: "equals",
          rightOperand: { type: "static", value: "100" },
        },
      ],
    };

    const isMet = evaluateLogic(dummySurvey, {}, { VCSCORE: 100 }, conditions, "vi");
    expect(isMet).toBe(true);
  });
});
