import { describe, expect, test } from "vitest";
import type { TActionEvaluateExpression } from "@formbricks/types/surveys/blocks";
import { evaluateExpressionAction } from "./expression-action";

const elementId = (source: string) => `q${source.toLowerCase()}1234567890123456`;
const variableId = (source: string) => `v${source.toLowerCase()}1234567890123456`;

const action = (
  output: string,
  expression: string,
  sources: readonly string[]
): TActionEvaluateExpression => ({
  id: `a${output.toLowerCase()}1234567890123456`,
  objective: "evaluateExpression",
  variableId: variableId(output),
  expression,
  references: sources.map((source) => ({
    source,
    target: {
      type: source.startsWith("Q109") ? ("variable" as const) : ("element" as const),
      value: source.startsWith("Q109") ? variableId("Q109") : elementId(source.split(".")[0]),
    },
    missingValue: source.endsWith(".NAOK") ? ("zero" as const) : ("error" as const),
  })),
});

describe("Lime equation runtime", () => {
  test.each([
    {
      id: "Q109",
      expression: "(Q105.NAOK + Q106.NAOK) / 2 * 20",
      values: { Q105: 3, Q106: 4 },
      expected: 70,
    },
    {
      id: "Q219",
      expression:
        "round((Q201.NAOK+Q202.NAOK+Q203.NAOK+Q204.NAOK+Q205.NAOK+Q206.NAOK+Q207.NAOK+Q208.NAOK+Q209.NAOK+Q210.NAOK+Q211.NAOK+Q212.NAOK+Q213.NAOK+Q214.NAOK+Q215.NAOK+Q216.NAOK)/16/5*100,1)",
      values: Object.fromEntries(Array.from({ length: 16 }, (_, index) => [`Q${201 + index}`, 4])),
      expected: 80,
    },
    {
      id: "Q322",
      expression:
        'round(if(Q301=="1",(Q302.NAOK+Q303.NAOK+Q304.NAOK+Q305.NAOK+Q306.NAOK+Q318.NAOK+Q319.NAOK+Q320.NAOK+Q321.NAOK)/9/5*100,if(Q301=="4",(Q312.NAOK+Q313.NAOK+Q314.NAOK+Q315.NAOK+Q316.NAOK+Q318.NAOK+Q319.NAOK+Q320.NAOK+Q321.NAOK)/9/5*100,(Q307.NAOK+Q308.NAOK+Q309.NAOK+Q310.NAOK+Q311.NAOK+Q318.NAOK+Q319.NAOK+Q320.NAOK+Q321.NAOK)/9/5*100)),1)',
      values: {
        Q301: "4",
        Q312: 4,
        Q313: 4,
        Q314: 4,
        Q315: 4,
        Q316: 4,
        Q318: 4,
        Q319: 4,
        Q320: 4,
        Q321: 4,
      },
      expected: 80,
    },
    {
      id: "Q422",
      expression:
        "round((Q401.NAOK+Q402.NAOK+Q403.NAOK+Q404.NAOK+Q405.NAOK+Q406.NAOK+Q407.NAOK+Q408.NAOK+Q409.NAOK+Q410.NAOK+Q411.NAOK+Q412.NAOK+Q413.NAOK+Q414.NAOK+Q415.NAOK+Q416.NAOK+Q417.NAOK+Q418.NAOK+Q419.NAOK)/19/5*100,1)",
      values: Object.fromEntries(Array.from({ length: 19 }, (_, index) => [`Q${401 + index}`, 3])),
      expected: 60,
    },
    {
      id: "Q609",
      expression: "round((Q601.NAOK+Q602.NAOK+Q603.NAOK+Q604.NAOK+Q605.NAOK+Q606.NAOK+Q607.NAOK)/7/5*100,1)",
      values: Object.fromEntries(Array.from({ length: 7 }, (_, index) => [`Q${601 + index}`, 3.5])),
      expected: 70,
    },
    {
      id: "Q804",
      expression: "if(Q801.NAOK==2 and Q802.NAOK==4, 100, if(Q801.NAOK==2 or Q802.NAOK==4, 50, 0))",
      values: { Q801: 2, Q802: 4 },
      expected: 100,
    },
  ])("evaluates $id deterministically", ({ id, expression, values, expected }) => {
    const sources = [...expression.matchAll(/\bQ\d+(?:\.NAOK)?\b/g)].map(([source]) => source);
    const responseData = Object.fromEntries(
      Object.entries(values).map(([source, value]) => [elementId(source), value])
    );

    expect(evaluateExpressionAction(action(id, expression, sources), responseData, {})).toBe(expected);
  });

  test("applies Lime .NAOK missing-answer policy as zero", () => {
    expect(
      evaluateExpressionAction(
        action("Q109", "(Q105.NAOK + Q106.NAOK) / 2 * 20", ["Q105.NAOK", "Q106.NAOK"]),
        { [elementId("Q105")]: 5 },
        {}
      )
    ).toBe(50);
  });

  test("maps a Formbricks choice label back to its canonical Lime code", () => {
    const mappedAction = action("Q322", 'if(Q301=="4", 100, 0)', ["Q301"]);
    mappedAction.references[0].valueMap = { "Năm 4": "4" };

    expect(evaluateExpressionAction(mappedAction, { [elementId("Q301")]: "Năm 4" }, {})).toBe(100);
  });

  test("preserves non-numeric letter codes on NAOK refs for string equality", () => {
    const letterAction: TActionEvaluateExpression = {
      ...action(
        "Q100",
        'round((((if(Q101.NAOK=="D",1,if(Q101.NAOK=="C",2,if(Q101.NAOK=="A",3,if(Q101.NAOK=="B",4,0))))+if(Q102.NAOK=="D",1,if(Q102.NAOK=="A",2,if(Q102.NAOK=="B",3,if(Q102.NAOK=="C",4,0)))))/2-1)/3)*100,1)',
        ["Q101.NAOK", "Q102.NAOK"]
      ),
      references: [
        {
          source: "Q101.NAOK",
          target: { type: "element", value: elementId("Q101") },
          valueMap: { "Mức 1": "D", "Mức 2": "C", "Mức 3": "A", "Mức 4": "B" },
          missingValue: "zero",
        },
        {
          source: "Q102.NAOK",
          target: { type: "element", value: elementId("Q102") },
          valueMap: { "Mức 1": "D", "Mức 2": "A", "Mức 3": "B", "Mức 4": "C" },
          missingValue: "zero",
        },
      ],
    };

    expect(
      evaluateExpressionAction(
        letterAction,
        { [elementId("Q101")]: "Mức 3", [elementId("Q102")]: "Mức 4" },
        {}
      )
    ).toBe(83.3);
  });

  test("preserves numeric choice codes on NAOK refs for string equality", () => {
    const numericCodeAction = action("Q200", 'if(Q201.NAOK=="5", 100, 0)', ["Q201.NAOK"]);
    numericCodeAction.references[0].valueMap = {
      "Có làm đầy đủ và duy trì thường xuyên": "5",
    };

    expect(
      evaluateExpressionAction(
        numericCodeAction,
        { [elementId("Q201")]: "Có làm đầy đủ và duy trì thường xuyên" },
        {}
      )
    ).toBe(100);
  });
});
