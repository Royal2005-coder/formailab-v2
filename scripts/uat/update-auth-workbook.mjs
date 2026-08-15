import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import * as XLSX from "xlsx";

XLSX.set_fs(fs);

const root = process.cwd();
const sourceWorkbook = process.argv[2] ?? path.join(root, "AILABSurvey_UATest_EndUser (1).xlsx");
const resultsFile = process.argv[3] ?? path.join(root, "artifacts/uat/auth/results.json");
const outputWorkbook =
  process.argv[4] ?? path.join(root, "artifacts/uat/auth/AILABSurvey_UATest_EndUser_AUTH_Automation.xlsx");
const testDataFile = path.join(root, "apps/web/playwright/uat/auth/auth-test-cases.json");

const testCases = JSON.parse(fs.readFileSync(testDataFile, "utf8"));
const workbook = XLSX.readFile(sourceWorkbook, { cellDates: true, cellFormula: true, cellStyles: true });
const authSheet = workbook.Sheets.UT01_XacThuc;
if (!authSheet) throw new Error("Workbook is missing sheet UT01_XacThuc");

const setCell = (sheet, address, value, styleFromAddress) => {
  const style = sheet[styleFromAddress ?? address]?.s;
  const cell = typeof value === "number" ? { t: "n", v: value } : { t: "s", v: String(value) };
  if (style) cell.s = style;
  sheet[address] = cell;
};

const collectSpecs = (suites, collected = []) => {
  for (const suite of suites ?? []) {
    collected.push(...(suite.specs ?? []));
    collectSpecs(suite.suites, collected);
  }
  return collected;
};

const getResultById = () => {
  if (!fs.existsSync(resultsFile)) return new Map();
  const report = JSON.parse(fs.readFileSync(resultsFile, "utf8"));
  const results = new Map();
  for (const spec of collectSpecs(report.suites)) {
    const id = spec.title.match(/AUTH-\d{3}/)?.[0];
    if (!id) continue;
    const playwrightTest = spec.tests?.[0];
    const attempts = playwrightTest?.results ?? [];
    const finalAttempt = attempts.at(-1);
    if (!finalAttempt) continue;
    const status = finalAttempt.status;
    if (!status) continue;
    const annotations = [...(spec.annotations ?? []), ...(playwrightTest?.annotations ?? [])];
    const blockedReason = annotations.find((annotation) => annotation.type === "skip")?.description;
    if (status === "skipped" && !blockedReason) continue;
    const workbookStatus = status === "passed" ? "Passed" : status === "skipped" ? "Blocked" : "Failed";
    const error = finalAttempt?.error?.message ?? finalAttempt?.errors?.[0]?.message;
    results.set(id, {
      status: workbookStatus,
      durationMs: attempts.reduce((sum, attempt) => sum + (attempt.duration ?? 0), 0),
      detail:
        workbookStatus === "Blocked" ? (blockedReason ?? "Blocked by test prerequisite") : (error ?? ""),
      retryCount: Math.max(0, attempts.length - 1),
    });
  }
  return results;
};

const resultsById = getResultById();
const executionDate = new Date().toISOString().slice(0, 10);
const statusCounts = { Passed: 0, Failed: 0, Blocked: 0, Untested: 0 };
const executionRows = [];

testCases.forEach((testCase, index) => {
  const column = XLSX.utils.encode_col(5 + index);
  const result = resultsById.get(testCase.id);
  const status = result?.status ?? "Untested";
  statusCounts[status] += 1;
  setCell(authSheet, `${column}22`, status, "F22");
  setCell(authSheet, `${column}23`, result ? executionDate : "", "F23");
  setCell(
    authSheet,
    `${column}24`,
    status === "Failed" ? `AUT-${testCase.id}` : status === "Blocked" ? result.detail : "",
    "F24"
  );

  const sampleRow = 14 + index;
  setCell(authSheet, `W${sampleRow}`, index + 1, "W14");
  setCell(authSheet, `X${sampleRow}`, `${testCase.type} – ${testCase.title}`, "X14");
  setCell(authSheet, `Y${sampleRow}`, testCase.sampleInput, "Y14");
  setCell(authSheet, `Z${sampleRow}`, testCase.expected, "Z14");
  setCell(authSheet, `AA${sampleRow}`, testCase.id, "AA14");

  executionRows.push({
    "TC ID": testCase.id,
    Type: testCase.type,
    Scenario: testCase.title,
    Precondition: testCase.precondition,
    "Sample Input": testCase.sampleInput,
    Expected: testCase.expected,
    Checkpoint: testCase.checkpoint,
    Status: status,
    "Executed Date": result ? executionDate : "",
    "Duration (ms)": result?.durationMs ?? "",
    Retries: result?.retryCount ?? "",
    "Defect / Blocked reason":
      status === "Failed"
        ? `AUT-${testCase.id}: ${result.detail}`
        : status === "Blocked"
          ? result.detail
          : "",
  });
});

setCell(authSheet, "A7", statusCounts.Passed, "A7");
setCell(authSheet, "C7", statusCounts.Failed, "C7");
setCell(authSheet, "E7", statusCounts.Blocked, "E7");
setCell(authSheet, "G7", statusCounts.Untested, "G7");
setCell(authSheet, "O7", testCases.length, "O7");

const reportSheet = workbook.Sheets["Test Report"];
if (reportSheet) {
  setCell(reportSheet, "C12", statusCounts.Passed, "C12");
  setCell(reportSheet, "D12", statusCounts.Failed, "D12");
  setCell(reportSheet, "E12", statusCounts.Blocked, "E12");
  setCell(reportSheet, "F12", statusCounts.Untested, "F12");
  setCell(reportSheet, "K12", (testCases.length - statusCounts.Untested) / testCases.length, "K12");
}

const executionSheet = XLSX.utils.json_to_sheet(executionRows);
executionSheet["!cols"] = [
  { wch: 12 },
  { wch: 7 },
  { wch: 38 },
  { wch: 48 },
  { wch: 70 },
  { wch: 70 },
  { wch: 60 },
  { wch: 12 },
  { wch: 15 },
  { wch: 15 },
  { wch: 8 },
  { wch: 80 },
];
executionSheet["!autofilter"] = { ref: `A1:L${executionRows.length + 1}` };
if (workbook.Sheets.AUT_Execution) {
  delete workbook.Sheets.AUT_Execution;
  workbook.SheetNames = workbook.SheetNames.filter((name) => name !== "AUT_Execution");
}
XLSX.utils.book_append_sheet(workbook, executionSheet, "AUT_Execution");
workbook.Workbook ??= {};
workbook.Workbook.CalcPr = { fullCalcOnLoad: "1", forceFullCalc: "1", calcMode: "auto" };

fs.mkdirSync(path.dirname(outputWorkbook), { recursive: true });
XLSX.writeFile(workbook, outputWorkbook, { cellStyles: true, bookType: "xlsx" });
console.log(
  JSON.stringify(
    {
      outputWorkbook,
      sourceWorkbook,
      resultsFile: fs.existsSync(resultsFile) ? resultsFile : null,
      statusCounts,
    },
    null,
    2
  )
);
