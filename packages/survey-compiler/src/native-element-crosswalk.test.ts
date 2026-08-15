import { describe, expect, test } from "vitest";
import { TSurveyElementTypeEnum } from "@formbricks/types/surveys/elements";
import { compileCanonicalToFormbricksArtifact } from "./compile-formbricks-artifact";
import type { TCanonicalSurvey } from "./contracts";

const survey = {
  schemaVersion: 1,
  externalId: "NATIVE",
  defaultLanguage: "en-US",
  languages: ["en-US"],
  title: { "en-US": "Native mappings" },
  groups: [{ externalId: "G", title: { "en-US": "Group" }, order: 0 }],
  questions: [
    {
      externalId: "RANK",
      groupExternalId: "G",
      type: "ranking",
      label: { "en-US": "Rank" },
      order: 0,
      mandatory: true,
      options: [
        { externalId: "FIRST", label: { "en-US": "First" }, value: "first", order: 0 },
        { externalId: "SECOND", label: { "en-US": "Second" }, value: 2, order: 1 },
      ],
    },
    {
      externalId: "MATRIX",
      groupExternalId: "G",
      type: "matrix",
      label: { "en-US": "Matrix" },
      order: 1,
      mandatory: false,
      options: [],
      matrix: {
        rows: [
          { externalId: "ROW_A", label: { "en-US": "A" }, value: "a", order: 0 },
          { externalId: "ROW_B", label: { "en-US": "B" }, value: "b", order: 1 },
        ],
        columns: [
          { externalId: "COL_1", label: { "en-US": "1" }, value: 1, order: 0 },
          { externalId: "COL_5", label: { "en-US": "5" }, value: 5, order: 1 },
        ],
      },
    },
  ],
  variables: [],
  endings: [{ externalId: "END", title: { "en-US": "Done" } }],
} satisfies TCanonicalSurvey;

describe("native element ID crosswalk", () => {
  test("tracks ranking choices and both matrix axes with distinct semantic kinds", () => {
    const artifact = compileCanonicalToFormbricksArtifact(survey);
    const elements = artifact.payload.blocks?.[0]?.elements ?? [];
    const ranking = elements.find((element) => element.type === TSurveyElementTypeEnum.Ranking);
    const matrix = elements.find((element) => element.type === TSurveyElementTypeEnum.Matrix);

    expect(ranking && "choices" in ranking ? ranking.choices.map(({ id }) => id) : []).toEqual(
      artifact.idCrosswalk.entries
        .filter(({ kind }) => kind === "rankingChoice")
        .map(({ formbricksId }) => formbricksId)
    );
    expect(matrix && "rows" in matrix ? matrix.rows.map(({ id }) => id) : []).toEqual(
      artifact.idCrosswalk.entries
        .filter(({ kind }) => kind === "matrixRow")
        .map(({ formbricksId }) => formbricksId)
    );
    expect(matrix && "columns" in matrix ? matrix.columns.map(({ id }) => id) : []).toEqual(
      artifact.idCrosswalk.entries
        .filter(({ kind }) => kind === "matrixColumn")
        .map(({ formbricksId }) => formbricksId)
    );

    expect(
      artifact.idCrosswalk.entries
        .filter(({ kind }) => kind === "rankingChoice" || kind === "matrixRow" || kind === "matrixColumn")
        .map((entry) => {
          if (!("canonicalValue" in entry)) {
            throw new Error(`Expected a nested canonical item, received '${entry.kind}'`);
          }
          return {
            kind: entry.kind,
            externalId: entry.canonicalExternalId,
            value: entry.canonicalValue,
          };
        })
    ).toEqual([
      { kind: "rankingChoice", externalId: "FIRST", value: "first" },
      { kind: "rankingChoice", externalId: "SECOND", value: 2 },
      { kind: "matrixRow", externalId: "ROW_A", value: "a" },
      { kind: "matrixRow", externalId: "ROW_B", value: "b" },
      { kind: "matrixColumn", externalId: "COL_1", value: 1 },
      { kind: "matrixColumn", externalId: "COL_5", value: 5 },
    ]);
  });
});
