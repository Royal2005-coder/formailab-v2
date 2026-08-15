import { z } from "zod";
import { ZCanonicalQuestionType, ZCompatibilityClass } from "./contracts";

export const CANONICAL_WORKBOOK_SHEETS = [
  "Survey",
  "Groups",
  "Questions",
  "Options",
  "Logic",
  "Variables",
  "Quotas",
] as const;

export const CANONICAL_WORKBOOK_AUXILIARY_SHEETS = [
  "Guide",
  "DataDictionary",
  "ExpressionExamples",
  "Compatibility",
] as const;

export const ZCanonicalWorkbookSheet = z.enum(CANONICAL_WORKBOOK_SHEETS);

export const CANONICAL_WORKBOOK_REQUIRED_COLUMNS = {
  Survey: ["external_id", "default_language", "title"],
  Groups: ["external_id", "order", "title"],
  Questions: ["external_id", "group_external_id", "type", "order", "text", "mandatory"],
  Options: ["external_id", "question_external_id", "order", "value", "label"],
  Logic: ["external_id", "target_external_id", "expression", "action"],
  Variables: ["external_id", "type", "name", "default_value", "calculation"],
  Quotas: ["external_id", "limit", "expression", "outcome"],
} as const satisfies Record<z.infer<typeof ZCanonicalWorkbookSheet>, readonly string[]>;

export const ZQuestionTypeCompatibility = z.object({
  sourceCode: z.string().min(1),
  sourceName: z.string().min(1),
  canonicalType: ZCanonicalQuestionType,
  compatibilityClass: ZCompatibilityClass,
  target: z.string().min(1),
});

export type TQuestionTypeCompatibility = z.infer<typeof ZQuestionTypeCompatibility>;

export const LIME_QUESTION_TYPE_COMPATIBILITY = [
  {
    sourceCode: "5",
    sourceName: "5-point choice",
    canonicalType: "rating",
    compatibilityClass: "compiled",
    target: "rating",
  },
  {
    sourceCode: "A",
    sourceName: "Array 5-point",
    canonicalType: "matrix",
    compatibilityClass: "compiled",
    target: "matrix",
  },
  {
    sourceCode: "B",
    sourceName: "Array 10-point",
    canonicalType: "matrix",
    compatibilityClass: "compiled",
    target: "matrix",
  },
  {
    sourceCode: "C",
    sourceName: "Array yes/no/uncertain",
    canonicalType: "matrix",
    compatibilityClass: "compiled",
    target: "matrix",
  },
  {
    sourceCode: "D",
    sourceName: "Date/time",
    canonicalType: "date",
    compatibilityClass: "native",
    target: "date",
  },
  {
    sourceCode: "E",
    sourceName: "Array increase/same/decrease",
    canonicalType: "matrix",
    compatibilityClass: "compiled",
    target: "matrix",
  },
  {
    sourceCode: "F",
    sourceName: "Array",
    canonicalType: "matrix",
    compatibilityClass: "compiled",
    target: "matrix",
  },
  {
    sourceCode: "G",
    sourceName: "Gender/binary choice",
    canonicalType: "singleChoice",
    compatibilityClass: "compiled",
    target: "multipleChoiceSingle",
  },
  {
    sourceCode: "H",
    sourceName: "Array by column",
    canonicalType: "matrix",
    compatibilityClass: "compiled",
    target: "matrix",
  },
  {
    sourceCode: "I",
    sourceName: "Language switch",
    canonicalType: "display",
    compatibilityClass: "unsupported",
    target: "surveyLanguageControl",
  },
  {
    sourceCode: "K",
    sourceName: "Multiple numerical input",
    canonicalType: "numeric",
    compatibilityClass: "compiled",
    target: "openTextNumberGroup",
  },
  {
    sourceCode: "L",
    sourceName: "List radio",
    canonicalType: "singleChoice",
    compatibilityClass: "native",
    target: "multipleChoiceSingle",
  },
  {
    sourceCode: "M",
    sourceName: "Multiple options",
    canonicalType: "multipleChoice",
    compatibilityClass: "native",
    target: "multipleChoiceMulti",
  },
  {
    sourceCode: "N",
    sourceName: "Numerical input",
    canonicalType: "numeric",
    compatibilityClass: "compiled",
    target: "openTextNumber",
  },
  {
    sourceCode: "O",
    sourceName: "List with comment",
    canonicalType: "singleChoice",
    compatibilityClass: "compiled",
    target: "choiceWithOpenText",
  },
  {
    sourceCode: "P",
    sourceName: "Multiple options with comments",
    canonicalType: "multipleChoice",
    compatibilityClass: "compiled",
    target: "multiChoiceWithOpenText",
  },
  {
    sourceCode: "Q",
    sourceName: "Multiple short text",
    canonicalType: "openText",
    compatibilityClass: "compiled",
    target: "openTextGroup",
  },
  {
    sourceCode: "R",
    sourceName: "Ranking",
    canonicalType: "ranking",
    compatibilityClass: "native",
    target: "ranking",
  },
  {
    sourceCode: "S",
    sourceName: "Short free text",
    canonicalType: "openText",
    compatibilityClass: "native",
    target: "openText",
  },
  {
    sourceCode: "T",
    sourceName: "Long free text",
    canonicalType: "openText",
    compatibilityClass: "native",
    target: "openText",
  },
  {
    sourceCode: "U",
    sourceName: "Huge free text",
    canonicalType: "openText",
    compatibilityClass: "native",
    target: "openText",
  },
  {
    sourceCode: "X",
    sourceName: "Text display",
    canonicalType: "display",
    compatibilityClass: "compiled",
    target: "description",
  },
  {
    sourceCode: "Y",
    sourceName: "Yes/no",
    canonicalType: "singleChoice",
    compatibilityClass: "compiled",
    target: "multipleChoiceSingle",
  },
  {
    sourceCode: "!",
    sourceName: "List dropdown",
    canonicalType: "singleChoice",
    compatibilityClass: "native",
    target: "multipleChoiceSingle",
  },
  {
    sourceCode: ":",
    sourceName: "Array numbers",
    canonicalType: "matrix",
    compatibilityClass: "extended",
    target: "typedMatrix",
  },
  {
    sourceCode: ";",
    sourceName: "Array texts",
    canonicalType: "matrix",
    compatibilityClass: "extended",
    target: "typedMatrix",
  },
  {
    sourceCode: "|",
    sourceName: "File upload",
    canonicalType: "fileUpload",
    compatibilityClass: "native",
    target: "fileUpload",
  },
  {
    sourceCode: "*",
    sourceName: "Equation",
    canonicalType: "equation",
    compatibilityClass: "extended",
    target: "calculatedVariable",
  },
  {
    sourceCode: "1",
    sourceName: "Dual-scale array",
    canonicalType: "matrix",
    compatibilityClass: "extended",
    target: "linkedMatrices",
  },
] as const satisfies readonly TQuestionTypeCompatibility[];

export const getQuestionTypeCompatibility = (sourceCode: string): TQuestionTypeCompatibility | null => {
  const code = (sourceCode ?? "").trim();
  const lower = code.toLowerCase();

  // Direct 1-character code match
  const directMatch = LIME_QUESTION_TYPE_COMPATIBILITY.find((entry) => entry.sourceCode === code);
  if (directMatch) return directMatch;

  // Friendly / Canonical type name mapping
  if (["equation", "calc", "calculation", "e"].includes(lower)) {
    return LIME_QUESTION_TYPE_COMPATIBILITY.find((e) => e.sourceCode === "*") ?? null;
  }
  if (["opentext", "text", "string", "shorttext", "longtext"].includes(lower)) {
    return LIME_QUESTION_TYPE_COMPATIBILITY.find((e) => e.sourceCode === "S") ?? null;
  }
  if (["numeric", "number", "integer", "float"].includes(lower)) {
    return LIME_QUESTION_TYPE_COMPATIBILITY.find((e) => e.sourceCode === "N") ?? null;
  }
  if (["singlechoice", "radio", "list", "dropdown", "select"].includes(lower)) {
    return LIME_QUESTION_TYPE_COMPATIBILITY.find((e) => e.sourceCode === "L") ?? null;
  }
  if (["multiplechoice", "checkbox", "multi"].includes(lower)) {
    return LIME_QUESTION_TYPE_COMPATIBILITY.find((e) => e.sourceCode === "M") ?? null;
  }
  if (["rating", "scale", "stars"].includes(lower)) {
    return LIME_QUESTION_TYPE_COMPATIBILITY.find((e) => e.sourceCode === "5") ?? null;
  }
  if (["date", "datetime", "time"].includes(lower)) {
    return LIME_QUESTION_TYPE_COMPATIBILITY.find((e) => e.sourceCode === "D") ?? null;
  }
  if (["ranking", "order"].includes(lower)) {
    return LIME_QUESTION_TYPE_COMPATIBILITY.find((e) => e.sourceCode === "R") ?? null;
  }
  if (["fileupload", "file", "upload"].includes(lower)) {
    return LIME_QUESTION_TYPE_COMPATIBILITY.find((e) => e.sourceCode === "|") ?? null;
  }
  if (["display", "boilerplate", "info", "html"].includes(lower)) {
    return LIME_QUESTION_TYPE_COMPATIBILITY.find((e) => e.sourceCode === "X") ?? null;
  }
  if (["matrix", "grid", "array"].includes(lower)) {
    return LIME_QUESTION_TYPE_COMPATIBILITY.find((e) => e.sourceCode === "F") ?? null;
  }

  // Fallback: match by canonicalType property
  return LIME_QUESTION_TYPE_COMPATIBILITY.find((e) => e.canonicalType.toLowerCase() === lower) ?? null;
};

export const getMissingWorkbookColumns = (
  sheet: z.infer<typeof ZCanonicalWorkbookSheet>,
  columns: readonly string[]
): string[] => {
  const availableColumns = new Set(columns);
  return CANONICAL_WORKBOOK_REQUIRED_COLUMNS[sheet].filter((column) => !availableColumns.has(column));
};
