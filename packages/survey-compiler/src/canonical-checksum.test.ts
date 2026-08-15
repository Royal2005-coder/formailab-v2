import { describe, expect, test } from "vitest";
import { createCanonicalChecksum } from "./server";

describe("createCanonicalChecksum", () => {
  test("hashes semantic JSON content independently of object key insertion order", () => {
    const first = {
      nested: { z: "value", x: true },
      a: 1,
    };
    const sameValueWithDifferentInsertionOrder = {
      a: 1,
      nested: { x: true, z: "value" },
    };
    const changedValue = {
      a: 2,
      nested: { x: true, z: "value" },
    };

    const expected = "eeee62feb612796579639d52759f583e636f89c85ecdb3ff14406bacae3bbfff";

    expect(createCanonicalChecksum(first)).toBe(expected);
    expect(createCanonicalChecksum(sameValueWithDifferentInsertionOrder)).toBe(expected);
    expect(createCanonicalChecksum(changedValue)).not.toBe(expected);
  });
});
