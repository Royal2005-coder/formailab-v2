import { TSurveyElementTypeEnum } from "@formbricks/types/surveys/constants";

export const V3_SURVEY_GENERATE_PROMPT_MIN_LENGTH = 4;
export const V3_SURVEY_GENERATE_PROMPT_DETAIL_MIN_LENGTH = 24;
export const V3_SURVEY_GENERATE_PROMPT_DETAIL_MIN_WORDS = 4;
export const V3_SURVEY_GENERATE_PROMPT_MAX_LENGTH = 50000;

// Gemini 2.5 models are reasoning models: they spend output tokens on "thinking" before
// emitting the JSON draft. Large question-bank documents (30+ questions) need well over
// 8K output tokens (measured: ~11K for a 30-question bank, ~4K of it reasoning), so the
// old 3000/8192 budgets truncated the JSON and surfaced as AI_NoOutputGeneratedError.
// 32768 leaves headroom for the largest imported test banks (60+ questions).
export const V3_SURVEY_GENERATE_MAX_OUTPUT_TOKENS = 32768;

// Generating full drafts for large imported test banks takes well over 45s (measured:
// ~90s for a 30-question bank). The client keeps the request open until it resolves.
export const V3_SURVEY_GENERATION_TIMEOUT_MS = 180_000;

export const GENERATED_SURVEY_MIN_BLOCKS = 1;
export const GENERATED_SURVEY_MAX_BLOCKS = 25;
export const GENERATED_SURVEY_MIN_QUESTIONS_PER_BLOCK = 1;
export const GENERATED_SURVEY_MAX_QUESTIONS_PER_BLOCK = 10;
export const GENERATED_SURVEY_ELEMENT_TYPES = [
  TSurveyElementTypeEnum.OpenText,
  TSurveyElementTypeEnum.MultipleChoiceSingle,
  TSurveyElementTypeEnum.MultipleChoiceMulti,
  TSurveyElementTypeEnum.NPS,
  TSurveyElementTypeEnum.Rating,
  TSurveyElementTypeEnum.CSAT,
  TSurveyElementTypeEnum.CES,
  TSurveyElementTypeEnum.Ranking,
  TSurveyElementTypeEnum.Matrix,
  TSurveyElementTypeEnum.Date,
] as const;
