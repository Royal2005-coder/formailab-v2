import { describe, expect, test } from "vitest";
import {
  CANONICAL_WORKBOOK_SHEETS,
  LIME_QUESTION_TYPE_COMPATIBILITY,
  ZQuestionTypeCompatibility,
  getMissingWorkbookColumns,
  getQuestionTypeCompatibility,
} from "./compatibility";

describe("question type compatibility", () => {
  test("contains only valid and unique source mappings", () => {
    const sourceCodes = LIME_QUESTION_TYPE_COMPATIBILITY.map((entry) => entry.sourceCode);

    expect(new Set(sourceCodes).size).toBe(sourceCodes.length);
    expect(
      LIME_QUESTION_TYPE_COMPATIBILITY.every((entry) => ZQuestionTypeCompatibility.safeParse(entry).success)
    ).toBe(true);
  });

  test("classifies known and unknown source codes explicitly", () => {
    expect(getQuestionTypeCompatibility("L")?.compatibilityClass).toBe("native");
    expect(getQuestionTypeCompatibility("*")?.compatibilityClass).toBe("extended");
    expect(getQuestionTypeCompatibility("unknown")).toBeNull();
  });
});

describe("canonical workbook contract", () => {
  test("keeps the seven version-one sheets stable", () => {
    expect(CANONICAL_WORKBOOK_SHEETS).toEqual([
      "Survey",
      "Groups",
      "Questions",
      "Options",
      "Logic",
      "Variables",
      "Quotas",
    ]);
  });

  test("reports missing required columns", () => {
    expect(getMissingWorkbookColumns("Questions", ["external_id", "group_external_id", "type"])).toEqual([
      "order",
      "text",
      "mandatory",
    ]);
  });
});
