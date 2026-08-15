import type { TExpressionDiagnostic, TExpressionErrorCode } from "./types";

export declare class ExpressionError extends Error {
  readonly code: TExpressionErrorCode;
  readonly position?: number;
  constructor(code: TExpressionErrorCode, message: string, position?: number);
  toDiagnostic(): TExpressionDiagnostic;
}
//# sourceMappingURL=error.d.ts.map
