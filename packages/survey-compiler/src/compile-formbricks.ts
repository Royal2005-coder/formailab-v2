import type { TI18nString } from "@formbricks/types/i18n";
import type { TSurveyBlock } from "@formbricks/types/surveys/blocks";
import { type TSurveyElement, TSurveyElementTypeEnum } from "@formbricks/types/surveys/elements";
import type { TSurveyCreateInput } from "@formbricks/types/surveys/types";
import type { TCanonicalSurvey } from "./contracts";
import { type TExpressionNode, parseExpression } from "./expression";
import {
  compileEquationActionId,
  compileEquationConditionGroupId,
  compileEquationLogicId,
  compileEquationVariableId,
  compileQuestionId,
} from "./id-crosswalk";

const compileLocalizedText = (text: Record<string, string>, defaultLanguage: string): TI18nString => ({
  default: text[defaultLanguage] ?? Object.values(text)[0] ?? "",
  ...text,
});

const collectExpressionReferences = (node: TExpressionNode): string[] => {
  const references: string[] = [];
  const visit = (current: TExpressionNode): void => {
    if (current.type === "reference") {
      references.push(current.path.join("."));
    } else if (current.type === "unary") {
      visit(current.operand);
    } else if (current.type === "binary") {
      visit(current.left);
      visit(current.right);
    } else if (current.type === "call") {
      current.arguments.forEach(visit);
    }
  };
  visit(node);
  return [...new Set(references)];
};

export const compileCanonicalPayloadWithSourceIds = (survey: TCanonicalSurvey): TSurveyCreateInput => {
  const registeredVariableIds = new Set<string>();
  const payloadVariables: NonNullable<TSurveyCreateInput["variables"]> = [];

  const registerVariable = (
    externalId: string,
    name?: string,
    type: "number" | "text" = "number",
    defaultValue?: string | number | boolean | string[]
  ) => {
    const varId = compileEquationVariableId(survey.externalId, externalId);
    if (!registeredVariableIds.has(varId)) {
      registeredVariableIds.add(varId);
      const varName = (name || `equation_${externalId}`).toLowerCase().replace(/[^a-z0-9_]/g, "_");
      if (type === "number") {
        payloadVariables.push({
          id: varId,
          name: varName,
          type: "number",
          value: typeof defaultValue === "number" ? defaultValue : 0,
        });
      } else {
        payloadVariables.push({
          id: varId,
          name: varName,
          type: "text",
          value: typeof defaultValue === "string" ? defaultValue : String(defaultValue ?? ""),
        });
      }
    }
    return varId;
  };

  // Register canonical variables
  for (const v of survey.variables) {
    registerVariable(v.externalId, v.name, v.type === "number" ? "number" : "text", v.defaultValue);
  }

  // Register equation questions
  for (const q of survey.questions) {
    if (q.type === "equation") {
      registerVariable(q.externalId);
    }
  }

  const questionByExternalId = new Map(survey.questions.map((question) => [question.externalId, question]));
  const blocks = [...survey.groups]
    .sort((left, right) => left.order - right.order)
    .map((group): TSurveyBlock => {
      const groupQuestions = survey.questions
        .filter((question) => question.groupExternalId === group.externalId)
        .sort((left, right) => left.order - right.order);
      const elements = groupQuestions.map((question): TSurveyElement => {
        const baseElement = {
          id: question.externalId,
          headline: compileLocalizedText(question.label, survey.defaultLanguage),
          ...(question.help
            ? { subheader: compileLocalizedText(question.help, survey.defaultLanguage) }
            : {}),
          required: question.mandatory,
        };

        if (question.type === "openText") {
          const validationRules = [
            ...(question.validation?.pattern
              ? [
                  {
                    id: `${question.externalId}_pattern`,
                    type: "pattern" as const,
                    params: { pattern: question.validation.pattern },
                  },
                ]
              : []),
          ];
          return {
            ...baseElement,
            type: TSurveyElementTypeEnum.OpenText,
            inputType: question.inputType ?? "text",
            ...(question.placeholder
              ? { placeholder: compileLocalizedText(question.placeholder, survey.defaultLanguage) }
              : {}),
            ...(question.longAnswer !== undefined ? { longAnswer: question.longAnswer } : {}),
            charLimit:
              question.validation?.min !== undefined || question.validation?.max !== undefined
                ? {
                    enabled: true,
                    ...(question.validation.min !== undefined ? { min: question.validation.min } : {}),
                    ...(question.validation.max !== undefined ? { max: question.validation.max } : {}),
                  }
                : { enabled: false },
            ...(validationRules.length
              ? { validation: { rules: validationRules, logic: "and" as const } }
              : {}),
          };
        }

        if (question.type === "numeric") {
          if (question.options.length > 0) {
            throw new Error(
              `Canonical numeric question ${question.externalId} has options that Formbricks cannot represent`
            );
          }

          if (question.formbricksType === "nps") {
            return {
              ...baseElement,
              type: TSurveyElementTypeEnum.NPS,
              isColorCodingEnabled: false,
            };
          }

          const validationRules = [
            ...(question.validation?.min !== undefined
              ? [
                  {
                    id: `${question.externalId}_min`,
                    type: "minValue" as const,
                    params: { min: question.validation.min },
                  },
                ]
              : []),
            ...(question.validation?.max !== undefined
              ? [
                  {
                    id: `${question.externalId}_max`,
                    type: "maxValue" as const,
                    params: { max: question.validation.max },
                  },
                ]
              : []),
          ];
          return {
            ...baseElement,
            type: TSurveyElementTypeEnum.OpenText,
            inputType: "number",
            longAnswer: false,
            charLimit: { enabled: false },
            ...(validationRules.length
              ? { validation: { rules: validationRules, logic: "and" as const } }
              : {}),
          };
        }

        if (question.type === "rating") {
          if (!question.rating) {
            throw new Error(
              `Canonical rating question ${question.externalId} is missing its rating configuration`
            );
          }

          if (question.formbricksType === "csat") {
            return {
              ...baseElement,
              type: TSurveyElementTypeEnum.CSAT,
              range: 5,
              scale: question.scale ?? "number",
              isColorCodingEnabled: false,
            };
          }

          if (question.formbricksType === "ces") {
            return {
              ...baseElement,
              type: TSurveyElementTypeEnum.CES,
              range: question.range === 7 ? 7 : 5,
              scale: question.scale ?? "number",
              isColorCodingEnabled: false,
            };
          }

          return {
            ...baseElement,
            type: TSurveyElementTypeEnum.Rating,
            range: question.rating.range,
            scale: question.rating.scale,
            isColorCodingEnabled: false,
            ...(question.rating.lowerLabel
              ? {
                  lowerLabel: compileLocalizedText(question.rating.lowerLabel, survey.defaultLanguage),
                }
              : {}),
            ...(question.rating.upperLabel
              ? {
                  upperLabel: compileLocalizedText(question.rating.upperLabel, survey.defaultLanguage),
                }
              : {}),
          };
        }

        if (question.type === "singleChoice" || question.type === "multipleChoice") {
          return {
            ...baseElement,
            type:
              question.type === "singleChoice"
                ? TSurveyElementTypeEnum.MultipleChoiceSingle
                : TSurveyElementTypeEnum.MultipleChoiceMulti,
            choices: [...question.options]
              .sort((left, right) => left.order - right.order)
              .map((option) => ({
                id: option.externalId,
                label: compileLocalizedText(option.label, survey.defaultLanguage),
              })),
            ...(question.shuffleOption ? { shuffleOption: question.shuffleOption } : {}),
            ...(question.displayType ? { displayType: question.displayType } : {}),
          };
        }

        if (question.type === "ranking") {
          return {
            ...baseElement,
            type: TSurveyElementTypeEnum.Ranking,
            choices: [...question.options]
              .sort((left, right) => left.order - right.order)
              .map((option) => ({
                id: option.externalId,
                label: compileLocalizedText(option.label, survey.defaultLanguage),
              })),
          };
        }

        if (question.type === "matrix") {
          if (!question.matrix) {
            throw new Error(
              `Canonical matrix question ${question.externalId} is missing its matrix configuration`
            );
          }

          const compileAxis = (axis: typeof question.matrix.rows) =>
            [...axis]
              .sort((left, right) => left.order - right.order)
              .map((item) => ({
                id: item.externalId,
                label: compileLocalizedText(item.label, survey.defaultLanguage),
              }));

          return {
            ...baseElement,
            type: TSurveyElementTypeEnum.Matrix,
            rows: compileAxis(question.matrix.rows),
            columns: compileAxis(question.matrix.columns),
            shuffleOption: "none",
          };
        }

        if (question.type === "display") {
          return {
            ...baseElement,
            type: TSurveyElementTypeEnum.CTA,
            buttonExternal: false,
          };
        }

        if (question.type === "equation") {
          if (!question.calculation) {
            throw new Error(`Canonical equation question ${question.externalId} is missing its calculation`);
          }
          const variableId = compileEquationVariableId(survey.externalId, question.externalId);
          return {
            ...baseElement,
            type: TSurveyElementTypeEnum.CTA,
            buttonExternal: false,
            subheader: {
              default: `#recall:${variableId}/fallback:0#`,
              [survey.defaultLanguage]: `#recall:${variableId}/fallback:0#`,
            },
          };
        }

        throw new Error(`Unsupported canonical question type: ${question.type}`);
      });
      const equationLogic = groupQuestions
        .filter(
          (question): question is typeof question & { calculation: string } =>
            question.type === "equation" && Boolean(question.calculation)
        )
        .map((question) => {
          registerVariable(question.externalId);
          const references = collectExpressionReferences(parseExpression(question.calculation)).map(
            (source) => {
              const [externalId, policy] = source.split(".");
              const referencedQuestion = questionByExternalId.get(externalId);
              if (!referencedQuestion) {
                const referencedVariable = survey.variables.find(
                  (v) => v.externalId === externalId || v.name === externalId
                );
                const targetVarId = registerVariable(referencedVariable?.externalId ?? externalId);
                return {
                  source,
                  target: {
                    type: "variable" as const,
                    value: targetVarId,
                  },
                  missingValue: policy?.toUpperCase() === "NAOK" ? ("zero" as const) : ("error" as const),
                };
              }
              return {
                source,
                target:
                  referencedQuestion.type === "equation"
                    ? {
                        type: "variable" as const,
                        value: registerVariable(externalId),
                      }
                    : {
                        type: "element" as const,
                        value: compileQuestionId(survey.externalId, externalId),
                      },
                missingValue: policy?.toUpperCase() === "NAOK" ? ("zero" as const) : ("error" as const),
                ...(referencedQuestion.options.length > 0
                  ? {
                      valueMap: Object.fromEntries(
                        referencedQuestion.options.flatMap((option) => [
                          ...Object.values(option.label).map((label) => [label, option.value] as const),
                          [String(option.value), option.value] as const,
                        ])
                      ),
                    }
                  : {}),
              };
            }
          );

          return {
            id: compileEquationLogicId(survey.externalId, question.externalId),
            conditions: {
              id: compileEquationConditionGroupId(survey.externalId, question.externalId),
              connector: "and" as const,
              conditions: [],
            },
            actions: [
              {
                id: compileEquationActionId(survey.externalId, question.externalId),
                objective: "evaluateExpression" as const,
                variableId: compileEquationVariableId(survey.externalId, question.externalId),
                expression: question.calculation,
                references,
              },
            ],
          };
        });

      return {
        id: group.externalId,
        name: compileLocalizedText(group.title, survey.defaultLanguage).default,
        elements,
        ...(equationLogic.length > 0 ? { logic: equationLogic } : {}),
      };
    });

  return {
    name: compileLocalizedText(survey.title, survey.defaultLanguage).default,
    type: "link",
    status: "inProgress",
    questions: [],
    blocks,
    variables: payloadVariables,
    endings: survey.endings.map((ending) => ({
      id: ending.externalId,
      type: "endScreen" as const,
      headline: compileLocalizedText(ending.title, survey.defaultLanguage),
      ...(ending.description
        ? { subheader: compileLocalizedText(ending.description, survey.defaultLanguage) }
        : {}),
    })),
  };
};
