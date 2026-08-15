import { type TCanonicalSurvey, type TImportDiagnostic, ZCanonicalSurvey } from "./contracts";

const getDuplicateIds = (ids: string[]): string[] => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const id of ids) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }

  return [...duplicates].sort();
};

export const validateCanonicalSurvey = (input: unknown): TImportDiagnostic[] => {
  const parsedSurvey = ZCanonicalSurvey.safeParse(input);

  if (!parsedSurvey.success) {
    return parsedSurvey.error.issues.map((issue) => ({
      severity: "error",
      code: "canonical.schema.invalid",
      message: `${issue.path.join(".") || "survey"}: ${issue.message}`,
    }));
  }

  return validateReferences(parsedSurvey.data);
};

const validateReferences = (survey: TCanonicalSurvey): TImportDiagnostic[] => {
  const diagnostics: TImportDiagnostic[] = [];
  const groupIds = new Set(survey.groups.map((group) => group.externalId));
  const allIds = [
    ...survey.groups.map((group) => group.externalId),
    ...survey.questions.map((question) => question.externalId),
    ...survey.variables.map((variable) => variable.externalId),
    ...survey.endings.map((ending) => ending.externalId),
  ];

  for (const duplicateId of getDuplicateIds(allIds)) {
    diagnostics.push({
      severity: "error",
      code: "canonical.external_id.duplicate",
      message: `External ID '${duplicateId}' is used by more than one canonical entity`,
      externalId: duplicateId,
    });
  }

  for (const question of survey.questions) {
    if (!groupIds.has(question.groupExternalId)) {
      diagnostics.push({
        severity: "error",
        code: "canonical.question.group_missing",
        message: `Question '${question.externalId}' references missing group '${question.groupExternalId}'`,
        externalId: question.externalId,
      });
    }

    for (const duplicateOptionId of getDuplicateIds(question.options.map((option) => option.externalId))) {
      diagnostics.push({
        severity: "error",
        code: "canonical.option.external_id.duplicate",
        message: `Question '${question.externalId}' contains duplicate option '${duplicateOptionId}'`,
        externalId: question.externalId,
      });
    }
  }

  if (!survey.languages.includes(survey.defaultLanguage)) {
    diagnostics.push({
      severity: "error",
      code: "canonical.language.default_missing",
      message: `Default language '${survey.defaultLanguage}' is not declared in languages`,
    });
  }

  return diagnostics;
};
