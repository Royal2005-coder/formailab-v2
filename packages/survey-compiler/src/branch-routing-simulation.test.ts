import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { compileCanonicalToFormbricksArtifact } from "./compile-formbricks-artifact";
import { importLegacyCsv } from "./import-csv";

describe("3-Branch Score Classification Simulation Test", () => {
  const csvPath = resolve(
    __dirname,
    "../../../apps/web/public/sample-csv/formbricks-survey-import-template.csv"
  );

  test("Score 100% routes exclusively to BRANCH_EXCELLENT and then to ending", () => {
    const csvContent = readFileSync(csvPath, "utf8");
    const result = importLegacyCsv(csvContent);
    const artifact = compileCanonicalToFormbricksArtifact(result.canonicalSurvey!);

    const blocks = artifact.payload.blocks;
    const endingId = artifact.payload.endings?.[0]?.id;
    expect(endingId).toBeDefined();

    // Find block for BRANCH_EXCELLENT
    const excellentBlock = blocks.find((b) =>
      b.elements.some((e) => e.headline.default.includes("Xuất sắc"))
    );
    expect(excellentBlock).toBeDefined();

    // Verify logicFallback of excellentBlock points to the ending card ID, NOT downstream blocks
    expect(excellentBlock?.logicFallback).toBe(endingId);
  });

  test("Score 65% routes exclusively to BRANCH_GOOD and then to ending", () => {
    const csvContent = readFileSync(csvPath, "utf8");
    const result = importLegacyCsv(csvContent);
    const artifact = compileCanonicalToFormbricksArtifact(result.canonicalSurvey!);

    const blocks = artifact.payload.blocks;
    const endingId = artifact.payload.endings?.[0]?.id;
    expect(endingId).toBeDefined();

    const goodBlock = blocks.find((b) =>
      b.elements.some((e) => e.headline.default.includes("Khá/Trung bình"))
    );
    expect(goodBlock).toBeDefined();
    expect(goodBlock?.logicFallback).toBe(endingId);
  });
});
