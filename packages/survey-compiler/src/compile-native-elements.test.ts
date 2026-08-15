import { describe, expect, test } from "vitest";
import { compileCanonicalPayloadWithSourceIds } from "./compile-formbricks";
import type { TCanonicalSurvey } from "./contracts";

const makeSurvey = (question: Record<string, unknown>): TCanonicalSurvey =>
  ({
    schemaVersion: 1,
    externalId: "AILAB",
    defaultLanguage: "en-US",
    languages: ["en-US"],
    title: { "en-US": "AI LAB" },
    groups: [{ externalId: "G1", title: { "en-US": "Group" }, order: 0 }],
    questions: [
      {
        externalId: "Q1",
        groupExternalId: "G1",
        label: { "en-US": "Question" },
        order: 0,
        mandatory: true,
        options: [],
        ...question,
      },
    ],
    variables: [],
    endings: [{ externalId: "END", title: { "en-US": "Done" } }],
  }) as unknown as TCanonicalSurvey;

describe("native Formbricks element compilation", () => {
  test("compiles a canonical five-point rating without inventing scale semantics", () => {
    const payload = compileCanonicalPayloadWithSourceIds(
      makeSurvey({
        type: "rating",
        rating: {
          range: 5,
          scale: "number",
          lowerLabel: { "en-US": "Strongly disagree" },
          upperLabel: { "en-US": "Strongly agree" },
        },
      })
    );

    expect(payload.blocks?.[0]?.elements[0]).toEqual({
      id: "Q1",
      type: "rating",
      headline: { default: "Question", "en-US": "Question" },
      required: true,
      range: 5,
      scale: "number",
      isColorCodingEnabled: false,
      lowerLabel: { default: "Strongly disagree", "en-US": "Strongly disagree" },
      upperLabel: { default: "Strongly agree", "en-US": "Strongly agree" },
    });
  });

  test("compiles ordered canonical options as a native ranking element", () => {
    const payload = compileCanonicalPayloadWithSourceIds(
      makeSurvey({
        type: "ranking",
        options: [
          {
            externalId: "LOW",
            label: { "en-US": "Low priority" },
            value: "low",
            order: 1,
          },
          {
            externalId: "HIGH",
            label: { "en-US": "High priority" },
            value: "high",
            order: 0,
          },
        ],
      })
    );

    expect(payload.blocks?.[0]?.elements[0]).toEqual({
      id: "Q1",
      type: "ranking",
      headline: { default: "Question", "en-US": "Question" },
      required: true,
      choices: [
        {
          id: "HIGH",
          label: { default: "High priority", "en-US": "High priority" },
        },
        {
          id: "LOW",
          label: { default: "Low priority", "en-US": "Low priority" },
        },
      ],
    });
  });

  test("compiles matrix rows and numeric-valued columns as separate native axes", () => {
    const payload = compileCanonicalPayloadWithSourceIds(
      makeSurvey({
        type: "matrix",
        matrix: {
          rows: [
            {
              externalId: "ROW_TEACHING",
              label: { "en-US": "Teaching" },
              value: "teaching",
              order: 0,
            },
            {
              externalId: "ROW_RESEARCH",
              label: { "en-US": "Research" },
              value: "research",
              order: 1,
            },
          ],
          columns: [
            {
              externalId: "COL_1",
              label: { "en-US": "1" },
              value: 1,
              order: 0,
            },
            {
              externalId: "COL_5",
              label: { "en-US": "5" },
              value: 5,
              order: 1,
            },
          ],
        },
      })
    );

    expect(payload.blocks?.[0]?.elements[0]).toEqual({
      id: "Q1",
      type: "matrix",
      headline: { default: "Question", "en-US": "Question" },
      required: true,
      rows: [
        {
          id: "ROW_TEACHING",
          label: { default: "Teaching", "en-US": "Teaching" },
        },
        {
          id: "ROW_RESEARCH",
          label: { default: "Research", "en-US": "Research" },
        },
      ],
      columns: [
        { id: "COL_1", label: { default: "1", "en-US": "1" } },
        { id: "COL_5", label: { default: "5", "en-US": "5" } },
      ],
      shuffleOption: "none",
    });
  });

  test("compiles display-only canonical content as a non-external CTA element", () => {
    const payload = compileCanonicalPayloadWithSourceIds(
      makeSurvey({
        type: "display",
        mandatory: false,
        label: { "en-US": "Before you continue" },
        help: { "en-US": "Read the following academic guidance carefully." },
      })
    );

    expect(payload.blocks?.[0]?.elements[0]).toEqual({
      id: "Q1",
      type: "cta",
      headline: { default: "Before you continue", "en-US": "Before you continue" },
      subheader: {
        default: "Read the following academic guidance carefully.",
        "en-US": "Read the following academic guidance carefully.",
      },
      required: false,
      buttonExternal: false,
    });
  });
});
