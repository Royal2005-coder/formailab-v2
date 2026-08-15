import { CANONICAL_LANGUAGE_CODES, normalizeLanguageCode } from "@formbricks/i18n-utils/src/canonical";
import type { TCanonicalSurvey } from "@formbricks/survey-compiler";

const supportedLanguageCodes = new Set(CANONICAL_LANGUAGE_CODES);

const canonicalize = (languageCode: string, path: string): string => {
  const normalized = normalizeLanguageCode(languageCode);
  if (normalized === null || !supportedLanguageCodes.has(normalized)) {
    throw new Error(`Unsupported language code "${languageCode}" at "${path}"`);
  }
  return normalized;
};

const normalizeLocalizedText = (
  localizedText: Record<string, string>,
  path: string
): Record<string, string> => {
  const normalized: Record<string, string> = {};
  const sourceAliases = new Map<string, string>();

  for (const [languageCode, value] of Object.entries(localizedText)) {
    const normalizedLanguageCode = canonicalize(languageCode, path);
    const existingValue = normalized[normalizedLanguageCode];

    if (existingValue !== undefined && existingValue !== value) {
      throw new Error(
        `Conflicting localized values for "${path}" aliases "${sourceAliases.get(normalizedLanguageCode)}" and "${languageCode}" (canonical "${normalizedLanguageCode}")`
      );
    }

    if (existingValue === undefined) {
      normalized[normalizedLanguageCode] = value;
      sourceAliases.set(normalizedLanguageCode, languageCode);
    }
  }

  return normalized;
};

export const normalizeImportLocales = (survey: TCanonicalSurvey): TCanonicalSurvey => {
  const languages = survey.languages.reduce<string[]>((normalized, languageCode, index) => {
    const normalizedLanguageCode = canonicalize(languageCode, `survey.languages[${index}]`);
    if (!normalized.includes(normalizedLanguageCode)) normalized.push(normalizedLanguageCode);
    return normalized;
  }, []);
  const defaultLanguage = canonicalize(survey.defaultLanguage, "survey.defaultLanguage");

  if (!languages.includes(defaultLanguage)) {
    throw new Error(`Default language "${defaultLanguage}" is missing from survey languages`);
  }

  return {
    ...survey,
    defaultLanguage,
    languages,
    title: normalizeLocalizedText(survey.title, "survey.title"),
    groups: survey.groups.map((group, groupIndex) => ({
      ...group,
      title: normalizeLocalizedText(group.title, `survey.groups[${groupIndex}].title`),
      ...(group.description
        ? {
            description: normalizeLocalizedText(
              group.description,
              `survey.groups[${groupIndex}].description`
            ),
          }
        : {}),
    })),
    questions: survey.questions.map((question, questionIndex) => ({
      ...question,
      label: normalizeLocalizedText(question.label, `survey.questions[${questionIndex}].label`),
      ...(question.help
        ? { help: normalizeLocalizedText(question.help, `survey.questions[${questionIndex}].help`) }
        : {}),
      options: question.options.map((option, optionIndex) => ({
        ...option,
        label: normalizeLocalizedText(
          option.label,
          `survey.questions[${questionIndex}].options[${optionIndex}].label`
        ),
      })),
    })),
    endings: survey.endings.map((ending, endingIndex) => ({
      ...ending,
      title: normalizeLocalizedText(ending.title, `survey.endings[${endingIndex}].title`),
      ...(ending.description
        ? {
            description: normalizeLocalizedText(
              ending.description,
              `survey.endings[${endingIndex}].description`
            ),
          }
        : {}),
    })),
  };
};
