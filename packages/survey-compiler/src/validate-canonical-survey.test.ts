import { describe, expect, test } from "vitest";
import { validateCanonicalSurvey } from "./validate-canonical-survey";

const validSurvey = {
  schemaVersion: 1,
  externalId: "AILAB_DEMO",
  defaultLanguage: "en-US",
  languages: ["en-US", "vi"],
  title: { "en-US": "AI LAB demo" },
  groups: [{ externalId: "PROFILE", title: { "en-US": "Profile" }, order: 0 }],
  questions: [
    {
      externalId: "ROLE",
      groupExternalId: "PROFILE",
      type: "singleChoice",
      label: { "en-US": "What is your role?" },
      order: 0,
      mandatory: true,
      options: [{ externalId: "student", label: { "en-US": "Student" }, value: "student", order: 0 }],
    },
  ],
  variables: [],
  endings: [{ externalId: "COMPLETE", title: { "en-US": "Thank you" } }],
};

describe("validateCanonicalSurvey", () => {
  test("accepts a valid canonical survey", () => {
    expect(validateCanonicalSurvey(validSurvey)).toEqual([]);
  });

  test("reports missing group references", () => {
    const survey = structuredClone(validSurvey);
    survey.questions[0]!.groupExternalId = "MISSING";

    expect(validateCanonicalSurvey(survey)).toContainEqual({
      severity: "error",
      code: "canonical.question.group_missing",
      message: "Question 'ROLE' references missing group 'MISSING'",
      externalId: "ROLE",
    });
  });

  test("reports duplicate canonical IDs", () => {
    const survey = structuredClone(validSurvey);
    survey.endings[0]!.externalId = "ROLE";

    expect(validateCanonicalSurvey(survey)).toContainEqual({
      severity: "error",
      code: "canonical.external_id.duplicate",
      message: "External ID 'ROLE' is used by more than one canonical entity",
      externalId: "ROLE",
    });
  });

  test("reports an undeclared default language", () => {
    const survey = structuredClone(validSurvey);
    survey.defaultLanguage = "de";

    expect(validateCanonicalSurvey(survey)).toContainEqual({
      severity: "error",
      code: "canonical.language.default_missing",
      message: "Default language 'de' is not declared in languages",
    });
  });
});
