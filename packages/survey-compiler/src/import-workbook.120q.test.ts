import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { importLegacyCsv } from "./import-csv";
import { importCanonicalWorkbook } from "./import-workbook";

const csv = readFileSync(new URL("../../../AILAB_120Q_Advanced_Adaptive_2026.csv", import.meta.url));
const workbook = readFileSync(
  new URL(
    "../../../apps/web/public/sample-csv/AILAB_120Q_Advanced_Adaptive_2026_Master_Template.xlsx",
    import.meta.url
  )
);

describe("AILAB 120Q master workbook", () => {
  test("round-trips all adaptive structures from the canonical CSV source", () => {
    const source = importLegacyCsv(csv).canonicalSurvey;
    const imported = importCanonicalWorkbook(workbook);

    expect(imported.diagnostics).toEqual([]);
    expect(imported.canonicalSurvey).toBeDefined();
    expect(imported.canonicalSurvey?.groups).toEqual(source?.groups);
    expect(imported.canonicalSurvey?.questions).toEqual(source?.questions);
    expect(imported.canonicalSurvey?.variables).toEqual(source?.variables);
  });
});
