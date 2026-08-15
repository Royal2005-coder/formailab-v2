import { describe, expect, test } from "vitest";
import { isAllowedImportFileName, isAllowedImportFileType, resolveActionError } from "./import-file-guard";

describe("isAllowedImportFileName", () => {
  test.each([
    ["survey.csv", true],
    ["survey.xlsx", true],
    ["survey.XLS", true],
    ["survey.xls", true],
    ["archive.tar.gz", false],
    ["survey.exe", false],
    ["survey", false],
    [undefined, false],
  ])("%s -> %s", (name, expected) => {
    expect(isAllowedImportFileName(name)).toBe(expected);
  });
});

describe("isAllowedImportFileType", () => {
  test("accepts every spreadsheet MIME type browsers can assign", () => {
    for (const type of [
      "text/csv",
      "text/x-csv",
      "text/comma-separated-values",
      "text/plain",
      "application/csv",
      "application/x-csv",
      "application/vnd.ms-excel",
      "application/x-excel",
      "application/excel",
      "application/x-msexcel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel.sheet.macroenabled.12",
    ]) {
      expect(isAllowedImportFileType({ name: "bank.xlsx", type })).toBe(true);
    }
  });

  test("accepts the OS 'unknown' buckets octet-stream and zip when the extension is valid", () => {
    expect(isAllowedImportFileType({ name: "bank.xls", type: "application/octet-stream" })).toBe(true);
    expect(isAllowedImportFileType({ name: "bank.xlsx", type: "application/zip" })).toBe(true);
    expect(isAllowedImportFileType({ name: "bank.xlsx", type: "application/x-zip-compressed" })).toBe(true);
    expect(isAllowedImportFileType({ name: "bank.csv", type: "" })).toBe(true);
  });

  test("rejects files whose MIME type is clearly not a spreadsheet", () => {
    expect(isAllowedImportFileType({ name: "bank.csv", type: "image/png" })).toBe(false);
    expect(isAllowedImportFileType({ name: "bank.xlsx", type: "video/mp4" })).toBe(false);
  });

  test("rejects valid MIME on a non-spreadsheet extension", () => {
    expect(isAllowedImportFileType({ name: "survey.exe", type: "application/octet-stream" })).toBe(false);
    expect(isAllowedImportFileType({ name: "survey.png", type: "text/csv" })).toBe(false);
  });
});

describe("resolveActionError", () => {
  const fallback = "fallback";

  test("returns the Error message", () => {
    expect(resolveActionError(new Error("boom"), fallback)).toBe("boom");
  });

  test("returns the fallback for an Error without a message", () => {
    expect(resolveActionError(new Error(""), fallback)).toBe(fallback);
  });

  test("returns the string rejection value", () => {
    expect(resolveActionError("boom", fallback)).toBe("boom");
  });

  test("returns the fallback for the classic undefined rejection (Unhandled Rejection: undefined)", () => {
    expect(resolveActionError(undefined, fallback)).toBe(fallback);
    expect(resolveActionError(null, fallback)).toBe(fallback);
    expect(resolveActionError(42, fallback)).toBe(fallback);
  });

  test("returns the message from an object-shaped rejection", () => {
    expect(resolveActionError({ message: "boom" }, fallback)).toBe("boom");
  });
});
