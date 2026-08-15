import { GENERATED_SURVEY_ELEMENT_TYPES } from "./constants";

// Gemini's structured-output drafts are loosely shaped: it omits inapplicable fields,
// emits null, and invents extra keys (id, html, thankYouCard, longForm). The ForAI
// schema tolerates that, and this sanitizer normalizes the model output into the strict
// downstream draft shape before it is parsed and converted into a v3 create payload.
// Every field that is dropped or defaulted here has a safe default in buildElement.

const DRAFT_KEYS = new Set(["language", "name", "description", "welcomeCard", "ending", "blocks"]);
const WELCOME_CARD_KEYS = new Set(["enabled", "headline", "subheader", "buttonLabel"]);
const ENDING_KEYS = new Set(["headline", "subheader"]);
const BLOCK_KEYS = new Set(["name", "questions"]);
const QUESTION_KEYS = new Set([
  "type",
  "headline",
  "subheader",
  "required",
  "placeholder",
  "longAnswer",
  "choices",
  "rows",
  "columns",
  "lowerLabel",
  "upperLabel",
  "scale",
  "format",
  "range",
]);

const ELEMENT_TYPES = new Set<string>(GENERATED_SURVEY_ELEMENT_TYPES);
const RATING_RANGES = new Set(["5", "7", "10"]);
const SCALE_OPTIONS = new Set(["number", "smiley", "star"]);
const DATE_FORMATS = new Set(["M-d-y", "d-M-y", "y-M-d"]);
const CHOICE_QUESTION_TYPES = new Set(["multipleChoiceSingle", "multipleChoiceMulti", "ranking"]);

// Must match the caps in schemas.ts; over-long model output is truncated (not rejected) so
// a single long statement can never fail the whole survey.
const MAX_TEXT_LENGTH = 500;
const MAX_CHOICE_LENGTH = 300;
const MAX_LABEL_LENGTH = 120;

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function pickKeys(value: unknown, allowedKeys: Set<string>): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(([key]) => allowedKeys.has(key))
  );
}

function nullableString(value: unknown, maxLength = MAX_TEXT_LENGTH): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  return truncate(trimmed, maxLength);
}

function nullableChoiceList(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const choices = value
    .filter((choice): choice is string => typeof choice === "string")
    .map((choice) => truncate(choice.trim(), MAX_CHOICE_LENGTH))
    .filter((choice) => choice.length > 0)
    .slice(0, 20);

  return choices.length > 0 ? choices : null;
}

function sanitizeQuestion(value: unknown): Record<string, unknown> | null {
  const question = pickKeys(value, QUESTION_KEYS);
  if (!question) {
    return null;
  }

  if (
    typeof question.type !== "string" ||
    !ELEMENT_TYPES.has(question.type) ||
    typeof question.headline !== "string"
  ) {
    return null;
  }

  const range = question.range;
  const normalizedRange =
    typeof range === "string" && RATING_RANGES.has(range)
      ? range
      : typeof range === "number" && RATING_RANGES.has(String(range))
        ? String(range)
        : null;

  // The draft schema requires csat -> range "5" and ces -> range "5" | "7"; default them so
  // a model that omits the range cannot fail the whole survey.
  const repairedRange =
    question.type === "csat" && !normalizedRange
      ? "5"
      : question.type === "ces" && !normalizedRange
        ? "7"
        : normalizedRange;

  const scale = question.scale;
  const normalizedScale = typeof scale === "string" && SCALE_OPTIONS.has(scale) ? scale : null;

  const format = question.format;
  const normalizedFormat = typeof format === "string" && DATE_FORMATS.has(format) ? format : null;

  const choices = nullableChoiceList(question.choices);
  const rows = nullableChoiceList(question.rows);
  const columns = nullableChoiceList(question.columns);

  let type = question.type;
  // Choice questions need at least 2 options and matrix questions need at least 2 rows and
  // columns; a degenerate question would fail the strict draft parse. Convert it to openText
  // (keeping the headline) instead of failing the whole survey.
  if (
    (CHOICE_QUESTION_TYPES.has(type) && (!choices || choices.length < 2)) ||
    (type === "matrix" && (!rows || rows.length < 2 || !columns || columns.length < 2))
  ) {
    type = "openText";
    return {
      type,
      headline: truncate(question.headline.trim(), MAX_TEXT_LENGTH),
      subheader: nullableString(question.subheader),
      required: typeof question.required === "boolean" ? question.required : true,
      placeholder: nullableString(question.placeholder, MAX_LABEL_LENGTH),
      longAnswer: typeof question.longAnswer === "boolean" ? question.longAnswer : null,
      choices: null,
      rows: null,
      columns: null,
      lowerLabel: nullableString(question.lowerLabel, MAX_LABEL_LENGTH),
      upperLabel: nullableString(question.upperLabel, MAX_LABEL_LENGTH),
      scale: null,
      format: null,
      range: null,
    };
  }

  return {
    type,
    headline: truncate(question.headline.trim(), MAX_TEXT_LENGTH),
    subheader: nullableString(question.subheader),
    required: typeof question.required === "boolean" ? question.required : true,
    placeholder: nullableString(question.placeholder, MAX_LABEL_LENGTH),
    longAnswer: typeof question.longAnswer === "boolean" ? question.longAnswer : null,
    choices,
    rows,
    columns,
    lowerLabel: nullableString(question.lowerLabel, MAX_LABEL_LENGTH),
    upperLabel: nullableString(question.upperLabel, MAX_LABEL_LENGTH),
    scale: normalizedScale,
    format: normalizedFormat,
    range: repairedRange,
  };
}

function sanitizeBlock(value: unknown): Record<string, unknown> | null {
  const block = pickKeys(value, BLOCK_KEYS);
  if (!block) {
    return null;
  }

  const questions = Array.isArray(block.questions)
    ? block.questions
        .map(sanitizeQuestion)
        .filter((question): question is Record<string, unknown> => question !== null)
    : [];

  if (questions.length === 0) {
    return null;
  }

  return {
    name:
      typeof block.name === "string" && block.name.trim().length > 0
        ? truncate(block.name.trim(), MAX_TEXT_LENGTH)
        : "Untitled block",
    questions,
  };
}

export function sanitizeGeneratedSurveyDraft(draft: unknown): unknown {
  const raw = pickKeys(draft, DRAFT_KEYS);
  if (!raw) {
    return draft;
  }

  const welcomeCard = pickKeys(raw.welcomeCard, WELCOME_CARD_KEYS);
  const ending = pickKeys(raw.ending, ENDING_KEYS);

  const blocks = Array.isArray(raw.blocks)
    ? raw.blocks.map(sanitizeBlock).filter((block): block is Record<string, unknown> => block !== null)
    : [];

  return {
    language: raw.language,
    name: typeof raw.name === "string" ? truncate(raw.name.trim(), MAX_TEXT_LENGTH) : raw.name,
    description: nullableString(raw.description),
    welcomeCard: welcomeCard
      ? {
          ...welcomeCard,
          enabled: typeof welcomeCard.enabled === "boolean" ? welcomeCard.enabled : true,
          headline: nullableString(welcomeCard.headline),
          subheader: nullableString(welcomeCard.subheader),
          buttonLabel: nullableString(welcomeCard.buttonLabel),
        }
      : null,
    ending: ending
      ? {
          headline: nullableString(ending.headline),
          subheader: nullableString(ending.subheader),
        }
      : null,
    blocks,
  };
}
