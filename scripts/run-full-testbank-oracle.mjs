import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { evaluateExpression, parseExpression } from "../packages/survey-compiler/dist/expression.js";
import { importLegacyCsv } from "../packages/survey-compiler/dist/server.js";

const workbook = XLSX.read(readFileSync("Testbank/00_AILAB_Adaptive_FULL_TEST_COVERAGE.xlsx"));
const sheet = (name) => XLSX.utils.sheet_to_json(workbook.Sheets[name]);
const routeCases = sheet("E2E_Route_Cases");
const boundaryCases = sheet("Boundary_88");
const systemCases = sheet("UI_System_Cases");
const executionCases = sheet("Execution_Log");
const recipes = sheet("Answer_Recipes");

const imported = importLegacyCsv(
  readFileSync("Testbank/00_AILAB_LimeSurvey_Adaptive_v2_FULL_READY_QA_NOTED.csv")
);
if (!imported.canonicalSurvey) throw new Error("The full Testbank CSV did not produce a canonical survey");

const caseIds = [...routeCases, ...boundaryCases, ...systemCases].map(({ Case_ID }) => Case_ID);
const executionCaseIds = executionCases.map(({ Case_ID }) => Case_ID);
const resultQuestionIds = new Set(boundaryCases.map(({ Expected_Result }) => Expected_Result));
for (const routeCase of routeCases) resultQuestionIds.add(routeCase.Expected_Result_Question);
const resultQuestions = imported.canonicalSurvey.questions.filter(({ externalId }) =>
  resultQuestionIds.has(externalId)
);
const scoreVariableByBank = {
  B1: "VRSCORE",
  B2: "VCSCORE",
  B3: "VGSCORE",
  B4: "WRSCORE",
  B5: "MTSCORE",
  B6: "ETSCORE",
  B7: "AIXSCORE",
  B8: "DGSCORE",
};
const localized = (value) => value?.vi ?? value?.["vi-VN"] ?? value?.["en-US"] ?? Object.values(value ?? {})[0] ?? "";
const plainText = (value) =>
  String(value)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\{[A-Z0-9_]+\}/g, "")
    .replace(/\s+/g, " ")
    .trim();

const collectReferences = (node) => {
  if (node.type === "reference") return [node.path.join(".")];
  if (node.type === "unary") return collectReferences(node.operand);
  if (node.type === "binary") return [...collectReferences(node.left), ...collectReferences(node.right)];
  if (node.type === "call") return node.arguments.flatMap(collectReferences);
  return [];
};

const routes = routeCases.map((routeCase) => {
  const answers = {
    CONSENT: routeCase.Case_ID === "E2E-CONSENT-NO" ? "N" : "Y",
    BANK: routeCase.Bank,
  };
  const year = routeCase.Profile_Selection.match(/YEAR=(\d)/)?.[1];
  const role = routeCase.Profile_Selection.match(/ROLE=([EM])/)?.[1];
  if (year) answers.YEAR = year;
  if (role) answers.ROLE = role;

  for (const recipe of recipes.filter(({ Case_ID }) => Case_ID === routeCase.Case_ID)) {
    const question = imported.canonicalSurvey.questions.find(
      ({ externalId }) => externalId === recipe.Question_Code
    );
    answers[recipe.Question_Code] =
      question?.type === "rating" ? Number(recipe.Answer_Code) : recipe.Answer_Code;
  }

  const variables = {};
  for (const question of imported.canonicalSurvey.questions.filter(({ type }) => type === "equation")) {
    const parsed = parseExpression(question.calculation);
    const context = {};
    for (const source of new Set(collectReferences(parsed))) {
      const [identifier, policy] = source.split(".");
      const value = variables[identifier] ?? answers[identifier] ?? 0;
      context[identifier] = policy ? { [policy]: value } : value;
    }
    const result = evaluateExpression(parsed, context);
    variables[question.externalId] = typeof result === "number" && Number.isFinite(result) ? result : 0;
  }

  const context = {};
  for (const [identifier, value] of Object.entries({ ...answers, ...variables })) {
    context[identifier] = { NAOK: value };
  }
  const matchingResultIds = resultQuestions
    .filter(({ relevance }) => {
      if (!relevance) return false;
      try {
        return evaluateExpression(parseExpression(relevance), context) === true;
      } catch {
        return false;
      }
    })
    .map(({ externalId }) => externalId);

  return {
    routeCase,
    actualScore: variables[scoreVariableByBank[routeCase.Bank]],
    dgCount: variables.DGCOUNT,
    matchingResultIds,
    recipeCount: recipes.filter(({ Case_ID }) => Case_ID === routeCase.Case_ID).length,
    browserAnswers: recipes
      .filter(({ Case_ID }) => Case_ID === routeCase.Case_ID)
      .map((recipe) => {
        const question = imported.canonicalSurvey.questions.find(
          ({ externalId }) => externalId === recipe.Question_Code
        );
        if (!question) throw new Error(`Missing recipe question ${recipe.Question_Code}`);
        const option = question.options.find(({ value }) => String(value) === String(recipe.Answer_Code));
        return {
          questionCode: recipe.Question_Code,
          questionLabel: plainText(localized(question.label)),
          kind: question.type === "rating" ? "rating" : "singleChoice",
          answerValue: question.type === "rating" ? Number(recipe.Answer_Code) : localized(option?.label),
          range: question.rating?.range ?? 5,
        };
      }),
    expectedResultText: plainText(
      localized(
        imported.canonicalSurvey.questions.find(
          ({ externalId }) => externalId === routeCase.Expected_Result_Question
        )?.label
      )
    ),
  };
});
const boundaries = boundaryCases.map((boundaryCase) => {
  const context = {
    CONSENT: { NAOK: "Y" },
    BANK: { NAOK: boundaryCase.Bank },
    VRSCORE: { NAOK: 0 },
    VCSCORE: { NAOK: 0 },
    VGSCORE: { NAOK: 0 },
    WRSCORE: { NAOK: 0 },
    MTSCORE: { NAOK: 0 },
    ETSCORE: { NAOK: 0 },
    AIXSCORE: { NAOK: 0 },
    DGSCORE: { NAOK: 0 },
    DGCOUNT: { NAOK: boundaryCase.DGCOUNT === "-" ? 0 : Number(boundaryCase.DGCOUNT) },
    [boundaryCase.Score_Variable]: { NAOK: boundaryCase.Injected_Score },
  };
  const matchingResultIds = resultQuestions
    .filter(({ relevance }) => relevance && evaluateExpression(parseExpression(relevance), context) === true)
    .map(({ externalId }) => externalId);

  return { boundaryCase, matchingResultIds };
});

process.stdout.write(
  JSON.stringify({
    inventory: {
      routeCount: routeCases.length,
      boundaryCount: boundaryCases.length,
      systemCount: systemCases.length,
      caseCount: caseIds.length,
      uniqueCaseCount: new Set(caseIds).size,
      executionLogMatches:
        executionCaseIds.length === caseIds.length && caseIds.every((caseId) => executionCaseIds.includes(caseId)),
      resultQuestionCount: resultQuestions.length,
      expectedResultQuestionCount: resultQuestionIds.size,
    },
    boundaries,
    routes,
  })
);
