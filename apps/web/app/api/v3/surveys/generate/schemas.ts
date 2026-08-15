import { z } from "zod";
import { normalizeLanguageCode } from "@formbricks/i18n-utils/src/canonical";
import { ZUserLocale } from "@formbricks/types/user";
import {
  GENERATED_SURVEY_ELEMENT_TYPES,
  GENERATED_SURVEY_MAX_BLOCKS,
  GENERATED_SURVEY_MAX_QUESTIONS_PER_BLOCK,
  GENERATED_SURVEY_MIN_BLOCKS,
  GENERATED_SURVEY_MIN_QUESTIONS_PER_BLOCK,
  V3_SURVEY_GENERATE_PROMPT_MAX_LENGTH,
  V3_SURVEY_GENERATE_PROMPT_MIN_LENGTH,
} from "./constants";

export const V3_SURVEY_GENERATE_ALLOWED_LOCALES = [
  ...ZUserLocale.options,
  // Vietnamese is not a supported app UI locale, but the AI Lab deployment is Vietnamese-first:
  // imported test banks and generated drafts are written in Vietnamese. The survey pipeline
  // accepts any canonical locale (vi-VN) for CREATE, so drafts may be tagged vi-VN.
  "vi-VN",
] as const;
export const ZV3SurveyGenerateAllowedLocale = z.enum(V3_SURVEY_GENERATE_ALLOWED_LOCALES);
export type TV3SurveyGenerateAllowedLocale = z.infer<typeof ZV3SurveyGenerateAllowedLocale>;

const ALLOWED_GENERATE_LOCALE_LOOKUP = new Map<string, TV3SurveyGenerateAllowedLocale>(
  V3_SURVEY_GENERATE_ALLOWED_LOCALES.map((locale) => [locale.toLowerCase(), locale] as const)
);

const ALLOWED_GENERATE_LOCALE_BASE_LOOKUP = new Map<string, TV3SurveyGenerateAllowedLocale | null>();

for (const locale of V3_SURVEY_GENERATE_ALLOWED_LOCALES) {
  const base = locale.toLowerCase().split(/[-_]/)[0];
  if (!ALLOWED_GENERATE_LOCALE_BASE_LOOKUP.has(base)) {
    ALLOWED_GENERATE_LOCALE_BASE_LOOKUP.set(base, locale);
  } else if (ALLOWED_GENERATE_LOCALE_BASE_LOOKUP.get(base) !== locale) {
    // Ambiguous base (e.g. "pt" -> pt-BR/pt-PT, "zh" -> zh-Hans-CN/zh-Hant-TW): never auto-map.
    ALLOWED_GENERATE_LOCALE_BASE_LOOKUP.set(base, null);
  }
}

export function normalizeV3SurveyGenerateLocale(value: string): TV3SurveyGenerateAllowedLocale | null {
  const normalizedLanguage = normalizeLanguageCode(value);

  if (!normalizedLanguage) {
    return null;
  }

  const exactMatch = ALLOWED_GENERATE_LOCALE_LOOKUP.get(normalizedLanguage.toLowerCase());
  if (exactMatch) {
    return exactMatch;
  }

  // Bare base codes without a region (e.g. "vi" -> vi-VN) map only when the base is unambiguous.
  // Region-qualified codes (e.g. "en-GB") never auto-map: they would silently relabel content.
  if (/^[a-z]{2,3}$/i.test(normalizedLanguage)) {
    const baseMatch = ALLOWED_GENERATE_LOCALE_BASE_LOOKUP.get(normalizedLanguage.toLowerCase());
    if (baseMatch) {
      return baseMatch;
    }
  }

  return null;
}

// Draft-language schema: accepts the allowed locale codes and maps bare bases like "vi" -> "vi-VN".
export const ZGeneratedSurveyLocale = z.preprocess(
  (value) => (typeof value === "string" ? (normalizeV3SurveyGenerateLocale(value) ?? value) : value),
  ZV3SurveyGenerateAllowedLocale
);

const ZV3SurveyGenerateLanguage = z
  .string()
  .trim()
  .min(1, "Language code is required")
  .transform((value, ctx) => {
    const normalizedLanguage = normalizeV3SurveyGenerateLocale(value);

    if (!normalizedLanguage) {
      ctx.addIssue({
        code: "custom",
        message: `Language '${value}' is not supported for AI survey creation`,
      });
      return z.NEVER;
    }

    return normalizedLanguage;
  });

export const ZV3SurveyGenerateBody = z
  .object({
    workspaceId: z.cuid2(),
    prompt: z
      .string()
      .trim()
      .min(
        V3_SURVEY_GENERATE_PROMPT_MIN_LENGTH,
        `Prompt must be at least ${V3_SURVEY_GENERATE_PROMPT_MIN_LENGTH} characters`
      )
      .max(
        V3_SURVEY_GENERATE_PROMPT_MAX_LENGTH,
        `Prompt must be ${V3_SURVEY_GENERATE_PROMPT_MAX_LENGTH} characters or less`
      ),
    type: z.enum(["link", "app"]).prefault("link"),
    language: ZV3SurveyGenerateLanguage.optional(),
  })
  .strict();

// Lengths are unbounded here: the model occasionally emits over-long statements (long
// Vietnamese choice options, verbose descriptions), and the sanitizer in sanitize.ts
// truncates everything to the documented caps (500/300/120 chars, 20 choices) before the
// strict downstream parse. The v3 create schema / DB impose no length limits either.
const ZGeneratedText = z.string().trim().min(1);
const ZGeneratedDescription = z.string().trim().min(1);
const ZGeneratedChoice = z.string().trim().min(1);
// Draft-list: strict minimum (choice questions must have at least 2 options).
const ZGeneratedChoiceList = z.array(ZGeneratedChoice).min(2).max(20);
// Provider-facing list: accepts degenerate model output (a single choice); the sanitizer
// converts choice questions with fewer than 2 options into openText before the strict parse.
const ZGeneratedChoiceListForAI = z.array(ZGeneratedChoice).min(1).max(20);
const ZGeneratedRatingRangeForAI = z.enum(["5", "7", "10"]);
const ZGeneratedRatingRange = z.preprocess(
  (value) => (typeof value === "number" ? String(value) : value),
  ZGeneratedRatingRangeForAI.transform((value) => Number(value) as 5 | 7 | 10)
);

// Fields are "nullable + optional" because Gemini routinely omits inapplicable fields
// (e.g. no placeholder on a choice question) or emits them as null. The sanitizer in
// sanitize.ts strips unknown keys (id, html, thankYouCard, ...) before the strict
// downstream parse, and buildElement defaults every missing/null field.
const generatedSurveyElementShape = {
  type: z.enum(GENERATED_SURVEY_ELEMENT_TYPES),
  headline: ZGeneratedText,
  subheader: ZGeneratedDescription.nullable().optional(),
  required: z.boolean(),
  placeholder: z.string().trim().min(1).nullable().optional(),
  longAnswer: z.boolean().nullable().optional(),
  choices: ZGeneratedChoiceList.nullable().optional(),
  rows: ZGeneratedChoiceList.nullable().optional(),
  columns: ZGeneratedChoiceList.nullable().optional(),
  lowerLabel: z.string().trim().min(1).nullable().optional(),
  upperLabel: z.string().trim().min(1).nullable().optional(),
  scale: z.enum(["number", "smiley", "star"]).nullable().optional(),
  format: z.enum(["M-d-y", "d-M-y", "y-M-d"]).nullable().optional(),
} as const;

function validateGeneratedSurveyElement(
  element: {
    type?: string;
    choices?: string[] | null;
    rows?: string[] | null;
    columns?: string[] | null;
    range?: string | number | null;
    [key: string]: unknown;
  },
  ctx: z.RefinementCtx
): void {
  if (
    (element.type === "multipleChoiceSingle" ||
      element.type === "multipleChoiceMulti" ||
      element.type === "ranking") &&
    !element.choices
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["choices"],
      message: "Choice questions must include choices",
    });
  }

  if (element.type === "matrix") {
    if (!element.rows) {
      ctx.addIssue({
        code: "custom",
        path: ["rows"],
        message: "Matrix questions must include rows",
      });
    }

    if (!element.columns) {
      ctx.addIssue({
        code: "custom",
        path: ["columns"],
        message: "Matrix questions must include columns",
      });
    }
  }

  if (element.type === "csat" && element.range !== "5" && element.range !== 5) {
    ctx.addIssue({
      code: "custom",
      path: ["range"],
      message: "CSAT questions must use a range of 5",
    });
  }

  if (
    element.type === "ces" &&
    element.range !== "5" &&
    element.range !== 5 &&
    element.range !== "7" &&
    element.range !== 7
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["range"],
      message: "CES questions must use a range of 5 or 7",
    });
  }
}

export const ZGeneratedSurveyElementForAI = z
  .object({
    ...generatedSurveyElementShape,
    choices: ZGeneratedChoiceListForAI.nullable().optional(),
    rows: ZGeneratedChoiceListForAI.nullable().optional(),
    columns: ZGeneratedChoiceListForAI.nullable().optional(),
    range: ZGeneratedRatingRangeForAI.nullable().optional(),
  })
  // No superRefine here: the provider-facing schema is a coarse gate. The sanitizer repairs
  // degenerate output (e.g. choice questions without enough options) before the strict
  // downstream ZGeneratedSurveyDraft parse, which runs the full validation.
  .passthrough();

const ZGeneratedSurveyElement = z
  .object({
    ...generatedSurveyElementShape,
    range: ZGeneratedRatingRange.nullable().optional(),
  })
  .passthrough()
  .superRefine(validateGeneratedSurveyElement);

const ZGeneratedSurveyBlockForAI = z
  .object({
    name: ZGeneratedText,
    questions: z
      .array(ZGeneratedSurveyElementForAI)
      .min(GENERATED_SURVEY_MIN_QUESTIONS_PER_BLOCK)
      .max(GENERATED_SURVEY_MAX_QUESTIONS_PER_BLOCK),
  })
  .passthrough();

const ZGeneratedSurveyBlock = z
  .object({
    name: ZGeneratedText,
    questions: z
      .array(ZGeneratedSurveyElement)
      .min(GENERATED_SURVEY_MIN_QUESTIONS_PER_BLOCK)
      .max(GENERATED_SURVEY_MAX_QUESTIONS_PER_BLOCK),
  })
  .passthrough();

const generatedSurveyDraftShape = {
  language: ZGeneratedSurveyLocale,
  name: ZGeneratedText,
  description: ZGeneratedDescription.nullable().optional(),
  welcomeCard: z
    .object({
      enabled: z.boolean(),
      headline: ZGeneratedText.nullable(),
      subheader: ZGeneratedDescription.nullable(),
      buttonLabel: ZGeneratedText.nullable(),
    })
    .passthrough()
    .nullable()
    .optional(),
  ending: z
    .object({
      headline: ZGeneratedText.nullable(),
      subheader: ZGeneratedDescription.nullable(),
    })
    .passthrough()
    .nullable()
    .optional(),
} as const;

export const ZGeneratedSurveyDraftForAI = z
  .object({
    ...generatedSurveyDraftShape,
    blocks: z
      .array(ZGeneratedSurveyBlockForAI)
      .min(GENERATED_SURVEY_MIN_BLOCKS)
      .max(GENERATED_SURVEY_MAX_BLOCKS),
  })
  .passthrough();

export const ZGeneratedSurveyDraft = z
  .object({
    ...generatedSurveyDraftShape,
    blocks: z.array(ZGeneratedSurveyBlock).min(GENERATED_SURVEY_MIN_BLOCKS).max(GENERATED_SURVEY_MAX_BLOCKS),
  })
  .passthrough();

export type TV3SurveyGenerateBody = z.infer<typeof ZV3SurveyGenerateBody>;
export type TGeneratedSurveyDraft = z.infer<typeof ZGeneratedSurveyDraft>;
export type TGeneratedSurveyElement = z.infer<typeof ZGeneratedSurveyElement>;
