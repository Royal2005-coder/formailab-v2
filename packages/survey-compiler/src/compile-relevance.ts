import type { TSurveyBlock, TSurveyBlockLogic } from "@formbricks/types/surveys/blocks";
import type { TConditionGroup, TSingleCondition } from "@formbricks/types/surveys/logic";
import { parseExpression } from "./expression";
import type { TExpressionLiteral, TExpressionNode } from "./expression/types";

export type TRelevanceReference = {
  type: "element" | "variable";
  formbricksId: string;
  valueType: "choice" | "number" | "text";
  resolveChoiceValue?: (value: string | number) => string;
};

export type TCompileRelevanceContext = {
  resolveReference: (externalId: string) => TRelevanceReference;
  createId: (path: string) => string;
};

const comparisonOperators = {
  "=": "equals",
  "!=": "doesNotEqual",
  "<": "isLessThan",
  "<=": "isLessThanOrEqual",
  ">": "isGreaterThan",
  ">=": "isGreaterThanOrEqual",
} as const;

const reverseComparisonOperators = {
  "=": "=",
  "!=": "!=",
  "<": ">",
  "<=": ">=",
  ">": "<",
  ">=": "<=",
} as const;

const getReferenceExternalId = (node: TExpressionNode): string | undefined => {
  if (node.type !== "reference") return undefined;
  if (node.path.length === 1) return node.path[0];
  if (node.path.length === 2 && node.path[1].toUpperCase() === "NAOK") return node.path[0];
  throw new Error(`Unsupported LimeSurvey relevance reference '${node.path.join(".")}'`);
};

const getLiteral = (node: TExpressionNode): TExpressionLiteral | undefined =>
  node.type === "literal" ? node.value : undefined;

const compileComparison = (
  node: Extract<TExpressionNode, { type: "binary" }>,
  context: TCompileRelevanceContext,
  path: string
): TSingleCondition => {
  let operator = node.operator as keyof typeof comparisonOperators;
  let referenceExternalId = getReferenceExternalId(node.left);
  let literal = getLiteral(node.right);

  if (!referenceExternalId) {
    referenceExternalId = getReferenceExternalId(node.right);
    literal = getLiteral(node.left);
    operator = reverseComparisonOperators[operator];
  }

  if (!referenceExternalId || literal === undefined || literal === null || typeof literal === "boolean") {
    throw new Error(
      "Formbricks relevance comparisons require one reference and one string or number literal"
    );
  }

  const reference = context.resolveReference(referenceExternalId);
  const value = reference.valueType === "choice" ? reference.resolveChoiceValue?.(literal) : literal;

  if (value === undefined) {
    throw new Error(
      `Canonical choice value '${String(literal)}' is not defined for '${referenceExternalId}'`
    );
  }

  return {
    id: context.createId(`${path}.condition`),
    leftOperand: {
      type: reference.type,
      value: reference.formbricksId,
    },
    operator: comparisonOperators[operator],
    rightOperand: { type: "static", value },
  };
};

const compileNode = (
  node: TExpressionNode,
  context: TCompileRelevanceContext,
  path: string
): TConditionGroup | TSingleCondition => {
  if (node.type === "reference") {
    const refExtId = getReferenceExternalId(node);
    if (!refExtId) throw new Error(`Invalid reference node in relevance`);
    const reference = context.resolveReference(refExtId);
    return {
      id: context.createId(`${path}.condition`),
      leftOperand: { type: reference.type, value: reference.formbricksId },
      operator: "isSubmitted",
    };
  }

  if (node.type === "call" && (node.name === "is_empty" || node.name === "empty")) {
    const arg = node.arguments[0];
    const refExtId = arg ? getReferenceExternalId(arg) : undefined;
    if (!refExtId) throw new Error(`is_empty in relevance requires a question reference`);
    const reference = context.resolveReference(refExtId);
    return {
      id: context.createId(`${path}.condition`),
      leftOperand: { type: reference.type, value: reference.formbricksId },
      operator: "isSkipped",
    };
  }

  if (node.type === "unary" && node.operator === "not") {
    if (node.operand.type === "reference") {
      const refExtId = getReferenceExternalId(node.operand);
      if (!refExtId) throw new Error(`Invalid reference node in relevance`);
      const reference = context.resolveReference(refExtId);
      return {
        id: context.createId(`${path}.condition`),
        leftOperand: { type: reference.type, value: reference.formbricksId },
        operator: "isSkipped",
      };
    }
    if (node.operand.type === "call" && (node.operand.name === "is_empty" || node.operand.name === "empty")) {
      const arg = node.operand.arguments[0];
      const refExtId = arg ? getReferenceExternalId(arg) : undefined;
      if (!refExtId) throw new Error(`!is_empty in relevance requires a question reference`);
      const reference = context.resolveReference(refExtId);
      return {
        id: context.createId(`${path}.condition`),
        leftOperand: { type: reference.type, value: reference.formbricksId },
        operator: "isSubmitted",
      };
    }
    return compileNode(node.operand, context, `${path}.not`);
  }

  if (node.type !== "binary") {
    throw new Error("Formbricks relevance supports comparison expressions joined by 'and' or 'or'");
  }

  if (node.operator === "and" || node.operator === "or") {
    return {
      id: context.createId(`${path}.group`),
      connector: node.operator,
      conditions: [
        compileNode(node.left, context, `${path}.left`),
        compileNode(node.right, context, `${path}.right`),
      ],
    };
  }

  if (!(node.operator in comparisonOperators)) {
    throw new Error(`Unsupported Formbricks relevance operator '${node.operator}'`);
  }

  return compileComparison(node, context, path);
};

export const compileRelevanceToFormbricksConditions = (
  expression: string,
  context: TCompileRelevanceContext
): TConditionGroup => {
  const cleanExpr = expression
    .trim()
    .replace(/^\{|\}$/g, "")
    .trim();
  const compiled = compileNode(parseExpression(cleanExpr), context, "root");
  return "conditions" in compiled
    ? compiled
    : {
        id: context.createId("root.group"),
        connector: "and",
        conditions: [compiled],
      };
};

type TConditionalGroup = {
  targetBlockId: string;
  relevance: string;
};

export const compileConditionalGroupRouting = ({
  blocks,
  conditionalGroups,
  fallbackTarget,
  context,
}: {
  blocks: TSurveyBlock[];
  conditionalGroups: TConditionalGroup[];
  fallbackTarget: string;
  context: TCompileRelevanceContext;
}): TSurveyBlock[] => {
  if (conditionalGroups.length === 0) return blocks;

  const conditionalIds = new Set(conditionalGroups.map(({ targetBlockId }) => targetBlockId));
  const firstConditionalIndex = blocks.findIndex((block) => conditionalIds.has(block.id));
  if (firstConditionalIndex <= 0) {
    throw new Error("Conditional group routing requires a preceding unconditional Formbricks block");
  }

  const entryBlockIndex = firstConditionalIndex - 1;
  const entryRules = conditionalGroups.map<TSurveyBlockLogic>(({ targetBlockId, relevance }, index) => ({
    id: context.createId(`routing.entry.${String(index)}`),
    conditions: compileRelevanceToFormbricksConditions(relevance, {
      ...context,
      createId: (path) => context.createId(`routing.entry.${String(index)}.${path}`),
    }),
    actions: [
      {
        id: context.createId(`routing.entry.${String(index)}.jump`),
        objective: "jumpToBlock",
        target: targetBlockId,
      },
    ],
  }));

  return blocks.map((block, index) => {
    if (index === entryBlockIndex) {
      return { ...block, logic: [...(block.logic ?? []), ...entryRules], logicFallback: fallbackTarget };
    }

    const branchIndex = conditionalGroups.findIndex(({ targetBlockId }) => targetBlockId === block.id);
    if (branchIndex === -1) return block;
    const branch = conditionalGroups[branchIndex];

    return {
      ...block,
      logic: [
        ...(block.logic ?? []),
        {
          id: context.createId(`routing.exit.${String(branchIndex)}`),
          conditions: compileRelevanceToFormbricksConditions(branch.relevance, {
            ...context,
            createId: (path) => context.createId(`routing.exit.${String(branchIndex)}.${path}`),
          }),
          actions: [
            {
              id: context.createId(`routing.exit.${String(branchIndex)}.jump`),
              objective: "jumpToBlock" as const,
              target: fallbackTarget,
            },
          ],
        },
      ],
    };
  });
};
