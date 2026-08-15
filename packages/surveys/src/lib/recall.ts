import { evaluateExpression, parseExpression } from "@formbricks/survey-compiler/expression";
import { type TJsWorkspaceStateSurvey } from "@formbricks/types/js";
import { type TResponseData, type TResponseVariables } from "@formbricks/types/responses";
import { type TSurveyElement } from "@formbricks/types/surveys/elements";
import { formatDateWithOrdinal, isValidDateString } from "@/lib/date-time";
import { getLocalizedValue } from "@/lib/i18n";

// Extracts the ID of recall question from a string containing the "recall" pattern.
const extractId = (text: string): string | null => {
  const pattern = /#recall:([A-Za-z0-9_-]+)/;
  const match = text.match(pattern);
  return match?.[1] ?? null;
};

// Extracts the fallback value from a string containing the "fallback" pattern.
const extractFallbackValue = (text: string): string => {
  const pattern = /fallback:([^#]*)#/;
  const match = text.match(pattern);
  return match?.[1] ?? "";
};

// Extracts the complete recall information (ID and fallback) from a headline string.
const extractRecallInfo = (headline: string, id?: string): string | null => {
  const idPattern = id ?? "[A-Za-z0-9_-]+";
  const pattern = new RegExp(`#recall:(${idPattern})\\/fallback:([^#]*)#`);
  const match = headline.match(pattern);
  return match ? match[0] : null;
};

export const replaceRecallInfo = (
  text: string,
  responseData: TResponseData,
  variables: TResponseVariables,
  languageCode: string = "en-US"
): string => {
  let modifiedText = text;

  while (modifiedText.includes("recall:")) {
    const recallInfo = extractRecallInfo(modifiedText);
    if (!recallInfo) break; // Exit the loop if no recall info is found

    const recallItemId = extractId(recallInfo);
    if (!recallItemId) return modifiedText; // Return the text if no ID could be extracted

    const fallback = extractFallbackValue(recallInfo).replace(/nbsp/g, " ").trim();
    let value: string | null = null;

    // Fetching value from variables based on recallItemId
    if (variables[recallItemId] !== undefined) {
      value = String(variables[recallItemId]) ?? fallback;
    }

    // Fetching value from responseData or attributes based on recallItemId
    if (responseData[recallItemId] !== undefined) {
      value = (responseData[recallItemId] as string) ?? fallback;
    }

    // Additional value formatting if it exists
    if (value) {
      if (isValidDateString(value)) {
        value = formatDateWithOrdinal(new Date(value), languageCode);
      } else if (Array.isArray(value)) {
        value = value.filter((item) => item).join(", "); // Filters out empty values and joins with a comma
      }
    }

    // Replace the recallInfo in the text with the obtained or fallback value
    modifiedText = modifiedText.replace(recallInfo, value?.toString() || fallback);
  }

  return modifiedText;
};

export const parseRecallInformation = (
  question: TSurveyElement,
  languageCode: string,
  responseData: TResponseData,
  variables: TResponseVariables,
  survey?: TJsWorkspaceStateSurvey
): TSurveyElement => {
  const modifiedQuestion = JSON.parse(JSON.stringify(question));
  const displayContext = survey ? buildDisplayContext(survey, responseData, variables) : undefined;
  const replaceAll = (text: string): string => {
    const recallReplaced = replaceRecallInfo(text, responseData, variables, languageCode);
    return displayContext ? replaceExpressionInfo(recallReplaced, displayContext) : recallReplaced;
  };
  // Use getLocalizedValue (falls back to the `default` key) instead of indexing by languageCode
  // directly — a code that isn't a content key (e.g. a legacy SDK language) would otherwise throw.
  if (getLocalizedValue(question.headline, languageCode).includes("recall:")) {
    modifiedQuestion.headline[languageCode] = replaceAll(
      getLocalizedValue(modifiedQuestion.headline, languageCode)
    );
  }
  if (getLocalizedValue(question.headline, languageCode).includes("{")) {
    modifiedQuestion.headline[languageCode] = replaceAll(
      getLocalizedValue(modifiedQuestion.headline, languageCode)
    );
  }
  if (
    question.subheader &&
    getLocalizedValue(question.subheader, languageCode).includes("recall:") &&
    modifiedQuestion.subheader
  ) {
    modifiedQuestion.subheader[languageCode] = replaceAll(
      getLocalizedValue(modifiedQuestion.subheader, languageCode)
    );
  }
  if (
    question.subheader &&
    getLocalizedValue(question.subheader, languageCode).includes("{") &&
    modifiedQuestion.subheader
  ) {
    modifiedQuestion.subheader[languageCode] = replaceAll(
      getLocalizedValue(modifiedQuestion.subheader, languageCode)
    );
  }
  return modifiedQuestion;
};

type DisplayContext = {
  flat: Record<string, unknown>;
  objects: Record<string, Record<string, unknown>>;
};

const hexDecode = (hex: string): string => {
  try {
    return decodeURIComponent(hex.replace(/(..)/g, "%$1"));
  } catch {
    return "";
  }
};

const externalNameOf = (id: string): string => {
  const chunk = id.split("g").pop();
  return chunk ? hexDecode(chunk) : "";
};

const numericValue = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (value === "" || value === null || value === undefined) return 0;
  return Number(value) || 0;
};

export const buildDisplayContext = (
  survey: TJsWorkspaceStateSurvey,
  responseData: TResponseData,
  variablesData: TResponseVariables
): DisplayContext => {
  const flat: Record<string, unknown> = {};
  const objects: Record<string, Record<string, unknown>> = {};
  const register = (id: string, value: unknown): void => {
    const name = externalNameOf(id);
    if (!name) return;
    flat[name] = value ?? "";
    objects[name] = { value: value ?? "", NAOK: numericValue(value), shown: value ?? "" };
  };
  for (const block of survey.blocks ?? []) {
    for (const element of block.elements ?? []) {
      register(element.id, responseData[element.id]);
    }
  }
  for (const variable of survey.variables ?? []) {
    register(variable.id, variablesData[variable.id]);
  }
  return { flat, objects };
};

const SIMPLE_REFERENCE = /^([A-Za-z_][A-Za-z0-9_]*)(?:\.(value|NAOK|shown))?$/;

const rewriteBareIdentifiers = (expr: string, flat: Record<string, unknown>): string => {
  let out = "";
  let i = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  while (i < expr.length) {
    const char = expr[i];
    if (inSingleQuote || inDoubleQuote) {
      out += char;
      if (inSingleQuote && char === "'") inSingleQuote = false;
      if (inDoubleQuote && char === '"') inDoubleQuote = false;
      i++;
      continue;
    }
    if (char === "'") {
      inSingleQuote = true;
      out += char;
      i++;
      continue;
    }
    if (char === '"') {
      inDoubleQuote = true;
      out += char;
      i++;
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      let end = i;
      while (end < expr.length && /[A-Za-z0-9_]/.test(expr[end])) end++;
      const word = expr.slice(i, end);
      if (flat[word] !== undefined && expr[end] !== ".") {
        const value = flat[word];
        out += typeof value === "number" ? String(value) : JSON.stringify(String(value));
      } else {
        out += word;
      }
      i = end;
      continue;
    }
    out += char;
    i++;
  }
  return out;
};

const resolveExpressionGroup = (content: string, context: DisplayContext): string => {
  const trimmed = content.trim();
  const simple = trimmed.match(SIMPLE_REFERENCE);
  if (simple) {
    const name = simple[1];
    const policy = simple[2];
    if (policy) {
      const value = context.objects[name]?.[policy];
      return value === undefined ? `{${content}}` : String(value);
    }
    const value = context.flat[name];
    return value === undefined ? `{${content}}` : String(value);
  }
  try {
    const rewritten = rewriteBareIdentifiers(trimmed, context.flat);
    const evaluated = evaluateExpression(parseExpression(rewritten), context.objects);
    return evaluated === null || evaluated === undefined ? `{${content}}` : String(evaluated);
  } catch {
    return `{${content}}`;
  }
};

export const replaceExpressionInfo = (text: string, context: DisplayContext): string => {
  let out = "";
  let i = 0;
  while (i < text.length) {
    if (text[i] === "{") {
      let depth = 0;
      let end = i;
      for (; end < text.length; end++) {
        if (text[end] === "{") depth++;
        else if (text[end] === "}") {
          depth--;
          if (depth === 0) break;
        }
      }
      if (depth === 0) {
        out += resolveExpressionGroup(text.slice(i + 1, end), context);
        i = end + 1;
        continue;
      }
    }
    out += text[i];
    i++;
  }
  return out;
};
