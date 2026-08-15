import { describe, expect, test } from "vitest";
import {
  ZCanonicalFormbricksArtifact,
  compileCanonicalToFormbricksArtifact,
} from "./compile-formbricks-artifact";
import type { TCanonicalSurvey } from "./contracts";

const survey = {
  schemaVersion: 1,
  externalId: "ARTIFACT",
  defaultLanguage: "en-US",
  languages: ["en-US"],
  title: { "en-US": "Immutable artifact" },
  groups: [
    {
      externalId: "GROUP",
      title: { "en-US": "Group" },
      order: 0,
    },
  ],
  questions: [
    {
      externalId: "OPEN",
      groupExternalId: "GROUP",
      type: "openText",
      label: { "en-US": "Open" },
      order: 0,
      mandatory: false,
      options: [],
    },
    {
      externalId: "CHOICE",
      groupExternalId: "GROUP",
      type: "singleChoice",
      label: { "en-US": "Choice" },
      order: 1,
      mandatory: true,
      options: [
        {
          externalId: "YES",
          label: { "en-US": "Yes" },
          value: "yes",
          order: 0,
        },
        {
          externalId: "NO",
          label: { "en-US": "No" },
          value: "no",
          order: 1,
        },
      ],
    },
  ],
  variables: [],
  endings: [{ externalId: "DONE", title: { "en-US": "Done" } }],
} satisfies TCanonicalSurvey;

describe("ZCanonicalFormbricksArtifact", () => {
  test("atomically compiles a valid payload and complete ID crosswalk", () => {
    const artifact = compileCanonicalToFormbricksArtifact(survey);

    expect(artifact.schemaVersion).toBe(1);
    expect(ZCanonicalFormbricksArtifact.safeParse(artifact).success).toBe(true);
    expect(artifact.idCrosswalk.entries).toHaveLength(6);
  });

  test.each([
    ["missing", (entries: unknown[]) => entries.slice(1)],
    ["duplicate", (entries: unknown[]) => [...entries, entries[0]]],
    ["unexpected", (entries: unknown[]) => entries.slice(0, -1)],
  ])("rejects a %s crosswalk entry", (_name, mutateEntries) => {
    const artifact = compileCanonicalToFormbricksArtifact(survey);
    const entries = mutateEntries(artifact.idCrosswalk.entries);

    if (_name === "unexpected") {
      entries.push({
        kind: "ending",
        canonicalExternalId: "EXTRA",
        formbricksId: "alextra",
      });
    }

    expect(
      ZCanonicalFormbricksArtifact.safeParse({
        ...artifact,
        idCrosswalk: { ...artifact.idCrosswalk, entries },
      }).success
    ).toBe(false);
  });

  test("rejects a crosswalk entry whose kind does not match the emitted payload entity", () => {
    const artifact = compileCanonicalToFormbricksArtifact(survey);
    const [groupEntry, ...remainingEntries] = artifact.idCrosswalk.entries;

    expect(groupEntry).toBeDefined();
    expect(
      ZCanonicalFormbricksArtifact.safeParse({
        ...artifact,
        idCrosswalk: {
          ...artifact.idCrosswalk,
          entries: [
            {
              kind: "ending",
              canonicalExternalId: groupEntry?.canonicalExternalId,
              formbricksId: groupEntry?.formbricksId,
            },
            ...remainingEntries,
          ],
        },
      }).success
    ).toBe(false);
  });

  test("rejects duplicate emitted IDs even when a crosswalk entry exists", () => {
    const artifact = compileCanonicalToFormbricksArtifact(survey);
    const block = artifact.payload.blocks?.[0];

    expect(block).toBeDefined();
    expect(
      ZCanonicalFormbricksArtifact.safeParse({
        ...artifact,
        payload: {
          ...artifact.payload,
          blocks: block ? [block, block] : [],
        },
      }).success
    ).toBe(false);
  });
});
