import "server-only";
import { prisma } from "@formbricks/database";
import { Prisma } from "@formbricks/database/prisma";
import { normalizeLanguageCode } from "@formbricks/i18n-utils";
import {
  type TCanonicalSurvey,
  type TImportDiagnostic,
  type TSurveyLifecycleStatus,
  ZCanonicalFormbricksArtifact,
  assertLifecycleTransition,
  assertPublicationReady,
  createImportIdempotencyKey,
} from "@formbricks/survey-compiler";
import { decideImportCommit } from "./import-commit-decision";
import { prepareValidatedImport } from "./prepare-validated-import";

type TImportMode =
  | "validateOnly"
  | "previewOnly"
  | "createSurvey"
  | "replaceDraft"
  | "createVersion"
  | "cloneTemplate";

const json = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;

const MAX_SERIALIZABLE_ATTEMPTS = 3;

const isSerializationConflict = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";

const withSerializableRetry = async <T>(operation: () => Promise<T>): Promise<T> => {
  let attempt = 1;

  while (true) {
    try {
      return await operation();
    } catch (error) {
      if (!isSerializationConflict(error) || attempt >= MAX_SERIALIZABLE_ATTEMPTS) {
        throw error;
      }
      attempt += 1;
    }
  }
};

export const createOrGetImportJob = async (
  input: Readonly<{
    workspaceId: string;
    registryId?: string;
    mode: TImportMode;
    sourceChecksum: string;
    sourceFileName?: string;
    createdBy?: string;
  }>
) => {
  const idempotencyKey = createImportIdempotencyKey(input);
  return prisma.aILabSurveyImportJob.upsert({
    where: { workspaceId_idempotencyKey: { workspaceId: input.workspaceId, idempotencyKey } },
    create: {
      workspaceId: input.workspaceId,
      registryId: input.registryId,
      mode: input.mode,
      sourceChecksum: input.sourceChecksum,
      sourceFileName: input.sourceFileName,
      createdBy: input.createdBy,
      idempotencyKey,
    },
    update: {},
  });
};

export const recordImportValidation = async (
  input: Readonly<{
    workspaceId: string;
    importJobId: string;
    canonicalSurvey?: TCanonicalSurvey;
    canonicalChecksum?: string;
    diagnostics: readonly TImportDiagnostic[];
  }>
) => {
  const hasBlockingDiagnostics = input.diagnostics.some(
    (diagnostic) => diagnostic.severity === "error" || diagnostic.severity === "manualReview"
  );
  return prisma.aILabSurveyImportJob.update({
    where: { id: input.importJobId, workspaceId: input.workspaceId },
    data: {
      status: hasBlockingDiagnostics ? "failed" : "validated",
      canonicalChecksum: input.canonicalChecksum,
      canonicalSnapshot: input.canonicalSurvey ? json(input.canonicalSurvey) : Prisma.JsonNull,
      diagnostics: json(input.diagnostics),
      ...(hasBlockingDiagnostics ? { completedAt: new Date() } : {}),
    },
  });
};

/**
 * Commits only the canonical snapshot persisted by the validation step. The caller supplies a checksum
 * as an optimistic concurrency token, but never supplies canonical or compiled survey data.
 */
export const commitValidatedImport = async (
  input: Readonly<{
    workspaceId: string;
    importJobId: string;
    expectedCanonicalChecksum: string;
  }>
) =>
  withSerializableRetry(() =>
    prisma.$transaction(
      async (transaction) => {
        const job = await transaction.aILabSurveyImportJob.findUniqueOrThrow({
          where: { id: input.importJobId, workspaceId: input.workspaceId },
        });

        if (!job.canonicalChecksum) {
          throw new Error(`Import job "${job.id}" has no validated canonical checksum`);
        }

        const prepared = prepareValidatedImport({
          canonicalSnapshot: job.canonicalSnapshot,
          storedCanonicalChecksum: job.canonicalChecksum,
          expectedCanonicalChecksum: input.expectedCanonicalChecksum,
          diagnostics: job.diagnostics,
        });
        const artifact = ZCanonicalFormbricksArtifact.parse(prepared.artifact);
        const existingRegistry = await transaction.aILabSurveyRegistry.findUnique({
          where: {
            workspaceId_externalId: {
              workspaceId: input.workspaceId,
              externalId: prepared.canonicalSurvey.externalId,
            },
          },
        });
        const existingVersion = existingRegistry
          ? await transaction.aILabSurveyVersion.findFirst({
              where:
                job.status === "completed" && job.versionId
                  ? { id: job.versionId, registryId: existingRegistry.id }
                  : {
                      registryId: existingRegistry.id,
                      canonicalChecksum: prepared.canonicalChecksum,
                    },
            })
          : null;
        const existingSurvey = existingRegistry?.surveyId
          ? await transaction.survey.findUnique({
              where: {
                id_workspaceId: {
                  id: existingRegistry.surveyId,
                  workspaceId: input.workspaceId,
                },
              },
              select: { id: true, workspaceId: true },
            })
          : null;
        const decision = decideImportCommit({
          job: {
            id: job.id,
            workspaceId: job.workspaceId,
            status: job.status,
            mode: job.mode,
            ...(job.registryId ? { registryId: job.registryId } : {}),
            ...(job.versionId ? { versionId: job.versionId } : {}),
          },
          prepared: {
            canonicalChecksum: prepared.canonicalChecksum,
            externalId: prepared.canonicalSurvey.externalId,
          },
          ...(existingRegistry
            ? {
                existingRegistry: {
                  id: existingRegistry.id,
                  workspaceId: existingRegistry.workspaceId,
                  externalId: existingRegistry.externalId,
                  ...(existingRegistry.surveyId ? { surveyId: existingRegistry.surveyId } : {}),
                },
              }
            : {}),
          ...(existingVersion
            ? {
                existingVersion: {
                  id: existingVersion.id,
                  registryId: existingVersion.registryId,
                  canonicalChecksum: existingVersion.canonicalChecksum,
                },
              }
            : {}),
          ...(existingSurvey ? { existingSurvey } : {}),
        });

        if (decision.kind === "completedReplay") {
          return { ...decision, reused: true } as const;
        }

        if (decision.kind === "reuseVersionAndSurvey") {
          await transaction.aILabSurveyImportJob.update({
            where: { id: job.id, workspaceId: input.workspaceId },
            data: {
              registryId: decision.registryId,
              versionId: decision.versionId,
              status: "completed",
              generatedFormbricksPayload: json(artifact),
              completedAt: new Date(),
            },
          });
          return { ...decision, reused: true } as const;
        }

        const registry =
          existingRegistry ??
          (await transaction.aILabSurveyRegistry.upsert({
            where: {
              workspaceId_externalId: {
                workspaceId: input.workspaceId,
                externalId: prepared.canonicalSurvey.externalId,
              },
            },
            create: {
              workspaceId: input.workspaceId,
              externalId: prepared.canonicalSurvey.externalId,
            },
            update: {},
          }));
        const latestVersion = await transaction.aILabSurveyVersion.findFirst({
          where: { registryId: registry.id },
          orderBy: { version: "desc" },
          select: { version: true },
        });
        const version = await transaction.aILabSurveyVersion.create({
          data: {
            registryId: registry.id,
            version: (latestVersion?.version ?? 0) + 1,
            schemaVersion: prepared.canonicalSurvey.schemaVersion,
            canonicalChecksum: prepared.canonicalChecksum,
            canonicalSnapshot: json(prepared.canonicalSurvey),
            formbricksPayload: json(artifact),
            createdBy: job.createdBy,
          },
        });
        const canonicalLangs = [
          ...new Set([prepared.canonicalSurvey.defaultLanguage, ...prepared.canonicalSurvey.languages]),
        ];

        const surveyLanguageCreates: Array<{ languageId: string; default: boolean; enabled: boolean }> = [];

        for (const langCode of canonicalLangs) {
          const normalizedCode = normalizeLanguageCode(langCode) || langCode.toLowerCase();
          let language = await transaction.language.findFirst({
            where: {
              workspaceId: input.workspaceId,
              code: normalizedCode,
            },
          });

          if (!language) {
            language = await transaction.language.create({
              data: {
                workspaceId: input.workspaceId,
                code: normalizedCode,
              },
            });
          }

          surveyLanguageCreates.push({
            languageId: language.id,
            default: langCode === prepared.canonicalSurvey.defaultLanguage,
            enabled: true,
          });
        }

        const payload = artifact.payload;
        const survey = await transaction.survey.create({
          data: {
            workspaceId: input.workspaceId,
            name: payload.name,
            type: payload.type,
            status: payload.status,
            questions: json(payload.questions ?? []),
            blocks: (payload.blocks ?? []).map(json),
            endings: (payload.endings ?? []).map(json),
            variables: json(payload.variables ?? []),
            createdBy: job.createdBy,
            languages: {
              create: surveyLanguageCreates,
            },
          },
          select: { id: true, workspaceId: true },
        });

        await transaction.aILabSurveyRegistry.update({
          where: { id: registry.id, workspaceId: input.workspaceId },
          data: { surveyId: survey.id },
        });
        await transaction.aILabSurveyImportJob.update({
          where: { id: job.id, workspaceId: input.workspaceId },
          data: {
            registryId: registry.id,
            versionId: version.id,
            status: "completed",
            generatedFormbricksPayload: json(artifact),
            completedAt: new Date(),
          },
        });

        return {
          kind: "createNewVersionAndSurvey",
          jobId: job.id,
          registryId: registry.id,
          versionId: version.id,
          surveyId: survey.id,
          reused: false,
        } as const;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    )
  );

export const commitImportedVersion = async (
  input: Readonly<{
    workspaceId: string;
    importJobId: string;
    externalId: string;
    canonicalSurvey: TCanonicalSurvey;
    canonicalChecksum: string;
    diagnostics: readonly TImportDiagnostic[];
    formbricksPayload?: Prisma.InputJsonValue;
    createdBy?: string;
  }>
) => {
  assertPublicationReady(input.diagnostics);
  return prisma.$transaction(
    async (transaction) => {
      const job = await transaction.aILabSurveyImportJob.findUniqueOrThrow({
        where: { id: input.importJobId, workspaceId: input.workspaceId },
      });
      const registry = await transaction.aILabSurveyRegistry.upsert({
        where: { workspaceId_externalId: { workspaceId: input.workspaceId, externalId: input.externalId } },
        create: { workspaceId: input.workspaceId, externalId: input.externalId },
        update: {},
      });
      const existingVersion = await transaction.aILabSurveyVersion.findUnique({
        where: {
          registryId_canonicalChecksum: {
            registryId: registry.id,
            canonicalChecksum: input.canonicalChecksum,
          },
        },
      });
      if (existingVersion) {
        await transaction.aILabSurveyImportJob.update({
          where: { id: job.id },
          data: {
            registryId: registry.id,
            versionId: existingVersion.id,
            status: "completed",
            completedAt: new Date(),
          },
        });
        return { registry, version: existingVersion, reused: true } as const;
      }
      const latestVersion = await transaction.aILabSurveyVersion.findFirst({
        where: { registryId: registry.id },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      const version = await transaction.aILabSurveyVersion.create({
        data: {
          registryId: registry.id,
          version: (latestVersion?.version ?? 0) + 1,
          schemaVersion: input.canonicalSurvey.schemaVersion,
          canonicalChecksum: input.canonicalChecksum,
          canonicalSnapshot: json(input.canonicalSurvey),
          formbricksPayload: input.formbricksPayload,
          createdBy: input.createdBy,
        },
      });
      await transaction.aILabSurveyImportJob.update({
        where: { id: job.id },
        data: {
          registryId: registry.id,
          versionId: version.id,
          status: "completed",
          canonicalChecksum: input.canonicalChecksum,
          canonicalSnapshot: json(input.canonicalSurvey),
          generatedFormbricksPayload: input.formbricksPayload,
          diagnostics: json(input.diagnostics),
          completedAt: new Date(),
        },
      });
      return { registry, version, reused: false } as const;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
};

export const transitionSurveyRegistry = async (
  input: Readonly<{
    workspaceId: string;
    registryId: string;
    from: TSurveyLifecycleStatus;
    to: TSurveyLifecycleStatus;
  }>
) => {
  assertLifecycleTransition(input.from, input.to);
  return prisma.aILabSurveyRegistry.update({
    where: { id: input.registryId, workspaceId: input.workspaceId, lifecycleStatus: input.from },
    data: { lifecycleStatus: input.to },
  });
};

export const publishSurveyVersion = async (
  input: Readonly<{
    workspaceId: string;
    registryId: string;
    versionId: string;
    surveyId: string;
    publishedBy?: string;
  }>
) =>
  prisma.$transaction(async (transaction) => {
    const registry = await transaction.aILabSurveyRegistry.findUniqueOrThrow({
      where: { id: input.registryId, workspaceId: input.workspaceId },
    });
    const version = await transaction.aILabSurveyVersion.findUniqueOrThrow({
      where: { id: input.versionId, registryId: registry.id, status: "approved" },
    });
    await transaction.survey.findUniqueOrThrow({
      where: { id_workspaceId: { id: input.surveyId, workspaceId: input.workspaceId } },
      select: { id: true },
    });
    const publication = await transaction.aILabSurveyPublication.create({
      data: {
        registryId: registry.id,
        versionId: version.id,
        surveyId: input.surveyId,
        checksum: version.canonicalChecksum,
        publishedBy: input.publishedBy,
      },
    });
    await Promise.all([
      transaction.aILabSurveyVersion.update({ where: { id: version.id }, data: { status: "published" } }),
      transaction.aILabSurveyRegistry.update({
        where: { id: registry.id },
        data: { surveyId: input.surveyId, lifecycleStatus: "published" },
      }),
    ]);
    return publication;
  });

export const getAILabWorkspaceStats = async (workspaceId: string) => {
  const [registries, versions, publications, jobs, recentJobs, responseSummary] = await Promise.all([
    prisma.aILabSurveyRegistry.count({ where: { workspaceId } }),
    prisma.aILabSurveyVersion.count({ where: { registry: { workspaceId } } }),
    prisma.aILabSurveyPublication.count({ where: { registry: { workspaceId } } }),
    prisma.aILabSurveyImportJob.count({ where: { workspaceId } }),
    prisma.aILabSurveyImportJob.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        mode: true,
        status: true,
        sourceFileName: true,
        sourceChecksum: true,
        canonicalChecksum: true,
        createdAt: true,
        completedAt: true,
        diagnostics: true,
      },
    }),
    prisma.response.findMany({
      where: { survey: { workspaceId } },
      select: { id: true, surveyId: true, finished: true, createdAt: true, data: true, variables: true },
      orderBy: { createdAt: "desc" },
      take: 5000,
    }),
  ]);

  const completedResponses = responseSummary.filter((response) => response.finished).length;
  const numericScores = responseSummary.flatMap((response) =>
    Object.values((response.variables ?? {}) as Record<string, unknown>).flatMap((value) => {
      const number = typeof value === "number" ? value : Number(value);
      return Number.isFinite(number) && number >= 0 && number <= 100 ? [number] : [];
    })
  );

  return {
    registriesCount: registries,
    versionsCount: versions,
    publicationsCount: publications,
    importJobsCount: jobs,
    recentJobs,
    responseCount: responseSummary.length,
    completedResponseCount: completedResponses,
    completionRate: responseSummary.length ? (completedResponses / responseSummary.length) * 100 : 0,
    averageScore: numericScores.length
      ? numericScores.reduce((total, score) => total + score, 0) / numericScores.length
      : null,
    responses: responseSummary,
  };
};

export const getAILabQuestionStatistics = async (workspaceId: string) => {
  const surveys = await prisma.survey.findMany({
    where: { workspaceId },
    select: {
      id: true,
      name: true,
      status: true,
      createdAt: true,
      _count: { select: { responses: true } },
      responses: {
        take: 500,
        select: {
          id: true,
          data: true,
          createdAt: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return surveys.map((s) => ({
    id: s.id,
    name: s.name,
    status: s.status,
    createdAt: s.createdAt,
    responseCount: s._count.responses,
    responses: s.responses,
  }));
};
