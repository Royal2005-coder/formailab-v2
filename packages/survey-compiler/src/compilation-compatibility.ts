import type { TCanonicalQuestion, TCanonicalSurvey } from "./contracts";

export type TCompilationCompatibilityDiagnostic = {
  severity: "error" | "manualReview";
  code: "invalidChoiceCount" | "missingConfiguration" | "unexpectedOptions" | "unsupportedQuestionType";
  message: string;
};

export type TQuestionCompilationStatus = "supported" | "manualReview" | "invalid";

export type TQuestionCompilationCompatibility = {
  externalId: string;
  type: TCanonicalQuestion["type"];
  status: TQuestionCompilationStatus;
  diagnostics: TCompilationCompatibilityDiagnostic[];
};

export type TCompilationCompatibilityReport = {
  questions: TQuestionCompilationCompatibility[];
  summary: {
    total: number;
    supported: number;
    manualReview: number;
    invalid: number;
    errors: number;
  };
};

const SUPPORTED_TYPES = new Set<TCanonicalQuestion["type"]>([
  "openText",
  "numeric",
  "singleChoice",
  "multipleChoice",
  "rating",
  "ranking",
  "matrix",
  "display",
  "equation",
]);

const analyzeQuestion = (question: TCanonicalQuestion): TQuestionCompilationCompatibility => {
  const diagnostics: TCompilationCompatibilityDiagnostic[] = [];

  if (!SUPPORTED_TYPES.has(question.type)) {
    diagnostics.push({
      severity: "manualReview",
      code: "unsupportedQuestionType",
      message: `Canonical question type "${question.type}" does not have a Formbricks compiler mapper`,
    });
  } else if (
    question.type === "singleChoice" ||
    question.type === "multipleChoice" ||
    question.type === "ranking"
  ) {
    if (question.options.length < 2) {
      diagnostics.push({
        severity: "error",
        code: "invalidChoiceCount",
        message: `Canonical ${question.type} question must have at least two choices for Formbricks`,
      });
    }
    if (question.type === "ranking" && question.options.length > 25) {
      diagnostics.push({
        severity: "error",
        code: "invalidChoiceCount",
        message: "Canonical ranking question cannot have more than 25 choices in Formbricks",
      });
    }
  } else if (question.type === "equation" && !question.calculation) {
    diagnostics.push({
      severity: "error",
      code: "missingConfiguration",
      message: "Canonical equation question requires a calculation expression",
    });
  } else if (question.type === "rating" && !question.rating) {
    diagnostics.push({
      severity: "error",
      code: "missingConfiguration",
      message: "Canonical rating question requires an explicit five-point rating configuration",
    });
  } else if (question.type === "matrix" && !question.matrix) {
    diagnostics.push({
      severity: "error",
      code: "missingConfiguration",
      message: "Canonical matrix question requires explicit row and column definitions",
    });
  } else if (question.options.length > 0) {
    diagnostics.push({
      severity: "error",
      code: "unexpectedOptions",
      message: `Canonical ${question.type} question cannot preserve choices in Formbricks`,
    });
  }

  const status: TQuestionCompilationStatus = diagnostics.some(({ severity }) => severity === "error")
    ? "invalid"
    : diagnostics.some(({ severity }) => severity === "manualReview")
      ? "manualReview"
      : "supported";

  return {
    externalId: question.externalId,
    type: question.type,
    status,
    diagnostics,
  };
};

export const analyzeCompilationCompatibility = (
  survey: TCanonicalSurvey
): TCompilationCompatibilityReport => {
  const groupOrder = new Map(
    [...survey.groups]
      .sort((left, right) => left.order - right.order || left.externalId.localeCompare(right.externalId))
      .map((group, index) => [group.externalId, index])
  );

  const questions = [...survey.questions]
    .sort((left, right) => {
      const leftGroupOrder = groupOrder.get(left.groupExternalId) ?? Number.MAX_SAFE_INTEGER;
      const rightGroupOrder = groupOrder.get(right.groupExternalId) ?? Number.MAX_SAFE_INTEGER;

      return (
        leftGroupOrder - rightGroupOrder ||
        left.order - right.order ||
        left.externalId.localeCompare(right.externalId)
      );
    })
    .map(analyzeQuestion);

  return {
    questions,
    summary: {
      total: questions.length,
      supported: questions.filter(({ status }) => status === "supported").length,
      manualReview: questions.filter(({ status }) => status === "manualReview").length,
      invalid: questions.filter(({ status }) => status === "invalid").length,
      errors: questions.reduce(
        (count, question) =>
          count + question.diagnostics.filter(({ severity }) => severity === "error").length,
        0
      ),
    },
  };
};
