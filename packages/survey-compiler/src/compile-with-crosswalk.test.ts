import { describe, expect, test } from "vitest";
import { ZId } from "@formbricks/types/common";
import { ZSurveyCreateInput } from "@formbricks/types/surveys/types";
import { compileCanonicalToFormbricks } from "./compile-with-crosswalk";
import type { TCanonicalSurvey } from "./contracts";
import { ZCanonicalFormbricksIdCrosswalk } from "./id-crosswalk";

const survey = {
  schemaVersion: 1,
  externalId: "AI_LAB-SURVEY",
  defaultLanguage: "en-US",
  languages: ["en-US"],
  title: { "en-US": "ID compatibility" },
  groups: [
    {
      externalId: "GROUP_A-B",
      title: { "en-US": "Group" },
      order: 0,
    },
  ],
  questions: [
    {
      externalId: "A_B",
      groupExternalId: "GROUP_A-B",
      type: "openText",
      label: { "en-US": "Underscore" },
      order: 0,
      mandatory: false,
      options: [],
    },
    {
      externalId: "A-B",
      groupExternalId: "GROUP_A-B",
      type: "singleChoice",
      label: { "en-US": "Hyphen" },
      order: 1,
      mandatory: true,
      options: [
        {
          externalId: "SAME_OPTION",
          label: { "en-US": "One" },
          value: "one",
          order: 0,
        },
        {
          externalId: "SECOND",
          label: { "en-US": "Two" },
          value: 2,
          order: 1,
        },
      ],
    },
    {
      externalId: "a_b",
      groupExternalId: "GROUP_A-B",
      type: "singleChoice",
      label: { "en-US": "Lowercase" },
      order: 2,
      mandatory: false,
      options: [
        {
          externalId: "SAME_OPTION",
          label: { "en-US": "Shared external ID" },
          value: "shared",
          order: 0,
        },
        {
          externalId: "THIRD",
          label: { "en-US": "Third" },
          value: "third",
          order: 1,
        },
      ],
    },
    {
      externalId: "AB",
      groupExternalId: "GROUP_A-B",
      type: "numeric",
      label: { "en-US": "Uppercase" },
      order: 3,
      mandatory: false,
      options: [],
    },
  ],
  variables: [],
  endings: [{ externalId: "END_SCREEN-1", title: { "en-US": "Complete" } }],
} satisfies TCanonicalSurvey;

describe("compileCanonicalToFormbricks", () => {
  test("emits a valid payload and a complete, collision-free ID crosswalk", () => {
    const result = compileCanonicalToFormbricks(survey);

    expect(ZSurveyCreateInput.safeParse(result.payload).success).toBe(true);
    expect(ZCanonicalFormbricksIdCrosswalk.safeParse(result.idCrosswalk).success).toBe(true);

    const emittedIds = [
      ...(result.payload.blocks ?? []).flatMap((block) => [
        block.id,
        ...block.elements.flatMap((element) => [
          element.id,
          ...("choices" in element ? element.choices.map((choice) => choice.id) : []),
        ]),
      ]),
      ...(result.payload.endings ?? []).map((ending) => ending.id),
    ];
    const crosswalkIds = result.idCrosswalk.entries.map((entry) => entry.formbricksId);

    expect(crosswalkIds).toEqual(emittedIds);
    expect(new Set(crosswalkIds).size).toBe(crosswalkIds.length);
    expect(crosswalkIds.every((id) => ZId.safeParse(id).success)).toBe(true);
    expect(crosswalkIds).not.toContain("GROUP_A-B");
    expect(crosswalkIds).not.toContain("END_SCREEN-1");

    const repeatedOptionEntries = result.idCrosswalk.entries.filter(
      (entry) => entry.kind === "option" && entry.canonicalExternalId === "SAME_OPTION"
    );
    expect(repeatedOptionEntries).toHaveLength(2);
    expect(repeatedOptionEntries[0]?.formbricksId).not.toBe(repeatedOptionEntries[1]?.formbricksId);
  });

  test("is deterministic across calls and canonical array order", () => {
    const first = compileCanonicalToFormbricks(survey);
    const repeated = compileCanonicalToFormbricks(survey);
    const reordered = compileCanonicalToFormbricks({
      ...survey,
      groups: [...survey.groups].reverse(),
      questions: [...survey.questions]
        .reverse()
        .map((question) => ({ ...question, options: [...question.options].reverse() })),
    });

    expect(repeated).toEqual(first);
    expect(reordered).toEqual(first);
  });

  test("supports the maximum canonical external ID without hashing or truncation", () => {
    const maximumExternalId = `A${"b".repeat(127)}`;
    const result = compileCanonicalToFormbricks({
      ...survey,
      groups: [{ ...survey.groups[0], externalId: maximumExternalId }],
      questions: [
        {
          ...survey.questions[0],
          groupExternalId: maximumExternalId,
          externalId: maximumExternalId,
        },
      ],
    });

    expect(ZSurveyCreateInput.safeParse(result.payload).success).toBe(true);
    expect(result.idCrosswalk.entries.every((entry) => ZId.safeParse(entry.formbricksId).success)).toBe(true);
  });
});
