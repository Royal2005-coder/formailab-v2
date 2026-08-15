import { describe, expect, test, vi } from "vitest";
import { type TJsWorkspaceStateSurvey } from "@formbricks/types/js";
import { type TResponseData, type TResponseVariables } from "@formbricks/types/responses";
import { TSurveyElementTypeEnum } from "@formbricks/types/surveys/constants";
import { type TSurveyOpenTextElement } from "@formbricks/types/surveys/elements";
import {
  buildDisplayContext,
  parseRecallInformation,
  replaceExpressionInfo,
  replaceRecallInfo,
} from "./recall";

// Mock getLocalizedValue (assuming path and simple behavior)
vi.mock("./i18n", () => ({
  getLocalizedValue: (localizedString: Record<string, string> | undefined, languageCode: string): string => {
    if (!localizedString) return "";
    return localizedString[languageCode] || ""; // Simplified mock: return value for lang or empty string
  },
}));

// Mock date-time functions as they are used internally and we want to isolate recall logic
vi.mock("./date-time", () => ({
  isValidDateString: (val: string) => /^\d{4}-\d{2}-\d{2}$/.test(val) || /^\d{2}-\d{2}-\d{4}$/.test(val),
  formatDateWithOrdinal: vi.fn(
    (date: Date) =>
      `${date.getUTCFullYear()}-${("0" + (date.getUTCMonth() + 1)).slice(-2)}-${("0" + date.getUTCDate()).slice(-2)}_formatted`
  ),
}));

describe("replaceRecallInfo", () => {
  const responseData: TResponseData = {
    name: "John Doe",
    email: "john.doe@example.com",
    age: 30,
    registrationDate: "2023-01-15",
    tags: ["beta", "user"],
    emptyArray: [],
  };

  const variables: TResponseVariables = {
    productName: "Formbricks",
    userRole: "Admin",
    lastLogin: "2024-03-10",
  };

  test("should replace recall info from responseData", () => {
    const text = "Welcome, #recall:name/fallback:Guest#! Your email is #recall:email/fallback:N/A#.";
    const expected = "Welcome, John Doe! Your email is john.doe@example.com.";
    expect(replaceRecallInfo(text, responseData, variables)).toBe(expected);
  });

  test("should replace recall info from variables if not in responseData", () => {
    const text = "Product: #recall:productName/fallback:N/A#. Role: #recall:userRole/fallback:User#.";
    const expected = "Product: Formbricks. Role: Admin.";
    expect(replaceRecallInfo(text, responseData, variables)).toBe(expected);
  });

  test("should use fallback if value is not found in responseData or variables", () => {
    const text = "Your organization is #recall:orgName/fallback:DefaultOrg#.";
    const expected = "Your organization is DefaultOrg.";
    expect(replaceRecallInfo(text, responseData, variables)).toBe(expected);
  });

  test("should handle nbsp in fallback", () => {
    const text = "Status: #recall:status/fallback:Pending&nbsp;Review#.";
    const expected = "Status: Pending& ;Review.";
    expect(replaceRecallInfo(text, responseData, variables)).toBe(expected);
  });

  test("should format date strings from responseData", () => {
    const text = "Registered on: #recall:registrationDate/fallback:N/A#.";
    const expected = "Registered on: 2023-01-15_formatted.";
    expect(replaceRecallInfo(text, responseData, variables)).toBe(expected);
  });

  test("should format date strings from variables", () => {
    const text = "Last login: #recall:lastLogin/fallback:N/A#.";
    const expected = "Last login: 2024-03-10_formatted.";
    expect(replaceRecallInfo(text, responseData, variables)).toBe(expected);
  });

  test("should pass the selected survey language to date formatting", async () => {
    const { formatDateWithOrdinal } = await import("./date-time");
    const text = "Registered on: #recall:registrationDate/fallback:N/A#.";

    replaceRecallInfo(text, responseData, variables, "fr-FR");

    expect(vi.mocked(formatDateWithOrdinal)).toHaveBeenCalledWith(expect.any(Date), "fr-FR");
  });

  test("should join array values with a comma and space", () => {
    const text = "Tags: #recall:tags/fallback:none#.";
    const expected = "Tags: beta, user.";
    expect(replaceRecallInfo(text, responseData, variables)).toBe(expected);
  });

  test("should handle empty array values, replacing with fallback", () => {
    const text = "Categories: #recall:emptyArray/fallback:No&nbsp;Categories#.";
    const expected = "Categories: No& ;Categories.";
    expect(replaceRecallInfo(text, responseData, variables)).toBe(expected);
  });

  test("should handle multiple recall patterns in a single string", () => {
    const text =
      "Hi #recall:name/fallback:User#, welcome to #recall:productName/fallback:Our Product#. Your role is #recall:userRole/fallback:Member#.";
    const expected = "Hi John Doe, welcome to Formbricks. Your role is Admin.";
    expect(replaceRecallInfo(text, responseData, variables)).toBe(expected);
  });

  test("should return original text if no recall pattern is found", () => {
    const text = "This is a normal text without recall info.";
    expect(replaceRecallInfo(text, responseData, variables)).toBe(text);
  });

  test("should handle recall ID not found, using fallback", () => {
    const text = "Value: #recall:nonExistent/fallback:FallbackValue#.";
    const expected = "Value: FallbackValue.";
    expect(replaceRecallInfo(text, responseData, variables)).toBe(expected);
  });

  test("should handle if recall info is incomplete (e.g. missing fallback part), effectively using empty fallback", () => {
    // This specific pattern is not fully matched by extractRecallInfo, leading to no replacement.
    // The current extractRecallInfo expects #recall:ID/fallback:VALUE#
    const text = "Test: #recall:name#";
    const expected = "Test: #recall:name#"; // No change as pattern is not fully matched by extractRecallInfo
    expect(replaceRecallInfo(text, responseData, variables)).toBe(expected);
  });

  test("should handle complex fallback with spaces and special characters encoded as nbsp", () => {
    const text =
      "Details: #recall:extraInfo/fallback:Value&nbsp;With&nbsp;Spaces# and #recall:anotherInfo/fallback:Default#";
    const expected = "Details: Value& ;With& ;Spaces and Default";
    expect(replaceRecallInfo(text, responseData, variables)).toBe(expected);
  });

  test("should handle fallback with only 'nbsp'", () => {
    const text = "Note: #recall:note/fallback:nbsp#.";
    const expected = "Note: .";
    expect(replaceRecallInfo(text, responseData, variables)).toBe(expected);
  });

  test("should handle fallback with only '&nbsp;'", () => {
    const text = "Note: #recall:note/fallback:&nbsp;#.";
    const expected = "Note: & ;.";
    expect(replaceRecallInfo(text, responseData, variables)).toBe(expected);
  });

  test("should handle fallback with '$nbsp;' (should not replace '$nbsp;')", () => {
    const text = "Note: #recall:note/fallback:$nbsp;#.";
    const expected = "Note: $ ;.";
    expect(replaceRecallInfo(text, responseData, variables)).toBe(expected);
  });
});

describe("parseRecallInformation", () => {
  // Re-use responseData and variables from the outer scope
  const responseData: TResponseData = {
    name: "John Doe",
    email: "john.doe@example.com",
    age: 30,
    registrationDate: "2023-01-15",
    tags: ["beta", "user"],
    emptyArray: [],
    city: "Testville",
  };

  const variables: TResponseVariables = {
    productName: "Formbricks",
    userRole: "Admin",
    lastLogin: "2024-03-10",
    surveyType: "Onboarding",
  };

  const baseQuestion: TSurveyOpenTextElement = {
    id: "survey1",
    type: TSurveyElementTypeEnum.OpenText,
    headline: { en: "Original Headline" },
    required: false,
    inputType: "text",
    charLimit: { enabled: false },
  };

  test("should replace recall info in headline", () => {
    const question: TSurveyOpenTextElement = {
      ...baseQuestion,
      headline: { en: "Welcome, #recall:name/fallback:Guest#!" },
    };
    const expectedHeadline = "Welcome, John Doe!";
    const result = parseRecallInformation(question, "en", responseData, variables);
    expect(result.headline.en).toBe(expectedHeadline);
  });

  test("does not throw when the language code is not a content key", () => {
    // After canonicalization, content is keyed "hi-IN"/"default"; an SDK may still request legacy "hi".
    const question: TSurveyOpenTextElement = {
      ...baseQuestion,
      headline: { default: "Welcome!", "hi-IN": "स्वागत है" },
      subheader: { default: "Subtitle", "hi-IN": "उपशीर्षक" },
    };
    expect(() => parseRecallInformation(question, "hi", responseData, variables)).not.toThrow();
  });

  test("should replace recall info in subheader", () => {
    const question: TSurveyOpenTextElement = {
      ...baseQuestion,
      headline: { en: "Main Question" },
      subheader: { en: "Details: #recall:productName/fallback:N/A#." },
    };
    const expectedSubheader = "Details: Formbricks.";
    const result = parseRecallInformation(question, "en", responseData, variables);
    expect(result.subheader?.en).toBe(expectedSubheader);
  });

  test("should replace recall info in both headline and subheader", () => {
    const question: TSurveyOpenTextElement = {
      ...baseQuestion,
      headline: { en: "User: #recall:name/fallback:User#" },
      subheader: { en: "Survey: #recall:surveyType/fallback:General#" },
    };
    const result = parseRecallInformation(question, "en", responseData, variables);
    expect(result.headline.en).toBe("User: John Doe");
    expect(result.subheader?.en).toBe("Survey: Onboarding");
  });

  test("should not change text if no recall info is present", () => {
    const question: TSurveyOpenTextElement = {
      ...baseQuestion,
      headline: { en: "A simple question." },
      subheader: { en: "With a simple subheader." },
    };
    const result = parseRecallInformation(
      JSON.parse(JSON.stringify(question)),
      "en",
      responseData,
      variables
    );
    expect(result.headline.en).toBe(question.headline.en);
    expect(result.subheader?.en).toBe(question.subheader?.en);
  });

  test("should handle undefined subheader gracefully", () => {
    const question: TSurveyOpenTextElement = {
      ...baseQuestion,
      headline: { en: "Question with #recall:name/fallback:User#" },
      subheader: undefined,
    };
    const result = parseRecallInformation(question, "en", responseData, variables);
    expect(result.headline.en).toBe("Question with John Doe");
    expect(result.subheader).toBeUndefined();
  });

  test("should not modify subheader if languageCode content is missing, even if recall is in other lang", () => {
    const question: TSurveyOpenTextElement = {
      ...baseQuestion,
      headline: { en: "Hello #recall:name/fallback:User#" },
      subheader: { fr: "Bonjour #recall:name/fallback:Utilisateur#", en: "" },
    };
    const result = parseRecallInformation(question, "en", responseData, variables);
    expect(result.headline.en).toBe("Hello John Doe");
    expect(result.subheader?.en).toBe("");
    expect(result.subheader?.fr).toBe("Bonjour #recall:name/fallback:Utilisateur#");
  });

  test("should handle malformed recall string (empty ID) leading to no replacement for that pattern", () => {
    // This tests extractId returning null because extractRecallInfo won't match '#recall:/fallback:foo#'
    // due to idPattern requiring at least one char for ID.
    const question: TSurveyOpenTextElement = {
      ...baseQuestion,
      headline: { en: "Malformed: #recall:/fallback:foo# and valid: #recall:name/fallback:User#" },
    };
    const result = parseRecallInformation(question, "en", responseData, variables);
    expect(result.headline.en).toBe("Malformed: #recall:/fallback:foo# and valid: John Doe");
  });

  test("should use empty string for empty fallback value", () => {
    // This tests extractFallbackValue returning ""
    const question: TSurveyOpenTextElement = {
      ...baseQuestion,
      headline: { en: "Data: #recall:nonExistentData/fallback:#" },
    };
    const result = parseRecallInformation(question, "en", responseData, variables);
    expect(result.headline.en).toBe("Data: "); // nonExistentData not found, empty fallback used
  });

  test("should handle recall info if subheader is present but no text for languageCode", () => {
    const question: TSurveyOpenTextElement = {
      ...baseQuestion,
      headline: { en: "Headline #recall:name/fallback:User#" },
      subheader: { fr: "French subheader #recall:productName/fallback:Produit#", en: "" },
    };
    const result = parseRecallInformation(question, "en", responseData, variables);
    expect(result.headline.en).toBe("Headline John Doe");
    expect(result.subheader?.fr).toBe("French subheader #recall:productName/fallback:Produit#");
    expect(result.subheader?.en).toBe("");
  });
});

describe("replaceExpressionInfo", () => {
  const q101Id = "alqg736c7567g51313031";
  const q105Id = "alqg736c7567g51313035";
  const q219VarId = "alvg736c7567g51323139";

  const survey = {
    id: "survey1",
    name: "120Q",
    type: "link",
    workspaceId: "ws1",
    createdAt: new Date(),
    updatedAt: new Date(),
    status: "inProgress",
    isActive: false,
    blocks: [
      {
        id: "albg736c7567g47315f50524f46494c455f7365676d656e745f31",
        name: "profile",
        elements: [
          { id: q101Id, type: TSurveyElementTypeEnum.MultipleChoiceSingle, headline: { en: "Q101" } },
          { id: q105Id, type: TSurveyElementTypeEnum.Rating, headline: { en: "Q105" } },
        ],
      },
    ],
    variables: [{ id: q219VarId, name: "Q219" }],
  } as unknown as TJsWorkspaceStateSurvey;

  const responseData: TResponseData = {
    [q101Id]: "Nhà Quản lý / Lãnh đạo Doanh nghiệp",
    [q105Id]: 3,
  };

  const variables: TResponseVariables = {
    [q219VarId]: 80,
  };

  test("substitutes variable values for bare references", () => {
    const context = buildDisplayContext(survey, responseData, variables);
    expect(replaceExpressionInfo("Điểm DSAIG: {Q219}/100.", context)).toBe("Điểm DSAIG: 80/100.");
  });

  test("substitutes responseData labels for .shown references", () => {
    const context = buildDisplayContext(survey, responseData, variables);
    expect(replaceExpressionInfo("Nhóm={Q101.shown}", context)).toBe(
      "Nhóm=Nhà Quản lý / Lãnh đạo Doanh nghiệp"
    );
  });

  test("evaluates if() expressions with variable values", () => {
    const context = buildDisplayContext(survey, responseData, variables);
    const text = "{if(Q219>=75,'XUẤT SẮC',if(Q219>=50,'KHÁ','CẦN CẢI THIỆN'))}";
    expect(replaceExpressionInfo(text, context)).toBe("XUẤT SẮC");
  });

  test("evaluates nested if() with a different variable value", () => {
    const context = buildDisplayContext(survey, { [q101Id]: "A" }, { [q219VarId]: 60 });
    const text = "{if(Q219>=75,'XUẤT SẮC',if(Q219>=50,'KHÁ','CẦN CẢI THIỆN'))}";
    expect(replaceExpressionInfo(text, context)).toBe("KHÁ");
  });

  test("keeps unknown references unchanged", () => {
    const context = buildDisplayContext(survey, responseData, variables);
    expect(replaceExpressionInfo("Giá trị {Q999}", context)).toBe("Giá trị {Q999}");
  });

  test("combines recall and expression replacement through parseRecallInformation", () => {
    const question: TSurveyOpenTextElement = {
      ...({} as TSurveyOpenTextElement),
      id: "alqg736c7567g51313039",
      type: TSurveyElementTypeEnum.OpenText,
      headline: { en: "Điểm: {Q219}/100, hồ sơ #recall:missing/fallback:OK#" },
      required: false,
      inputType: "text",
      charLimit: { enabled: false },
    };
    const result = parseRecallInformation(question, "en", responseData, variables, survey);
    expect(result.headline.en).toBe("Điểm: 80/100, hồ sơ OK");
  });
});
