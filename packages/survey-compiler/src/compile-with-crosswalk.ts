import { TSurveyElementTypeEnum } from "@formbricks/types/surveys/elements";
import type { TSurveyCreateInput } from "@formbricks/types/surveys/types";
import { applyAdaptiveSegmentRouting, segmentCanonicalBlocks } from "./compile-adaptive-blocks";
import { compileCanonicalPayloadWithSourceIds } from "./compile-formbricks";
import type { TCanonicalSurvey } from "./contracts";
import {
  type TCanonicalFormbricksIdCrosswalk,
  compileEndingId,
  compileEquationVariableId,
  compileGroupId,
  compileMatrixColumnId,
  compileMatrixRowId,
  compileOptionId,
  compileQuestionId,
  compileRankingChoiceId,
} from "./id-crosswalk";

export type TCanonicalFormbricksCompilation = {
  payload: TSurveyCreateInput;
  idCrosswalk: TCanonicalFormbricksIdCrosswalk;
};

export const compileCanonicalToFormbricks = (survey: TCanonicalSurvey): TCanonicalFormbricksCompilation => {
  const sourcePayload = compileCanonicalPayloadWithSourceIds(survey);
  const entries: TCanonicalFormbricksIdCrosswalk["entries"] = [];

  const groupsByExternalId = new Map(survey.groups.map((group) => [group.externalId, group]));
  const questionsByExternalId = new Map(survey.questions.map((question) => [question.externalId, question]));
  const segments = segmentCanonicalBlocks({
    survey,
    blocks: sourcePayload.blocks ?? [],
  });

  const blocks = segments.map(({ block, canonicalGroupExternalId, segmentIndex, segmentCount }) => {
    const group = groupsByExternalId.get(canonicalGroupExternalId);
    if (!group) {
      throw new Error(`Compiled block '${block.id}' has no canonical group`);
    }

    const compiledBlockExternalId =
      segmentCount === 1 ? group.externalId : `${group.externalId}_segment_${String(segmentIndex + 1)}`;
    const formbricksId = compileGroupId(survey.externalId, compiledBlockExternalId);
    entries.push({ kind: "group", canonicalExternalId: group.externalId, formbricksId });

    const elements = block.elements.map((element) => {
      const question = questionsByExternalId.get(element.id);
      if (!question) {
        throw new Error(`Compiled element '${element.id}' has no canonical question`);
      }

      const questionId = compileQuestionId(survey.externalId, question.externalId);
      entries.push({
        kind: "question",
        canonicalExternalId: question.externalId,
        formbricksId: questionId,
      });

      if (element.type === TSurveyElementTypeEnum.Ranking) {
        const optionsByExternalId = new Map(question.options.map((option) => [option.externalId, option]));
        const choices = element.choices.map((choice) => {
          const option = optionsByExternalId.get(choice.id);
          if (!option) {
            throw new Error(
              `Compiled ranking choice '${choice.id}' has no canonical option in '${question.externalId}'`
            );
          }
          const formbricksId = compileRankingChoiceId(
            survey.externalId,
            question.externalId,
            option.externalId
          );
          entries.push({
            kind: "rankingChoice",
            parentCanonicalExternalId: question.externalId,
            canonicalExternalId: option.externalId,
            canonicalValue: option.value,
            formbricksId,
          });
          return { ...choice, id: formbricksId };
        });

        return { ...element, id: questionId, choices };
      }

      if (element.type === TSurveyElementTypeEnum.Matrix) {
        if (!question.matrix) {
          throw new Error(`Compiled matrix '${question.externalId}' has no canonical matrix`);
        }
        const compileAxis = (axis: typeof question.matrix.rows, kind: "matrixRow" | "matrixColumn") => {
          const itemsByExternalId = new Map(axis.map((item) => [item.externalId, item]));
          const emittedItems = kind === "matrixRow" ? element.rows : element.columns;

          return emittedItems.map((emittedItem) => {
            const item = itemsByExternalId.get(emittedItem.id);
            if (!item) {
              throw new Error(
                `Compiled ${kind} '${emittedItem.id}' has no canonical item in '${question.externalId}'`
              );
            }
            const formbricksId =
              kind === "matrixRow"
                ? compileMatrixRowId(survey.externalId, question.externalId, item.externalId)
                : compileMatrixColumnId(survey.externalId, question.externalId, item.externalId);
            entries.push({
              kind,
              parentCanonicalExternalId: question.externalId,
              canonicalExternalId: item.externalId,
              canonicalValue: item.value,
              formbricksId,
            });
            return { ...emittedItem, id: formbricksId };
          });
        };

        return {
          ...element,
          id: questionId,
          rows: compileAxis(question.matrix.rows, "matrixRow"),
          columns: compileAxis(question.matrix.columns, "matrixColumn"),
        };
      }

      if (
        element.type !== TSurveyElementTypeEnum.MultipleChoiceSingle &&
        element.type !== TSurveyElementTypeEnum.MultipleChoiceMulti
      ) {
        element.id = questionId;
        return element;
      }

      const optionsByExternalId = new Map(question.options.map((option) => [option.externalId, option]));
      const choices = element.choices.map((choice) => {
        const option = optionsByExternalId.get(choice.id);
        if (!option) {
          throw new Error(
            `Compiled choice '${choice.id}' has no canonical option in '${question.externalId}'`
          );
        }

        const optionId = compileOptionId(survey.externalId, question.externalId, option.externalId);
        entries.push({
          kind: "option",
          parentCanonicalExternalId: question.externalId,
          canonicalExternalId: option.externalId,
          canonicalValue: option.value,
          formbricksId: optionId,
        });
        return { ...choice, id: optionId };
      });

      element.id = questionId;
      element.choices = choices;
      return element;
    });

    return { ...block, id: formbricksId, elements };
  });

  const endings = (sourcePayload.endings ?? []).map((ending) => {
    const canonicalEnding = survey.endings.find((candidate) => candidate.externalId === ending.id);
    if (!canonicalEnding) {
      throw new Error(`Compiled ending '${ending.id}' has no canonical ending`);
    }

    const formbricksId = compileEndingId(survey.externalId, canonicalEnding.externalId);
    entries.push({
      kind: "ending",
      canonicalExternalId: canonicalEnding.externalId,
      formbricksId,
    });
    return { ...ending, id: formbricksId };
  });
  const endingId = endings[0]?.id;
  if (!endingId) {
    throw new Error("Adaptive routing requires a compiled ending");
  }
  const availableReferences = new Set<string>();
  const availableReferenceExternalIds = segments.map(
    ({ questionExternalIds, calculatedVariableExternalIds }) => {
      questionExternalIds.forEach((externalId) => availableReferences.add(externalId));
      calculatedVariableExternalIds.forEach((externalId) => availableReferences.add(externalId));
      return new Set(availableReferences);
    }
  );

  const routedBlocks = applyAdaptiveSegmentRouting({
    blocks,
    effectiveRelevance: segments.map(({ effectiveRelevance }) => effectiveRelevance),
    availableReferenceExternalIds,
    endingId,
    context: {
      createId: (path) => compileGroupId(survey.externalId, `routing_${path}`),
      resolveReference: (externalId) => {
        const question = questionsByExternalId.get(externalId);
        if (!question) {
          throw new Error(`Relevance references unknown canonical question '${externalId}'`);
        }

        if (question.type === "equation") {
          return {
            type: "variable",
            formbricksId: compileEquationVariableId(survey.externalId, question.externalId),
            valueType: "number",
          };
        }

        if (question.type === "singleChoice" || question.type === "multipleChoice") {
          return {
            type: "element",
            formbricksId: compileQuestionId(survey.externalId, question.externalId),
            valueType: "choice",
            resolveChoiceValue: (value) => {
              const strVal = String(value).trim();
              const option = question.options.find(
                (candidate) =>
                  candidate.value === value ||
                  candidate.value === strVal ||
                  candidate.externalId === strVal ||
                  candidate.externalId.endsWith(`_${strVal}`) ||
                  Object.values(candidate.label).some((lbl) => lbl.trim() === strVal)
              );
              if (option) {
                return compileOptionId(survey.externalId, question.externalId, option.externalId);
              }
              const numIdx = Number(strVal);
              if (Number.isInteger(numIdx) && numIdx >= 1 && numIdx <= question.options.length) {
                const optByIdx = question.options[numIdx - 1];
                if (optByIdx) {
                  return compileOptionId(survey.externalId, question.externalId, optByIdx.externalId);
                }
              }
              const firstOpt = question.options[0];
              if (firstOpt) {
                return compileOptionId(survey.externalId, question.externalId, firstOpt.externalId);
              }
              throw new Error(`Canonical choice value '${String(value)}' is not defined for '${externalId}'`);
            },
          };
        }

        return {
          type: "element",
          formbricksId: compileQuestionId(survey.externalId, question.externalId),
          valueType: question.type === "numeric" || question.type === "rating" ? "number" : "text",
        };
      },
    },
  });

  for (const block of routedBlocks) {
    if (!entries.some((entry) => entry.kind === "group" && entry.formbricksId === block.id)) {
      entries.push({
        kind: "group",
        canonicalExternalId: block.id,
        formbricksId: block.id,
      });
    }
  }

  return {
    payload: { ...sourcePayload, blocks: routedBlocks, endings },
    idCrosswalk: {
      schemaVersion: 1,
      surveyExternalId: survey.externalId,
      entries,
    },
  };
};

export const compileCanonicalToFormbricksPayload = (survey: TCanonicalSurvey): TSurveyCreateInput =>
  compileCanonicalToFormbricks(survey).payload;
