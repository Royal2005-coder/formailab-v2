import { describe, expect, test } from "vitest";
import * as XLSX from "xlsx";
import { importCanonicalWorkbook } from "./import-workbook";

const workbookBytes = (overrides: Readonly<Record<string, Readonly<Record<string, unknown>[]>>> = {}) => {
  const workbook = XLSX.utils.book_new();
  const sheets: Record<string, Readonly<Record<string, unknown>[]>> = {
    Survey: [{ external_id: "DEMO", default_language: "en-US", title: "Demo", "title:vi": "Bản mẫu" }],
    Groups: [{ external_id: "PROFILE", order: 0, title: "Profile" }],
    Questions: [
      {
        external_id: "ROLE",
        group_external_id: "PROFILE",
        type: "singleChoice",
        order: 0,
        text: "Role",
        mandatory: "yes",
        formbricks_type: "multipleChoiceSingle",
        display_type: "dropdown",
        shuffle_option: "exceptLast",
        min: 2,
        max: 20,
        validation: "^[A-Za-z]+$",
      },
      {
        external_id: "SCORE",
        group_external_id: "PROFILE",
        type: "equation",
        order: 1,
        text: "Score",
        mandatory: "no",
        relevance: "true",
        calculation: 'round(if(ROLE=="student",100,0),1)',
        rating_range: "",
      },
      {
        external_id: "GRID",
        group_external_id: "PROFILE",
        type: "matrix",
        order: 2,
        text: "Grid",
        mandatory: "no",
        relevance: "true",
        calculation: "",
        rating_range: "",
      },
    ],
    Options: [
      {
        external_id: "STUDENT",
        question_external_id: "ROLE",
        order: 0,
        value: "student",
        label: "Student",
        axis: "",
      },
      {
        external_id: "GRID_ROW",
        question_external_id: "GRID",
        order: 0,
        value: "row",
        label: "Row",
        axis: "row",
      },
      {
        external_id: "GRID_COL",
        question_external_id: "GRID",
        order: 0,
        value: "1",
        label: "One",
        axis: "column",
      },
      {
        external_id: "GRID_COL_2",
        question_external_id: "GRID",
        order: 1,
        value: "2",
        label: "Two",
        axis: "column",
      },
    ],
    Logic: [{ external_id: "ROLE_VISIBLE", target_external_id: "ROLE", expression: "true", action: "show" }],
    Variables: [
      {
        external_id: "INITIAL_SCORE",
        type: "number",
        name: "Initial score",
        default_value: 5,
        calculation: "",
      },
    ],
    Quotas: [],
    ...overrides,
  };
  const emptyHeaders: Record<string, string[]> = {
    Quotas: ["external_id", "limit", "expression", "outcome"],
  };
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(
      workbook,
      rows.length ? XLSX.utils.json_to_sheet([...rows]) : XLSX.utils.aoa_to_sheet([emptyHeaders[name] ?? []]),
      name
    );
  }
  return new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx" }));
};

describe("importCanonicalWorkbook", () => {
  test("imports a canonical XLSX workbook with localized text", () => {
    const result = importCanonicalWorkbook(workbookBytes());

    expect(result.diagnostics).toEqual([]);
    expect(result.canonicalSurvey).toMatchObject({
      externalId: "DEMO",
      languages: ["en-US", "vi"],
      title: { "en-US": "Demo", vi: "Bản mẫu" },
      questions: [
        {
          externalId: "ROLE",
          groupExternalId: "PROFILE",
          mandatory: true,
          relevance: "true",
          formbricksType: "multipleChoiceSingle",
          displayType: "dropdown",
          shuffleOption: "exceptLast",
          validation: { min: 2, max: 20, pattern: "^[A-Za-z]+$" },
          options: [{ externalId: "STUDENT", value: "student" }],
        },
        {
          externalId: "SCORE",
          calculation: 'round(if(ROLE=="student",100,0),1)',
        },
        {
          externalId: "GRID",
          matrix: {
            rows: [{ externalId: "GRID_ROW", value: "row" }],
            columns: [
              { externalId: "GRID_COL", value: "1" },
              { externalId: "GRID_COL_2", value: "2" },
            ],
          },
        },
      ],
      variables: [{ externalId: "INITIAL_SCORE", type: "number", defaultValue: 5 }],
    });
    expect(result.sourceChecksum).toMatch(/^[a-f0-9]{64}$/);
    expect(result.canonicalChecksum).toMatch(/^[a-f0-9]{64}$/);
  });

  test("reports a missing sheet with a stable diagnostic", () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet([{ external_id: "DEMO", default_language: "en-US", title: "Demo" }]),
      "Survey"
    );
    const bytes = new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx" }));

    expect(importCanonicalWorkbook(bytes).diagnostics).toContainEqual({
      severity: "error",
      code: "workbook.sheet.missing",
      message: "Missing required sheet 'Groups'",
      source: { sheet: "Groups", row: 1 },
    });
  });

  test("reports dangling option references with cell coordinates", () => {
    const result = importCanonicalWorkbook(
      workbookBytes({
        Options: [
          { external_id: "ORPHAN", question_external_id: "MISSING", order: 0, value: "x", label: "X" },
        ],
      })
    );

    expect(result.diagnostics).toContainEqual({
      severity: "error",
      code: "workbook.option.question_missing",
      message: "Option references missing question 'MISSING'",
      source: { sheet: "Options", row: 2, column: "question_external_id" },
      externalId: "ORPHAN",
    });
  });

  test("validate-only returns checksums without the canonical payload", () => {
    const result = importCanonicalWorkbook(workbookBytes(), { mode: "validateOnly" });

    expect(result.canonicalSurvey).toBeUndefined();
    expect(result.canonicalChecksum).toMatch(/^[a-f0-9]{64}$/);
  });

  test("blocks calculated variables and quotas instead of silently discarding their behavior", () => {
    const result = importCanonicalWorkbook(
      workbookBytes({
        Variables: [
          {
            external_id: "DERIVED_SCORE",
            type: "number",
            name: "Derived score",
            default_value: 0,
            calculation: "sum(1)",
          },
        ],
        Quotas: [{ external_id: "ALL", limit: 100, expression: "true", outcome: "complete" }],
      })
    );

    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "manualReview",
          code: "workbook.variable.calculation.unsupported",
          externalId: "DERIVED_SCORE",
        }),
        expect.objectContaining({
          severity: "manualReview",
          code: "workbook.quota.unsupported",
          externalId: "ALL",
        }),
      ])
    );
  });

  test("blocks hidden and terminal metadata that cannot be represented safely", () => {
    const questions = [
      {
        external_id: "ROLE",
        group_external_id: "PROFILE",
        type: "singleChoice",
        order: 0,
        text: "Role",
        mandatory: "yes",
        hidden: "yes",
        terminal: "COMPLETE",
      },
    ];
    const result = importCanonicalWorkbook(workbookBytes({ Questions: questions }));

    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ severity: "manualReview", code: "workbook.question.hidden.unsupported" }),
        expect.objectContaining({ severity: "manualReview", code: "workbook.question.terminal.unsupported" }),
      ])
    );
  });
});
