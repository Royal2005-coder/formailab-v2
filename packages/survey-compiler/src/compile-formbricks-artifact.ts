import { z } from "zod";
import { TSurveyElementTypeEnum } from "@formbricks/types/surveys/elements";
import { ZSurveyCreateInput } from "@formbricks/types/surveys/types";
import { compileCanonicalToFormbricks } from "./compile-with-crosswalk";
import type { TCanonicalSurvey } from "./contracts";
import { type TCanonicalFormbricksIdCrosswalkEntry, ZCanonicalFormbricksIdCrosswalk } from "./id-crosswalk";

type TEmittedId = {
  kind: TCanonicalFormbricksIdCrosswalkEntry["kind"];
  formbricksId: string;
};

const getEmittedIds = (payload: z.output<typeof ZSurveyCreateInput>): TEmittedId[] => [
  ...(payload.blocks ?? []).flatMap((block) => [
    { kind: "group" as const, formbricksId: block.id },
    ...block.elements.flatMap((element) => [
      { kind: "question" as const, formbricksId: element.id },
      ...(element.type === TSurveyElementTypeEnum.MultipleChoiceSingle ||
      element.type === TSurveyElementTypeEnum.MultipleChoiceMulti
        ? element.choices.map((choice) => ({
            kind: "option" as const,
            formbricksId: choice.id,
          }))
        : element.type === TSurveyElementTypeEnum.Ranking
          ? element.choices.map((choice) => ({
              kind: "rankingChoice" as const,
              formbricksId: choice.id,
            }))
          : element.type === TSurveyElementTypeEnum.Matrix
            ? [
                ...element.rows.map((row) => ({
                  kind: "matrixRow" as const,
                  formbricksId: row.id,
                })),
                ...element.columns.map((column) => ({
                  kind: "matrixColumn" as const,
                  formbricksId: column.id,
                })),
              ]
            : []),
    ]),
  ]),
  ...(payload.endings ?? []).map((ending) => ({
    kind: "ending" as const,
    formbricksId: ending.id,
  })),
];

const formatEntry = ({ kind, formbricksId }: TEmittedId): string => `${kind}:${formbricksId}`;

export const ZCanonicalFormbricksArtifact = z
  .object({
    schemaVersion: z.literal(1),
    payload: ZSurveyCreateInput,
    idCrosswalk: ZCanonicalFormbricksIdCrosswalk,
  })
  .superRefine(({ payload, idCrosswalk }, context) => {
    const emittedEntries = getEmittedIds(payload);
    const emittedCounts = new Map<string, number>();
    const crosswalkCounts = new Map<string, number>();

    for (const entry of emittedEntries) {
      const key = formatEntry(entry);
      emittedCounts.set(key, (emittedCounts.get(key) ?? 0) + 1);
    }

    for (const entry of idCrosswalk.entries) {
      const key = formatEntry(entry);
      crosswalkCounts.set(key, (crosswalkCounts.get(key) ?? 0) + 1);
    }

    for (const [key, count] of emittedCounts) {
      if (count !== 1) {
        context.addIssue({
          code: "custom",
          message: `Compiled payload ID '${key}' must be emitted exactly once`,
          path: ["payload"],
        });
      }

      if (crosswalkCounts.get(key) !== 1) {
        context.addIssue({
          code: "custom",
          message: `Compiled payload ID '${key}' must have exactly one matching crosswalk entry`,
          path: ["idCrosswalk", "entries"],
        });
      }
    }

    for (const [key, count] of crosswalkCounts) {
      if (count !== 1) {
        context.addIssue({
          code: "custom",
          message: `Crosswalk ID '${key}' must occur exactly once`,
          path: ["idCrosswalk", "entries"],
        });
      }

      if (emittedCounts.get(key) !== 1) {
        context.addIssue({
          code: "custom",
          message: `Crosswalk ID '${key}' must match exactly one emitted payload entity`,
          path: ["idCrosswalk", "entries"],
        });
      }
    }
  });

export type TCanonicalFormbricksArtifact = z.infer<typeof ZCanonicalFormbricksArtifact>;

export const compileCanonicalToFormbricksArtifact = (
  survey: TCanonicalSurvey
): TCanonicalFormbricksArtifact => {
  const compilation = compileCanonicalToFormbricks(survey);

  return ZCanonicalFormbricksArtifact.parse({
    schemaVersion: 1,
    ...compilation,
  });
};
