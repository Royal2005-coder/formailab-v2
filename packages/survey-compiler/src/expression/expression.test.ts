import { describe, expect, test } from "vitest";
import { ExpressionError, evaluateExpression, parseExpression } from "./index";

const evaluate = (source: string, context: Readonly<Record<string, unknown>> = {}): unknown =>
  evaluateExpression(parseExpression(source), context);

describe("expression engine", () => {
  test("respects arithmetic, comparison, and boolean precedence", () => {
    expect(evaluate("1 + 2 * 3 = 7 and not false")).toBe(true);
    expect(evaluate("false and missing.value")).toBe(false);
    expect(evaluate("true or missing.value")).toBe(true);
  });

  test("reads nested references without evaluating arbitrary properties", () => {
    expect(evaluate("answers.score + profile.bonus", { answers: { score: 7 }, profile: { bonus: 3 } })).toBe(
      10
    );
    expect(() => evaluate("answers.missing", { answers: {} })).toThrowError(ExpressionError);
    expect(() => evaluate("answers.constructor", { answers: {} })).toThrowError(/Unknown reference/);
  });

  test("supports approved aggregate and string functions", () => {
    expect(evaluate("sum(1, 2, scores)", { scores: [3, 4] })).toBe(10);
    expect(evaluate("avg(2, 4, 6)")).toBe(4);
    expect(evaluate("min(4, 2, 8) + max(4, 2, 8)")).toBe(10);
    expect(evaluate("count(scores)", { scores: [1, 2, 3] })).toBe(3);
    expect(evaluate("concat('AI', ' ', 'LAB')")).toBe("AI LAB");
    expect(evaluate("round(2.345, 2)")).toBe(2.35);
    expect(evaluate("abs(-5)")).toBe(5);
    expect(evaluate("ceil(2.1)")).toBe(3);
    expect(evaluate("floor(2.9)")).toBe(2);
    expect(evaluate("is_empty(missing.val)")).toBe(true);
    expect(evaluate("is_empty('hello')")).toBe(false);
  });

  test("supports ternary operator and || && ! syntax", () => {
    expect(evaluate("Q101 == 'A3' ? 10 : 5", { Q101: "A3" })).toBe(10);
    expect(evaluate("Q101 == 'A3' ? 10 : 5", { Q101: "A1" })).toBe(5);
    expect(evaluate("Q101 == 'A2' || Q101 == 'A3'", { Q101: "A3" })).toBe(true);
    expect(evaluate("!is_empty(name)", { name: "John" })).toBe(true);
  });

  test("lazily evaluates if and coalesce", () => {
    expect(evaluate("if(true, 'yes', missing.value)")).toBe("yes");
    expect(evaluate("coalesce(null, profile.name, missing.value)", { profile: { name: "Ada" } })).toBe("Ada");
  });

  test("returns structured parse diagnostics", () => {
    try {
      parseExpression("1 + @");
      throw new Error("Expected parsing to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ExpressionError);
      expect((error as ExpressionError).toDiagnostic()).toEqual({
        code: "INVALID_TOKEN",
        message: "Invalid token '@'",
        position: 4,
      });
    }
  });

  test("rejects unsafe or invalid evaluation", () => {
    expect(() => evaluate("unknown(1)")).toThrowError(/Unknown function/);
    expect(() => evaluate("10 / 0")).toThrowError(/Division by zero/);
    expect(() => evaluate("avg()")).toThrowError(/at least 1/);
  });

  test("enforces depth and operation limits", () => {
    const expression = parseExpression("1 + 2 + 3 + 4");
    expect(() => evaluateExpression(expression, {}, { maxOperations: 3 })).toThrowError(/operation count/);
    expect(() => evaluateExpression(expression, {}, { maxDepth: 1 })).toThrowError(/maximum depth/);
  });
});
