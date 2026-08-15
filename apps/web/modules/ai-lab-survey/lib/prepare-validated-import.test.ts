import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { importLegacyCsv } from "@formbricks/survey-compiler/server";
import { createCanonicalChecksum } from "@formbricks/survey-compiler/server";
import { prepareValidatedImport } from "./prepare-validated-import";

const canonicalSnapshot = {
  schemaVersion: 1,
  externalId: "employee_pulse",
  defaultLanguage: "en-US",
  languages: ["en-US"],
  title: { "en-US": "Employee pulse" },
  groups: [
    {
      externalId: "profile",
      title: { "en-US": "Profile" },
      order: 0,
    },
  ],
  questions: [
    {
      externalId: "role",
      groupExternalId: "profile",
      type: "openText",
      label: { "en-US": "What is your role?" },
      order: 0,
      mandatory: true,
      options: [],
    },
  ],
  variables: [],
  endings: [
    {
      externalId: "complete",
      title: { "en-US": "Thank you" },
    },
  ],
} as const;

describe("prepareValidatedImport", () => {
  test("prepares a validated Formbricks payload and ID crosswalk from stored canonical data", () => {
    const checksum = createCanonicalChecksum(canonicalSnapshot);

    const result = prepareValidatedImport({
      canonicalSnapshot,
      storedCanonicalChecksum: checksum,
      expectedCanonicalChecksum: checksum,
      diagnostics: [],
    });

    expect(result).toMatchObject({
      canonicalSurvey: canonicalSnapshot,
      canonicalChecksum: checksum,
      diagnostics: [],
      artifact: {
        schemaVersion: 1,
        payload: {
          name: "Employee pulse",
          status: "inProgress",
          type: "link",
        },
        idCrosswalk: {
          schemaVersion: 1,
          surveyExternalId: "employee_pulse",
        },
      },
      payload: {
        name: "Employee pulse",
        status: "inProgress",
        type: "link",
      },
      idCrosswalk: {
        schemaVersion: 1,
        surveyExternalId: "employee_pulse",
      },
    });
    expect(result.idCrosswalk.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "group", canonicalExternalId: "profile" }),
        expect.objectContaining({ kind: "question", canonicalExternalId: "role" }),
        expect.objectContaining({ kind: "ending", canonicalExternalId: "complete" }),
      ])
    );
    expect(result.payload).toBe(result.artifact.payload);
    expect(result.idCrosswalk).toBe(result.artifact.idCrosswalk);
  });

  test("preserves every block and element from the production 120Q CSV through commit preparation", () => {
    const source = readFileSync(
      new URL("../../../../../AILAB_120Q_Advanced_Adaptive_2026.csv", import.meta.url)
    );
    const imported = importLegacyCsv(source);
    expect(imported.diagnostics.filter(({ severity }) => severity === "error")).toEqual([]);
    expect(imported.canonicalSurvey).toBeDefined();

    const importedSurvey = imported.canonicalSurvey!;
    const checksum = createCanonicalChecksum(importedSurvey);
    const result = prepareValidatedImport({
      canonicalSnapshot: importedSurvey,
      storedCanonicalChecksum: checksum,
      expectedCanonicalChecksum: checksum,
      diagnostics: imported.diagnostics,
    });

    expect(result.payload.questions).toEqual([]);
    expect(result.payload.blocks).toHaveLength(21);
    expect(result.payload.blocks?.flatMap(({ elements }) => elements)).toHaveLength(120);
    expect(result.artifact.payload.blocks).toEqual(result.payload.blocks);
  });
});
