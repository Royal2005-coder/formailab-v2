import { describe, expect, test } from "vitest";
import {
  SurveyLifecycleError,
  assertLifecycleTransition,
  assertPublicationReady,
  assertVersionMutable,
  createImportIdempotencyKey,
} from "./lifecycle";

describe("survey lifecycle", () => {
  test("accepts the review and publication path", () => {
    expect(() => assertLifecycleTransition("draft", "underReview")).not.toThrow();
    expect(() => assertLifecycleTransition("underReview", "approved")).not.toThrow();
    expect(() => assertLifecycleTransition("approved", "published")).not.toThrow();
  });

  test("rejects skipped lifecycle transitions", () => {
    expect(() => assertLifecycleTransition("draft", "active")).toThrowError(SurveyLifecycleError);
  });

  test("protects published and superseded versions", () => {
    expect(() => assertVersionMutable("draft")).not.toThrow();
    expect(() => assertVersionMutable("published")).toThrow(/immutable/);
    expect(() => assertVersionMutable("superseded")).toThrow(/immutable/);
  });

  test("blocks publication on errors but permits warnings and manual review records", () => {
    expect(() =>
      assertPublicationReady([{ severity: "warning", code: "w", message: "warning" }])
    ).not.toThrow();
    expect(() => assertPublicationReady([{ severity: "error", code: "e", message: "error" }])).toThrow(
      /blocked by 1 error/
    );
  });

  test("creates stable tenant-scoped import idempotency keys", () => {
    const input = { workspaceId: "ws_1", registryId: "reg_1", mode: "createVersion", sourceChecksum: "abc" };
    expect(createImportIdempotencyKey(input)).toBe(createImportIdempotencyKey(input));
    expect(createImportIdempotencyKey({ ...input, workspaceId: "ws_2" })).not.toBe(
      createImportIdempotencyKey(input)
    );
  });
});
