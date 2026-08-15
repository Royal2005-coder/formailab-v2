import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import type { TSurveyBlockLogicAction } from "@formbricks/types/surveys/blocks";
import type { TConditionGroup, TSingleCondition } from "@formbricks/types/surveys/logic";
import { compileCanonicalToFormbricksArtifact } from "./compile-formbricks-artifact";
import { importLegacyCsv } from "./import-csv";

const fixture = readFileSync(new URL("../../../AILAB_120Q_Advanced_Adaptive_2026.csv", import.meta.url));

const survey = importLegacyCsv(fixture).canonicalSurvey;
if (!survey) throw new Error("The exact AILAB 120Q fixture did not produce a canonical survey");

const artifact = compileCanonicalToFormbricksArtifact(survey);
const blocks = artifact.payload.blocks ?? [];
type TCompiledBlock = (typeof blocks)[number];

type TOracleContext = {
  elements: Readonly<Record<string, string | number>>;
  score: number;
};

const evaluateCondition = (
  condition: TConditionGroup | TSingleCondition,
  context: TOracleContext
): boolean => {
  if ("conditions" in condition) {
    const results = condition.conditions.map((child) => evaluateCondition(child, context));
    return condition.connector === "and" ? results.every(Boolean) : results.some(Boolean);
  }

  const actual =
    condition.leftOperand.type === "variable" ? context.score : context.elements[condition.leftOperand.value];
  const expected = condition.rightOperand?.value;

  switch (condition.operator) {
    case "equals":
      return actual === expected;
    case "doesNotEqual":
      return actual !== expected;
    case "isLessThan":
      return Number(actual) < Number(expected);
    case "isLessThanOrEqual":
      return Number(actual) <= Number(expected);
    case "isGreaterThan":
      return Number(actual) > Number(expected);
    case "isGreaterThanOrEqual":
      return Number(actual) >= Number(expected);
    default:
      throw new Error(`Route oracle does not support operator '${condition.operator}'`);
  }
};

const routeOracle = (context: TOracleContext): TCompiledBlock[] => {
  const route: TCompiledBlock[] = [];
  let block: TCompiledBlock | undefined = blocks[0];

  while (block) {
    if (route.includes(block)) throw new Error(`Compiled route contains a cycle at '${block.id}'`);
    route.push(block);

    const jumpTarget: TSurveyBlockLogicAction | undefined = block.logic
      ?.filter((rule) => rule.actions.some(({ objective }) => objective === "jumpToBlock"))
      .find((rule) => evaluateCondition(rule.conditions, context))
      ?.actions.find(({ objective }) => objective === "jumpToBlock");
    const nextId: string | undefined =
      jumpTarget?.objective === "jumpToBlock"
        ? jumpTarget.target
        : (block.logicFallback ?? blocks[blocks.indexOf(block) + 1]?.id);

    block = blocks.find(({ id }) => id === nextId);
  }

  return route;
};

const getCompiledId = (
  kind: "question" | "option",
  canonicalExternalId: string,
  parentCanonicalExternalId?: string
): string => {
  const entry = artifact.idCrosswalk.entries.find(
    (candidate) =>
      candidate.kind === kind &&
      candidate.canonicalExternalId === canonicalExternalId &&
      (!parentCanonicalExternalId ||
        ("parentCanonicalExternalId" in candidate &&
          candidate.parentCanonicalExternalId === parentCanonicalExternalId))
  );
  if (!entry) throw new Error(`Missing ${kind} crosswalk for '${canonicalExternalId}'`);
  return entry.formbricksId;
};

const q101Id = getCompiledId("question", "Q101");
const q301Id = getCompiledId("question", "Q301");

const answersFor = (q101Value: "1" | "2" | "3"): Record<string, string> => {
  const q101Option = survey.questions
    .find(({ externalId }) => externalId === "Q101")
    ?.options.find(({ value }) => value === q101Value);
  if (!q101Option) throw new Error(`Fixture Q101 option '${q101Value}' is missing`);

  const answers: Record<string, string> = {
    [q101Id]: getCompiledId("option", q101Option.externalId, "Q101"),
  };

  if (q101Value === "1") {
    const q301Option = survey.questions
      .find(({ externalId }) => externalId === "Q301")
      ?.options.find(({ value }) => value === "1");
    if (!q301Option) throw new Error("Fixture Q301 option '1' is missing");
    answers[q301Id] = getCompiledId("option", q301Option.externalId, "Q301");
  }

  return answers;
};

const externalQuestionsOn = (route: readonly TCompiledBlock[]): string[] => {
  const externalIdByCompiledId = new Map(
    artifact.idCrosswalk.entries
      .filter(({ kind }) => kind === "question")
      .map((entry) => [entry.formbricksId, entry.canonicalExternalId])
  );

  return route.flatMap(({ elements }) =>
    elements.map(({ id }) => externalIdByCompiledId.get(id) ?? `unknown:${id}`)
  );
};

describe("exact AILAB 120Q compiled adaptive routing", () => {
  test("maps every source question exactly once after block segmentation and ID remapping", () => {
    const compiledQuestionIds = blocks.flatMap(({ elements }) => elements.map(({ id }) => id));
    const sourceExternalIds = externalQuestionsOn(blocks);

    expect(compiledQuestionIds).toHaveLength(120);
    expect(new Set(compiledQuestionIds)).toHaveLength(120);
    expect(sourceExternalIds).toEqual(survey.questions.map(({ externalId }) => externalId));
    expect(sourceExternalIds.every((externalId) => !externalId.startsWith("unknown:"))).toBe(true);
  });

  test("remaps every adaptive element, choice, and navigation target to an emitted ID", () => {
    const emittedBlockIds = new Set([
      ...blocks.map(({ id }) => id),
      ...(artifact.payload.endings ?? []).map(({ id }) => id),
    ]);
    const emittedElementIds = new Set(blocks.flatMap(({ elements }) => elements.map(({ id }) => id)));
    const emittedChoiceIds = new Set(
      blocks.flatMap(({ elements }) =>
        elements.flatMap((element) => ("choices" in element ? element.choices.map(({ id }) => id) : []))
      )
    );

    for (const block of blocks) {
      if (block.logicFallback) expect(emittedBlockIds).toContain(block.logicFallback);
      for (const rule of block.logic ?? []) {
        const visit = (condition: TConditionGroup | TSingleCondition): void => {
          if ("conditions" in condition) {
            condition.conditions.forEach(visit);
            return;
          }
          if (condition.leftOperand.type === "element") {
            expect(emittedElementIds).toContain(condition.leftOperand.value);
          }
          if (condition.operator === "equals" && typeof condition.rightOperand?.value === "string") {
            expect(emittedChoiceIds).toContain(condition.rightOperand.value);
          }
        };
        visit(rule.conditions);

        for (const action of rule.actions) {
          if (action.objective === "jumpToBlock") {
            expect(emittedBlockIds).toContain(action.target);
          }
        }
      }
    }
  });

  test("calculates each equation on its own route-safe display segment", () => {
    for (const externalId of ["Q109", "Q219", "Q322", "Q422", "Q609", "Q804"]) {
      const equationId = getCompiledId("question", externalId);
      const displayBlockIndex = blocks.findIndex(({ elements }) =>
        elements.some(({ id }) => id === equationId)
      );
      expect(displayBlockIndex).toBeGreaterThan(0);

      expect(
        blocks[displayBlockIndex].logic?.some((rule) =>
          rule.actions.some(({ objective }) => objective === "evaluateExpression")
        ) ?? false
      ).toBe(true);
    }
  });

  test.each([
    ["1", "Q3", ["Q2", "Q4"]],
    ["2", "Q4", ["Q2", "Q3"]],
    ["3", "Q2", ["Q3", "Q4"]],
  ] as const)("Q101=%s enters only the %s academic branch", (q101, included, excluded) => {
    const externalIds = externalQuestionsOn(routeOracle({ elements: answersFor(q101), score: 60 }));

    expect(externalIds.some((externalId) => externalId.startsWith(included))).toBe(true);
    for (const prefix of excluded) {
      expect(externalIds.some((externalId) => externalId.startsWith(prefix))).toBe(false);
    }
  });

  test.each([
    [40, ["Q702", "Q703"], ["Q704", "Q705"]],
    [60, [], ["Q702", "Q703", "Q704", "Q705"]],
    [80, ["Q704", "Q705"], ["Q702", "Q703"]],
  ] as const)("score=%i selects only its adaptive tier", (score, included, excluded) => {
    const externalIds = externalQuestionsOn(routeOracle({ elements: answersFor("3"), score }));

    for (const externalId of included) expect(externalIds).toContain(externalId);
    for (const externalId of excluded) expect(externalIds).not.toContain(externalId);
  });
});
