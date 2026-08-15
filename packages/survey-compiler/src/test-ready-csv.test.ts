import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { compileCanonicalToFormbricksArtifact } from "./compile-formbricks-artifact";
import { importLegacyCsv } from "./import-csv";

describe("Test 00_AILAB_All_Test_Banks_Adaptive_Formbricks_READY.csv Import", () => {
  const csvPath = resolve(__dirname, "../../../00_AILAB_All_Test_Banks_Adaptive_Formbricks_READY.csv");

  test("Imports and compiles 00_AILAB_All_Test_Banks_Adaptive_Formbricks_READY.csv", () => {
    const csvContent = readFileSync(csvPath, "utf8");
    console.log("CSV length:", csvContent.length);

    const result = importLegacyCsv(csvContent);
    console.log("Diagnostics count:", result.diagnostics.length);
    if (result.diagnostics.length > 0) {
      console.log("Diagnostics:", result.diagnostics.slice(0, 10));
    }

    expect(result.canonicalSurvey).toBeDefined();
    console.log("Canonical survey questions:", result.canonicalSurvey?.questions.length);
    console.log("Canonical survey groups:", result.canonicalSurvey?.groups.length);

    const artifact = compileCanonicalToFormbricksArtifact(result.canonicalSurvey!);
    console.log("Artifact blocks count:", artifact.payload.blocks.length);
    expect(artifact.payload.blocks.length).toBeGreaterThan(0);
  });
});
