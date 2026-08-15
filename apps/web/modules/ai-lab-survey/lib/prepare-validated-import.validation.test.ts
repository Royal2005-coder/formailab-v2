import { describe, expect, test } from "vitest";
import { createCanonicalChecksum } from "@formbricks/survey-compiler/server";
import { prepareValidatedImport } from "./prepare-validated-import";

const canonicalSnapshot = {
  schemaVersion: 1,
  externalId: "employee_pulse",
  defaultLanguage: "en-US",
  languages: ["en-US"],
  title: { "en-US": "Employee pulse" },
  groups: [{ externalId: "profile", title: { "en-US": "Profile" }, order: 0 }],
  questions: [
    {
      externalId: "role",
      groupExternalId: "profile",
      type: "openText",
      label: { "en-US": "What is your role?" },
      order: 0,
      mandatory: true,
      options: [],
    },
  ],
  variables: [],
  endings: [{ externalId: "complete", title: { "en-US": "Thank you" } }],
} as const;

describe("prepareValidatedImport validation", () => {
  test.each([
    {
      name: "stored and expected checksums differ",
      storedCanonicalChecksum: "stored-checksum",
      expectedCanonicalChecksum: "expected-checksum",
    },
    {
      name: "stored checksum differs from the recomputed snapshot checksum",
      storedCanonicalChecksum: "tampered-checksum",
      expectedCanonicalChecksum: "tampered-checksum",
    },
  ])("rejects when $name", ({ storedCanonicalChecksum, expectedCanonicalChecksum }) => {
    expect(() =>
      prepareValidatedImport({
        canonicalSnapshot,
        storedCanonicalChecksum,
        expectedCanonicalChecksum,
        diagnostics: [],
      })
    ).toThrow("Canonical survey checksum mismatch");
  });

  test("rejects a stored canonical snapshot that does not satisfy the canonical schema", () => {
    const checksum = createCanonicalChecksum(canonicalSnapshot);

    expect(() =>
      prepareValidatedImport({
        canonicalSnapshot: { ...canonicalSnapshot, schemaVersion: 2 },
        storedCanonicalChecksum: checksum,
        expectedCanonicalChecksum: checksum,
        diagnostics: [],
      })
    ).toThrow();
  });

  test.each(["error", "manualReview"] as const)("rejects unresolved %s diagnostics", (severity) => {
    const checksum = createCanonicalChecksum(canonicalSnapshot);

    expect(() =>
      prepareValidatedImport({
        canonicalSnapshot,
        storedCanonicalChecksum: checksum,
        expectedCanonicalChecksum: checksum,
        diagnostics: [
          {
            severity,
            code: "lime.question.unsupported",
            message: "Question needs an explicit migration decision",
          },
        ],
      })
    ).toThrow("Import has unresolved publish-blocking diagnostics");
  });

  test("rejects malformed stored diagnostics instead of treating them as resolved", () => {
    const checksum = createCanonicalChecksum(canonicalSnapshot);

    expect(() =>
      prepareValidatedImport({
        canonicalSnapshot,
        storedCanonicalChecksum: checksum,
        expectedCanonicalChecksum: checksum,
        diagnostics: [{ severity: "warning" }],
      })
    ).toThrow();
  });
});
