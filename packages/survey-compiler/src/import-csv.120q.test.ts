import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { analyzeCompilationCompatibility } from "./compilation-compatibility";
import { compileCanonicalToFormbricksPayload } from "./compile-with-crosswalk";
import { ZCanonicalSurvey } from "./contracts";
import { importLegacyCsv } from "./import-csv";

const fixture = readFileSync(new URL("../../../AILAB_120Q_Advanced_Adaptive_2026.csv", import.meta.url));
const fixtureText = fixture.toString("utf8");

describe("AILAB 120Q LimeSurvey CSV acceptance", () => {
  test("imports the complete Vietnamese adaptive survey deterministically", () => {
    const first = importLegacyCsv(fixture);
    const replay = importLegacyCsv(fixture);

    expect(first.diagnostics.filter(({ severity }) => severity === "error")).toEqual([]);
    expect(first.canonicalSurvey).toBeDefined();
    expect(ZCanonicalSurvey.safeParse(first.canonicalSurvey).success).toBe(true);
    expect(first.canonicalSurvey).toMatchObject({
      defaultLanguage: "vi",
      languages: ["vi"],
      title: {
        vi: "AILAB 120Q Advanced Adaptive Intelligence Assessment 2026",
      },
    });
    expect(first.canonicalSurvey?.groups).toHaveLength(8);
    expect(first.canonicalSurvey?.questions).toHaveLength(120);
    expect(first.canonicalSurvey?.questions.filter(({ relevance }) => relevance !== "1")).toHaveLength(79);
    expect(first.canonicalSurvey?.questions.filter(({ mandatory }) => mandatory)).toHaveLength(97);
    expect(first.canonicalSurvey?.groups.filter(({ relevance }) => relevance !== "1")).toHaveLength(3);
    expect(
      first.canonicalSurvey?.questions.find(({ externalId }) => externalId === "Q108")?.options
    ).toMatchObject([
      { externalId: "Q108_A_Y", value: "Y" },
      { externalId: "Q108_A_N", value: "N" },
    ]);
    expect(first.canonicalSurvey?.questions.filter(({ type }) => type === "rating")).toHaveLength(86);
    expect(
      first.canonicalSurvey?.questions
        .filter(({ type }) => type === "rating")
        .every(({ rating, options }) => rating?.range === 5 && options.length === 0)
    ).toBe(true);
    expect(first.canonicalSurvey?.questions.filter(({ type }) => type === "matrix")).toHaveLength(3);
    expect(first.canonicalSurvey?.questions.find(({ externalId }) => externalId === "Q217")).toMatchObject({
      type: "matrix",
      options: [],
      matrix: {
        rows: [
          { externalId: "Q217_SQ_SQ001", value: "SQ001" },
          { externalId: "Q217_SQ_SQ002", value: "SQ002" },
          { externalId: "Q217_SQ_SQ003", value: "SQ003" },
          { externalId: "Q217_SQ_SQ004", value: "SQ004" },
          { externalId: "Q217_SQ_SQ005", value: "SQ005" },
        ],
        columns: [
          { externalId: "Q217_A_1", value: 1 },
          { externalId: "Q217_A_2", value: 2 },
          { externalId: "Q217_A_3", value: 3 },
          { externalId: "Q217_A_4", value: 4 },
          { externalId: "Q217_A_5", value: 5 },
        ],
      },
    });
    expect(first.canonicalChecksum).toBe(replay.canonicalChecksum);
    expect(first.canonicalSurvey).toEqual(replay.canonicalSurvey);
  });

  test("treats the localized survey title as canonical content rather than a settings row", () => {
    const original = importLegacyCsv(fixture);
    const renamed = importLegacyCsv(
      fixtureText.replace(
        "AILAB 120Q Advanced Adaptive Intelligence Assessment 2026",
        "AILAB 120Q Adaptive Acceptance Revision"
      )
    );

    expect(original.canonicalSurvey?.externalId).not.toBe("language");
    expect(original.canonicalSurvey?.title.vi).not.toBe("vi");
    expect(renamed.canonicalSurvey?.title.vi).toBe("AILAB 120Q Adaptive Acceptance Revision");
    expect(renamed.canonicalChecksum).not.toBe(original.canonicalChecksum);
  });

  test("compiles all six calculated equation questions through the runtime extension", () => {
    const result = importLegacyCsv(fixture);
    const survey = ZCanonicalSurvey.parse(result.canonicalSurvey);
    const compatibility = analyzeCompilationCompatibility(survey);

    expect(compatibility.summary).toEqual({
      total: 120,
      supported: 120,
      manualReview: 0,
      invalid: 0,
      errors: 0,
    });
    expect(
      compatibility.questions
        .filter(({ status }) => status === "manualReview")
        .map(({ externalId }) => externalId)
    ).toEqual([]);

    expect(
      survey.questions
        .filter(({ type }) => type === "equation")
        .map(({ externalId, calculation }) => ({ externalId, calculation }))
    ).toEqual([
      { externalId: "Q109", calculation: "(Q105.NAOK + Q106.NAOK) / 2 * 20" },
      {
        externalId: "Q219",
        calculation:
          "round((Q201.NAOK+Q202.NAOK+Q203.NAOK+Q204.NAOK+Q205.NAOK+Q206.NAOK+Q207.NAOK+Q208.NAOK+Q209.NAOK+Q210.NAOK+Q211.NAOK+Q212.NAOK+Q213.NAOK+Q214.NAOK+Q215.NAOK+Q216.NAOK)/16/5*100,1)",
      },
      {
        externalId: "Q322",
        calculation:
          'round(if(Q301=="1",(Q302.NAOK+Q303.NAOK+Q304.NAOK+Q305.NAOK+Q306.NAOK+Q318.NAOK+Q319.NAOK+Q320.NAOK+Q321.NAOK)/9/5*100,if(Q301=="4",(Q312.NAOK+Q313.NAOK+Q314.NAOK+Q315.NAOK+Q316.NAOK+Q318.NAOK+Q319.NAOK+Q320.NAOK+Q321.NAOK)/9/5*100,(Q307.NAOK+Q308.NAOK+Q309.NAOK+Q310.NAOK+Q311.NAOK+Q318.NAOK+Q319.NAOK+Q320.NAOK+Q321.NAOK)/9/5*100)),1)',
      },
      {
        externalId: "Q422",
        calculation:
          "round((Q401.NAOK+Q402.NAOK+Q403.NAOK+Q404.NAOK+Q405.NAOK+Q406.NAOK+Q407.NAOK+Q408.NAOK+Q409.NAOK+Q410.NAOK+Q411.NAOK+Q412.NAOK+Q413.NAOK+Q414.NAOK+Q415.NAOK+Q416.NAOK+Q417.NAOK+Q418.NAOK+Q419.NAOK)/19/5*100,1)",
      },
      {
        externalId: "Q609",
        calculation:
          "round((Q601.NAOK+Q602.NAOK+Q603.NAOK+Q604.NAOK+Q605.NAOK+Q606.NAOK+Q607.NAOK)/7/5*100,1)",
      },
      {
        externalId: "Q804",
        calculation: "if(Q801.NAOK==2 and Q802.NAOK==4, 100, if(Q801.NAOK==2 or Q802.NAOK==4, 50, 0))",
      },
    ]);

    const payload = compileCanonicalToFormbricksPayload(survey);
    const expressionActions = (payload.blocks ?? []).flatMap((block) =>
      (block.logic ?? []).flatMap((logic) =>
        logic.actions.filter((action) => action.objective === "evaluateExpression" && "references" in action)
      )
    );
    expect(payload.variables).toHaveLength(6);
    expect(expressionActions).toHaveLength(6);
    expect(expressionActions.every((action) => "references" in action && action.references.length > 0)).toBe(
      true
    );
    const q301Reference = expressionActions
      .flatMap((action) => ("references" in action ? action.references : []))
      .find(({ source }) => source === "Q301");
    expect(q301Reference?.valueMap).toMatchObject({
      "Năm 1": "1",
      "Năm 4": "4",
    });
    expect(
      (payload.blocks ?? [])
        .flatMap(({ elements }) => elements)
        .filter(({ id }) =>
          ["Q109", "Q219", "Q322", "Q422", "Q609", "Q804"].some((sourceId) =>
            id.endsWith(
              Array.from(sourceId, (character) => character.charCodeAt(0).toString(16).padStart(2, "0")).join(
                ""
              )
            )
          )
        )
        .every((element) => element.subheader?.default.startsWith("#recall:"))
    ).toBe(true);
  });
});
