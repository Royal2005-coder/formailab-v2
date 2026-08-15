import type { TExpressionDiagnostic, TExpressionErrorCode } from "./types";

export class ExpressionError extends Error {
  readonly code: TExpressionErrorCode;
  readonly position?: number;

  constructor(code: TExpressionErrorCode, message: string, position?: number) {
    super(message);
    this.name = "ExpressionError";
    this.code = code;
    this.position = position;
  }

  toDiagnostic(): TExpressionDiagnostic {
    return {
      code: this.code,
      message: this.message,
      ...(this.position === undefined ? {} : { position: this.position }),
    };
  }
}
