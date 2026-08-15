-- CreateEnum
CREATE TYPE "AILabSurveyLifecycleStatus" AS ENUM ('draft', 'underReview', 'approved', 'published', 'active', 'paused', 'closed', 'archived');
CREATE TYPE "AILabSurveyVersionStatus" AS ENUM ('draft', 'underReview', 'approved', 'published', 'superseded');
CREATE TYPE "AILabImportJobStatus" AS ENUM ('pending', 'validating', 'validated', 'committing', 'completed', 'failed', 'rolledBack');
CREATE TYPE "AILabImportMode" AS ENUM ('validateOnly', 'previewOnly', 'createSurvey', 'replaceDraft', 'createVersion', 'cloneTemplate');

CREATE TABLE "AILabSurveyRegistry" (
  "id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "surveyId" TEXT,
  "externalId" TEXT NOT NULL,
  "lifecycleStatus" "AILabSurveyLifecycleStatus" NOT NULL DEFAULT 'draft',
  CONSTRAINT "AILabSurveyRegistry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AILabSurveyVersion" (
  "id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "registryId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "AILabSurveyVersionStatus" NOT NULL DEFAULT 'draft',
  "schemaVersion" INTEGER NOT NULL,
  "canonicalChecksum" TEXT NOT NULL,
  "canonicalSnapshot" JSONB NOT NULL,
  "formbricksPayload" JSONB,
  "createdBy" TEXT,
  CONSTRAINT "AILabSurveyVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AILabSurveyPublication" (
  "id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "registryId" TEXT NOT NULL,
  "versionId" TEXT NOT NULL,
  "surveyId" TEXT NOT NULL,
  "checksum" TEXT NOT NULL,
  "publishedBy" TEXT,
  CONSTRAINT "AILabSurveyPublication_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AILabSurveyImportJob" (
  "id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "registryId" TEXT,
  "versionId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "mode" "AILabImportMode" NOT NULL,
  "status" "AILabImportJobStatus" NOT NULL DEFAULT 'pending',
  "sourceFileName" TEXT,
  "sourceChecksum" TEXT NOT NULL,
  "canonicalChecksum" TEXT,
  "canonicalSnapshot" JSONB,
  "generatedFormbricksPayload" JSONB,
  "previousDraftSnapshot" JSONB,
  "diagnostics" JSONB NOT NULL DEFAULT '[]',
  "createdBy" TEXT,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "AILabSurveyImportJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AILabSurveyRegistry_surveyId_key" ON "AILabSurveyRegistry"("surveyId");
CREATE UNIQUE INDEX "AILabSurveyRegistry_workspaceId_externalId_key" ON "AILabSurveyRegistry"("workspaceId", "externalId");
CREATE INDEX "AILabSurveyRegistry_workspaceId_updatedAt_idx" ON "AILabSurveyRegistry"("workspaceId", "updated_at");
CREATE UNIQUE INDEX "AILabSurveyVersion_registryId_version_key" ON "AILabSurveyVersion"("registryId", "version");
CREATE UNIQUE INDEX "AILabSurveyVersion_registryId_canonicalChecksum_key" ON "AILabSurveyVersion"("registryId", "canonicalChecksum");
CREATE INDEX "AILabSurveyVersion_registryId_createdAt_idx" ON "AILabSurveyVersion"("registryId", "created_at");
CREATE UNIQUE INDEX "AILabSurveyPublication_versionId_key" ON "AILabSurveyPublication"("versionId");
CREATE INDEX "AILabSurveyPublication_registryId_createdAt_idx" ON "AILabSurveyPublication"("registryId", "created_at");
CREATE INDEX "AILabSurveyPublication_surveyId_createdAt_idx" ON "AILabSurveyPublication"("surveyId", "created_at");
CREATE UNIQUE INDEX "AILabSurveyImportJob_workspaceId_idempotencyKey_key" ON "AILabSurveyImportJob"("workspaceId", "idempotencyKey");
CREATE INDEX "AILabSurveyImportJob_workspaceId_createdAt_idx" ON "AILabSurveyImportJob"("workspaceId", "created_at");
CREATE INDEX "AILabSurveyImportJob_registryId_createdAt_idx" ON "AILabSurveyImportJob"("registryId", "created_at");
CREATE INDEX "AILabSurveyImportJob_status_updatedAt_idx" ON "AILabSurveyImportJob"("status", "updated_at");

ALTER TABLE "AILabSurveyRegistry" ADD CONSTRAINT "AILabSurveyRegistry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AILabSurveyRegistry" ADD CONSTRAINT "AILabSurveyRegistry_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AILabSurveyVersion" ADD CONSTRAINT "AILabSurveyVersion_registryId_fkey" FOREIGN KEY ("registryId") REFERENCES "AILabSurveyRegistry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AILabSurveyPublication" ADD CONSTRAINT "AILabSurveyPublication_registryId_fkey" FOREIGN KEY ("registryId") REFERENCES "AILabSurveyRegistry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AILabSurveyPublication" ADD CONSTRAINT "AILabSurveyPublication_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "AILabSurveyVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AILabSurveyPublication" ADD CONSTRAINT "AILabSurveyPublication_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AILabSurveyImportJob" ADD CONSTRAINT "AILabSurveyImportJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AILabSurveyImportJob" ADD CONSTRAINT "AILabSurveyImportJob_registryId_fkey" FOREIGN KEY ("registryId") REFERENCES "AILabSurveyRegistry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AILabSurveyImportJob" ADD CONSTRAINT "AILabSurveyImportJob_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "AILabSurveyVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
