import { parse } from "csv-parse/sync";
import { createCanonicalChecksum, createSha256Checksum } from "./checksum";
import { getQuestionTypeCompatibility } from "./compatibility";
import { type TCanonicalSurvey, type TImportDiagnostic, type TImportResult } from "./contracts";
import { repairCorruptedEncoding } from "./encoding-utils";
import { validateCanonicalSurvey } from "./validate-canonical-survey";

type Row = Record<string, string>;
export type ImportCsvOptions = { mode?: "validateOnly" | "previewOnly"; sheet?: string };

const id = (row: Row, fallback: string) => row.external_id?.trim() || row.name?.trim() || fallback;
const externalId = (value: string, fallback: string): string => {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 128);
  const candidate = normalized || fallback;

  return /^[A-Za-z]/.test(candidate) ? candidate : `ID_${candidate}`.slice(0, 128);
};

const localized = (row: Row, field: "text" | "help" | "title", language: string) => {
  const val = row[field]?.trim() || row.name?.trim() || "";
  return {
    [row.language?.trim() || language]: repairCorruptedEncoding(val),
  };
};
const bool = (value?: string) => ["y", "yes", "true", "1"].includes((value ?? "").toLowerCase());
const num = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const unwrapEquation = (value: string): string => {
  const trimmed = value.trim();
  const inner = trimmed.startsWith("{") && trimmed.endsWith("}") ? trimmed.slice(1, -1).trim() : trimmed;
  return inner.replace(/""/g, '"');
};

const sanitizeRelevance = (value?: string): string | undefined => {
  if (!value?.trim()) return undefined;
  return unwrapEquation(value.trim());
};

const parseMetadata = (value?: string): Record<string, string> =>
  Object.fromEntries(
    (value ?? "")
      .split(";")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const separator = entry.indexOf("=");
        return separator === -1
          ? [entry, "true"]
          : [entry.slice(0, separator).trim(), entry.slice(separator + 1).trim()];
      })
  );

const decodeCsvSource = (source: string | Uint8Array): string => {
  let decoded = "";
  if (typeof source === "string") {
    decoded = source;
  } else {
    const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(source);
    if (!utf8.includes("\uFFFD")) {
      decoded = utf8;
    } else {
      try {
        decoded = new TextDecoder("windows-1258", { fatal: false }).decode(source);
      } catch {
        decoded = utf8;
      }
    }
  }
  return repairCorruptedEncoding(decoded);
};

export const importLegacyCsv = (
  source: string | Uint8Array,
  options: ImportCsvOptions = {}
): TImportResult => {
  const sourceText = decodeCsvSource(source);
  const sourceChecksum = createSha256Checksum(
    typeof source === "string" ? new TextEncoder().encode(source) : source
  );
  const diagnostics: TImportDiagnostic[] = [];
  let rows: Row[];
  try {
    const rawRows = parse(sourceText.replace(/^\uFEFF/, ""), {
      columns: true,
      skip_empty_lines: true,
      bom: true,
      relax_column_count: true,
      trim: true,
    }) as Record<string, string>[];
    rows = rawRows.map((r) =>
      Object.fromEntries(
        Object.entries(r).map(([k, v]) => [
          k.trim().toLowerCase(),
          typeof v === "string" ? v.trim() : String(v ?? ""),
        ])
      )
    );
  } catch (error) {
    diagnostics.push({
      severity: "error",
      code: "csv.parse.invalid",
      message: error instanceof Error ? error.message : "Invalid CSV",
      source: { sheet: options.sheet ?? "CSV", row: 1 },
    });
    return { mode: options.mode ?? "previewOnly", sourceChecksum, diagnostics };
  }
  const surveySettingsRow = rows.find((r) => r.class?.toUpperCase() === "S");
  const surveyLanguageRow = rows.find(
    (row) => row.class?.toUpperCase() === "SL" && row.name?.trim().toLowerCase() === "surveyls_title"
  );
  const language = surveyLanguageRow?.language?.trim() || surveySettingsRow?.language?.trim() || "en-US";
  const languages = [
    ...new Set(
      rows
        .filter((r) => r.language)
        .map((r) => r.language!.trim())
        .concat(language)
    ),
  ];
  const indexedRows = rows.map((row, index) => ({ row, sourceRow: index + 2 }));

  const deduplicatedGroups: TCanonicalSurvey["groups"] = [];
  const groupIndexMap = new Map<string, number>();

  for (const { row } of indexedRows.filter(({ row }) => row.class?.toUpperCase() === "G")) {
    const rawId = id(row, `GROUP_${deduplicatedGroups.length + 1}`);
    const extId = externalId(rawId, `GROUP_${deduplicatedGroups.length + 1}`);
    const locTitle = localized(row, "text", language);
    const existingIndex = groupIndexMap.get(extId);

    if (existingIndex !== undefined) {
      const existing = deduplicatedGroups[existingIndex];
      existing.title = { ...existing.title, ...locTitle };
      const sanitizedRel = sanitizeRelevance(row.relevance);
      if (sanitizedRel) {
        existing.relevance = sanitizedRel;
      }
    } else {
      const newIndex = deduplicatedGroups.length;
      const sanitizedRel = sanitizeRelevance(row.relevance);
      groupIndexMap.set(extId, newIndex);
      deduplicatedGroups.push({
        externalId: extId,
        title: locTitle,
        order: num(row.order, newIndex),
        ...(sanitizedRel ? { relevance: sanitizedRel } : {}),
      });
    }
  }

  if (deduplicatedGroups.length === 0) {
    const defaultGroupExtId = "GROUP_1";
    groupIndexMap.set(defaultGroupExtId, 0);
    deduplicatedGroups.push({
      externalId: defaultGroupExtId,
      title: { [language]: "Thông tin Khảo sát" },
      order: 0,
    });
  }

  let groupCursor = 0;
  let currentGroup = deduplicatedGroups[0]?.externalId || "GROUP_1";
  let currentQuestion: string | undefined;
  const questions: TCanonicalSurvey["questions"] = [];
  const questionIndexMap = new Map<string, number>();

  for (const { row: r, sourceRow } of indexedRows) {
    const rowClass = r.class?.toUpperCase()?.trim();
    if (rowClass === "G") {
      const gRawId = id(r, "");
      if (gRawId) {
        const gExtId = externalId(gRawId, "");
        if (groupIndexMap.has(gExtId)) {
          currentGroup = gExtId;
        }
      } else if (groupCursor < deduplicatedGroups.length) {
        currentGroup = deduplicatedGroups[groupCursor].externalId;
        groupCursor++;
      }
      continue;
    }

    const isQuestionClass = ["Q", "V", "E", "EQ", "CALC", "VARIABLE"].includes(rowClass ?? "");
    if (!isQuestionClass) continue;

    const rawType =
      r["type/scale"] ||
      r.type ||
      (["V", "E", "EQ", "CALC", "VARIABLE"].includes(rowClass ?? "") ? "*" : "S");
    const type = getQuestionTypeCompatibility(rawType);
    const rawQId = id(r, `QUESTION_${questions.length + 1}`);
    const extQId = externalId(rawQId, `QUESTION_${questions.length + 1}`);
    currentQuestion = extQId;

    if (!type) {
      diagnostics.push({
        severity: "error",
        code: "csv.question.type.unsupported",
        message: `Unsupported question type '${r["type/scale"] || r.type}'`,
        source: { sheet: options.sheet ?? "CSV", row: sourceRow, column: "type/scale" },
        externalId: extQId,
      });
    }

    const existingIndex = questionIndexMap.get(extQId);
    if (existingIndex !== undefined) {
      const existing = questions[existingIndex];
      existing.label = { ...existing.label, ...localized(r, "text", language) };
      if (r.help?.trim() && existing.type !== "equation") {
        existing.help = { ...(existing.help || {}), ...localized(r, "help", language) };
      }
      continue;
    }

    const canonicalType = type?.canonicalType || "openText";
    const metadata = parseMetadata(r.other);
    const newIndex = questions.length;
    questionIndexMap.set(extQId, newIndex);

    questions.push({
      externalId: extQId,
      groupExternalId: r.parent_external_id?.trim() || currentGroup,
      type: canonicalType,
      label:
        canonicalType === "equation" && r.help?.trim()
          ? { [r.language?.trim() || language]: r.help.trim() }
          : localized(r, "text", language),
      ...(canonicalType !== "equation" && r.help ? { help: localized(r, "help", language) } : {}),
      order: num(r.order, newIndex),
      mandatory: bool(r.mandatory),
      ...(sanitizeRelevance(r.relevance) ? { relevance: sanitizeRelevance(r.relevance) } : {}),
      ...(canonicalType === "equation"
        ? { calculation: unwrapEquation(r.calculation?.trim() || r.value?.trim() || r.text?.trim() || "") }
        : {}),
      options: [],
      ...(canonicalType === "rating" ? { rating: { range: 5 as const, scale: "number" as const } } : {}),
      ...(canonicalType === "matrix"
        ? {
            matrix: {
              rows: [],
              columns: Array.from({ length: 5 }, (_, columnIndex) => {
                const value = columnIndex + 1;
                return {
                  externalId: externalId(`${extQId}_A_${value}`, `COLUMN_${value}`),
                  label: { [language]: String(value) },
                  value,
                  order: columnIndex,
                };
              }),
            },
          }
        : {}),
      ...([
        "statement",
        "consent",
        "multipleChoiceSingle",
        "multipleChoiceMulti",
        "rating",
        "openText",
        "variable",
        "ranking",
        "matrix",
        "csat",
        "ces",
        "nps",
      ].includes(metadata.formbricksType)
        ? {
            formbricksType: metadata.formbricksType as
              | "statement"
              | "consent"
              | "multipleChoiceSingle"
              | "multipleChoiceMulti"
              | "rating"
              | "openText"
              | "variable"
              | "ranking"
              | "matrix"
              | "csat"
              | "ces"
              | "nps",
          }
        : {}),
      ...(["list", "dropdown"].includes(metadata.displayType)
        ? { displayType: metadata.displayType as "list" | "dropdown" }
        : {}),
      ...(["none", "all", "exceptLast", "reverseOrderOccasionally", "reverseOrderExceptLast"].includes(
        metadata.shuffleOption
      )
        ? {
            shuffleOption: metadata.shuffleOption as
              | "none"
              | "all"
              | "exceptLast"
              | "reverseOrderOccasionally"
              | "reverseOrderExceptLast",
          }
        : {}),
      ...(metadata.longAnswer !== undefined ? { longAnswer: bool(metadata.longAnswer) } : {}),
      ...(["text", "email", "url", "number", "phone"].includes(metadata.inputType)
        ? { inputType: metadata.inputType as "text" | "email" | "url" | "number" | "phone" }
        : {}),
      ...(metadata.placeholder
        ? { placeholder: { [r.language?.trim() || language]: metadata.placeholder } }
        : {}),
      ...([3, 4, 5, 7, 10].includes(Number(metadata.range))
        ? { range: Number(metadata.range) as 3 | 4 | 5 | 7 | 10 }
        : {}),
      ...(["number", "smiley", "star"].includes(metadata.scale)
        ? { scale: metadata.scale as "number" | "smiley" | "star" }
        : {}),
    });
  }

  currentQuestion = undefined;
  for (const { row: r, sourceRow } of indexedRows) {
    const rowClass = r.class?.toUpperCase();
    if (rowClass === "Q") {
      currentQuestion = externalId(id(r, "QUESTION"), "QUESTION");
      continue;
    }
    if (rowClass !== "A" && rowClass !== "SQ") continue;
    const optionIndex = questions.reduce((total, question) => total + question.options.length, 0);
    const target = r.parent_external_id?.trim() || r.question_external_id?.trim() || currentQuestion;
    const q = questions.find((question) => question.externalId === target);
    const sourceOptionId = id(r, `OPTION_${optionIndex + 1}`);
    const optionExternalId = externalId(
      `${target ?? "QUESTION"}_${rowClass}_${sourceOptionId}`,
      `OPTION_${optionIndex + 1}`
    );

    if (!q) {
      diagnostics.push({
        severity: "error",
        code: rowClass === "SQ" ? "csv.subquestion.question_missing" : "csv.option.question_missing",
        message: `${rowClass === "SQ" ? "Subquestion" : "Option"} references missing question`,
        source: { sheet: options.sheet ?? "CSV", row: sourceRow, column: "parent_external_id" },
        externalId: optionExternalId,
      });
    } else {
      const optionVal = r.value?.trim() || r.name?.trim() || sourceOptionId;
      const optionLocLabel = localized(r, "text", language);

      if (q.type === "matrix" && q.matrix) {
        if (rowClass === "A" && q.matrix.columns.length === 5) {
          q.matrix.columns = [];
        }
        const axis = rowClass === "SQ" ? q.matrix.rows : q.matrix.columns;
        const existingAxisItem = axis.find(
          (item) => item.externalId === optionExternalId || item.value === optionVal
        );
        if (existingAxisItem) {
          existingAxisItem.label = { ...existingAxisItem.label, ...optionLocLabel };
        } else {
          axis.push({
            externalId: optionExternalId,
            label: optionLocLabel,
            value: optionVal,
            order: num(r.order, axis.length),
          });
        }
      } else if (q.type !== "rating" && q.type !== "display") {
        const existingOpt = q.options.find(
          (opt) => opt.externalId === optionExternalId || opt.value === optionVal
        );
        if (existingOpt) {
          existingOpt.label = { ...existingOpt.label, ...optionLocLabel };
        } else {
          q.options.push({
            externalId: optionExternalId,
            label: optionLocLabel,
            value: optionVal,
            order: num(r.order, q.options.length),
          });
        }
      }
    }
  }

  for (const question of questions) {
    const sourceQuestion = rows.find(
      (row) =>
        row.class?.toUpperCase() === "Q" &&
        externalId(id(row, "QUESTION"), "QUESTION") === question.externalId
    );
    if (sourceQuestion?.["type/scale"] === "Y" && question.options.length === 0) {
      question.options.push(
        {
          externalId: `${question.externalId}_A_Y`,
          label: { [language]: "Có" },
          value: "Y",
          order: 0,
        },
        {
          externalId: `${question.externalId}_A_N`,
          label: { [language]: "Không" },
          value: "N",
          order: 1,
        }
      );
    }
  }

  for (const { row: r, sourceRow } of indexedRows.filter(({ row }) => row.class?.toUpperCase() === "R")) {
    const target = r.parent_external_id?.trim() || r.name?.trim();
    const entity =
      questions.find((question) => question.externalId === target) ??
      deduplicatedGroups.find((group) => group.externalId === target);
    if (!entity)
      diagnostics.push({
        severity: "error",
        code: "csv.rule.target_missing",
        message: `Routing rule references missing target '${target || ""}'`,
        source: { sheet: options.sheet ?? "CSV", row: sourceRow, column: "parent_external_id" },
      });
    else if (r.relevance) entity.relevance = r.relevance.trim();
  }

  const endings = [{ externalId: "COMPLETE", title: { [language]: "Thank you" } }];

  // Global ID deduplication across all entity types (groups, questions, variables, endings)
  const usedIds = new Set<string>();
  for (const g of deduplicatedGroups) usedIds.add(g.externalId);
  for (const e of endings) usedIds.add(e.externalId);

  const deduplicatedQuestions: TCanonicalSurvey["questions"] = questions.map((q) => {
    let finalId = q.externalId;
    if (usedIds.has(finalId)) {
      let counter = 1;
      while (usedIds.has(`${q.externalId}_Q${counter}`)) counter++;
      finalId = `${q.externalId}_Q${counter}`;
    }
    usedIds.add(finalId);
    return { ...q, externalId: finalId };
  });

  const rawVariables = rows.filter((r) => r.class?.toUpperCase() === "V");
  const deduplicatedVariables: TCanonicalSurvey["variables"] = [];
  const varIndexMap = new Map<string, number>();

  for (let i = 0; i < rawVariables.length; i++) {
    const r = rawVariables[i];
    const rawVId = id(r, `VARIABLE_${i + 1}`);
    const extVId = externalId(rawVId, `VARIABLE_${i + 1}`);

    let finalId = extVId;
    if (usedIds.has(finalId)) {
      let counter = 1;
      while (usedIds.has(`${extVId}_V${counter}`)) counter++;
      finalId = `${extVId}_V${counter}`;
    }

    const existingIndex = varIndexMap.get(finalId);
    if (existingIndex === undefined) {
      varIndexMap.set(finalId, deduplicatedVariables.length);
      usedIds.add(finalId);
      deduplicatedVariables.push({
        externalId: finalId,
        type: (["number", "boolean", "date", "stringArray"].includes(r.type || "") ? r.type : "string") as
          | "string"
          | "number"
          | "boolean"
          | "date"
          | "stringArray",
        name: r.variable_label?.trim() || r.text?.trim() || finalId,
        ...(r.calculation ? { calculation: r.calculation.trim() } : {}),
      });
    }
  }

  const surveyTitle = surveyLanguageRow?.text?.trim() || surveySettingsRow?.text?.trim() || "Survey";
  const survey: TCanonicalSurvey = {
    schemaVersion: 1,
    externalId: externalId(surveyTitle, "SURVEY"),
    defaultLanguage: language,
    languages,
    title: { [language]: surveyTitle },
    groups: deduplicatedGroups,
    questions: deduplicatedQuestions,
    variables: deduplicatedVariables,
    endings,
  };
  diagnostics.push(...validateCanonicalSurvey(survey));
  return {
    mode: options.mode ?? "previewOnly",
    sourceChecksum,
    canonicalChecksum: createCanonicalChecksum(survey),
    canonicalSurvey: options.mode === "validateOnly" ? undefined : survey,
    diagnostics,
  };
};
