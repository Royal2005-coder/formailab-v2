import { NoObjectGeneratedError, NoOutputGeneratedError } from "ai";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { type TAITranslationField, translateFields } from "./translate-fields";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  generateOrganizationAIText: vi.fn(),
  loggerError: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
}));

vi.mock("@/lib/ai/service", () => ({
  generateOrganizationAIText: (...args: unknown[]) => mocks.generateOrganizationAIText(...args),
}));

vi.mock("@formbricks/logger", () => ({
  logger: { error: mocks.loggerError, info: mocks.loggerInfo, warn: mocks.loggerWarn },
}));

const baseInput = {
  organizationId: "org-1",
  sourceLanguage: "English",
  targetLanguage: "German",
};

const fields: TAITranslationField[] = [
  { path: "welcomeCard.headline.default", defaultText: "Welcome", isRichText: false },
  { path: "questions.0.html.default", defaultText: "<p>Hello</p>", isRichText: true },
];

const makeFields = (count: number): TAITranslationField[] =>
  Array.from({ length: count }, (_, index) => ({
    path: `questions.${index}.headline.default`,
    defaultText: `Text ${index}`,
    isRichText: false,
  }));

const makeGenerationResult = (object: Record<string, string>) => ({
  output: object,
  finishReason: "stop",
  rawFinishReason: "STOP",
  usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
  warnings: [],
});

const makeNoOutputGenerationResult = () => ({
  get output(): never {
    throw new NoOutputGeneratedError();
  },
  finishReason: "length",
  rawFinishReason: "MAX_TOKENS",
  usage: { inputTokens: 100, outputTokens: 6400, totalTokens: 6500 },
  warnings: [],
});

const makeInvalidStructuredOutputError = () =>
  new NoObjectGeneratedError({
    message: "No object generated: response did not match schema",
    text: JSON.stringify([{ id: "t0", text: "Welcome", richText: false }]),
    response: { id: "test-id", timestamp: new Date(0), modelId: "gemini-2.5-flash" },
    usage: {
      inputTokens: 10,
      inputTokenDetails: {
        noCacheTokens: 10,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
      outputTokens: 10,
      outputTokenDetails: { textTokens: 10, reasoningTokens: 0 },
      totalTokens: 20,
    },
    finishReason: "stop",
  });

const mockTranslationsFor = (fieldList: TAITranslationField[]): void => {
  mocks.generateOrganizationAIText.mockResolvedValue(
    makeGenerationResult(
      Object.fromEntries(fieldList.map((_, index) => [`t${index}`, `Translated ${index}`]))
    )
  );
};

describe("translateFields", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns translations keyed by original field paths", async () => {
    mocks.generateOrganizationAIText.mockResolvedValue(
      makeGenerationResult({ t0: "Willkommen", t1: "<p>Hallo</p>" })
    );

    const result = await translateFields({ ...baseInput, fields });

    expect(result).toEqual({
      "welcomeCard.headline.default": "Willkommen",
      "questions.0.html.default": "<p>Hallo</p>",
    });
  });

  test("sends opaque indexed IDs to the model, never the field paths", async () => {
    mocks.generateOrganizationAIText.mockResolvedValue(
      makeGenerationResult({ t0: "Willkommen", t1: "<p>Hallo</p>" })
    );

    await translateFields({ ...baseInput, fields });

    expect(mocks.generateOrganizationAIText).toHaveBeenCalledTimes(1);
    const callArg = mocks.generateOrganizationAIText.mock.calls[0][0];
    expect(callArg.prompt).not.toContain("welcomeCard.headline.default");
    expect(callArg.prompt).not.toContain("questions.0.html.default");
    const userPayload = JSON.parse(callArg.prompt);
    expect(userPayload).toEqual([
      { id: "t0", text: "Welcome", richText: false },
      { id: "t1", text: "<p>Hello</p>", richText: true },
    ]);
  });

  test("requests deterministic output (temperature: 0) for stable translations", async () => {
    mocks.generateOrganizationAIText.mockResolvedValue(
      makeGenerationResult({ t0: "Willkommen", t1: "<p>Hallo</p>" })
    );

    await translateFields({ ...baseInput, fields });

    expect(mocks.generateOrganizationAIText.mock.calls[0][0]).toMatchObject({
      temperature: 0,
      maxOutputTokens: 1024,
      timeout: 45000,
      providerOptions: {
        google: {
          thinkingConfig: { thinkingBudget: 0 },
        },
      },
    });
  });

  test("scales maxOutputTokens with field count in the mid-range", async () => {
    const midRangeFields = makeFields(20);
    mockTranslationsFor(midRangeFields);

    await translateFields({ ...baseInput, fields: midRangeFields });

    expect(mocks.generateOrganizationAIText.mock.calls[0][0]).toMatchObject({
      maxOutputTokens: 3200,
    });
  });

  test("splits large translation jobs into provider-safe batches", async () => {
    const largeBatchFields = makeFields(2450);
    let activeCalls = 0;
    let maxConcurrentCalls = 0;
    mocks.generateOrganizationAIText.mockImplementation(async ({ prompt }: { prompt: string }) => {
      activeCalls++;
      maxConcurrentCalls = Math.max(maxConcurrentCalls, activeCalls);
      const items = JSON.parse(prompt) as { id: string }[];
      await new Promise((resolve) => setTimeout(resolve, 0));
      activeCalls--;
      return makeGenerationResult(Object.fromEntries(items.map(({ id }) => [id, `Translated ${id}`])));
    });

    const result = await translateFields({ ...baseInput, fields: largeBatchFields });

    expect(mocks.generateOrganizationAIText).toHaveBeenCalledTimes(62);
    for (const [callArg] of mocks.generateOrganizationAIText.mock.calls) {
      const batch = JSON.parse(callArg.prompt) as unknown[];
      expect(batch.length).toBeGreaterThan(0);
      expect(batch.length).toBeLessThanOrEqual(40);
      expect(callArg.maxOutputTokens).toBeLessThanOrEqual(8192);
    }
    expect(maxConcurrentCalls).toBe(3);
    expect(Object.keys(result)).toHaveLength(2450);
  });

  test("returns empty object without calling the model when no fields are provided", async () => {
    const result = await translateFields({ ...baseInput, fields: [] });

    expect(result).toEqual({});
    expect(mocks.generateOrganizationAIText).not.toHaveBeenCalled();
  });

  test("throws when the model omits any requested ID from the response", async () => {
    mocks.generateOrganizationAIText.mockResolvedValue(
      makeGenerationResult({ t0: "Willkommen" }) // t1 missing
    );

    await expect(translateFields({ ...baseInput, fields })).rejects.toThrow(
      "AI translation returned incomplete result"
    );
  });

  test("throws when the model returns an empty string for any ID", async () => {
    mocks.generateOrganizationAIText.mockResolvedValue(
      makeGenerationResult({ t0: "Willkommen", t1: "" }) // empty string treated as missing
    );

    await expect(translateFields({ ...baseInput, fields })).rejects.toThrow(
      "AI translation returned incomplete result"
    );
  });

  test("propagates errors thrown by the AI provider", async () => {
    mocks.generateOrganizationAIText.mockRejectedValue(new Error("provider failed"));

    await expect(translateFields({ ...baseInput, fields })).rejects.toThrow("provider failed");
  });

  test("retries a batch when Gemini returns no output and logs generation metadata", async () => {
    mocks.generateOrganizationAIText
      .mockResolvedValueOnce(makeNoOutputGenerationResult())
      .mockResolvedValueOnce(makeGenerationResult({ t0: "Willkommen", t1: "<p>Hallo</p>" }));

    const result = await translateFields({ ...baseInput, fields });

    expect(result).toEqual({
      "welcomeCard.headline.default": "Willkommen",
      "questions.0.html.default": "<p>Hallo</p>",
    });
    expect(mocks.generateOrganizationAIText).toHaveBeenCalledTimes(2);
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        batchIndex: 0,
        attempt: 1,
        maxAttempts: 3,
        finishReason: "length",
        rawFinishReason: "MAX_TOKENS",
        usage: { inputTokens: 100, outputTokens: 6400, totalTokens: 6500 },
      }),
      "AI translation batch returned no output; retrying"
    );
  });

  test("retries when Gemini returns JSON that does not match the requested object schema", async () => {
    mocks.generateOrganizationAIText
      .mockRejectedValueOnce(makeInvalidStructuredOutputError())
      .mockResolvedValueOnce(makeGenerationResult({ t0: "Willkommen", t1: "<p>Hallo</p>" }));

    const result = await translateFields({ ...baseInput, fields });

    expect(result).toEqual({
      "welcomeCard.headline.default": "Willkommen",
      "questions.0.html.default": "<p>Hallo</p>",
    });
    expect(mocks.generateOrganizationAIText).toHaveBeenCalledTimes(2);
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        batchIndex: 0,
        attempt: 1,
        maxAttempts: 3,
        finishReason: "stop",
        usage: expect.objectContaining({ totalTokens: 20 }),
      }),
      "AI translation batch returned invalid structured output; retrying"
    );
  });

  test("stops after bounded no-output retries and logs the final batch failure", async () => {
    mocks.generateOrganizationAIText.mockImplementation(() =>
      Promise.resolve(makeNoOutputGenerationResult())
    );

    await expect(translateFields({ ...baseInput, fields })).rejects.toThrow("No output generated");

    expect(mocks.generateOrganizationAIText).toHaveBeenCalledTimes(3);
    expect(mocks.loggerWarn).toHaveBeenCalledTimes(2);
    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        batchIndex: 0,
        attempt: 3,
        maxAttempts: 3,
        finishReason: "length",
        rawFinishReason: "MAX_TOKENS",
        usage: { inputTokens: 100, outputTokens: 6400, totalTokens: 6500 },
      }),
      "AI translation batch returned no output after retries"
    );
  });

  test("echoes empty defaultText through without calling the model", async () => {
    const allEmpty: TAITranslationField[] = [
      { path: "welcomeCard.subheader.default", defaultText: "", isRichText: false },
      { path: "endings.0.subheader.default", defaultText: "", isRichText: false },
    ];

    const result = await translateFields({ ...baseInput, fields: allEmpty });

    expect(result).toEqual({
      "welcomeCard.subheader.default": "",
      "endings.0.subheader.default": "",
    });
    expect(mocks.generateOrganizationAIText).not.toHaveBeenCalled();
  });

  test("translates non-empty fields and echoes empty ones in the same call", async () => {
    const mixed: TAITranslationField[] = [
      { path: "welcomeCard.headline.default", defaultText: "Welcome", isRichText: false },
      { path: "welcomeCard.subheader.default", defaultText: "", isRichText: false },
      { path: "questions.0.headline.default", defaultText: "How are you?", isRichText: false },
    ];

    // Empty fields are filtered out before indexing, so the model only sees
    // the two non-empty entries as t0 and t1.
    mocks.generateOrganizationAIText.mockResolvedValue(
      makeGenerationResult({ t0: "Willkommen", t1: "Wie geht es dir?" })
    );

    const result = await translateFields({ ...baseInput, fields: mixed });

    expect(result).toEqual({
      "welcomeCard.headline.default": "Willkommen",
      "welcomeCard.subheader.default": "",
      "questions.0.headline.default": "Wie geht es dir?",
    });

    // Confirm the model never saw the empty field in the payload.
    const callArg = mocks.generateOrganizationAIText.mock.calls[0][0];
    const userPayload = JSON.parse(callArg.prompt);
    expect(userPayload).toEqual([
      { id: "t0", text: "Welcome", richText: false },
      { id: "t1", text: "How are you?", richText: false },
    ]);
  });
});
