import { describe, expect, test } from "vitest";
import { decideImportCommit } from "./import-commit-decision";

const job = {
  id: "job-1",
  workspaceId: "workspace-1",
  status: "validated",
  mode: "createSurvey",
} as const;

const prepared = {
  canonicalChecksum: "checksum-1",
  externalId: "survey-external-id",
} as const;

const registry = {
  id: "registry-1",
  workspaceId: "workspace-1",
  externalId: prepared.externalId,
} as const;

const version = {
  id: "version-1",
  registryId: registry.id,
  canonicalChecksum: prepared.canonicalChecksum,
} as const;

const survey = {
  id: "survey-1",
  workspaceId: "workspace-1",
} as const;

describe("decideImportCommit", () => {
  test("creates a version and Survey for a validated createSurvey job with no prior registry", () => {
    expect(decideImportCommit({ job, prepared })).toEqual({
      kind: "createNewVersionAndSurvey",
      jobId: job.id,
    });
  });

  test("creates a new version and Survey in an existing matching registry when no checksum match exists", () => {
    expect(decideImportCommit({ job, prepared, existingRegistry: registry })).toEqual({
      kind: "createNewVersionAndSurvey",
      jobId: job.id,
      registryId: registry.id,
    });
  });

  test("reuses a matching version and its workspace-owned Survey", () => {
    expect(
      decideImportCommit({
        job,
        prepared,
        existingRegistry: { ...registry, surveyId: survey.id },
        existingVersion: version,
        existingSurvey: survey,
      })
    ).toEqual({
      kind: "reuseVersionAndSurvey",
      jobId: job.id,
      registryId: registry.id,
      versionId: version.id,
      surveyId: survey.id,
    });
  });

  test("replays a completed job only when all persisted linkages are complete and consistent", () => {
    expect(
      decideImportCommit({
        job: { ...job, status: "completed", registryId: registry.id, versionId: version.id },
        prepared,
        existingRegistry: { ...registry, surveyId: survey.id },
        existingVersion: version,
        existingSurvey: survey,
      })
    ).toEqual({
      kind: "completedReplay",
      jobId: job.id,
      registryId: registry.id,
      versionId: version.id,
      surveyId: survey.id,
    });
  });

  test.each(["pending", "validating", "failed"] as const)("rejects a non-validated %s job", (status) => {
    expect(() => decideImportCommit({ job: { ...job, status }, prepared })).toThrowError(
      `Import job "${job.id}" must be validated before commit`
    );
  });

  test.each(["validateOnly", "previewOnly", "replaceDraft", "createVersion", "cloneTemplate"] as const)(
    "rejects unsupported mode %s",
    (mode) => {
      expect(() => decideImportCommit({ job: { ...job, mode }, prepared })).toThrowError(
        `Import mode "${mode}" cannot be committed as createSurvey`
      );
    }
  );

  test("rejects partial completed-job linkage IDs", () => {
    expect(() =>
      decideImportCommit({
        job: { ...job, status: "completed", registryId: registry.id },
        prepared,
      })
    ).toThrowError(`Completed import job "${job.id}" has incomplete persisted linkages`);
  });

  test("rejects a completed job when linked facts are absent", () => {
    expect(() =>
      decideImportCommit({
        job: { ...job, status: "completed", registryId: registry.id, versionId: version.id },
        prepared,
      })
    ).toThrowError(`Completed import job "${job.id}" has incomplete persisted linkages`);
  });

  test("rejects registry ownership by another workspace", () => {
    expect(() =>
      decideImportCommit({
        job,
        prepared,
        existingRegistry: { ...registry, workspaceId: "workspace-2" },
      })
    ).toThrowError(`Registry "${registry.id}" does not belong to workspace "${job.workspaceId}"`);
  });

  test("rejects a registry for another external survey", () => {
    expect(() =>
      decideImportCommit({
        job,
        prepared,
        existingRegistry: { ...registry, externalId: "another-survey" },
      })
    ).toThrowError(`Registry "${registry.id}" does not match external survey "${prepared.externalId}"`);
  });

  test("rejects a version linked to another registry", () => {
    expect(() =>
      decideImportCommit({
        job,
        prepared,
        existingRegistry: registry,
        existingVersion: { ...version, registryId: "registry-2" },
      })
    ).toThrowError(`Version "${version.id}" does not belong to registry "${registry.id}"`);
  });

  test("rejects a supplied version with a different canonical checksum", () => {
    expect(() =>
      decideImportCommit({
        job,
        prepared,
        existingRegistry: registry,
        existingVersion: { ...version, canonicalChecksum: "another-checksum" },
      })
    ).toThrowError(
      `Version "${version.id}" does not match canonical checksum "${prepared.canonicalChecksum}"`
    );
  });

  test("rejects a Survey owned by another workspace", () => {
    expect(() =>
      decideImportCommit({
        job,
        prepared,
        existingRegistry: { ...registry, surveyId: survey.id },
        existingVersion: version,
        existingSurvey: { ...survey, workspaceId: "workspace-2" },
      })
    ).toThrowError(`Survey "${survey.id}" does not belong to workspace "${job.workspaceId}"`);
  });

  test("rejects a Survey that is not the registry's linked Survey", () => {
    expect(() =>
      decideImportCommit({
        job,
        prepared,
        existingRegistry: { ...registry, surveyId: "survey-2" },
        existingVersion: version,
        existingSurvey: survey,
      })
    ).toThrowError(`Registry "${registry.id}" is not linked to Survey "${survey.id}"`);
  });

  test("rejects incomplete reuse facts instead of silently creating a duplicate", () => {
    expect(() =>
      decideImportCommit({
        job,
        prepared,
        existingRegistry: registry,
        existingVersion: version,
      })
    ).toThrowError(`Version "${version.id}" has no complete Survey linkage`);
  });

  test("rejects orphan version or Survey facts", () => {
    expect(() => decideImportCommit({ job, prepared, existingVersion: version })).toThrowError(
      "Existing version facts require an existing registry"
    );
    expect(() => decideImportCommit({ job, prepared, existingSurvey: survey })).toThrowError(
      "Existing Survey facts require an existing registry"
    );
  });
});
