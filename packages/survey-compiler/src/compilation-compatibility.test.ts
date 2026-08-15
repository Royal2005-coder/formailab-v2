import { describe, expect, test } from "vitest";
import { analyzeCompilationCompatibility } from "./compilation-compatibility";
import type { TCanonicalQuestion, TCanonicalSurvey } from "./contracts";

const makeQuestion = (
  externalId: string,
  type: TCanonicalQuestion["type"],
  order: number,
  optionCount = 0,
  groupExternalId = "group-a"
): TCanonicalQuestion => ({
  externalId,
  groupExternalId,
  type,
  label: { en: externalId },
  order,
  mandatory: false,
  options: Array.from({ length: optionCount }, (_, index) => ({
    externalId: `${externalId}-option-${index + 1}`,
    label: { en: `Option ${index + 1}` },
    value: index + 1,
    order: index,
  })),
});

const makeSurvey = (questions: TCanonicalQuestion[]): TCanonicalSurvey => ({
  schemaVersion: 1,
  externalId: "survey-a",
  defaultLanguage: "en",
  languages: ["en"],
  title: { en: "Survey" },
  groups: [
    { externalId: "group-b", title: { en: "Second" }, order: 2 },
    { externalId: "group-a", title: { en: "First" }, order: 1 },
  ],
  questions,
  variables: [],
  endings: [{ externalId: "ending-a", title: { en: "Done" } }],
});

describe("analyzeCompilationCompatibility", () => {
  test("reports every currently implemented mapper as supported", () => {
    const report = analyzeCompilationCompatibility(
      makeSurvey([
        makeQuestion("open", "openText", 0),
        makeQuestion("number", "numeric", 1),
        makeQuestion("single", "singleChoice", 2, 2),
        makeQuestion("multi", "multipleChoice", 3, 3),
        {
          ...makeQuestion("rating", "rating", 4),
          rating: { range: 5, scale: "number" },
        },
        makeQuestion("ranking", "ranking", 5, 2),
        {
          ...makeQuestion("matrix", "matrix", 6),
          matrix: {
            rows: [
              {
                externalId: "row",
                label: { en: "Row" },
                value: "row",
                order: 0,
              },
            ],
            columns: [
              { externalId: "one", label: { en: "1" }, value: 1, order: 0 },
              { externalId: "five", label: { en: "5" }, value: 5, order: 1 },
            ],
          },
        },
        makeQuestion("display", "display", 7),
      ])
    );

    expect(report.questions).toEqual([
      expect.objectContaining({ externalId: "open", status: "supported", diagnostics: [] }),
      expect.objectContaining({ externalId: "number", status: "supported", diagnostics: [] }),
      expect.objectContaining({ externalId: "single", status: "supported", diagnostics: [] }),
      expect.objectContaining({ externalId: "multi", status: "supported", diagnostics: [] }),
      expect.objectContaining({ externalId: "rating", status: "supported", diagnostics: [] }),
      expect.objectContaining({ externalId: "ranking", status: "supported", diagnostics: [] }),
      expect.objectContaining({ externalId: "matrix", status: "supported", diagnostics: [] }),
      expect.objectContaining({ externalId: "display", status: "supported", diagnostics: [] }),
    ]);
    expect(report.summary).toEqual({
      total: 8,
      supported: 8,
      manualReview: 0,
      invalid: 0,
      errors: 0,
    });
  });

  test.each(["date", "fileUpload", "consent"] as const)(
    "does not silently map unsupported %s questions",
    (type) => {
      const report = analyzeCompilationCompatibility(makeSurvey([makeQuestion("unsupported", type, 0)]));

      expect(report.questions[0]).toEqual({
        externalId: "unsupported",
        type,
        status: "manualReview",
        diagnostics: [
          {
            severity: "manualReview",
            code: "unsupportedQuestionType",
            message: `Canonical question type "${type}" does not have a Formbricks compiler mapper`,
          },
        ],
      });
      expect(report.summary).toEqual({
        total: 1,
        supported: 0,
        manualReview: 1,
        invalid: 0,
        errors: 0,
      });
    }
  );

  test("supports equation questions only when an explicit calculation is present", () => {
    const equation = {
      ...makeQuestion("score", "equation", 0),
      calculation: "round((Q1.NAOK + Q2.NAOK) / 2, 1)",
    };
    const report = analyzeCompilationCompatibility(makeSurvey([equation]));

    expect(report.questions[0]).toEqual({
      externalId: "score",
      type: "equation",
      status: "supported",
      diagnostics: [],
    });
  });

  test.each(["singleChoice", "multipleChoice"] as const)(
    "rejects %s with fewer than the Formbricks minimum of two choices",
    (type) => {
      const report = analyzeCompilationCompatibility(makeSurvey([makeQuestion("choice", type, 0, 1)]));

      expect(report.questions[0]).toEqual({
        externalId: "choice",
        type,
        status: "invalid",
        diagnostics: [
          {
            severity: "error",
            code: "invalidChoiceCount",
            message: `Canonical ${type} question must have at least two choices for Formbricks`,
          },
        ],
      });
      expect(report.summary.errors).toBe(1);
    }
  );

  test.each(["openText", "numeric"] as const)(
    "rejects options that the %s mapper cannot preserve",
    (type) => {
      const report = analyzeCompilationCompatibility(makeSurvey([makeQuestion("non-choice", type, 0, 2)]));

      expect(report.questions[0]).toEqual(
        expect.objectContaining({
          status: "invalid",
          diagnostics: [
            {
              severity: "error",
              code: "unexpectedOptions",
              message: `Canonical ${type} question cannot preserve choices in Formbricks`,
            },
          ],
        })
      );
    }
  );

  test("returns questions in deterministic compile order and uses external IDs as tie-breakers", () => {
    const report = analyzeCompilationCompatibility(
      makeSurvey([
        makeQuestion("z-last", "openText", 0, 0, "group-b"),
        makeQuestion("z-tie", "openText", 1),
        makeQuestion("a-tie", "numeric", 1),
        makeQuestion("first", "openText", 0),
      ])
    );

    expect(report.questions.map(({ externalId }) => externalId)).toEqual([
      "first",
      "a-tie",
      "z-tie",
      "z-last",
    ]);
  });
});
