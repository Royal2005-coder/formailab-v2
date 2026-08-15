import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import type { TSurveyBlockLogicAction } from "@formbricks/types/surveys/blocks";
import { compileCanonicalToFormbricksArtifact } from "./compile-formbricks-artifact";
import { importLegacyCsv } from "./import-csv";

const fixture = readFileSync(
  new URL("../../../Testbank/00_AILAB_LimeSurvey_Adaptive_v2_FULL_READY_QA_NOTED.csv", import.meta.url)
);
const imported = importLegacyCsv(fixture);
if (!imported.canonicalSurvey) throw new Error("The full Testbank CSV did not produce a canonical survey");

const survey = imported.canonicalSurvey;
const artifact = compileCanonicalToFormbricksArtifact(survey);
const blocks = artifact.payload.blocks ?? [];

const decodeCompiledId = (id: string): string => {
  const encoded = id.split("g").at(-1);
  if (!encoded) return id;
  try {
    return Buffer.from(encoded, "hex").toString("utf8");
  } catch {
    return id;
  }
};

const externalQuestionByCompiledId = new Map(
  artifact.idCrosswalk.entries
    .filter(({ kind }) => kind === "question")
    .map((entry) => [entry.formbricksId, entry.canonicalExternalId])
);

describe("full AI LAB Testbank CSV", () => {
  test("imports and compiles the production fixture without diagnostics", () => {
    expect(imported.diagnostics).toEqual([]);
    expect(survey.groups).toHaveLength(112);
    expect(survey.questions).toHaveLength(508);
    expect(blocks).toHaveLength(192);
    expect(artifact.payload.variables).toHaveLength(53);
  });

  test("emits only valid adaptive navigation and expression targets", () => {
    const navigationIds = new Set([
      ...blocks.map(({ id }) => id),
      ...(artifact.payload.endings ?? []).map(({ id }) => id),
    ]);
    const elementIds = new Set(blocks.flatMap(({ elements }) => elements.map(({ id }) => id)));
    const variableIds = new Set((artifact.payload.variables ?? []).map(({ id }) => id));

    for (const block of blocks) {
      if (block.logicFallback) expect(navigationIds).toContain(block.logicFallback);
      for (const rule of block.logic ?? []) {
        for (const action of rule.actions) {
          if (action.objective === "jumpToBlock") expect(navigationIds).toContain(action.target);
          if (action.objective === "evaluateExpression") {
            expect(variableIds).toContain(action.variableId);
            for (const reference of action.references) {
              expect(reference.target.type === "element" ? elementIds : variableIds).toContain(
                reference.target.value
              );
            }
          }
        }
      }
    }
  });

  test("routes the B4 employee calculation chain past manager scores to WRSCORE", () => {
    const wre4Block = blocks.find(({ elements }) =>
      elements.some(({ id }) => externalQuestionByCompiledId.get(id) === "WRE4SCORE")
    );
    expect(wre4Block).toBeDefined();

    const jumpTargets = (wre4Block?.logic ?? [])
      .flatMap(({ actions }) => actions)
      .filter(
        (action): action is Extract<TSurveyBlockLogicAction, { objective: "jumpToBlock" }> =>
          action.objective === "jumpToBlock"
      )
      .map(({ target }) => decodeCompiledId(target));

    expect(jumpTargets).toContain("G_WR_RESULT_segment_11");
    expect(jumpTargets).toContain("G_WR_RESULT_segment_15");
  });

  test("calculates WRM1SCORE on the manager segment that displays it", () => {
    const wrm1Block = blocks.find(({ elements }) =>
      elements.some(({ id }) => externalQuestionByCompiledId.get(id) === "WRM1SCORE")
    );
    const wrm1Action = (wrm1Block?.logic ?? [])
      .flatMap(({ actions }) => actions)
      .find(
        (action) => action.objective === "evaluateExpression" && action.expression.includes("WR045.NAOK")
      );

    expect(wrm1Action?.objective).toBe("evaluateExpression");
    if (wrm1Action?.objective !== "evaluateExpression") return;
    expect(wrm1Action.references.map(({ source }) => source)).toEqual([
      "WR045.NAOK",
      "WR046.NAOK",
      "WR047.NAOK",
      "WR048.NAOK",
    ]);
  });

  test("compiles DG numeric choice codes into expression value maps", () => {
    const dgScoreAction = blocks
      .flatMap(({ logic }) => logic ?? [])
      .flatMap(({ actions }) => actions)
      .find((action) => action.objective === "evaluateExpression" && action.expression.includes("DG01.NAOK"));
    expect(dgScoreAction?.objective).toBe("evaluateExpression");
    if (dgScoreAction?.objective !== "evaluateExpression") return;

    const dg01 = dgScoreAction.references.find(({ source }) => source === "DG01.NAOK");
    expect(dg01?.valueMap?.["Có làm đầy đủ và duy trì thường xuyên"]).toBe("5");
  });

  test("preserves supported Formbricks metadata from the other column", () => {
    const element = (externalId: string) =>
      blocks
        .flatMap(({ elements }) => elements)
        .find(({ id }) => externalQuestionByCompiledId.get(id) === externalId);

    expect(element("BANK")).toMatchObject({ type: "multipleChoiceSingle", displayType: "dropdown" });
    expect(element("AI_GOAL")).toMatchObject({ type: "openText", longAnswer: true });
    expect(element("ST_CSAT")).toMatchObject({ type: "csat", range: 5, scale: "smiley" });
    expect(element("WK_CES")).toMatchObject({ type: "ces", range: 5, scale: "number" });
    expect(element("NPS_SCORE")).toMatchObject({ type: "nps" });
  });
});
