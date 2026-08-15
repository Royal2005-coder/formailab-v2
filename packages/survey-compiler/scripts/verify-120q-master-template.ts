import { readFileSync } from "node:fs";
import { importLegacyCsv } from "../src/import-csv";
import { importCanonicalWorkbook } from "../src/import-workbook";

const csv = importLegacyCsv(readFileSync("AILAB_120Q_Advanced_Adaptive_2026.csv")).canonicalSurvey;
const workbookResult = importCanonicalWorkbook(
  readFileSync("apps/web/public/sample-csv/AILAB_120Q_Advanced_Adaptive_2026_Master_Template.xlsx")
);
if (!csv || !workbookResult.canonicalSurvey) throw new Error(JSON.stringify(workbookResult.diagnostics));
const workbook = workbookResult.canonicalSurvey;
const summarize = (survey: typeof csv) => ({
  groups: survey.groups.length,
  questions: survey.questions.length,
  options: survey.questions.reduce(
    (total, question) =>
      total +
      question.options.length +
      (question.matrix?.rows.length ?? 0) +
      (question.matrix?.columns.length ?? 0),
    0
  ),
  relevance: survey.questions.filter((question) => question.relevance && question.relevance !== "1").length,
  equations: survey.questions.filter((question) => question.type === "equation").length,
  matrices: survey.questions.filter((question) => question.type === "matrix").length,
  ratings: survey.questions.filter((question) => question.type === "rating").length,
});
const mismatches = csv.questions.flatMap((question) => {
  const candidate = workbook.questions.find(({ externalId }) => externalId === question.externalId);
  if (!candidate) return [question.externalId + ":missing"];
  const source = JSON.stringify({
    type: question.type,
    relevance: question.relevance,
    calculation: question.calculation,
    options: question.options,
    matrix: question.matrix,
    rating: question.rating,
  });
  const roundTrip = JSON.stringify({
    type: candidate.type,
    relevance: candidate.relevance,
    calculation: candidate.calculation,
    options: candidate.options,
    matrix: candidate.matrix,
    rating: candidate.rating,
  });
  return source === roundTrip ? [] : [question.externalId];
});
console.log(
  JSON.stringify(
    {
      source: summarize(csv),
      roundTrip: summarize(workbook),
      diagnostics: workbookResult.diagnostics,
      mismatches,
    },
    null,
    2
  )
);
if (mismatches.length > 0 || workbookResult.diagnostics.length > 0) process.exitCode = 1;
