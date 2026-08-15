export type TImportCommitJob = Readonly<{
  id: string;
  workspaceId: string;
  status: string;
  mode: string;
  registryId?: string;
  versionId?: string;
}>;

export type TPreparedImportIdentity = Readonly<{
  canonicalChecksum: string;
  externalId: string;
}>;

export type TImportCommitRegistryFact = Readonly<{
  id: string;
  workspaceId: string;
  externalId: string;
  surveyId?: string;
}>;

export type TImportCommitVersionFact = Readonly<{
  id: string;
  registryId: string;
  canonicalChecksum: string;
}>;

export type TImportCommitSurveyFact = Readonly<{
  id: string;
  workspaceId: string;
}>;

export type TImportCommitDecision =
  | Readonly<{
      kind: "completedReplay";
      jobId: string;
      registryId: string;
      versionId: string;
      surveyId: string;
    }>
  | Readonly<{
      kind: "createNewVersionAndSurvey";
      jobId: string;
      registryId?: string;
    }>
  | Readonly<{
      kind: "reuseVersionAndSurvey";
      jobId: string;
      registryId: string;
      versionId: string;
      surveyId: string;
    }>;

type TDecideImportCommitInput = Readonly<{
  job: TImportCommitJob;
  prepared: TPreparedImportIdentity;
  existingRegistry?: TImportCommitRegistryFact;
  existingVersion?: TImportCommitVersionFact;
  existingSurvey?: TImportCommitSurveyFact;
}>;

const assertSupportedJob = (job: TImportCommitJob): void => {
  if (job.mode !== "createSurvey") {
    throw new Error(`Import mode "${job.mode}" cannot be committed as createSurvey`);
  }
  if (job.status !== "validated" && job.status !== "completed") {
    throw new Error(`Import job "${job.id}" must be validated before commit`);
  }
};

const assertRegistry = (
  job: TImportCommitJob,
  prepared: TPreparedImportIdentity,
  registry: TImportCommitRegistryFact
): void => {
  if (registry.workspaceId !== job.workspaceId) {
    throw new Error(`Registry "${registry.id}" does not belong to workspace "${job.workspaceId}"`);
  }
  if (registry.externalId !== prepared.externalId) {
    throw new Error(`Registry "${registry.id}" does not match external survey "${prepared.externalId}"`);
  }
  if (job.registryId && job.registryId !== registry.id) {
    throw new Error(`Import job "${job.id}" is not linked to registry "${registry.id}"`);
  }
};

const assertVersion = (
  prepared: TPreparedImportIdentity,
  registry: TImportCommitRegistryFact,
  version: TImportCommitVersionFact
): void => {
  if (version.registryId !== registry.id) {
    throw new Error(`Version "${version.id}" does not belong to registry "${registry.id}"`);
  }
  if (version.canonicalChecksum !== prepared.canonicalChecksum) {
    throw new Error(
      `Version "${version.id}" does not match canonical checksum "${prepared.canonicalChecksum}"`
    );
  }
};

const assertSurvey = (
  job: TImportCommitJob,
  registry: TImportCommitRegistryFact,
  survey: TImportCommitSurveyFact
): void => {
  if (survey.workspaceId !== job.workspaceId) {
    throw new Error(`Survey "${survey.id}" does not belong to workspace "${job.workspaceId}"`);
  }
  if (registry.surveyId !== survey.id) {
    throw new Error(`Registry "${registry.id}" is not linked to Survey "${survey.id}"`);
  }
};

export const decideImportCommit = ({
  job,
  prepared,
  existingRegistry,
  existingVersion,
  existingSurvey,
}: TDecideImportCommitInput): TImportCommitDecision => {
  assertSupportedJob(job);

  if (!existingRegistry && existingVersion) {
    throw new Error("Existing version facts require an existing registry");
  }
  if (!existingRegistry && existingSurvey) {
    throw new Error("Existing Survey facts require an existing registry");
  }

  if (job.status === "completed") {
    if (
      !job.registryId ||
      !job.versionId ||
      !existingRegistry?.surveyId ||
      !existingVersion ||
      !existingSurvey ||
      existingRegistry.id !== job.registryId ||
      existingVersion.id !== job.versionId
    ) {
      throw new Error(`Completed import job "${job.id}" has incomplete persisted linkages`);
    }
    assertRegistry(job, prepared, existingRegistry);
    assertVersion(prepared, existingRegistry, existingVersion);
    assertSurvey(job, existingRegistry, existingSurvey);
    return {
      kind: "completedReplay",
      jobId: job.id,
      registryId: existingRegistry.id,
      versionId: existingVersion.id,
      surveyId: existingSurvey.id,
    };
  }

  if (job.registryId && (!existingRegistry || existingRegistry.id !== job.registryId)) {
    throw new Error(`Import job "${job.id}" has an unresolved registry linkage`);
  }
  if (job.versionId && (!existingVersion || existingVersion.id !== job.versionId)) {
    throw new Error(`Import job "${job.id}" has an unresolved version linkage`);
  }

  if (!existingRegistry) {
    return { kind: "createNewVersionAndSurvey", jobId: job.id };
  }

  assertRegistry(job, prepared, existingRegistry);
  if (existingSurvey) {
    assertSurvey(job, existingRegistry, existingSurvey);
  }

  if (!existingVersion) {
    return {
      kind: "createNewVersionAndSurvey",
      jobId: job.id,
      registryId: existingRegistry.id,
    };
  }

  assertVersion(prepared, existingRegistry, existingVersion);
  if (!existingRegistry.surveyId || !existingSurvey) {
    throw new Error(`Version "${existingVersion.id}" has no complete Survey linkage`);
  }

  return {
    kind: "reuseVersionAndSurvey",
    jobId: job.id,
    registryId: existingRegistry.id,
    versionId: existingVersion.id,
    surveyId: existingSurvey.id,
  };
};
