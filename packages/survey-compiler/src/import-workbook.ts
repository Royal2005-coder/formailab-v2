import * as XLSX from "xlsx";
import { createCanonicalChecksum, createSha256Checksum } from "./checksum";
import { CANONICAL_WORKBOOK_SHEETS, getMissingWorkbookColumns } from "./compatibility";
import {
  type TCanonicalSurvey,
  type TImportDiagnostic,
  type TImportResult,
  ZCanonicalFormbricksType,
} from "./contracts";
import { repairCorruptedEncoding } from "./encoding-utils";
import { validateCanonicalSurvey } from "./validate-canonical-survey";

type TWorkbookRow = Readonly<Record<string, unknown>>;

export type ImportWorkbookOptions = Readonly<{
  mode?: "validateOnly" | "previewOnly";
}>;

const cell = (row: TWorkbookRow, column: string): string =>
  repairCorruptedEncoding(String(row[column] ?? "").trim());
const numberCell = (row: TWorkbookRow, column: string, fallback: number): number => {
  const value = Number(row[column]);
  return Number.isFinite(value) ? value : fallback;
};
const booleanCell = (row: TWorkbookRow, column: string): boolean =>
  ["1", "true", "y", "yes"].includes(cell(row, column).toLowerCase());
const optionValue = (row: TWorkbookRow): string | number => {
  const value = cell(row, "value");
  const valueType = cell(row, "value_type").toLowerCase();
  if (valueType === "number") {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : value;
  }
  return value;
};

const variableDefaultValue = (
  row: TWorkbookRow,
  type: TCanonicalSurvey["variables"][number]["type"]
): string | number | boolean | string[] | undefined => {
  const value = cell(row, "default_value");
  if (!value) return undefined;
  if (type === "number") {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : value;
  }
  if (type === "boolean") return ["1", "true", "y", "yes"].includes(value.toLowerCase());
  if (type === "stringArray")
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  return value;
};

const localized = (row: TWorkbookRow, field: string, defaultLanguage: string): Record<string, string> => {
  const values: Record<string, string> = {};
  const prefix = `${field}:`;
  for (const [column, value] of Object.entries(row)) {
    if (column.startsWith(prefix) && String(value).trim())
      values[column.slice(prefix.length)] = repairCorruptedEncoding(String(value).trim());
  }
  const fallback = cell(row, field);
  if (fallback) values[defaultLanguage] = repairCorruptedEncoding(fallback);
  return values;
};

const canonicalQuestionType = (type: string): TCanonicalSurvey["questions"][number]["type"] | null => {
  const aliases: Record<string, TCanonicalSurvey["questions"][number]["type"]> = {
    openText: "openText",
    singleChoice: "singleChoice",
    multipleChoice: "multipleChoice",
    numeric: "numeric",
    rating: "rating",
    ranking: "ranking",
    matrix: "matrix",
    date: "date",
    fileUpload: "fileUpload",
    consent: "consent",
    display: "display",
    equation: "equation",
  };
  return aliases[type] ?? null;
};

export const importCanonicalWorkbook = (
  source: Uint8Array,
  options: ImportWorkbookOptions = {}
): TImportResult => {
  const mode = options.mode ?? "previewOnly";
  const sourceChecksum = createSha256Checksum(source);
  const diagnostics: TImportDiagnostic[] = [];
  let workbook: XLSX.WorkBook;

  try {
    workbook = XLSX.read(source, { type: "array", cellDates: false });
  } catch (error) {
    return {
      mode,
      sourceChecksum,
      diagnostics: [
        {
          severity: "error",
          code: "workbook.parse.invalid",
          message: error instanceof Error ? error.message : "Invalid workbook",
        },
      ],
    };
  }

  const rows = new Map<string, TWorkbookRow[]>();
  for (const sheetName of CANONICAL_WORKBOOK_SHEETS) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      diagnostics.push({
        severity: "error",
        code: "workbook.sheet.missing",
        message: `Missing required sheet '${sheetName}'`,
        source: { sheet: sheetName, row: 1 },
      });
      rows.set(sheetName, []);
      continue;
    }
    const sheetRows = XLSX.utils.sheet_to_json<TWorkbookRow>(sheet, { defval: "", raw: false });
    rows.set(sheetName, sheetRows);
    const [headerRow = []] = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: "",
      raw: false,
    });
    const columns = headerRow.map((column) => String(column).trim()).filter(Boolean);
    for (const column of getMissingWorkbookColumns(sheetName, columns)) {
      diagnostics.push({
        severity: "error",
        code: "workbook.column.missing",
        message: `Sheet '${sheetName}' is missing required column '${column}'`,
        source: { sheet: sheetName, row: 1, column },
      });
    }
  }

  for (const sheetName of ["Guide", "DataDictionary", "ExpressionExamples", "Compatibility"] as const) {
    if (workbook.Sheets[sheetName])
      rows.set(
        sheetName,
        XLSX.utils.sheet_to_json<TWorkbookRow>(workbook.Sheets[sheetName], { defval: "", raw: false })
      );
  }

  for (const sheetName of workbook.SheetNames) {
    if (
      !CANONICAL_WORKBOOK_SHEETS.includes(sheetName as (typeof CANONICAL_WORKBOOK_SHEETS)[number]) &&
      !["Guide", "DataDictionary", "ExpressionExamples", "Compatibility"].includes(sheetName)
    ) {
      diagnostics.push({
        severity: "warning",
        code: "workbook.sheet.unknown",
        message: `Unknown sheet '${sheetName}' was ignored`,
        source: { sheet: sheetName, row: 1 },
      });
    }
  }

  if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return { mode, sourceChecksum, diagnostics };
  }

  const surveyRow = rows.get("Survey")?.[0] ?? {};
  const defaultLanguage = cell(surveyRow, "default_language") || "en-US";
  const groups = (rows.get("Groups") ?? []).map((row, index) => ({
    externalId: cell(row, "external_id"),
    title: localized(row, "title", defaultLanguage),
    ...(Object.keys(localized(row, "description", defaultLanguage)).length
      ? { description: localized(row, "description", defaultLanguage) }
      : {}),
    order: numberCell(row, "order", index),
    ...(cell(row, "relevance") ? { relevance: cell(row, "relevance") } : {}),
  }));
  const questions: TCanonicalSurvey["questions"] = (rows.get("Questions") ?? []).map((row, index) => {
    const sourceType = cell(row, "type");
    const type = canonicalQuestionType(sourceType);
    if (!type) {
      diagnostics.push({
        severity: "error",
        code: "workbook.question.type.unsupported",
        message: `Unsupported canonical question type '${sourceType}'`,
        source: { sheet: "Questions", row: index + 2, column: "type" },
        externalId: cell(row, "external_id") || undefined,
      });
    }
    const ratingRange = numberCell(row, "rating_range", 5);
    if (type === "rating" && ratingRange !== 5) {
      diagnostics.push({
        severity: "error",
        code: "workbook.rating.range.unsupported",
        message: `Unsupported rating range '${ratingRange}'; the current canonical contract supports 5`,
        source: { sheet: "Questions", row: index + 2, column: "rating_range" },
        externalId: cell(row, "external_id") || undefined,
      });
    }
    const formbricksType = ZCanonicalFormbricksType.safeParse(cell(row, "formbricks_type"));
    const displayType = cell(row, "display_type");
    const shuffleOption = cell(row, "shuffle_option");
    const inputType = cell(row, "input_type");
    const range = numberCell(row, "range", 0);
    const scale = cell(row, "scale");
    const placeholder = localized(row, "placeholder", defaultLanguage);
    const minimum = cell(row, "min") ? numberCell(row, "min", Number.NaN) : undefined;
    const maximum = cell(row, "max") ? numberCell(row, "max", Number.NaN) : undefined;
    const pattern = cell(row, "validation");
    if (booleanCell(row, "hidden")) {
      diagnostics.push({
        severity: "manualReview",
        code: "workbook.question.hidden.unsupported",
        message: "Hidden questions cannot be represented safely in the Formbricks survey player",
        source: { sheet: "Questions", row: index + 2, column: "hidden" },
        externalId: cell(row, "external_id") || undefined,
      });
    }
    if (cell(row, "terminal")) {
      diagnostics.push({
        severity: "manualReview",
        code: "workbook.question.terminal.unsupported",
        message: "Question-level terminal routing requires an explicit supported ending route",
        source: { sheet: "Questions", row: index + 2, column: "terminal" },
        externalId: cell(row, "external_id") || undefined,
      });
    }
    return {
      externalId: cell(row, "external_id"),
      groupExternalId: cell(row, "group_external_id"),
      type: type ?? "openText",
      label: localized(row, "text", defaultLanguage),
      ...(Object.keys(localized(row, "help", defaultLanguage)).length
        ? { help: localized(row, "help", defaultLanguage) }
        : {}),
      order: numberCell(row, "order", index),
      mandatory: booleanCell(row, "mandatory"),
      ...(cell(row, "relevance") ? { relevance: cell(row, "relevance") } : {}),
      ...(type === "equation" && cell(row, "calculation") ? { calculation: cell(row, "calculation") } : {}),
      options: [],
      ...(type === "rating"
        ? {
            rating: {
              range: 5 as const,
              scale: "number" as const,
            },
          }
        : {}),
      ...(type === "matrix" ? { matrix: { rows: [], columns: [] } } : {}),
      ...(formbricksType.success ? { formbricksType: formbricksType.data } : {}),
      ...(["list", "dropdown"].includes(displayType)
        ? { displayType: displayType as "list" | "dropdown" }
        : {}),
      ...(["none", "all", "exceptLast", "reverseOrderOccasionally", "reverseOrderExceptLast"].includes(
        shuffleOption
      )
        ? {
            shuffleOption: shuffleOption as
              | "none"
              | "all"
              | "exceptLast"
              | "reverseOrderOccasionally"
              | "reverseOrderExceptLast",
          }
        : {}),
      ...(cell(row, "long_answer") ? { longAnswer: booleanCell(row, "long_answer") } : {}),
      ...(["text", "email", "url", "number", "phone"].includes(inputType)
        ? { inputType: inputType as "text" | "email" | "url" | "number" | "phone" }
        : {}),
      ...(Object.keys(placeholder).length ? { placeholder } : {}),
      ...([3, 4, 5, 7, 10].includes(range) ? { range: range as 3 | 4 | 5 | 7 | 10 } : {}),
      ...(["number", "smiley", "star"].includes(scale)
        ? { scale: scale as "number" | "smiley" | "star" }
        : {}),
      ...(minimum !== undefined || maximum !== undefined || pattern
        ? {
            validation: {
              ...(minimum !== undefined && Number.isFinite(minimum) ? { min: minimum } : {}),
              ...(maximum !== undefined && Number.isFinite(maximum) ? { max: maximum } : {}),
              ...(pattern ? { pattern } : {}),
            },
          }
        : {}),
    };
  });
  for (const [index, row] of (rows.get("Options") ?? []).entries()) {
    const questionId = cell(row, "question_external_id");
    const question = questions.find((candidate) => candidate.externalId === questionId);
    if (!question) {
      diagnostics.push({
        severity: "error",
        code: "workbook.option.question_missing",
        message: `Option references missing question '${questionId}'`,
        source: { sheet: "Options", row: index + 2, column: "question_external_id" },
        externalId: cell(row, "external_id") || undefined,
      });
      continue;
    }
    const axis = cell(row, "axis").toLowerCase();
    const item = {
      externalId: cell(row, "external_id"),
      label: localized(row, "label", defaultLanguage),
      value: optionValue(row),
      order: numberCell(row, "order", question.options.length),
    };
    if (question.type === "matrix" && question.matrix && (axis === "row" || axis === "column")) {
      question.matrix[axis === "row" ? "rows" : "columns"].push(item);
    } else {
      question.options.push(item);
    }
  }
  for (const [index, row] of (rows.get("Logic") ?? []).entries()) {
    const targetId = cell(row, "target_external_id");
    const target =
      questions.find((question) => question.externalId === targetId) ??
      groups.find((group) => group.externalId === targetId);
    if (!target) {
      diagnostics.push({
        severity: "error",
        code: "workbook.logic.target_missing",
        message: `Logic references missing target '${targetId}'`,
        source: { sheet: "Logic", row: index + 2, column: "target_external_id" },
        externalId: cell(row, "external_id") || undefined,
      });
    } else if (cell(row, "action") === "show") {
      target.relevance = cell(row, "expression");
    } else {
      diagnostics.push({
        severity: "manualReview",
        code: "workbook.logic.action.extended",
        message: `Logic action '${cell(row, "action")}' requires adaptive compilation`,
        source: { sheet: "Logic", row: index + 2, column: "action" },
        externalId: cell(row, "external_id") || undefined,
      });
    }
  }
  const variables: TCanonicalSurvey["variables"] = (rows.get("Variables") ?? []).map((row, index) => {
    const type = ["number", "boolean", "date", "stringArray"].includes(cell(row, "type"))
      ? (cell(row, "type") as "number" | "boolean" | "date" | "stringArray")
      : "string";
    const defaultValue = variableDefaultValue(row, type);
    if (cell(row, "calculation")) {
      diagnostics.push({
        severity: "manualReview",
        code: "workbook.variable.calculation.unsupported",
        message: "Calculated variables are not executable; use an equation question instead",
        source: { sheet: "Variables", row: index + 2, column: "calculation" },
        externalId: cell(row, "external_id") || undefined,
      });
    }
    return {
      externalId: cell(row, "external_id"),
      type,
      name: cell(row, "name") || `Variable ${index + 1}`,
      ...(defaultValue !== undefined ? { defaultValue } : {}),
    };
  });
  for (const [index, row] of (rows.get("Quotas") ?? []).entries()) {
    if (!cell(row, "external_id")) continue;
    diagnostics.push({
      severity: "manualReview",
      code: "workbook.quota.unsupported",
      message: "Quotas are not supported by the Formbricks compiler",
      source: { sheet: "Quotas", row: index + 2 },
      externalId: cell(row, "external_id"),
    });
  }
  const endings = [{ externalId: "COMPLETE", title: { [defaultLanguage]: "Thank you" } }];

  const usedIds = new Set<string>();
  for (const g of groups) {
    let finalId = g.externalId;
    if (usedIds.has(finalId)) {
      let counter = 1;
      while (usedIds.has(`${g.externalId}_G${counter}`)) counter++;
      finalId = `${g.externalId}_G${counter}`;
      g.externalId = finalId;
    }
    usedIds.add(finalId);
  }
  for (const e of endings) usedIds.add(e.externalId);

  for (const q of questions) {
    let finalId = q.externalId;
    if (usedIds.has(finalId)) {
      let counter = 1;
      while (usedIds.has(`${q.externalId}_Q${counter}`)) counter++;
      finalId = `${q.externalId}_Q${counter}`;
      q.externalId = finalId;
    }
    usedIds.add(finalId);
  }

  for (const v of variables) {
    let finalId = v.externalId;
    if (usedIds.has(finalId)) {
      let counter = 1;
      while (usedIds.has(`${v.externalId}_V${counter}`)) counter++;
      finalId = `${v.externalId}_V${counter}`;
      v.externalId = finalId;
    }
    usedIds.add(finalId);
  }

  const languages = new Set<string>([defaultLanguage]);
  for (const row of [
    ...(rows.get("Survey") ?? []),
    ...(rows.get("Groups") ?? []),
    ...(rows.get("Questions") ?? []),
  ]) {
    for (const column of Object.keys(row)) {
      const separator = column.indexOf(":");
      if (separator !== -1) languages.add(column.slice(separator + 1));
    }
  }

  const survey: TCanonicalSurvey = {
    schemaVersion: 1,
    externalId: cell(surveyRow, "external_id") || "SURVEY",
    defaultLanguage,
    languages: [...languages].sort(),
    title: localized(surveyRow, "title", defaultLanguage),
    groups,
    questions,
    variables,
    endings,
  };
  diagnostics.push(...validateCanonicalSurvey(survey));
  const canonicalChecksum = createCanonicalChecksum(survey);
  return {
    mode,
    sourceChecksum,
    canonicalChecksum,
    ...(mode === "validateOnly" ? {} : { canonicalSurvey: survey }),
    diagnostics,
  };
};
