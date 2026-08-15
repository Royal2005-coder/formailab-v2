import { ExpressionError } from "./error";

export type TTokenType =
  | "number"
  | "string"
  | "identifier"
  | "operator"
  | "leftParen"
  | "rightParen"
  | "comma"
  | "eof";
export type TToken = { type: TTokenType; value: string; position: number };

const isIdentifierStart = (character: string): boolean => /[A-Za-z_]/.test(character);
const isIdentifierPart = (character: string): boolean => /[A-Za-z0-9_.]/.test(character);

export const tokenizeExpression = (source: string): TToken[] => {
  const tokens: TToken[] = [];
  let position = 0;

  while (position < source.length) {
    const character = source[position];
    if (/\s/.test(character)) {
      position++;
      continue;
    }
    if (/\d/.test(character) || (character === "." && /\d/.test(source[position + 1] ?? ""))) {
      const start = position;
      while (/\d/.test(source[position] ?? "")) position++;
      if (source[position] === ".") {
        position++;
        while (/\d/.test(source[position] ?? "")) position++;
      }
      tokens.push({ type: "number", value: source.slice(start, position), position: start });
      continue;
    }
    if (character === '"' || character === "'") {
      const start = position;
      const quote = character;
      let value = "";
      position++;
      while (position < source.length && source[position] !== quote) {
        if (source[position] === "\\") {
          position++;
          if (position >= source.length) break;
          const escaped = source[position];
          value += escaped === "n" ? "\n" : escaped === "t" ? "\t" : escaped;
        } else value += source[position];
        position++;
      }
      if (source[position] !== quote)
        throw new ExpressionError("UNTERMINATED_STRING", "Unterminated string literal", start);
      position++;
      tokens.push({ type: "string", value, position: start });
      continue;
    }
    if (isIdentifierStart(character)) {
      const start = position++;
      while (isIdentifierPart(source[position] ?? "")) position++;
      tokens.push({ type: "identifier", value: source.slice(start, position), position: start });
      continue;
    }
    const pair = source.slice(position, position + 2);
    if (["!=", "<=", ">=", "==", "&&", "||"].includes(pair)) {
      tokens.push({ type: "operator", value: pair, position });
      position += 2;
      continue;
    }
    const simple: Record<string, TTokenType> = {
      "+": "operator",
      "-": "operator",
      "*": "operator",
      "/": "operator",
      "%": "operator",
      "=": "operator",
      "<": "operator",
      ">": "operator",
      "!": "operator",
      "?": "operator",
      ":": "operator",
      "(": "leftParen",
      ")": "rightParen",
      ",": "comma",
    };
    const type = simple[character];
    if (!type) throw new ExpressionError("INVALID_TOKEN", `Invalid token '${character}'`, position);
    tokens.push({ type, value: character, position: position++ });
  }
  tokens.push({ type: "eof", value: "", position });
  return tokens;
};
