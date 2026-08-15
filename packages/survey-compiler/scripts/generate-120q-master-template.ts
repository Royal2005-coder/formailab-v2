import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import * as XLSX from "xlsx";
import { analyzeCompilationCompatibility } from "../src/compilation-compatibility";
import { importLegacyCsv } from "../src/import-csv";

const sourcePath = resolve(process.argv[2] ?? "AILAB_120Q_Advanced_Adaptive_2026.csv");
const outputPath = resolve(
  process.argv[3] ?? "apps/web/public/sample-csv/AILAB_120Q_Advanced_Adaptive_2026_Master_Template.xlsx"
);
const source = readFileSync(sourcePath);
const imported = importLegacyCsv(source);
if (!imported.canonicalSurvey) throw new Error("CSV did not produce a canonical survey");
const survey = imported.canonicalSurvey;
const compatibility = analyzeCompilationCompatibility(survey);
const languages = survey.languages;
const localized = (field: string, value: Record<string, string> | undefined, fallback = "") =>
  Object.fromEntries(languages.map((language) => [`${field}:${language}`, value?.[language] ?? fallback]));

const guide = [
  {
    section: "Purpose",
    rule: "Master true-source workbook generated from AILAB_120Q_Advanced_Adaptive_2026.csv. Do not rename sheets or required columns.",
  },
  {
    section: "Encoding",
    rule: "XLSX is Unicode-safe. CSV interchange must be UTF-8 with BOM, comma delimiter, and quoted cells.",
  },
  {
    section: "Question types",
    rule: "Use LimeSurvey source codes in CSV or canonical types in Questions: openText, singleChoice, multipleChoice, numeric, rating, ranking, matrix, date, fileUpload, consent, display, equation.",
  },
  {
    section: "Conditions",
    rule: 'Use Lime expressions such as Q108.NAOK=="Y", YEAR=="1", and nested and/or. Group and question relevance are compiled to adaptive routing.',
  },
  {
    section: "Variables",
    rule: "Variables.calculation stores calculated values. Equation questions store calculation on Questions. Missing numeric answers use .NAOK.",
  },
  {
    section: "Options",
    rule: "Keep value as the stable answer code and label as localized display text. Matrix rows/columns use axis=row or axis=column.",
  },
  {
    section: "Validation",
    rule: "A publishable import must have zero error and manualReview diagnostics. Keep source_checksum and canonical_checksum for audit.",
  },
  {
    section: "Unsupported",
    rule: "Non-empty hidden, terminal, calculated Variables, and Quotas are blocked with manualReview diagnostics; they are never silently discarded.",
  },
];
const dataDictionary = [
  { sheet: "Survey", column: "external_id", required: "yes", meaning: "Stable survey identifier" },
  { sheet: "Groups", column: "external_id", required: "yes", meaning: "Stable group identifier" },
  { sheet: "Questions", column: "type", required: "yes", meaning: "Canonical question type" },
  { sheet: "Questions", column: "relevance", required: "no", meaning: "Lime condition expression" },
  { sheet: "Questions", column: "calculation", required: "equation only", meaning: "Calculated expression" },
  {
    sheet: "Questions",
    column: "rating_range",
    required: "rating only",
    meaning: "Rating scale, currently 5",
  },
  {
    sheet: "Questions",
    column: "formbricks_type",
    required: "no",
    meaning: "statement, consent, choice, rating, openText, ranking, matrix, csat, ces, or nps",
  },
  { sheet: "Questions", column: "input_type", required: "no", meaning: "text, email, url, number, or phone" },
  { sheet: "Questions", column: "min/max", required: "no", meaning: "Text length or numeric value bounds" },
  { sheet: "Questions", column: "validation", required: "no", meaning: "Regular expression for open text" },
  {
    sheet: "Questions",
    column: "hidden/terminal",
    required: "no",
    meaning: "Unsupported; non-empty values block commit",
  },
  { sheet: "Options", column: "axis", required: "matrix only", meaning: "row or column for matrix options" },
  { sheet: "Logic", column: "action", required: "yes", meaning: "show or adaptive extension action" },
];
const expressionExamples = [
  { expression: 'Q108.NAOK=="Y"', meaning: "show a follow-up when yes" },
  { expression: 'YEAR=="1" and BANK=="B2"', meaning: "route to year 1 competency bank" },
  { expression: "round((Q105.NAOK+Q106.NAOK)/2*20,1)", meaning: "percentage score" },
  { expression: 'if(Q301=="1",Q302.NAOK,0)', meaning: "branch score by year" },
  { expression: "Q801.NAOK==2 or Q802.NAOK==4", meaning: "alternative condition" },
];

const rows = {
  Guide: guide,
  DataDictionary: dataDictionary,
  ExpressionExamples: expressionExamples,
  Survey: [
    {
      external_id: survey.externalId,
      default_language: survey.defaultLanguage,
      title: survey.title[survey.defaultLanguage] ?? "",
      ...localized("title", survey.title),
    },
  ],
  Groups: survey.groups.map((group) => ({
    external_id: group.externalId,
    order: group.order,
    relevance: group.relevance ?? "1",
    title: group.title[survey.defaultLanguage] ?? "",
    ...localized("title", group.title, ""),
  })),
  Questions: survey.questions.map((question) => ({
    external_id: question.externalId,
    group_external_id: question.groupExternalId,
    type: question.type,
    order: question.order,
    text: question.label[survey.defaultLanguage] ?? "",
    mandatory: question.mandatory ? "yes" : "no",
    relevance: question.relevance ?? "1",
    calculation: question.calculation ?? "",
    rating_range: question.rating?.range ?? "",
    formbricks_type: question.formbricksType ?? "",
    display_type: question.displayType ?? "",
    shuffle_option: question.shuffleOption ?? "",
    long_answer: question.longAnswer ?? "",
    input_type: question.inputType ?? "",
    placeholder: question.placeholder?.[survey.defaultLanguage] ?? "",
    range: question.range ?? "",
    scale: question.scale ?? "",
    min: question.validation?.min ?? "",
    max: question.validation?.max ?? "",
    validation: question.validation?.pattern ?? "",
    hidden: "",
    terminal: "",
    help: question.help?.[survey.defaultLanguage] ?? "",
    ...Object.fromEntries(languages.map((language) => [`text:${language}`, question.label[language] ?? ""])),
    ...Object.fromEntries(languages.map((language) => [`help:${language}`, question.help?.[language] ?? ""])),
  })),
  Options: survey.questions.flatMap((question) => {
    if (question.matrix) {
      return [
        ...question.matrix.rows.map((option) => ({
          external_id: option.externalId,
          question_external_id: question.externalId,
          order: option.order,
          value: String(option.value),
          value_type: typeof option.value === "number" ? "number" : "string",
          label: option.label[survey.defaultLanguage] ?? "",
          axis: "row",
        })),
        ...question.matrix.columns.map((option) => ({
          external_id: option.externalId,
          question_external_id: question.externalId,
          order: option.order,
          value: String(option.value),
          value_type: typeof option.value === "number" ? "number" : "string",
          label: option.label[survey.defaultLanguage] ?? "",
          axis: "column",
        })),
      ];
    }
    return question.options.map((option) => ({
      external_id: option.externalId,
      question_external_id: question.externalId,
      order: option.order,
      value: String(option.value),
      value_type: typeof option.value === "number" ? "number" : "string",
      label: option.label[survey.defaultLanguage] ?? "",
      axis: "",
    }));
  }),
  Logic: survey.questions
    .filter((question) => question.relevance && question.relevance !== "1")
    .map((question) => ({
      external_id: `SHOW_${question.externalId}`,
      target_external_id: question.externalId,
      expression: question.relevance,
      action: "show",
    })),
  Variables: survey.variables.map((variable) => ({
    external_id: variable.externalId,
    type: variable.type,
    name: variable.name,
    default_value: variable.defaultValue ?? "",
    calculation: variable.calculation ?? "",
  })),
  Quotas: [],
  Compatibility: compatibility.questions.map((item) => ({
    external_id: item.externalId,
    type: item.type,
    status: item.status,
    diagnostics: item.diagnostics.map((diagnostic) => diagnostic.message).join(" | "),
  })),
};

const workbook = XLSX.utils.book_new();
const emptySheetHeaders: Record<string, string[]> = {
  Variables: ["external_id", "type", "name", "default_value", "calculation"],
  Quotas: ["external_id", "limit", "expression", "outcome"],
};
for (const [name, sheetRows] of Object.entries(rows)) {
  const worksheet = sheetRows.length
    ? XLSX.utils.json_to_sheet(sheetRows)
    : XLSX.utils.aoa_to_sheet([emptySheetHeaders[name] ?? []]);
  worksheet["!freeze"] = { xSplit: 0, ySplit: 1 };
  XLSX.utils.book_append_sheet(workbook, worksheet, name);
}
writeFileSync(outputPath, XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
console.log(
  JSON.stringify(
    {
      outputPath,
      questions: survey.questions.length,
      groups: survey.groups.length,
      variables: survey.variables.length,
      diagnostics: imported.diagnostics.length,
    },
    null,
    2
  )
);
