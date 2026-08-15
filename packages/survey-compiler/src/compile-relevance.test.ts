import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { compileRelevanceToFormbricksConditions } from "./compile-relevance";
import { importLegacyCsv } from "./import-csv";

const createId = (path: string): string => `alr${path.replaceAll(".", "x")}`;

describe("compileRelevanceToFormbricksConditions", () => {
  test("maps the Q101 LimeSurvey branch value to the emitted Formbricks choice ID", () => {
    const conditions = compileRelevanceToFormbricksConditions('Q101 == "3"', {
      createId,
      resolveReference: (externalId) => {
        expect(externalId).toBe("Q101");
        return {
          type: "element",
          formbricksId: "alq101",
          valueType: "choice",
          resolveChoiceValue: (value) => {
            expect(value).toBe("3");
            return "almanagerchoice";
          },
        };
      },
    });

    expect(conditions).toMatchObject({
      connector: "and",
      conditions: [
        {
          leftOperand: { type: "element", value: "alq101" },
          operator: "equals",
          rightOperand: { type: "static", value: "almanagerchoice" },
        },
      ],
    });
  });

  test("preserves nested academic adaptive relevance and treats NAOK as the same response", () => {
    const conditions = compileRelevanceToFormbricksConditions(
      '(Q101 == "3" and Q219.NAOK < 50) or (Q101 == "1" and Q322.NAOK < 50)',
      {
        createId,
        resolveReference: (externalId) =>
          externalId === "Q101"
            ? {
                type: "element",
                formbricksId: "alq101",
                valueType: "choice",
                resolveChoiceValue: (value) => `choice-${String(value)}`,
              }
            : {
                type: "variable",
                formbricksId: `variable-${externalId.toLowerCase()}`,
                valueType: "number",
              },
      }
    );

    expect(conditions.connector).toBe("or");
    expect(conditions.conditions).toMatchObject([
      {
        connector: "and",
        conditions: [
          { operator: "equals", rightOperand: { value: "choice-3" } },
          {
            leftOperand: { type: "variable", value: "variable-q219" },
            operator: "isLessThan",
            rightOperand: { value: 50 },
          },
        ],
      },
      {
        connector: "and",
        conditions: [
          { operator: "equals", rightOperand: { value: "choice-1" } },
          {
            leftOperand: { type: "variable", value: "variable-q322" },
            operator: "isLessThan",
            rightOperand: { value: 50 },
          },
        ],
      },
    ]);
  });

  test("rejects equation semantics that Formbricks block conditions cannot execute", () => {
    expect(() =>
      compileRelevanceToFormbricksConditions("round(Q201 / 5) >= 50", {
        createId,
        resolveReference: () => ({
          type: "element",
          formbricksId: "alq201",
          valueType: "number",
        }),
      })
    ).toThrowError("one reference and one string or number literal");
  });

  test("compiles every Q101 group branch from the exact AILAB 120Q fixture without changing values", () => {
    const fixture = readFileSync(new URL("../../../AILAB_120Q_Advanced_Adaptive_2026.csv", import.meta.url));
    const canonicalSurvey = importLegacyCsv(fixture).canonicalSurvey;
    if (!canonicalSurvey) throw new Error("The 120Q fixture did not produce a canonical survey");

    const q101 = canonicalSurvey.questions.find(({ externalId }) => externalId === "Q101");
    if (!q101) throw new Error("Q101 is missing from the 120Q fixture");
    const branchGroups = canonicalSurvey.groups.filter(({ relevance }) => relevance !== "1");

    expect(branchGroups.map(({ externalId }) => externalId)).toEqual(["G2_DSAIG", "G3_VSAIC", "G4_WAIC"]);

    const compiled = branchGroups.map(({ relevance }) =>
      compileRelevanceToFormbricksConditions(relevance ?? "1", {
        createId,
        resolveReference: (externalId) => {
          expect(externalId).toBe("Q101");
          return {
            type: "element",
            formbricksId: "alq101",
            valueType: "choice",
            resolveChoiceValue: (value) => {
              const option = q101.options.find((candidate) => candidate.value === value);
              if (!option) throw new Error(`Q101 has no canonical value '${String(value)}'`);
              return `choice-${option.externalId}`;
            },
          };
        },
      })
    );

    expect(
      compiled.map((group) => {
        const condition = group.conditions[0];
        if ("conditions" in condition) throw new Error("Expected a single Q101 comparison");
        return condition.rightOperand?.value;
      })
    ).toEqual(["choice-Q101_A_3", "choice-Q101_A_1", "choice-Q101_A_2"]);
  });
});
