import { ExpressionError } from "./error";
import { type TToken, tokenizeExpression } from "./tokenizer";
import type { TExpressionNode } from "./types";

const BINARY_PRECEDENCE: Readonly<Record<string, number>> = {
  or: 1,
  "||": 1,
  and: 2,
  "&&": 2,
  "=": 3,
  "==": 3,
  "!=": 3,
  "<": 3,
  "<=": 3,
  ">": 3,
  ">=": 3,
  "+": 4,
  "-": 4,
  "*": 5,
  "/": 5,
  "%": 5,
};

export const parseExpression = (source: string): TExpressionNode => {
  const tokens = tokenizeExpression(source);
  let cursor = 0;
  const current = (): TToken => tokens[cursor];
  const consume = (): TToken => tokens[cursor++];

  const parsePrimary = (): TExpressionNode => {
    const token = consume();
    if (token.type === "number") return { type: "literal", value: Number(token.value) };
    if (token.type === "string") return { type: "literal", value: token.value };
    if (token.type === "leftParen") {
      const expression = parseTernary();
      if (current().type !== "rightParen")
        throw new ExpressionError("UNEXPECTED_TOKEN", "Expected ')'", current().position);
      consume();
      return expression;
    }
    if (token.type === "identifier") {
      const name = token.value;
      const normalized = name.toLowerCase();
      if (normalized === "true" || normalized === "false" || normalized === "null") {
        return { type: "literal", value: normalized === "null" ? null : normalized === "true" };
      }
      if (normalized === "not") return { type: "unary", operator: "not", operand: parsePrimary() };
      if (current().type === "leftParen") {
        consume();
        const arguments_: TExpressionNode[] = [];
        if (current().type !== "rightParen") {
          while (true) {
            if (current().type === "rightParen") break;
            arguments_.push(parseTernary());
            if (current().type === "comma") {
              consume();
            } else {
              break;
            }
          }
        }
        if (current().type !== "rightParen")
          throw new ExpressionError(
            "UNEXPECTED_TOKEN",
            "Expected ')' after function arguments",
            current().position
          );
        consume();
        return { type: "call", name: normalized, arguments: arguments_ };
      }
      const path = name.split(".");
      if (path.some((part) => part.length === 0))
        throw new ExpressionError("UNEXPECTED_TOKEN", "Invalid reference path", token.position);
      return { type: "reference", path };
    }
    if (token.type === "operator" && (token.value === "-" || token.value === "!"))
      return { type: "unary", operator: token.value === "!" ? "not" : "-", operand: parsePrimary() };
    throw new ExpressionError("UNEXPECTED_TOKEN", `Unexpected token '${token.value}'`, token.position);
  };

  const parseBinary = (minimumPrecedence: number): TExpressionNode => {
    let left = parsePrimary();
    while (true) {
      const token = current();
      const operator = token.type === "identifier" ? token.value.toLowerCase() : token.value;
      const precedence =
        token.type === "operator" || token.type === "identifier" ? BINARY_PRECEDENCE[operator] : undefined;
      if (precedence === undefined || precedence < minimumPrecedence) break;
      consume();
      const right = parseBinary(precedence + 1);
      const normalizedOperator =
        operator === "==" ? "=" : operator === "||" ? "or" : operator === "&&" ? "and" : operator;
      left = {
        type: "binary",
        operator: normalizedOperator as Extract<TExpressionNode, { type: "binary" }>["operator"],
        left,
        right,
      };
    }
    return left;
  };

  const parseTernary = (): TExpressionNode => {
    const condition = parseBinary(0);
    if (current().type === "operator" && current().value === "?") {
      consume();
      const trueExpr = parseTernary();
      if (current().type !== "operator" || current().value !== ":") {
        throw new ExpressionError(
          "UNEXPECTED_TOKEN",
          "Expected ':' in ternary expression",
          current().position
        );
      }
      consume();
      const falseExpr = parseTernary();
      return { type: "call", name: "if", arguments: [condition, trueExpr, falseExpr] };
    }
    return condition;
  };

  const expression = parseTernary();
  if (current().type !== "eof")
    throw new ExpressionError(
      "UNEXPECTED_TOKEN",
      `Unexpected token '${current().value}'`,
      current().position
    );
  return expression;
};
