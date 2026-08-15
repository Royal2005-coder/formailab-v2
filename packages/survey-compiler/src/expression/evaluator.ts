import { ExpressionError } from "./error";
import type { TExpressionContext, TExpressionLimits, TExpressionNode } from "./types";

const DEFAULT_MAX_DEPTH = 200;
const DEFAULT_MAX_OPERATIONS = 10_000;
const FORBIDDEN_REFERENCE_PARTS = new Set(["__proto__", "constructor", "prototype"]);
const toNumber = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new ExpressionError("INVALID_ARGUMENT", "Expected a finite number");
  return value;
};
const flatten = (values: unknown[]): unknown[] =>
  values.flatMap((value) => (Array.isArray(value) ? value : [value]));

export const evaluateExpression = (
  node: TExpressionNode,
  context: TExpressionContext = {},
  limits: TExpressionLimits = {}
): unknown => {
  let operations = 0;
  const maxDepth = limits.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxOperations = limits.maxOperations ?? DEFAULT_MAX_OPERATIONS;

  const evaluate = (current: TExpressionNode, depth: number): unknown => {
    if (depth > maxDepth)
      throw new ExpressionError("MAX_DEPTH_EXCEEDED", `Expression exceeds maximum depth of ${maxDepth}`);
    operations++;
    if (operations > maxOperations)
      throw new ExpressionError(
        "MAX_OPERATIONS_EXCEEDED",
        `Expression exceeds maximum operation count of ${maxOperations}`
      );
    if (current.type === "literal") return current.value;
    if (current.type === "reference") {
      let value: unknown = context;
      for (const part of current.path) {
        if (
          FORBIDDEN_REFERENCE_PARTS.has(part) ||
          typeof value !== "object" ||
          value === null ||
          !Object.prototype.hasOwnProperty.call(value, part)
        )
          throw new ExpressionError("UNKNOWN_REFERENCE", `Unknown reference '${current.path.join(".")}'`);
        value = (value as Record<string, unknown>)[part];
      }
      return value;
    }
    if (current.type === "unary") {
      const value = evaluate(current.operand, depth + 1);
      return current.operator === "not" ? !value : -toNumber(value);
    }
    if (current.type === "binary") {
      const left = evaluate(current.left, depth + 1);
      if (current.operator === "and" && !left) return false;
      if (current.operator === "or" && left) return true;
      const right = evaluate(current.right, depth + 1);
      switch (current.operator) {
        case "and":
          return Boolean(right);
        case "or":
          return Boolean(right);
        case "+":
          return typeof left === "string" || typeof right === "string"
            ? String(left) + String(right)
            : toNumber(left) + toNumber(right);
        case "-":
          return toNumber(left) - toNumber(right);
        case "*":
          return toNumber(left) * toNumber(right);
        case "/": {
          const divisor = toNumber(right);
          if (divisor === 0) throw new ExpressionError("DIVISION_BY_ZERO", "Division by zero");
          return toNumber(left) / divisor;
        }
        case "%": {
          const divisor = toNumber(right);
          if (divisor === 0) throw new ExpressionError("DIVISION_BY_ZERO", "Division by zero");
          return toNumber(left) % divisor;
        }
        case "=":
          return left === right;
        case "!=":
          return left !== right;
        case "<":
          return toNumber(left) < toNumber(right);
        case "<=":
          return toNumber(left) <= toNumber(right);
        case ">":
          return toNumber(left) > toNumber(right);
        case ">=":
          return toNumber(left) >= toNumber(right);
      }
    }
    if (current.name === "if") {
      if (current.arguments.length !== 3)
        throw new ExpressionError("INVALID_ARGUMENT", "if expects exactly 3 arguments");
      return evaluate(current.arguments[evaluate(current.arguments[0], depth + 1) ? 1 : 2], depth + 1);
    }
    if (current.name === "is_empty" || current.name === "empty") {
      if (current.arguments.length !== 1)
        throw new ExpressionError("INVALID_ARGUMENT", "is_empty expects exactly 1 argument");
      let val: unknown;
      try {
        val = evaluate(current.arguments[0], depth + 1);
      } catch {
        return true;
      }
      return val === null || val === undefined || val === "" || val === 0 || val === false;
    }
    if (current.name === "coalesce") {
      for (const argument of current.arguments) {
        const value = evaluate(argument, depth + 1);
        if (value !== null && value !== undefined) return value;
      }
      return null;
    }
    const values = flatten(current.arguments.map((argument) => evaluate(argument, depth + 1)));
    switch (current.name) {
      case "sum":
        return values.reduce<number>((total, value) => total + toNumber(value), 0);
      case "avg":
        if (values.length === 0)
          throw new ExpressionError("INVALID_ARGUMENT", "avg expects at least 1 value");
        return values.reduce<number>((total, value) => total + toNumber(value), 0) / values.length;
      case "min":
        if (values.length === 0)
          throw new ExpressionError("INVALID_ARGUMENT", "min expects at least 1 value");
        return Math.min(...values.map(toNumber));
      case "max":
        if (values.length === 0)
          throw new ExpressionError("INVALID_ARGUMENT", "max expects at least 1 value");
        return Math.max(...values.map(toNumber));
      case "abs":
        if (values.length !== 1)
          throw new ExpressionError("INVALID_ARGUMENT", "abs expects exactly 1 argument");
        return Math.abs(toNumber(values[0]));
      case "ceil":
        if (values.length !== 1)
          throw new ExpressionError("INVALID_ARGUMENT", "ceil expects exactly 1 argument");
        return Math.ceil(toNumber(values[0]));
      case "floor":
        if (values.length !== 1)
          throw new ExpressionError("INVALID_ARGUMENT", "floor expects exactly 1 argument");
        return Math.floor(toNumber(values[0]));
      case "count":
        return values.length;
      case "concat":
        return values.map(String).join("");
      case "round":
        if (values.length < 1 || values.length > 2)
          throw new ExpressionError("INVALID_ARGUMENT", "round expects 1 or 2 arguments");
        {
          const precision = values[1] === undefined ? 0 : toNumber(values[1]);
          if (!Number.isInteger(precision) || precision < 0 || precision > 15)
            throw new ExpressionError("INVALID_ARGUMENT", "round precision must be an integer from 0 to 15");
          const factor = 10 ** precision;
          return Math.round((toNumber(values[0]) + Number.EPSILON) * factor) / factor;
        }
      default:
        throw new ExpressionError("UNKNOWN_FUNCTION", `Unknown function '${current.name}'`);
    }
  };
  return evaluate(node, 1);
};
