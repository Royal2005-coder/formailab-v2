import { describe, expect, test } from "vitest";
import { canonicalSerialize } from "./index";

describe("canonicalSerialize", () => {
  test("sorts object keys recursively while preserving array order", () => {
    const first = {
      title: { vi: "Khảo sát", en: "Survey" },
      questions: [
        { label: "Second", id: "Q2" },
        { id: "Q1", label: "First" },
      ],
      schemaVersion: 1,
    };
    const sameValueWithDifferentInsertionOrder = {
      schemaVersion: 1,
      questions: [
        { id: "Q2", label: "Second" },
        { label: "First", id: "Q1" },
      ],
      title: { en: "Survey", vi: "Khảo sát" },
    };

    const expected =
      '{"questions":[{"id":"Q2","label":"Second"},{"id":"Q1","label":"First"}],"schemaVersion":1,"title":{"en":"Survey","vi":"Khảo sát"}}';

    expect(canonicalSerialize(first)).toBe(expected);
    expect(canonicalSerialize(sameValueWithDifferentInsertionOrder)).toBe(expected);
  });
});
