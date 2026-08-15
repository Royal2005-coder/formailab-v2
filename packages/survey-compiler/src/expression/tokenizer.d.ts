export type TTokenType =
  | "number"
  | "string"
  | "identifier"
  | "operator"
  | "leftParen"
  | "rightParen"
  | "comma"
  | "eof";
export type TToken = {
  type: TTokenType;
  value: string;
  position: number;
};
export declare const tokenizeExpression: (source: string) => TToken[];
//# sourceMappingURL=tokenizer.d.ts.map
