import type { TCanonicalSurvey, TImportDiagnostic } from "./contracts";
import { ExpressionError, evaluateExpression, parseExpression } from "./expression";
import type { TExpressionNode } from "./expression/types";

export type TAdaptiveValue = string | number | boolean | null | string[];
export type TAdaptiveContext = Readonly<Record<string, TAdaptiveValue>>;

export type TRouteTraceEntry = Readonly<{
  targetExternalId: string;
  targetType: "group" | "question" | "ending";
  expression?: string;
  result: boolean;
  reason: "relevant" | "notRelevant" | "parentNotRelevant" | "complete" | "evaluationError";
}>;

export type TCalculatedVariableTrace = Readonly<{
  variableExternalId: string;
  expression: string;
  value?: TAdaptiveValue;
  dependencies: readonly string[];
  result: "calculated" | "error" | "cycle";
}>;

export type TAdaptiveSimulationResult = Readonly<{
  visibleGroupExternalIds: readonly string[];
  visibleQuestionExternalIds: readonly string[];
  endingExternalId: string;
  variables: TAdaptiveContext;
  routeTrace: readonly TRouteTraceEntry[];
  calculationTrace: readonly TCalculatedVariableTrace[];
  diagnostics: readonly TImportDiagnostic[];
}>;

const collectReferences = (node: TExpressionNode, references: Set<string>): void => {
  switch (node.type) {
    case "reference":
      references.add(node.path[0]);
      return;
    case "unary":
      collectReferences(node.operand, references);
      return;
    case "binary":
      collectReferences(node.left, references);
      collectReferences(node.right, references);
      return;
    case "call":
      node.arguments.forEach((argument) => collectReferences(argument, references));
      return;
    case "literal":
      return;
  }
};

const asAdaptiveValue = (value: unknown): TAdaptiveValue => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) return value;
  throw new ExpressionError("INVALID_ARGUMENT", "Expression result is not a supported adaptive value");
};

export const evaluateCalculatedVariables = (
  survey: TCanonicalSurvey,
  answers: TAdaptiveContext
): Readonly<{
  variables: TAdaptiveContext;
  trace: readonly TCalculatedVariableTrace[];
  diagnostics: readonly TImportDiagnostic[];
}> => {
  const variables: Record<string, TAdaptiveValue> = {};
  const diagnostics: TImportDiagnostic[] = [];
  const trace: TCalculatedVariableTrace[] = [];
  const calculatedVariables = survey.variables.filter((variable) => variable.calculation);
  const variableIds = new Set(calculatedVariables.map((variable) => variable.externalId));
  const parsed = new Map<string, { expression: string; node: TExpressionNode; dependencies: string[] }>();

  for (const variable of calculatedVariables) {
    try {
      const expression = variable.calculation!;
      const node = parseExpression(expression);
      const references = new Set<string>();
      collectReferences(node, references);
      parsed.set(variable.externalId, {
        expression,
        node,
        dependencies: [...references].filter((reference) => variableIds.has(reference)).sort(),
      });
    } catch (error) {
      diagnostics.push({
        severity: "error",
        code: "adaptive.calculation.parse_error",
        message: error instanceof Error ? error.message : "Invalid calculation",
        externalId: variable.externalId,
      });
      trace.push({
        variableExternalId: variable.externalId,
        expression: variable.calculation!,
        dependencies: [],
        result: "error",
      });
    }
  }

  const pending = new Set(parsed.keys());
  while (pending.size > 0) {
    const ready = [...pending].filter((id) =>
      parsed.get(id)!.dependencies.every((dependency) => !pending.has(dependency))
    );
    if (ready.length === 0) {
      for (const id of [...pending].sort()) {
        const definition = parsed.get(id)!;
        diagnostics.push({
          severity: "error",
          code: "adaptive.calculation.cycle",
          message: `Calculated variable '${id}' is part of a dependency cycle`,
          externalId: id,
        });
        trace.push({
          variableExternalId: id,
          expression: definition.expression,
          dependencies: definition.dependencies,
          result: "cycle",
        });
      }
      break;
    }
    for (const id of ready.sort()) {
      pending.delete(id);
      const definition = parsed.get(id)!;
      try {
        const value = asAdaptiveValue(evaluateExpression(definition.node, { ...answers, ...variables }));
        variables[id] = value;
        trace.push({
          variableExternalId: id,
          expression: definition.expression,
          value,
          dependencies: definition.dependencies,
          result: "calculated",
        });
      } catch (error) {
        diagnostics.push({
          severity: "error",
          code: "adaptive.calculation.evaluation_error",
          message: error instanceof Error ? error.message : "Calculation failed",
          externalId: id,
        });
        trace.push({
          variableExternalId: id,
          expression: definition.expression,
          dependencies: definition.dependencies,
          result: "error",
        });
      }
    }
  }

  return { variables, trace, diagnostics };
};

const evaluateRelevance = (expression: string | undefined, context: TAdaptiveContext): boolean =>
  expression ? Boolean(evaluateExpression(parseExpression(expression), context)) : true;

export const simulateAdaptiveRoute = (
  survey: TCanonicalSurvey,
  answers: TAdaptiveContext
): TAdaptiveSimulationResult => {
  const calculations = evaluateCalculatedVariables(survey, answers);
  const context = { ...answers, ...calculations.variables };
  const diagnostics = [...calculations.diagnostics];
  const routeTrace: TRouteTraceEntry[] = [];
  const visibleGroupExternalIds: string[] = [];
  const visibleQuestionExternalIds: string[] = [];
  const groupVisibility = new Map<string, boolean>();

  for (const group of [...survey.groups].sort((left, right) => left.order - right.order)) {
    try {
      const result = evaluateRelevance(group.relevance, context);
      groupVisibility.set(group.externalId, result);
      if (result) visibleGroupExternalIds.push(group.externalId);
      routeTrace.push({
        targetExternalId: group.externalId,
        targetType: "group",
        ...(group.relevance ? { expression: group.relevance } : {}),
        result,
        reason: result ? "relevant" : "notRelevant",
      });
    } catch (error) {
      groupVisibility.set(group.externalId, false);
      diagnostics.push({
        severity: "error",
        code: "adaptive.relevance.evaluation_error",
        message: error instanceof Error ? error.message : "Relevance evaluation failed",
        externalId: group.externalId,
      });
      routeTrace.push({
        targetExternalId: group.externalId,
        targetType: "group",
        ...(group.relevance ? { expression: group.relevance } : {}),
        result: false,
        reason: "evaluationError",
      });
    }
  }

  for (const question of [...survey.questions].sort((left, right) => left.order - right.order)) {
    if (!groupVisibility.get(question.groupExternalId)) {
      routeTrace.push({
        targetExternalId: question.externalId,
        targetType: "question",
        ...(question.relevance ? { expression: question.relevance } : {}),
        result: false,
        reason: "parentNotRelevant",
      });
      continue;
    }
    try {
      const result = evaluateRelevance(question.relevance, context);
      if (result) visibleQuestionExternalIds.push(question.externalId);
      routeTrace.push({
        targetExternalId: question.externalId,
        targetType: "question",
        ...(question.relevance ? { expression: question.relevance } : {}),
        result,
        reason: result ? "relevant" : "notRelevant",
      });
    } catch (error) {
      diagnostics.push({
        severity: "error",
        code: "adaptive.relevance.evaluation_error",
        message: error instanceof Error ? error.message : "Relevance evaluation failed",
        externalId: question.externalId,
      });
      routeTrace.push({
        targetExternalId: question.externalId,
        targetType: "question",
        ...(question.relevance ? { expression: question.relevance } : {}),
        result: false,
        reason: "evaluationError",
      });
    }
  }

  const endingExternalId = survey.endings[0].externalId;
  routeTrace.push({
    targetExternalId: endingExternalId,
    targetType: "ending",
    result: true,
    reason: "complete",
  });
  return {
    visibleGroupExternalIds,
    visibleQuestionExternalIds,
    endingExternalId,
    variables: calculations.variables,
    routeTrace,
    calculationTrace: calculations.trace,
    diagnostics,
  };
};
