import { describe, expect, test } from "vitest";
import { sanitizeGeneratedSurveyDraft } from "./sanitize";
import { ZGeneratedSurveyDraft } from "./schemas";

const modelQuestion = {
  id: "q_a1_industry",
  type: "multipleChoiceSingle",
  headline: "A1. Main business sector/industry:",
  longForm: false,
  required: true,
  choices: ["Agriculture", "Manufacturing", "Services"],
};

const modelDraft = {
  language: "vi",
  name: "AI and Data Security Management Self-Assessment Survey",
  description: "Self-assessment of AI usage management and data protection",
  welcomeCard: {
    enabled: true,
    headline: "Welcome",
    html: "Dear Sir/Madam,<br/>This questionnaire helps businesses self-assess.",
  },
  thankYouCard: { enabled: true },
  blocks: [
    {
      name: "General information",
      questions: [modelQuestion],
    },
  ],
};

describe("sanitizeGeneratedSurveyDraft", () => {
  test("strips unknown keys from every level and parses with the strict draft schema", () => {
    const result = ZGeneratedSurveyDraft.safeParse(sanitizeGeneratedSurveyDraft(modelDraft));

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.welcomeCard?.headline).toBe("Welcome");
      expect(result.data.blocks[0].questions[0].headline).toBe("A1. Main business sector/industry:");
      expect(result.data.blocks[0].questions[0].choices).toEqual([
        "Agriculture",
        "Manufacturing",
        "Services",
      ]);
    }
  });

  test("fills missing nullable fields with null and defaults required to true", () => {
    const sanitized = sanitizeGeneratedSurveyDraft({
      ...modelDraft,
      welcomeCard: null,
      ending: undefined,
      blocks: [
        {
          name: "Block",
          questions: [
            {
              type: "openText",
              headline: "Any comments?",
            },
          ],
        },
      ],
    }) as {
      welcomeCard: null;
      ending: null;
      blocks: Array<{ questions: Array<{ required: boolean; subheader: null; placeholder: null }> }>;
    };

    expect(sanitized.welcomeCard).toBeNull();
    expect(sanitized.ending).toBeNull();
    expect(sanitized.blocks[0].questions[0].required).toBe(true);
    expect(sanitized.blocks[0].questions[0].subheader).toBeNull();
    expect(sanitized.blocks[0].questions[0].placeholder).toBeNull();
  });

  test("normalizes rating ranges, scales and formats to allowed values", () => {
    const sanitized = sanitizeGeneratedSurveyDraft({
      ...modelDraft,
      blocks: [
        {
          name: "Rating",
          questions: [
            { type: "rating", headline: "Rate us", range: 5, scale: "smiley" },
            { type: "rating", headline: "Rate again", range: "1-5", scale: "bogus" },
            { type: "date", headline: "When", format: "invalid" },
          ],
        },
      ],
    }) as {
      blocks: Array<{
        questions: Array<{ range: string | null; scale: string | null; format: string | null }>;
      }>;
    };

    expect(sanitized.blocks[0].questions[0].range).toBe("5");
    expect(sanitized.blocks[0].questions[0].scale).toBe("smiley");
    expect(sanitized.blocks[0].questions[1].range).toBeNull();
    expect(sanitized.blocks[0].questions[1].scale).toBeNull();
    expect(sanitized.blocks[0].questions[2].format).toBeNull();
  });

  test("filters non-string choices and caps them at 20", () => {
    const sanitized = sanitizeGeneratedSurveyDraft({
      ...modelDraft,
      blocks: [
        {
          name: "Choices",
          questions: [
            {
              type: "multipleChoiceSingle",
              headline: "Pick",
              choices: [
                "a",
                42,
                "",
                "b",
                "c",
                "d",
                "e",
                "f",
                "g",
                "h",
                "i",
                "j",
                "k",
                "l",
                "m",
                "n",
                "o",
                "p",
                "q",
                "r",
                "s",
                "t",
                "u",
              ],
            },
          ],
        },
      ],
    }) as { blocks: Array<{ questions: Array<{ choices: string[] | null }> }> };

    expect(sanitized.blocks[0].questions[0].choices).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
      "f",
      "g",
      "h",
      "i",
      "j",
      "k",
      "l",
      "m",
      "n",
      "o",
      "p",
      "q",
      "r",
      "s",
      "t",
    ]);
  });

  test("converts choice and matrix questions with fewer than 2 options into openText", () => {
    const sanitized = sanitizeGeneratedSurveyDraft({
      ...modelDraft,
      blocks: [
        {
          name: "Degenerate",
          questions: [
            { type: "multipleChoiceSingle", headline: "Single option", choices: ["Only one"] },
            { type: "multipleChoiceMulti", headline: "No options" },
            { type: "matrix", headline: "One row", rows: ["Row"], columns: ["A", "B"] },
          ],
        },
      ],
    }) as {
      blocks: Array<{ questions: Array<{ type: string; choices: string[] | null; rows: string[] | null }> }>;
    };

    expect(sanitized.blocks[0].questions.map((question) => question.type)).toEqual([
      "openText",
      "openText",
      "openText",
    ]);
    expect(sanitized.blocks[0].questions[0].choices).toBeNull();
  });

  test("drops questions with unknown types or missing headlines and defaults block names", () => {
    const sanitized = sanitizeGeneratedSurveyDraft({
      ...modelDraft,
      blocks: [
        {
          name: "",
          questions: [
            { type: "bogusType", headline: "Drop me" },
            { type: "openText" },
            { type: "openText", headline: "Keep me" },
          ],
        },
      ],
    }) as { blocks: Array<{ name: string; questions: Array<{ headline: string }> }> };

    expect(sanitized.blocks[0].name).toBe("Untitled block");
    expect(sanitized.blocks[0].questions.map((question) => question.headline)).toEqual(["Keep me"]);
  });

  test("drops empty blocks", () => {
    const sanitized = sanitizeGeneratedSurveyDraft({
      ...modelDraft,
      blocks: [
        { name: "Empty", questions: [] },
        { name: "Full", questions: [{ type: "openText", headline: "Keep me" }] },
      ],
    }) as { blocks: Array<{ name: string }> };

    expect(sanitized.blocks.map((block) => block.name)).toEqual(["Full"]);
  });
});
