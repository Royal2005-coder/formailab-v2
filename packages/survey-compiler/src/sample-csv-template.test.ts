import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { compileCanonicalToFormbricksArtifact } from "./compile-formbricks-artifact";
import { importLegacyCsv } from "./import-csv";

describe("Sample CSV Master Template Import & Compilation Test", () => {
  const csvPath = resolve(
    __dirname,
    "../../../apps/web/public/sample-csv/formbricks-survey-import-template.csv"
  );

  test("Imports standard CSV template with zero diagnostics errors", () => {
    const csvContent = readFileSync(csvPath, "utf8");
    const result = importLegacyCsv(csvContent);

    const errors = result.diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);
    expect(result.canonicalSurvey).toBeDefined();

    const survey = result.canonicalSurvey!;
    expect(survey.groups.length).toBeGreaterThanOrEqual(3);
    expect(survey.questions.length).toBeGreaterThanOrEqual(6);

    // Verify SCORE equation question is parsed correctly
    const scoreQuestion = survey.questions.find((q) => q.externalId === "SCORE");
    expect(scoreQuestion).toBeDefined();
    expect(scoreQuestion?.type).toBe("equation");
    expect(scoreQuestion?.calculation).toContain("round(");
  });

  test("Compiles standard CSV canonical survey to Formbricks artifact with blocks and routing logic", () => {
    const csvContent = readFileSync(csvPath, "utf8");
    const result = importLegacyCsv(csvContent);
    expect(result.canonicalSurvey).toBeDefined();

    const artifact = compileCanonicalToFormbricksArtifact(result.canonicalSurvey!);
    expect(artifact.payload.blocks).toBeDefined();
    expect(artifact.payload.blocks.length).toBeGreaterThan(0);

    const totalElements = artifact.payload.blocks.reduce((acc, b) => acc + b.elements.length, 0);
    expect(totalElements).toBeGreaterThan(0);
  });
});
