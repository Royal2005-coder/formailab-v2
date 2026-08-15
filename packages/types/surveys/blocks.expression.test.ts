import { describe, expect, test } from "vitest";
import { ZActionEvaluateExpression } from "./blocks";

describe("evaluateExpression block action contract", () => {
  test("accepts an explicit, typed NAOK reference map", () => {
    expect(
      ZActionEvaluateExpression.parse({
        id: "a12345678901234567890123",
        objective: "evaluateExpression",
        variableId: "v12345678901234567890123",
        expression: "(Q105.NAOK + Q106.NAOK) / 2 * 20",
        references: [
          {
            source: "Q105.NAOK",
            target: { type: "element", value: "q12345678901234567890123" },
            missingValue: "zero",
          },
        ],
      }).objective
    ).toBe("evaluateExpression");
  });

  test("rejects executable reference paths", () => {
    const result = ZActionEvaluateExpression.safeParse({
      id: "a12345678901234567890123",
      objective: "evaluateExpression",
      variableId: "v12345678901234567890123",
      expression: "Q105.constructor",
      references: [
        {
          source: "Q105.constructor",
          target: { type: "element", value: "q12345678901234567890123" },
          missingValue: "zero",
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});
