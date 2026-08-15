import { describe, expect, test } from "vitest";
import type { TCanonicalSurvey } from "@formbricks/survey-compiler";
import { normalizeImportLocales } from "./normalize-import-locales";

const survey = {
  schemaVersion: 1,
  externalId: "SURVEY",
  defaultLanguage: "en",
  languages: ["en", "de", "EN_us"],
  title: { en: "Survey", EN_us: "Survey", de: "Umfrage" },
  groups: [
    {
      externalId: "GROUP",
      title: { en: "Group", de: "Gruppe" },
      description: { EN_us: "Description" },
      order: 0,
    },
  ],
  questions: [
    {
      externalId: "QUESTION",
      groupExternalId: "GROUP",
      type: "singleChoice",
      label: { en: "Question", de: "Frage" },
      help: { EN_us: "Help" },
      order: 0,
      mandatory: false,
      options: [{ externalId: "OPTION", label: { en: "Option", de: "Option" }, value: "yes", order: 0 }],
    },
  ],
  variables: [],
  endings: [
    {
      externalId: "ENDING",
      title: { en: "Done", de: "Fertig" },
      description: { EN_us: "Thank you" },
    },
  ],
} satisfies TCanonicalSurvey;

describe("normalizeImportLocales", () => {
  test("normalizes and deduplicates survey languages while preserving their first-seen order", () => {
    const normalized = normalizeImportLocales(survey);

    expect(normalized.defaultLanguage).toBe("en-US");
    expect(normalized.languages).toEqual(["en-US", "de-DE"]);
  });

  test("normalizes every localized field and merges identical aliases", () => {
    const normalized = normalizeImportLocales(survey);

    expect(normalized.title).toEqual({ "en-US": "Survey", "de-DE": "Umfrage" });
    expect(normalized.groups[0]).toMatchObject({
      title: { "en-US": "Group", "de-DE": "Gruppe" },
      description: { "en-US": "Description" },
    });
    expect(normalized.questions[0]).toMatchObject({
      label: { "en-US": "Question", "de-DE": "Frage" },
      help: { "en-US": "Help" },
      options: [{ label: { "en-US": "Option", "de-DE": "Option" } }],
    });
    expect(normalized.endings[0]).toMatchObject({
      title: { "en-US": "Done", "de-DE": "Fertig" },
      description: { "en-US": "Thank you" },
    });
  });

  test("rejects aliases with different localized values", () => {
    expect(() =>
      normalizeImportLocales({
        ...survey,
        title: { en: "Survey", "en-US": "Different survey" },
      })
    ).toThrowError(
      'Conflicting localized values for "survey.title" aliases "en" and "en-US" (canonical "en-US")'
    );
  });

  test("rejects unsupported language codes in the language list and localized maps", () => {
    expect(() => normalizeImportLocales({ ...survey, languages: ["en", "not a language"] })).toThrowError(
      'Unsupported language code "not a language" at "survey.languages[1]"'
    );

    expect(() =>
      normalizeImportLocales({ ...survey, title: { en: "Survey", invalid_locale: "No" } })
    ).toThrowError('Unsupported language code "invalid_locale" at "survey.title"');
  });

  test("rejects a normalized default language absent from the normalized language list", () => {
    expect(() =>
      normalizeImportLocales({ ...survey, defaultLanguage: "fr", languages: ["en", "de"] })
    ).toThrowError('Default language "fr-FR" is missing from survey languages');
  });
});
