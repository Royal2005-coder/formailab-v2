import { evaluateExpression, parseExpression } from "@formbricks/survey-compiler/expression";
import type { TResponseData, TResponseVariables } from "@formbricks/types/responses";
import type { TActionEvaluateExpression } from "@formbricks/types/surveys/blocks";

const assignContextValue = (context: Record<string, unknown>, source: string, value: unknown): void => {
  const [identifier, policy] = source.split(".");
  if (policy === undefined) {
    context[identifier] = value;
    return;
  }
  const current = context[identifier];
  if (current !== undefined && (typeof current !== "object" || current === null)) {
    throw new Error(`Expression reference '${source}' conflicts with '${identifier}'`);
  }
  context[identifier] = {
    ...(current as Record<string, unknown> | undefined),
    [policy]: value,
  };
};

export const evaluateExpressionAction = (
  action: TActionEvaluateExpression,
  responseData: TResponseData,
  variablesData: TResponseVariables
): number => {
  try {
    const context: Record<string, unknown> = {};
    const seenSources = new Set<string>();

    for (const reference of action.references) {
      if (seenSources.has(reference.source)) continue;
      seenSources.add(reference.source);

      const sourceValue =
        reference.target.type === "element"
          ? responseData[reference.target.value]
          : variablesData[reference.target.value];
      const mappedSourceValue =
        typeof sourceValue === "string" && reference.valueMap?.[sourceValue] !== undefined
          ? reference.valueMap[sourceValue]
          : sourceValue;
      const value =
        mappedSourceValue === undefined || mappedSourceValue === null || mappedSourceValue === ""
          ? 0
          : mappedSourceValue;

      assignContextValue(context, reference.source, value);
    }

    const parsed = parseExpression(action.expression);
    const evaluated = evaluateExpression(parsed, context);
    return typeof evaluated === "number" && Number.isFinite(evaluated) ? evaluated : 0;
  } catch (error) {
    console.warn(`[Formbricks] Failed to evaluate expression "${action.expression}":`, error);
    return 0;
  }
};
