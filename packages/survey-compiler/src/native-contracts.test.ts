import { describe, expect, test } from "vitest";
import { ZCanonicalQuestion } from "./contracts";

const baseQuestion = {
  externalId: "Q1",
  groupExternalId: "G1",
  label: { en: "Question" },
  order: 0,
  mandatory: false,
  options: [],
};

describe("native canonical question contracts", () => {
  test.each([
    [{ ...baseQuestion, type: "rating" }, "rating"],
    [{ ...baseQuestion, type: "matrix" }, "matrix"],
  ])("rejects %s without its explicit native configuration", (question, field) => {
    const result = ZCanonicalQuestion.safeParse(question);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual([
        expect.objectContaining({
          path: [field],
        }),
      ]);
    }
  });

  test("rejects matrix axes whose IDs collide within the question", () => {
    const result = ZCanonicalQuestion.safeParse({
      ...baseQuestion,
      type: "matrix",
      matrix: {
        rows: [{ externalId: "SAME", label: { en: "Row" }, value: "row", order: 0 }],
        columns: [
          { externalId: "SAME", label: { en: "1" }, value: 1, order: 0 },
          { externalId: "OTHER", label: { en: "2" }, value: 2, order: 1 },
        ],
      },
    });

    expect(result.success).toBe(false);
  });
});
