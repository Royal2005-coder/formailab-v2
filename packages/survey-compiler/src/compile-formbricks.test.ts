import { describe, expect, test } from "vitest";
import { ZSurveyCreateInput } from "@formbricks/types/surveys/types";
import {
  type TCanonicalFormbricksCompilation,
  compileCanonicalToFormbricks,
  compileCanonicalToFormbricksPayload,
} from "./compile-with-crosswalk";
import type { TCanonicalSurvey } from "./contracts";

const getCompiledId = (
  compilation: TCanonicalFormbricksCompilation,
  kind: "group" | "question" | "option" | "ending",
  canonicalExternalId: string,
  parentCanonicalExternalId?: string
): string => {
  const entry = compilation.idCrosswalk.entries.find(
    (candidate) =>
      candidate.kind === kind &&
      candidate.canonicalExternalId === canonicalExternalId &&
      (candidate.kind !== "option" || candidate.parentCanonicalExternalId === parentCanonicalExternalId)
  );
  if (!entry) throw new Error(`Missing compiled ID for ${kind} ${canonicalExternalId}`);
  return entry.formbricksId;
};

const canonicalSurvey = {
  schemaVersion: 1,
  externalId: "employee_pulse",
  defaultLanguage: "en-US",
  languages: ["en-US", "vi"],
  title: {
    "en-US": "Employee pulse",
    vi: "Khảo sát nhân viên",
  },
  groups: [
    {
      externalId: "profile",
      title: { "en-US": "Profile", vi: "Hồ sơ" },
      order: 0,
    },
  ],
  questions: [
    {
      externalId: "role",
      groupExternalId: "profile",
      type: "openText",
      label: { "en-US": "What is your role?", vi: "Vai trò của bạn là gì?" },
      help: { "en-US": "Use your current title", vi: "Dùng chức danh hiện tại" },
      order: 0,
      mandatory: true,
      options: [],
    },
  ],
  variables: [],
  endings: [
    {
      externalId: "complete",
      title: { "en-US": "Thank you", vi: "Cảm ơn" },
      description: { "en-US": "Response recorded", vi: "Đã ghi nhận phản hồi" },
    },
  ],
} satisfies TCanonicalSurvey;

describe("compileCanonicalToFormbricksPayload", () => {
  test("compiles localized groups and open text questions into a valid Formbricks create payload", () => {
    const compilation = compileCanonicalToFormbricks(canonicalSurvey);
    const payload = compilation.payload;
    const roleId = getCompiledId(compilation, "question", "role");

    expect(payload).toMatchObject({
      name: "Employee pulse",
      type: "link",
      status: "inProgress",
      questions: [],
      blocks: [
        {
          name: "Profile",
          elements: [
            {
              id: roleId,
              type: "openText",
              headline: {
                default: "What is your role?",
                "en-US": "What is your role?",
                vi: "Vai trò của bạn là gì?",
              },
              subheader: {
                default: "Use your current title",
                "en-US": "Use your current title",
                vi: "Dùng chức danh hiện tại",
              },
              required: true,
            },
          ],
        },
      ],
      endings: [
        {
          type: "endScreen",
          headline: { default: "Thank you", "en-US": "Thank you", vi: "Cảm ơn" },
          subheader: {
            default: "Response recorded",
            "en-US": "Response recorded",
            vi: "Đã ghi nhận phản hồi",
          },
        },
      ],
    });
    expect(ZSurveyCreateInput.safeParse(payload).success).toBe(true);
  });

  test("compiles localized choice questions and orders their questions and options", () => {
    const choiceSurvey = {
      ...canonicalSurvey,
      questions: [
        {
          externalId: "tools",
          groupExternalId: "profile",
          type: "multipleChoice",
          label: { "en-US": "Which tools?", vi: "Công cụ nào?" },
          order: 2,
          mandatory: false,
          options: [
            {
              externalId: "tool_two",
              label: { "en-US": "Tool two", vi: "Công cụ hai" },
              value: "tool-two",
              order: 1,
            },
            {
              externalId: "tool_one",
              label: { "en-US": "Tool one", vi: "Công cụ một" },
              value: "tool-one",
              order: 0,
            },
          ],
        },
        {
          externalId: "department",
          groupExternalId: "profile",
          type: "singleChoice",
          label: { "en-US": "Department", vi: "Phòng ban" },
          order: 1,
          mandatory: true,
          options: [
            {
              externalId: "engineering",
              label: { "en-US": "Engineering", vi: "Kỹ thuật" },
              value: "engineering",
              order: 0,
            },
            {
              externalId: "product",
              label: { "en-US": "Product", vi: "Sản phẩm" },
              value: "product",
              order: 1,
            },
          ],
        },
      ],
    } satisfies TCanonicalSurvey;

    const compilation = compileCanonicalToFormbricks(choiceSurvey);
    const payload = compilation.payload;
    const departmentId = getCompiledId(compilation, "question", "department");
    const engineeringId = getCompiledId(compilation, "option", "engineering", "department");
    const productId = getCompiledId(compilation, "option", "product", "department");
    const toolsId = getCompiledId(compilation, "question", "tools");
    const toolOneId = getCompiledId(compilation, "option", "tool_one", "tools");
    const toolTwoId = getCompiledId(compilation, "option", "tool_two", "tools");

    expect(payload.blocks?.[0]?.elements).toMatchObject([
      {
        id: departmentId,
        type: "multipleChoiceSingle",
        headline: { default: "Department", "en-US": "Department", vi: "Phòng ban" },
        required: true,
        choices: [
          {
            id: engineeringId,
            label: { default: "Engineering", "en-US": "Engineering", vi: "Kỹ thuật" },
          },
          {
            id: productId,
            label: { default: "Product", "en-US": "Product", vi: "Sản phẩm" },
          },
        ],
      },
      {
        id: toolsId,
        type: "multipleChoiceMulti",
        headline: { default: "Which tools?", "en-US": "Which tools?", vi: "Công cụ nào?" },
        required: false,
        choices: [
          {
            id: toolOneId,
            label: { default: "Tool one", "en-US": "Tool one", vi: "Công cụ một" },
          },
          {
            id: toolTwoId,
            label: { default: "Tool two", "en-US": "Tool two", vi: "Công cụ hai" },
          },
        ],
      },
    ]);
    expect(ZSurveyCreateInput.safeParse(payload).success).toBe(true);
  });

  test("compiles a numeric question to a native Formbricks number input", () => {
    const nativeSurvey = {
      ...canonicalSurvey,
      questions: [
        {
          externalId: "headcount",
          groupExternalId: "profile",
          type: "numeric",
          label: { "en-US": "Team size", vi: "Quy mô nhóm" },
          order: 0,
          mandatory: true,
          options: [],
        },
      ],
    } satisfies TCanonicalSurvey;

    const compilation = compileCanonicalToFormbricks(nativeSurvey);
    const payload = compilation.payload;
    const headcountId = getCompiledId(compilation, "question", "headcount");

    expect(payload.blocks?.[0]?.elements).toMatchObject([
      {
        id: headcountId,
        type: "openText",
        inputType: "number",
        longAnswer: false,
        charLimit: { enabled: false },
      },
    ]);
    expect(ZSurveyCreateInput.safeParse(payload).success).toBe(true);

    expect(() =>
      compileCanonicalToFormbricksPayload({
        ...nativeSurvey,
        questions: [
          {
            ...nativeSurvey.questions[0],
            options: [
              {
                externalId: "numeric_option",
                label: { "en-US": "Unrepresentable numeric option" },
                value: 1,
                order: 0,
              },
            ],
          },
        ],
      })
    ).toThrowError("Canonical numeric question headcount has options that Formbricks cannot represent");
  });
});
