import { describe, expect, test } from "vitest";
import { repairCorruptedEncoding } from "./encoding-utils";

describe("repairCorruptedEncoding", () => {
  test("should repair double-encoded UTF-8 Vietnamese strings", () => {
    expect(repairCorruptedEncoding("káº¿t há»£p nhiá»u cÃ´ng cá»¥")).toBe("kết hợp nhiều công cụ");
    expect(repairCorruptedEncoding("Viá»‡c káº¿t há»£p nhiá»u cÃ´ng cá»¥")).toBe(
      "Việc kết hợp nhiều công cụ"
    );
    expect(repairCorruptedEncoding("KhÃ¡")).toBe("Khá");
    expect(repairCorruptedEncoding("Xuáº¥t sáº¯c")).toBe("Xuất sắc");
    expect(repairCorruptedEncoding("Bá»• trá»£")).toBe("Bổ trợ");
    expect(repairCorruptedEncoding("Sinh viÃªn nÄƒm 1")).toBe("Sinh viên năm 1");
  });

  test("should preserve clean UTF-8 Vietnamese strings unchanged", () => {
    expect(repairCorruptedEncoding("Chào bạn đến với khảo sát")).toBe("Chào bạn đến với khảo sát");
    expect(repairCorruptedEncoding("Việc kết hợp nhiều công cụ")).toBe("Việc kết hợp nhiều công cụ");
    expect(repairCorruptedEncoding("Xuất sắc")).toBe("Xuất sắc");
  });

  test("should preserve English and ASCII text unchanged", () => {
    expect(repairCorruptedEncoding("Hello world 123")).toBe("Hello world 123");
    expect(repairCorruptedEncoding("GROUP_1")).toBe("GROUP_1");
  });
});
