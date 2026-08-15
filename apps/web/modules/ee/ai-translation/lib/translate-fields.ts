import "server-only";
import { NoObjectGeneratedError, NoOutputGeneratedError, Output } from "ai";
import { z } from "zod";
import { logger } from "@formbricks/logger";
import { generateOrganizationAIText } from "@/lib/ai/service";

export const ZAITranslationField = z.object({
  path: z.string(),
  defaultText: z.string(),
  isRichText: z.boolean(),
});

export type TAITranslationField = z.infer<typeof ZAITranslationField>;

const AI_TRANSLATION_TIMEOUT_MS = 45_000;
const AI_TRANSLATION_MIN_OUTPUT_TOKENS = 1024;
const AI_TRANSLATION_MAX_OUTPUT_TOKENS = 8192;
const AI_TRANSLATION_OUTPUT_TOKENS_PER_FIELD = 160;
const AI_TRANSLATION_BATCH_SIZE = 40;
const AI_TRANSLATION_MAX_CONCURRENT_BATCHES = 3;
const AI_TRANSLATION_MAX_ATTEMPTS = 3;

interface TranslateFieldsInput {
  organizationId: string;
  fields: TAITranslationField[];
  sourceLanguage: string;
  targetLanguage: string;
}

interface TranslateFieldBatchInput extends TranslateFieldsInput {
  batchIndex: number;
}

const translateFieldBatch = async ({
  organizationId,
  fields,
  sourceLanguage,
  targetLanguage,
  batchIndex,
}: TranslateFieldBatchInput): Promise<Record<string, string>> => {
  // Indexed IDs insulate the LLM from user-supplied paths (dots, casing,
  // separator normalization). We map back to paths after generation.
  const items = fields.map((f, i) => ({
    id: `t${i}`,
    path: f.path,
    text: f.defaultText,
    richText: f.isRichText,
  }));

  // Schema with explicit keys forces the provider to return exactly this set.
  const schema = z.object(Object.fromEntries(items.map((item) => [item.id, z.string()])));

  const systemPrompt = `You are a professional translator for survey content. Translate each item from ${sourceLanguage} to ${targetLanguage}.

Rules:
- For rich text items (richText: true), preserve all HTML tags exactly. Only translate the text content within the tags.
- Preserve any {{variable}} patterns exactly — do not translate text inside double curly braces.
- Translate every item. Do not omit any keys.
- Return only a JSON object whose property names are the input IDs and whose values are the translated strings.
- Never return an array, the input objects, or the id/text/richText metadata.`;

  const userPayload = JSON.stringify(items.map(({ id, text, richText }) => ({ id, text, richText })));

  let translatedById: Record<string, string> | undefined;

  for (let attempt = 1; attempt <= AI_TRANSLATION_MAX_ATTEMPTS; attempt++) {
    let result: Awaited<ReturnType<typeof generateOrganizationAIText>> | undefined;

    try {
      result = await generateOrganizationAIText({
        organizationId,
        output: Output.object({ schema }),
        system: systemPrompt,
        prompt: userPayload,
        temperature: 0,
        maxOutputTokens: Math.min(
          AI_TRANSLATION_MAX_OUTPUT_TOKENS,
          Math.max(AI_TRANSLATION_MIN_OUTPUT_TOKENS, fields.length * AI_TRANSLATION_OUTPUT_TOKENS_PER_FIELD)
        ),
        timeout: AI_TRANSLATION_TIMEOUT_MS,
        providerOptions: {
          google: {
            thinkingConfig: { thinkingBudget: 0 },
          },
        },
      });

      translatedById = result.output as Record<string, string>;
      break;
    } catch (error) {
      const isInvalidStructuredOutput = NoObjectGeneratedError.isInstance(error);
      if (!isInvalidStructuredOutput && !NoOutputGeneratedError.isInstance(error)) {
        throw error;
      }

      const logContext = {
        organizationId,
        sourceLanguage,
        targetLanguage,
        batchIndex,
        batchSize: fields.length,
        attempt,
        maxAttempts: AI_TRANSLATION_MAX_ATTEMPTS,
        finishReason: isInvalidStructuredOutput ? error.finishReason : result?.finishReason,
        rawFinishReason: result?.rawFinishReason,
        usage: isInvalidStructuredOutput ? error.usage : result?.usage,
        warnings: result?.warnings,
      };
      const failureReason = isInvalidStructuredOutput ? "invalid structured output" : "no output";

      if (attempt < AI_TRANSLATION_MAX_ATTEMPTS) {
        logger.warn(logContext, `AI translation batch returned ${failureReason}; retrying`);
        continue;
      }

      logger.error(logContext, `AI translation batch returned ${failureReason} after retries`);
      throw error;
    }
  }

  if (!translatedById) {
    throw new Error("AI translation returned no output");
  }

  const translations: Record<string, string> = {};
  const missingIds: string[] = [];
  for (const item of items) {
    const value = translatedById[item.id];
    if (typeof value === "string" && value.length > 0) {
      translations[item.path] = value;
    } else {
      missingIds.push(item.id);
    }
  }

  if (missingIds.length > 0) {
    logger.error(
      {
        organizationId,
        sourceLanguage,
        targetLanguage,
        requestedCount: fields.length,
        returnedCount: Object.keys(translations).length,
        missingIds,
      },
      "AI translation returned incomplete result"
    );
    throw new Error("AI translation returned incomplete result");
  }

  return translations;
};

export const translateFields = async ({
  organizationId,
  fields,
  sourceLanguage,
  targetLanguage,
}: TranslateFieldsInput): Promise<Record<string, string>> => {
  if (fields.length === 0) {
    return {};
  }

  // Empty defaultText is valid per the schema but has no meaningful translation.
  // Echo it through unchanged so callers still see every requested path in the
  // result, instead of aborting the whole batch when the model "fails" to
  // translate an empty string.
  const translatableFields: TAITranslationField[] = [];
  const translations: Record<string, string> = {};
  for (const field of fields) {
    if (field.defaultText.length === 0) {
      translations[field.path] = "";
    } else {
      translatableFields.push(field);
    }
  }

  for (
    let batchStart = 0;
    batchStart < translatableFields.length;
    batchStart += AI_TRANSLATION_BATCH_SIZE * AI_TRANSLATION_MAX_CONCURRENT_BATCHES
  ) {
    const concurrentBatches: { batchIndex: number; fields: TAITranslationField[] }[] = [];
    const concurrentBatchEnd = Math.min(
      translatableFields.length,
      batchStart + AI_TRANSLATION_BATCH_SIZE * AI_TRANSLATION_MAX_CONCURRENT_BATCHES
    );

    for (
      let concurrentBatchStart = batchStart;
      concurrentBatchStart < concurrentBatchEnd;
      concurrentBatchStart += AI_TRANSLATION_BATCH_SIZE
    ) {
      concurrentBatches.push({
        batchIndex: Math.floor(concurrentBatchStart / AI_TRANSLATION_BATCH_SIZE),
        fields: translatableFields.slice(
          concurrentBatchStart,
          Math.min(concurrentBatchStart + AI_TRANSLATION_BATCH_SIZE, concurrentBatchEnd)
        ),
      });
    }

    const batchTranslations = await Promise.all(
      concurrentBatches.map(({ batchIndex, fields: batchFields }) =>
        translateFieldBatch({
          organizationId,
          fields: batchFields,
          sourceLanguage,
          targetLanguage,
          batchIndex,
        })
      )
    );

    for (const batchTranslation of batchTranslations) {
      Object.assign(translations, batchTranslation);
    }
  }

  return translations;
};
