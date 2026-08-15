import type { TSurveyCreateInput } from "@formbricks/types/surveys/types";
import { type TCompileRelevanceContext, compileRelevanceToFormbricksConditions } from "./compile-relevance";
import type { TCanonicalSurvey } from "./contracts";
import { parseExpression } from "./expression";
import type { TExpressionNode } from "./expression/types";
import { compileEquationVariableId } from "./id-crosswalk";

export type TAdaptiveBlockSegment = {
  block: TCompiledSurveyBlock;
  canonicalGroupExternalId: string;
  effectiveRelevance: string;
  segmentIndex: number;
  segmentCount: number;
  questionExternalIds: string[];
  calculatedVariableExternalIds: string[];
};

const TRUE_RELEVANCE = "1";
type TCompiledSurveyBlock = NonNullable<TSurveyCreateInput["blocks"]>[number];

const normalizeRelevance = (relevance: string | undefined): string => {
  const normalized = relevance?.trim();
  return normalized && normalized !== TRUE_RELEVANCE ? normalized : TRUE_RELEVANCE;
};

const combineRelevance = (
  groupRelevance: string | undefined,
  questionRelevance: string | undefined
): string => {
  const group = normalizeRelevance(groupRelevance);
  const question = normalizeRelevance(questionRelevance);

  if (group === TRUE_RELEVANCE) return question;
  if (question === TRUE_RELEVANCE || question === group) return group;
  return `(${group}) and (${question})`;
};

const getRelevanceReferences = (relevance: string): string[] => {
  const references = new Set<string>();
  const visit = (node: TExpressionNode): void => {
    if (node.type === "reference") {
      references.add(node.path[0]);
    } else if (node.type === "unary") {
      visit(node.operand);
    } else if (node.type === "binary") {
      visit(node.left);
      visit(node.right);
    } else if (node.type === "call") {
      node.arguments.forEach(visit);
    }
  };
  visit(parseExpression(relevance));
  return [...references];
};

export const segmentCanonicalBlocks = ({
  survey,
  blocks,
}: {
  survey: TCanonicalSurvey;
  blocks: readonly TCompiledSurveyBlock[];
}): TAdaptiveBlockSegment[] => {
  const questionsByExternalId = new Map(survey.questions.map((question) => [question.externalId, question]));
  const sourceBlocksByGroupExternalId = new Map(blocks.map((block) => [block.id, block]));
  const segments: TAdaptiveBlockSegment[] = [];

  for (const group of [...survey.groups].sort((left, right) => left.order - right.order)) {
    const sourceBlock = sourceBlocksByGroupExternalId.get(group.externalId);
    if (!sourceBlock) {
      throw new Error(`Canonical group '${group.externalId}' has no compiled Formbricks block`);
    }

    const groupSegments: Array<Omit<TAdaptiveBlockSegment, "segmentCount">> = [];

    for (const element of sourceBlock.elements) {
      const question = questionsByExternalId.get(element.id);
      if (!question) {
        throw new Error(`Compiled element '${element.id}' has no canonical question`);
      }

      const effectiveRelevance = combineRelevance(group.relevance, question.relevance);
      const equationVariableId =
        question.type === "equation"
          ? compileEquationVariableId(survey.externalId, question.externalId)
          : undefined;
      const elementLogic = sourceBlock.logic?.filter((rule) =>
        rule.actions.some(
          (action) => action.objective === "evaluateExpression" && action.variableId === equationVariableId
        )
      );
      if (question.type === "equation") {
        const segmentIndex = groupSegments.length;
        groupSegments.push({
          canonicalGroupExternalId: group.externalId,
          effectiveRelevance,
          segmentIndex,
          questionExternalIds: [question.externalId],
          calculatedVariableExternalIds: [question.externalId],
          block: {
            ...sourceBlock,
            id: `${group.externalId}_segment_${String(segmentIndex + 1)}`,
            name: segmentIndex === 0 ? sourceBlock.name : `${sourceBlock.name} · ${String(segmentIndex + 1)}`,
            elements: [element],
            logic: elementLogic ? [...elementLogic] : [],
            logicFallback: undefined,
          },
        });
        continue;
      }

      const previous = groupSegments.at(-1);
      if (previous?.effectiveRelevance === effectiveRelevance) {
        previous.block.elements.push(element);
        previous.questionExternalIds.push(question.externalId);
        continue;
      }

      const segmentIndex = groupSegments.length;
      groupSegments.push({
        canonicalGroupExternalId: group.externalId,
        effectiveRelevance,
        segmentIndex,
        questionExternalIds: [question.externalId],
        calculatedVariableExternalIds: [],
        block: {
          ...sourceBlock,
          id: `${group.externalId}_segment_${String(segmentIndex + 1)}`,
          name: segmentIndex === 0 ? sourceBlock.name : `${sourceBlock.name} · ${String(segmentIndex + 1)}`,
          elements: [element],
          logic: undefined,
          logicFallback: undefined,
        },
      });
    }

    const segmentCount = groupSegments.length;
    segments.push(
      ...groupSegments.map((segment) => ({
        ...segment,
        segmentCount,
        block:
          segmentCount === 1
            ? { ...segment.block, id: group.externalId, name: sourceBlock.name }
            : segment.block,
      }))
    );
  }

  return segments;
};

export const isUnconditionalRelevance = (relevance: string): boolean =>
  normalizeRelevance(relevance) === TRUE_RELEVANCE;

export const applyAdaptiveSegmentRouting = ({
  blocks,
  effectiveRelevance,
  availableReferenceExternalIds,
  endingId,
  context,
}: {
  blocks: readonly TCompiledSurveyBlock[];
  effectiveRelevance: readonly string[];
  availableReferenceExternalIds: readonly ReadonlySet<string>[];
  endingId: string;
  context: TCompileRelevanceContext;
}): TCompiledSurveyBlock[] => {
  if (blocks.length !== effectiveRelevance.length || blocks.length !== availableReferenceExternalIds.length) {
    throw new Error("Adaptive routing requires exactly one relevance expression per block");
  }

  return blocks.map((block, blockIndex) => {
    const rules = [];
    let fallbackTarget = endingId;
    const seenRelevance = new Set<string>();

    for (let targetIndex = blockIndex + 1; targetIndex < blocks.length; targetIndex += 1) {
      const targetBlock = blocks[targetIndex];
      const relevance = effectiveRelevance[targetIndex];

      if (isUnconditionalRelevance(relevance)) {
        fallbackTarget = targetBlock.id;
        break;
      }

      if (
        seenRelevance.has(relevance) ||
        getRelevanceReferences(relevance).some(
          (externalId) => !availableReferenceExternalIds[blockIndex].has(externalId)
        )
      ) {
        continue;
      }
      seenRelevance.add(relevance);

      const routePath = `routing.block.${String(blockIndex)}.target.${String(targetIndex)}`;
      rules.push({
        id: context.createId(`${routePath}.rule`),
        conditions: compileRelevanceToFormbricksConditions(relevance, {
          ...context,
          createId: (path) => context.createId(`${routePath}.${path}`),
        }),
        actions: [
          {
            id: context.createId(`${routePath}.jump`),
            objective: "jumpToBlock" as const,
            target: targetBlock.id,
          },
        ],
      });
    }

    if (rules.length === 0) return block;

    return {
      ...block,
      logic: [...(block.logic ?? []), ...rules],
      logicFallback: fallbackTarget,
    };
  });
};
