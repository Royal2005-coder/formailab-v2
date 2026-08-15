import { z } from "zod";

export const CANONICAL_SURVEY_SCHEMA_VERSION = 1 as const;

export const ZExternalId = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z][A-Za-z0-9_-]*$/, "Use letters, numbers, underscores, or hyphens");

export const ZLocalizedText = z.record(z.string().min(2), z.string());

export const ZCompatibilityClass = z.enum(["native", "compiled", "extended", "unsupported"]);

export const ZCanonicalValueType = z.enum(["string", "number", "boolean", "date", "stringArray"]);

export const ZCanonicalVariable = z.object({
  externalId: ZExternalId,
  type: ZCanonicalValueType,
  name: z.string().min(1),
  defaultValue: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]).optional(),
  calculation: z.string().min(1).optional(),
});

export const ZCanonicalOption = z.object({
  externalId: ZExternalId,
  label: ZLocalizedText,
  value: z.union([z.string(), z.number()]),
  order: z.number().int().nonnegative(),
});

export const ZCanonicalRating = z.object({
  range: z.literal(5),
  scale: z.literal("number"),
  lowerLabel: ZLocalizedText.optional(),
  upperLabel: ZLocalizedText.optional(),
});

export const ZCanonicalMatrix = z.object({
  rows: z.array(ZCanonicalOption).min(1),
  columns: z.array(ZCanonicalOption).min(2),
});

export const ZCanonicalQuestionType = z.enum([
  "openText",
  "singleChoice",
  "multipleChoice",
  "numeric",
  "rating",
  "ranking",
  "matrix",
  "date",
  "fileUpload",
  "consent",
  "display",
  "equation",
]);

export const ZCanonicalFormbricksType = z.enum([
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
]);

export const ZCanonicalQuestionValidation = z.object({
  min: z.number().optional(),
  max: z.number().optional(),
  pattern: z.string().min(1).optional(),
});

export const ZCanonicalQuestion = z
  .object({
    externalId: ZExternalId,
    groupExternalId: ZExternalId,
    type: ZCanonicalQuestionType,
    label: ZLocalizedText,
    help: ZLocalizedText.optional(),
    order: z.number().int().nonnegative(),
    mandatory: z.boolean(),
    relevance: z.string().min(1).optional(),
    calculation: z.string().min(1).optional(),
    options: z.array(ZCanonicalOption).default([]),
    rating: ZCanonicalRating.optional(),
    matrix: ZCanonicalMatrix.optional(),
    formbricksType: ZCanonicalFormbricksType.optional(),
    displayType: z.enum(["list", "dropdown"]).optional(),
    shuffleOption: z
      .enum(["none", "all", "exceptLast", "reverseOrderOccasionally", "reverseOrderExceptLast"])
      .optional(),
    longAnswer: z.boolean().optional(),
    inputType: z.enum(["text", "email", "url", "number", "phone"]).optional(),
    placeholder: ZLocalizedText.optional(),
    range: z.union([z.literal(3), z.literal(4), z.literal(5), z.literal(7), z.literal(10)]).optional(),
    scale: z.enum(["number", "smiley", "star"]).optional(),
    validation: ZCanonicalQuestionValidation.optional(),
  })
  .superRefine((question, context) => {
    if (question.type === "rating" && !question.rating) {
      context.addIssue({
        code: "custom",
        message: "Rating questions require an explicit rating configuration",
        path: ["rating"],
      });
    }
    if (question.type === "matrix" && !question.matrix) {
      context.addIssue({
        code: "custom",
        message: "Matrix questions require explicit row and column definitions",
        path: ["matrix"],
      });
    }
    if (question.type === "equation" && !question.calculation) {
      context.addIssue({
        code: "custom",
        message: "Equation questions require a calculation expression",
        path: ["calculation"],
      });
    }
    if (question.type !== "equation" && question.calculation) {
      context.addIssue({
        code: "custom",
        message: "Only equation questions can define a calculation expression",
        path: ["calculation"],
      });
    }
    if (question.type !== "rating" && question.rating) {
      context.addIssue({
        code: "custom",
        message: "Only rating questions can define rating configuration",
        path: ["rating"],
      });
    }
    if (question.type !== "matrix" && question.matrix) {
      context.addIssue({
        code: "custom",
        message: "Only matrix questions can define matrix axes",
        path: ["matrix"],
      });
    }
    if (question.matrix) {
      const ids = [
        ...question.matrix.rows.map(({ externalId }) => externalId),
        ...question.matrix.columns.map(({ externalId }) => externalId),
      ];
      if (new Set(ids).size !== ids.length) {
        context.addIssue({
          code: "custom",
          message: "Matrix row and column external IDs must be unique within the question",
          path: ["matrix"],
        });
      }
    }
  });

export const ZCanonicalGroup = z.object({
  externalId: ZExternalId,
  title: ZLocalizedText,
  description: ZLocalizedText.optional(),
  order: z.number().int().nonnegative(),
  relevance: z.string().min(1).optional(),
});

export const ZCanonicalEnding = z.object({
  externalId: ZExternalId,
  title: ZLocalizedText,
  description: ZLocalizedText.optional(),
});

export const ZCanonicalSurvey = z.object({
  schemaVersion: z.literal(CANONICAL_SURVEY_SCHEMA_VERSION),
  externalId: ZExternalId,
  defaultLanguage: z.string().min(2),
  languages: z.array(z.string().min(2)).min(1),
  title: ZLocalizedText,
  groups: z.array(ZCanonicalGroup),
  questions: z.array(ZCanonicalQuestion),
  variables: z.array(ZCanonicalVariable).default([]),
  endings: z.array(ZCanonicalEnding).min(1),
});

export const ZImportSourceLocation = z.object({
  sheet: z.string().min(1),
  row: z.number().int().positive(),
  column: z.string().min(1).optional(),
});

export const ZImportDiagnostic = z.object({
  severity: z.enum(["error", "warning", "manualReview"]),
  code: z.string().min(1),
  message: z.string().min(1),
  source: ZImportSourceLocation.optional(),
  externalId: ZExternalId.optional(),
});

export const ZImportMode = z.enum([
  "validateOnly",
  "previewOnly",
  "createSurvey",
  "replaceDraft",
  "createVersion",
  "cloneTemplate",
]);

export const ZImportResult = z.object({
  mode: ZImportMode,
  sourceChecksum: z.string().min(1),
  canonicalChecksum: z.string().min(1).optional(),
  canonicalSurvey: ZCanonicalSurvey.optional(),
  diagnostics: z.array(ZImportDiagnostic),
});

export type TCanonicalSurvey = z.infer<typeof ZCanonicalSurvey>;
export type TCanonicalQuestion = z.infer<typeof ZCanonicalQuestion>;
export type TCompatibilityClass = z.infer<typeof ZCompatibilityClass>;
export type TImportDiagnostic = z.infer<typeof ZImportDiagnostic>;
export type TImportResult = z.infer<typeof ZImportResult>;
