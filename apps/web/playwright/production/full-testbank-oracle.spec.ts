import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";

type TBoundaryCase = Readonly<{
  Case_ID: string;
  Bank: string;
  Score_Variable: string;
  DGCOUNT: number | string;
  Injected_Score: number;
  Expected_Route: string;
  Expected_Result: string;
  Matched_Route_Count: number;
  Execution_Mode: string;
}>;

type TOracleResult = Readonly<{
  inventory: {
    routeCount: number;
    boundaryCount: number;
    systemCount: number;
    caseCount: number;
    uniqueCaseCount: number;
    executionLogMatches: boolean;
    resultQuestionCount: number;
    expectedResultQuestionCount: number;
  };
  boundaries: ReadonlyArray<{
    boundaryCase: TBoundaryCase;
    matchingResultIds: string[];
  }>;
  routes: ReadonlyArray<{
    routeCase: {
      Case_ID: string;
      Bank: string;
      Target_Route: string;
      Expected_Score: number | string;
      Expected_Result_Question: string;
    };
    actualScore?: number;
    dgCount?: number;
    matchingResultIds: string[];
    recipeCount: number;
  }>;
}>;

const oracle = JSON.parse(
  execFileSync(process.execPath, ["scripts/run-full-testbank-oracle.mjs"], { encoding: "utf8" })
) as TOracleResult;

test.describe("AI LAB full Testbank inventory", () => {
  test("[node-oracle] workbook contains 50 E2E, 88 boundary, and 35 system cases", () => {
    expect(oracle.inventory).toEqual({
      routeCount: 50,
      boundaryCount: 88,
      systemCount: 35,
      caseCount: 173,
      uniqueCaseCount: 173,
      executionLogMatches: true,
      resultQuestionCount: oracle.inventory.expectedResultQuestionCount,
      expectedResultQuestionCount: oracle.inventory.expectedResultQuestionCount,
    });
  });
});

test.describe("AI LAB boundary logic simulation", () => {
  for (const { boundaryCase, matchingResultIds } of oracle.boundaries) {
    test(`[node-oracle] ${boundaryCase.Case_ID}: ${boundaryCase.Bank} ${boundaryCase.Expected_Route}`, () => {
      expect(boundaryCase.Execution_Mode).toContain("Compiler/unit fixture");

      expect(matchingResultIds).toEqual([boundaryCase.Expected_Result]);
      expect(matchingResultIds).toHaveLength(boundaryCase.Matched_Route_Count);
    });
  }
});

test.describe("AI LAB route recipe simulation", () => {
  for (const { routeCase, actualScore, dgCount, matchingResultIds, recipeCount } of oracle.routes) {
    test(`[node-oracle] ${routeCase.Case_ID}: recipe selects ${routeCase.Target_Route}`, () => {
      if (routeCase.Case_ID !== "E2E-CONSENT-NO") expect(recipeCount).toBeGreaterThan(0);
      if (routeCase.Target_Route === "LC") {
        expect(dgCount).toBeLessThan(18);
      } else if (routeCase.Case_ID !== "E2E-CONSENT-NO") {
        expect(actualScore).toBeCloseTo(Number(routeCase.Expected_Score), 1);
      }
      expect(matchingResultIds).toEqual([routeCase.Expected_Result_Question]);
    });
  }
});
