import { describe, expect, test } from "vitest";
import { formatIdForDisplay } from "./format-id-for-display";

describe("formatIdForDisplay", () => {
  test("decodes the canonical external ID from compiler-generated IDs", () => {
    expect(formatIdForDisplay("alqg41494c41425f385f4e67616e5f68616e67g5652303031")).toBe("VR001");
    expect(formatIdForDisplay("alog41494c4142g5652303031g4f505431")).toBe("OPT1");
  });

  test("preserves regular and malformed IDs", () => {
    expect(formatIdForDisplay("cm1234567890")).toBe("cm1234567890");
    expect(formatIdForDisplay("alqg123gnot-hex")).toBe("alqg123gnot-hex");
    expect(formatIdForDisplay(42)).toBe(42);
  });
});
