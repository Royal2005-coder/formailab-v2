export type TExpressionLiteral = string | number | boolean | null;
export type TExpressionNode =
  | {
      type: "literal";
      value: TExpressionLiteral;
    }
  | {
      type: "reference";
      path: string[];
    }
  | {
      type: "unary";
      operator: "-" | "not";
      operand: TExpressionNode;
    }
  | {
      type: "binary";
      operator: "+" | "-" | "*" | "/" | "%" | "=" | "!=" | "<" | "<=" | ">" | ">=" | "and" | "or";
      left: TExpressionNode;
      right: TExpressionNode;
    }
  | {
      type: "call";
      name: string;
      arguments: TExpressionNode[];
    };
export type TExpressionErrorCode =
  | "INVALID_TOKEN"
  | "UNEXPECTED_TOKEN"
  | "UNTERMINATED_STRING"
  | "UNKNOWN_REFERENCE"
  | "UNKNOWN_FUNCTION"
  | "INVALID_ARGUMENT"
  | "DIVISION_BY_ZERO"
  | "MAX_DEPTH_EXCEEDED"
  | "MAX_OPERATIONS_EXCEEDED";
export type TExpressionDiagnostic = {
  code: TExpressionErrorCode;
  message: string;
  position?: number;
};
export type TExpressionContext = Readonly<Record<string, unknown>>;
export type TExpressionLimits = {
  maxDepth?: number;
  maxOperations?: number;
};
//# sourceMappingURL=types.d.ts.map
