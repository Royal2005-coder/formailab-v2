import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import * as XLSX from "xlsx";
import { evaluateExpression, parseExpression } from "./expression";
import type { TExpressionNode } from "./expression/types";
import { importLegacyCsv } from "./import-csv";

type TRouteCase = Readonly<{
  Case_ID: string;
  Bank: string;
  Profile_Selection: string;
  Target_Route: string;
  Expected_Score: number | string;
}>;

type TRecipe = Readonly<{
  Case_ID: string;
  Question_Code: string;
  Answer_Code: string | number;
  Answer_Label?: string;
}>;

const workbook = XLSX.read(
  readFileSync(new URL("../../../Testbank/00_AILAB_Adaptive_FULL_TEST_COVERAGE.xlsx", import.meta.url))
);
const routeCases = XLSX.utils.sheet_to_json<TRouteCase>(workbook.Sheets.E2E_Route_Cases);
const recipes = XLSX.utils.sheet_to_json<TRecipe>(workbook.Sheets.Answer_Recipes);
const csv = importLegacyCsv(
  readFileSync(
    new URL("../../../Testbank/00_AILAB_LimeSurvey_Adaptive_v2_FULL_READY_QA_NOTED.csv", import.meta.url)
  )
).canonicalSurvey;
if (!csv) throw new Error("The full Testbank CSV did not produce a canonical survey");

const scoreVariableByBank: Readonly<Record<string, string>> = {
  B1: "VRSCORE",
  B2: "VCSCORE",
  B3: "VGSCORE",
  B4: "WRSCORE",
  B5: "MTSCORE",
  B6: "ETSCORE",
  B7: "AIXSCORE",
  B8: "DGSCORE",
};

const collectReferences = (node: TExpressionNode): string[] => {
  if (node.type === "reference") return [node.path.join(".")];
  if (node.type === "unary") return collectReferences(node.operand);
  if (node.type === "binary") {
    return [...collectReferences(node.left), ...collectReferences(node.right)];
  }
  if (node.type === "call") return node.arguments.flatMap(collectReferences);
  return [];
};

const calculateCase = (routeCase: TRouteCase): number | undefined => {
  const answers: Record<string, string | number> = {
    CONSENT: routeCase.Case_ID === "E2E-CONSENT-NO" ? "N" : "Y",
    BANK: routeCase.Bank,
  };
  const year = routeCase.Profile_Selection.match(/YEAR=(\d)/)?.[1];
  const role = routeCase.Profile_Selection.match(/ROLE=([EM])/)?.[1];
  if (year) answers.YEAR = year;
  if (role) answers.ROLE = role;

  for (const recipe of recipes.filter(({ Case_ID }) => Case_ID === routeCase.Case_ID)) {
    const question = csv.questions.find(({ externalId }) => externalId === recipe.Question_Code);
    answers[recipe.Question_Code] =
      question?.type === "rating" ? Number(recipe.Answer_Code) : recipe.Answer_Code;
  }

  const variables: Record<string, number> = {};
  for (const question of csv.questions.filter(({ type }) => type === "equation")) {
    const parsed = parseExpression(question.calculation!);
    const context: Record<string, unknown> = {};
    for (const source of new Set(collectReferences(parsed))) {
      const [identifier, policy] = source.split(".");
      const value = variables[identifier] ?? answers[identifier] ?? 0;
      if (policy) {
        context[identifier] = {
          ...(typeof context[identifier] === "object" ? context[identifier] : {}),
          [policy]: value,
        };
      } else {
        context[identifier] = value;
      }
    }
    const result = evaluateExpression(parsed, context);
    variables[question.externalId] = typeof result === "number" && Number.isFinite(result) ? result : 0;
  }

  return variables[scoreVariableByBank[routeCase.Bank]];
};

describe("full AI LAB QA workbook", () => {
  test("contains complete B7 rating labels", () => {
    const b7Recipes = recipes.filter(({ Case_ID }) => Case_ID.startsWith("E2E-B7-"));
    expect(b7Recipes).toHaveLength(120);
    expect(b7Recipes.every(({ Answer_Label }) => Boolean(Answer_Label))).toBe(true);
  });

  test.each(routeCases.filter(({ Bank }) => scoreVariableByBank[Bank]))(
    "$Case_ID recipe calculates the declared score",
    (routeCase) => {
      if (routeCase.Target_Route === "LC") return;
      const expected = Number(routeCase.Expected_Score);
      expect(Number.isFinite(expected)).toBe(true);
      expect(calculateCase(routeCase)).toBeCloseTo(expected, 1);
    }
  );

  test.each(routeCases.filter(({ Bank }) => scoreVariableByBank[Bank]))(
    "$Case_ID score satisfies $Target_Route",
    (routeCase) => {
      const score = Number(routeCase.Expected_Score);
      if (routeCase.Target_Route === "LC") return;
      const expectedRoute = score < 40 ? "L1" : score < 65 ? "L2" : score < 85 ? "L3" : "L4";
      expect(routeCase.Target_Route).toBe(expectedRoute);
    }
  );
});
