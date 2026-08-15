import { describe, expect, test } from "vitest";
import { evaluateCalculatedVariables, simulateAdaptiveRoute } from "./adaptive";
import type { TCanonicalSurvey } from "./contracts";

const survey: TCanonicalSurvey = {
  schemaVersion: 1,
  externalId: "ADAPTIVE",
  defaultLanguage: "en-US",
  languages: ["en-US"],
  title: { "en-US": "Adaptive" },
  groups: [
    { externalId: "PROFILE", title: { "en-US": "Profile" }, order: 0 },
    { externalId: "SUPPORT", title: { "en-US": "Support" }, order: 1, relevance: "SCORE < 50" },
  ],
  questions: [
    {
      externalId: "ROLE",
      groupExternalId: "PROFILE",
      type: "singleChoice",
      label: { "en-US": "Role" },
      order: 0,
      mandatory: true,
      options: [],
    },
    {
      externalId: "HELP",
      groupExternalId: "SUPPORT",
      type: "openText",
      label: { "en-US": "Help" },
      order: 1,
      mandatory: false,
      relevance: "ROLE = 'student'",
      options: [],
    },
  ],
  variables: [
    { externalId: "RAW", type: "number", name: "Raw", calculation: "Q1 + Q2" },
    { externalId: "SCORE", type: "number", name: "Score", calculation: "RAW * 10" },
  ],
  endings: [{ externalId: "COMPLETE", title: { "en-US": "Complete" } }],
};

describe("adaptive calculations", () => {
  test("evaluates calculated variables in dependency order", () => {
    expect(evaluateCalculatedVariables(survey, { Q1: 2, Q2: 2 })).toMatchObject({
      variables: { RAW: 4, SCORE: 40 },
      diagnostics: [],
      trace: [
        { variableExternalId: "RAW", dependencies: [], result: "calculated" },
        { variableExternalId: "SCORE", dependencies: ["RAW"], result: "calculated" },
      ],
    });
  });

  test("detects variable dependency cycles without evaluating them", () => {
    const cyclicSurvey = structuredClone(survey);
    cyclicSurvey.variables = [
      { externalId: "A", type: "number", name: "A", calculation: "B + 1" },
      { externalId: "B", type: "number", name: "B", calculation: "A + 1" },
    ];

    const result = evaluateCalculatedVariables(cyclicSurvey, {});
    expect(result.variables).toEqual({});
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "adaptive.calculation.cycle",
      "adaptive.calculation.cycle",
    ]);
  });
});

describe("adaptive route simulation", () => {
  test("returns a deterministic route and explanation trace", () => {
    const first = simulateAdaptiveRoute(survey, { Q1: 2, Q2: 2, ROLE: "student" });
    const second = simulateAdaptiveRoute(survey, { Q1: 2, Q2: 2, ROLE: "student" });

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      visibleGroupExternalIds: ["PROFILE", "SUPPORT"],
      visibleQuestionExternalIds: ["ROLE", "HELP"],
      variables: { RAW: 4, SCORE: 40 },
      endingExternalId: "COMPLETE",
      diagnostics: [],
    });
    expect(first.routeTrace.at(-1)).toEqual({
      targetExternalId: "COMPLETE",
      targetType: "ending",
      result: true,
      reason: "complete",
    });
  });

  test("hides children when their parent group is not relevant", () => {
    const result = simulateAdaptiveRoute(survey, { Q1: 4, Q2: 4, ROLE: "student" });

    expect(result.visibleGroupExternalIds).toEqual(["PROFILE"]);
    expect(result.visibleQuestionExternalIds).toEqual(["ROLE"]);
    expect(result.routeTrace).toContainEqual(
      expect.objectContaining({ targetExternalId: "HELP", result: false, reason: "parentNotRelevant" })
    );
  });
});
