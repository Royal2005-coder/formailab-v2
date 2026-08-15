import { createHash } from "node:crypto";
import { beforeEach, describe, expect, test } from "vitest";
import { prisma } from "@formbricks/database";
import { type TCanonicalSurvey, ZCanonicalFormbricksArtifact } from "@formbricks/survey-compiler";
import { createCanonicalChecksum } from "@formbricks/survey-compiler/server";
import { resetDb } from "@/integration/reset-db";
import {
  commitImportedVersion,
  commitValidatedImport,
  createOrGetImportJob,
  publishSurveyVersion,
  recordImportValidation,
} from "@/modules/ai-lab-survey/lib/service";

const canonicalSurvey: TCanonicalSurvey = {
  schemaVersion: 1,
  externalId: "AI_LAB_DEMO",
  defaultLanguage: "en-US",
  languages: ["en-US"],
  title: { "en-US": "AI LAB demo" },
  groups: [{ externalId: "PROFILE", title: { "en-US": "Profile" }, order: 0 }],
  questions: [
    {
      externalId: "ROLE",
      groupExternalId: "PROFILE",
      type: "openText",
      label: { "en-US": "What is your role?" },
      order: 0,
      mandatory: true,
      options: [],
    },
    {
      externalId: "SCORE",
      groupExternalId: "PROFILE",
      type: "equation",
      label: { "en-US": "Calculated score" },
      order: 1,
      mandatory: false,
      calculation: "1 + 1",
      options: [],
    },
  ],
  variables: [],
  endings: [{ externalId: "THANK_YOU", title: { "en-US": "Thank you" } }],
};

const canonicalChecksum = createHash("sha256").update(JSON.stringify(canonicalSurvey)).digest("hex");

const createWorkspace = async (suffix: string) => {
  const organization = await prisma.organization.create({ data: { name: `AI LAB ${suffix}` } });
  return prisma.workspace.create({
    data: { name: `Workspace ${suffix}`, organizationId: organization.id },
  });
};

beforeEach(async () => {
  await resetDb();
});

describe("AI LAB survey persistence (real Postgres)", () => {
  test("commits a stored validated snapshot into one linked Survey and replays without duplicate writes", async () => {
    const workspace = await createWorkspace("validated-commit");
    const checksum = createCanonicalChecksum(canonicalSurvey);
    const job = await createOrGetImportJob({
      workspaceId: workspace.id,
      mode: "createSurvey",
      sourceChecksum: "validated-source",
      sourceFileName: "adaptive.csv",
    });
    await recordImportValidation({
      workspaceId: workspace.id,
      importJobId: job.id,
      canonicalSurvey,
      canonicalChecksum: checksum,
      diagnostics: [],
    });

    const first = await commitValidatedImport({
      workspaceId: workspace.id,
      importJobId: job.id,
      expectedCanonicalChecksum: checksum,
    });
    const replay = await commitValidatedImport({
      workspaceId: workspace.id,
      importJobId: job.id,
      expectedCanonicalChecksum: checksum,
    });

    expect(first).toMatchObject({ kind: "createNewVersionAndSurvey", reused: false });
    expect(replay).toMatchObject({
      kind: "completedReplay",
      reused: true,
      registryId: first.registryId,
      versionId: first.versionId,
      surveyId: first.surveyId,
    });
    expect(await prisma.survey.count({ where: { workspaceId: workspace.id } })).toBe(1);
    expect(await prisma.aILabSurveyVersion.count({ where: { registryId: first.registryId } })).toBe(1);

    const [survey, version, completedJob] = await Promise.all([
      prisma.survey.findUniqueOrThrow({ where: { id: first.surveyId } }),
      prisma.aILabSurveyVersion.findUniqueOrThrow({ where: { id: first.versionId } }),
      prisma.aILabSurveyImportJob.findUniqueOrThrow({ where: { id: job.id } }),
    ]);
    const versionArtifact = ZCanonicalFormbricksArtifact.parse(version.formbricksPayload);
    const jobArtifact = ZCanonicalFormbricksArtifact.parse(completedJob.generatedFormbricksPayload);

    expect(jobArtifact).toEqual(versionArtifact);
    expect(survey).toMatchObject({
      workspaceId: workspace.id,
      name: "AI LAB demo",
      type: "link",
      status: "draft",
      blocks: versionArtifact.payload.blocks,
      endings: versionArtifact.payload.endings,
      variables: versionArtifact.payload.variables,
    });
  });

  test("rejects a stale checksum and rolls back every commit-side write", async () => {
    const workspace = await createWorkspace("validated-rollback");
    const checksum = createCanonicalChecksum(canonicalSurvey);
    const job = await createOrGetImportJob({
      workspaceId: workspace.id,
      mode: "createSurvey",
      sourceChecksum: "rollback-source",
    });
    await recordImportValidation({
      workspaceId: workspace.id,
      importJobId: job.id,
      canonicalSurvey,
      canonicalChecksum: checksum,
      diagnostics: [],
    });

    await expect(
      commitValidatedImport({
        workspaceId: workspace.id,
        importJobId: job.id,
        expectedCanonicalChecksum: "stale-checksum",
      })
    ).rejects.toThrow("Canonical survey checksum mismatch");

    expect(await prisma.survey.count({ where: { workspaceId: workspace.id } })).toBe(0);
    expect(await prisma.aILabSurveyRegistry.count({ where: { workspaceId: workspace.id } })).toBe(0);
    expect(
      await prisma.aILabSurveyVersion.count({
        where: { registry: { workspaceId: workspace.id } },
      })
    ).toBe(0);
    expect(await prisma.aILabSurveyImportJob.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({
      status: "validated",
      registryId: null,
      versionId: null,
      generatedFormbricksPayload: null,
    });
  });

  test("serializes concurrent commits of the same canonical survey into one version and Survey", async () => {
    const workspace = await createWorkspace("concurrent-commit");
    const checksum = createCanonicalChecksum(canonicalSurvey);
    const jobs = await Promise.all(
      ["concurrent-source-a", "concurrent-source-b"].map(async (sourceChecksum) => {
        const job = await createOrGetImportJob({
          workspaceId: workspace.id,
          mode: "createSurvey",
          sourceChecksum,
        });
        await recordImportValidation({
          workspaceId: workspace.id,
          importJobId: job.id,
          canonicalSurvey,
          canonicalChecksum: checksum,
          diagnostics: [],
        });
        return job;
      })
    );

    const commits = await Promise.all(
      jobs.map((job) =>
        commitValidatedImport({
          workspaceId: workspace.id,
          importJobId: job.id,
          expectedCanonicalChecksum: checksum,
        })
      )
    );

    expect(new Set(commits.map((commit) => commit.registryId))).toHaveLength(1);
    expect(new Set(commits.map((commit) => commit.versionId))).toHaveLength(1);
    expect(new Set(commits.map((commit) => commit.surveyId))).toHaveLength(1);
    expect(await prisma.survey.count({ where: { workspaceId: workspace.id } })).toBe(1);
    expect(
      await prisma.aILabSurveyVersion.count({
        where: { registry: { workspaceId: workspace.id } },
      })
    ).toBe(1);
    expect(
      await prisma.aILabSurveyImportJob.count({
        where: { workspaceId: workspace.id, status: "completed" },
      })
    ).toBe(2);
  });

  test("retries of one source resolve to the same import job and canonical version", async () => {
    const workspace = await createWorkspace("idempotency");
    const importInput = {
      workspaceId: workspace.id,
      mode: "createSurvey" as const,
      sourceChecksum: "source-checksum-1",
      sourceFileName: "legacy-survey.csv",
    };

    const firstJob = await createOrGetImportJob(importInput);
    const retriedJob = await createOrGetImportJob(importInput);
    expect(retriedJob.id).toBe(firstJob.id);

    const firstCommit = await commitImportedVersion({
      workspaceId: workspace.id,
      importJobId: firstJob.id,
      externalId: canonicalSurvey.externalId,
      canonicalSurvey,
      canonicalChecksum,
      diagnostics: [],
    });
    const secondJob = await createOrGetImportJob({ ...importInput, sourceChecksum: "source-checksum-2" });
    const secondCommit = await commitImportedVersion({
      workspaceId: workspace.id,
      importJobId: secondJob.id,
      externalId: canonicalSurvey.externalId,
      canonicalSurvey,
      canonicalChecksum,
      diagnostics: [],
    });

    expect(firstCommit.reused).toBe(false);
    expect(secondCommit.reused).toBe(true);
    expect(secondCommit.version.id).toBe(firstCommit.version.id);
    expect(await prisma.aILabSurveyVersion.count({ where: { registryId: firstCommit.registry.id } })).toBe(1);
  });

  test("publishes only to a Survey in the registry workspace and rolls back every mutation on rejection", async () => {
    const ownerWorkspace = await createWorkspace("owner");
    const otherWorkspace = await createWorkspace("other");
    const foreignSurvey = await prisma.survey.create({
      data: { name: "Foreign survey", workspaceId: otherWorkspace.id },
    });
    const job = await createOrGetImportJob({
      workspaceId: ownerWorkspace.id,
      mode: "createSurvey",
      sourceChecksum: "tenant-source",
    });
    const committed = await commitImportedVersion({
      workspaceId: ownerWorkspace.id,
      importJobId: job.id,
      externalId: canonicalSurvey.externalId,
      canonicalSurvey,
      canonicalChecksum,
      diagnostics: [],
    });
    await prisma.aILabSurveyVersion.update({
      where: { id: committed.version.id },
      data: { status: "approved" },
    });

    await expect(
      publishSurveyVersion({
        workspaceId: ownerWorkspace.id,
        registryId: committed.registry.id,
        versionId: committed.version.id,
        surveyId: foreignSurvey.id,
      })
    ).rejects.toThrow();

    expect(
      await prisma.aILabSurveyPublication.count({
        where: { registry: { workspaceId: ownerWorkspace.id } },
      })
    ).toBe(0);
    expect(
      await prisma.aILabSurveyVersion.findUniqueOrThrow({ where: { id: committed.version.id } })
    ).toMatchObject({ status: "approved" });
    expect(
      await prisma.aILabSurveyRegistry.findUniqueOrThrow({ where: { id: committed.registry.id } })
    ).toMatchObject({ lifecycleStatus: "draft", surveyId: null });
  });

  test("derives the publication checksum from the immutable stored version", async () => {
    const workspace = await createWorkspace("checksum");
    const survey = await prisma.survey.create({
      data: { name: "Runtime survey", workspaceId: workspace.id },
    });
    const job = await createOrGetImportJob({
      workspaceId: workspace.id,
      mode: "createSurvey",
      sourceChecksum: "checksum-source",
    });
    const committed = await commitImportedVersion({
      workspaceId: workspace.id,
      importJobId: job.id,
      externalId: canonicalSurvey.externalId,
      canonicalSurvey,
      canonicalChecksum,
      diagnostics: [],
    });
    await prisma.aILabSurveyVersion.update({
      where: { id: committed.version.id },
      data: { status: "approved" },
    });

    const publication = await publishSurveyVersion({
      workspaceId: workspace.id,
      registryId: committed.registry.id,
      versionId: committed.version.id,
      surveyId: survey.id,
    });

    expect(publication.checksum).toBe(canonicalChecksum);
  });
});
