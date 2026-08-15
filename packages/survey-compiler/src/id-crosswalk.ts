import { z } from "zod";

const ZCanonicalEntityCrosswalkEntry = z.object({
  kind: z.enum(["group", "question", "ending"]),
  canonicalExternalId: z.string().min(1),
  formbricksId: z.cuid2(),
});

const ZCanonicalChoiceCrosswalkEntry = z.object({
  kind: z.enum(["option", "rankingChoice", "matrixRow", "matrixColumn"]),
  parentCanonicalExternalId: z.string().min(1),
  canonicalExternalId: z.string().min(1),
  canonicalValue: z.union([z.string(), z.number()]),
  formbricksId: z.cuid2(),
});

export const ZCanonicalFormbricksIdCrosswalkEntry = z.discriminatedUnion("kind", [
  ZCanonicalEntityCrosswalkEntry,
  ZCanonicalChoiceCrosswalkEntry,
]);

export const ZCanonicalFormbricksIdCrosswalk = z.object({
  schemaVersion: z.literal(1),
  surveyExternalId: z.string().min(1),
  entries: z.array(ZCanonicalFormbricksIdCrosswalkEntry),
});

export type TCanonicalFormbricksIdCrosswalkEntry = z.infer<typeof ZCanonicalFormbricksIdCrosswalkEntry>;
export type TCanonicalFormbricksIdCrosswalk = z.infer<typeof ZCanonicalFormbricksIdCrosswalk>;

const encodeExternalId = (externalId: string): string =>
  Array.from(externalId, (character) => character.charCodeAt(0).toString(16).padStart(2, "0")).join("");

const compileNamespacedId = (
  namespace: "b" | "q" | "e",
  surveyExternalId: string,
  canonicalExternalId: string
): string => `al${namespace}g${encodeExternalId(surveyExternalId)}g${encodeExternalId(canonicalExternalId)}`;

export const compileGroupId = (surveyExternalId: string, groupExternalId: string): string =>
  compileNamespacedId("b", surveyExternalId, groupExternalId);

export const compileQuestionId = (surveyExternalId: string, questionExternalId: string): string =>
  compileNamespacedId("q", surveyExternalId, questionExternalId);

export const compileEquationVariableId = (surveyExternalId: string, questionExternalId: string): string =>
  `alvg${encodeExternalId(surveyExternalId)}g${encodeExternalId(questionExternalId)}`;

export const compileEquationActionId = (surveyExternalId: string, questionExternalId: string): string =>
  `alag${encodeExternalId(surveyExternalId)}g${encodeExternalId(questionExternalId)}`;

export const compileEquationLogicId = (surveyExternalId: string, questionExternalId: string): string =>
  `allg${encodeExternalId(surveyExternalId)}g${encodeExternalId(questionExternalId)}`;

export const compileEquationConditionGroupId = (
  surveyExternalId: string,
  questionExternalId: string
): string => `alcg${encodeExternalId(surveyExternalId)}g${encodeExternalId(questionExternalId)}`;

export const compileEndingId = (surveyExternalId: string, endingExternalId: string): string =>
  compileNamespacedId("e", surveyExternalId, endingExternalId);

export const compileOptionId = (
  surveyExternalId: string,
  questionExternalId: string,
  optionExternalId: string
): string =>
  `alog${encodeExternalId(surveyExternalId)}g${encodeExternalId(questionExternalId)}g${encodeExternalId(optionExternalId)}`;

const compileNestedItemId = (
  namespace: "r" | "mr" | "mc",
  surveyExternalId: string,
  questionExternalId: string,
  itemExternalId: string
): string =>
  `al${namespace}g${encodeExternalId(surveyExternalId)}g${encodeExternalId(questionExternalId)}g${encodeExternalId(itemExternalId)}`;

export const compileRankingChoiceId = (
  surveyExternalId: string,
  questionExternalId: string,
  choiceExternalId: string
): string => compileNestedItemId("r", surveyExternalId, questionExternalId, choiceExternalId);

export const compileMatrixRowId = (
  surveyExternalId: string,
  questionExternalId: string,
  rowExternalId: string
): string => compileNestedItemId("mr", surveyExternalId, questionExternalId, rowExternalId);

export const compileMatrixColumnId = (
  surveyExternalId: string,
  questionExternalId: string,
  columnExternalId: string
): string => compileNestedItemId("mc", surveyExternalId, questionExternalId, columnExternalId);
