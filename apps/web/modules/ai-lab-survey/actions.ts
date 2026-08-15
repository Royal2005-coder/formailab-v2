"use server";

import { logger } from "@formbricks/logger";
import { analyzeCompilationCompatibility } from "@formbricks/survey-compiler";
import { importCanonicalWorkbook, importLegacyCsv } from "@formbricks/survey-compiler/server";
import { AuthenticationError, AuthorizationError } from "@formbricks/types/errors";
import { authenticatedActionClient } from "@/lib/utils/action-client";
import { checkAuthorizationUpdated } from "@/lib/utils/action-client/action-client-middleware";
import { getOrganizationIdFromWorkspaceId } from "@/lib/utils/helper";
import { ZCommitAiLabCsvImportAction, ZValidateAiLabCsvImportAction } from "./actions.schema";
import { commitValidatedImport, createOrGetImportJob, recordImportValidation } from "./lib/service";

const authorizeWorkspaceWrite = async (userId: string, workspaceId: string) => {
  const organizationId = await getOrganizationIdFromWorkspaceId(workspaceId);

  await checkAuthorizationUpdated({
    userId,
    organizationId,
    access: [
      {
        type: "organization",
        roles: ["owner", "manager"],
      },
      {
        type: "workspaceTeam",
        minPermission: "readWrite",
        workspaceId,
      },
    ],
  });

  return organizationId;
};

export const validateAiLabCsvImportAction = authenticatedActionClient
  .inputSchema(ZValidateAiLabCsvImportAction)
  .action(async ({ ctx, parsedInput }) => {
    try {
      const organizationId = await authorizeWorkspaceWrite(ctx.user.id, parsedInput.workspaceId);

      let fileName = parsedInput.fileName ?? "survey.csv";
      let source: Uint8Array;

      if (parsedInput.file) {
        fileName = parsedInput.file.name;
        const arrayBuffer = await parsedInput.file.arrayBuffer();
        source = new Uint8Array(arrayBuffer);
      } else if (parsedInput.fileBase64) {
        const buffer = Buffer.from(parsedInput.fileBase64, "base64");
        source = new Uint8Array(buffer);
      } else {
        return {
          code: "AI_LAB_IMPORT_VALIDATION_FAILED" as const,
          importJobId: "",
          sourceChecksum: "",
          canonicalChecksum: "",
          canonicalSurvey: undefined,
          compatibility: undefined,
          diagnostics: [
            {
              severity: "error" as const,
              code: "file.empty",
              message: "Nội dung file không được để trống",
              externalId: undefined,
            },
          ],
        };
      }

      const isWorkbook = /\.(xlsx|xls)$/i.test(fileName);
      let result;
      try {
        result = isWorkbook
          ? importCanonicalWorkbook(source, { mode: "previewOnly" })
          : importLegacyCsv(source, { mode: "previewOnly" });
      } catch (parseErr) {
        logger.error(parseErr, "Failed to parse import CSV/Excel file");
        return {
          code: "AI_LAB_IMPORT_VALIDATION_FAILED" as const,
          importJobId: "",
          sourceChecksum: "",
          canonicalChecksum: "",
          canonicalSurvey: undefined,
          compatibility: undefined,
          diagnostics: [
            {
              severity: "error" as const,
              code: "file.parse_error",
              message: parseErr instanceof Error ? parseErr.message : "Failed to parse import CSV/Excel file",
              externalId: undefined,
            },
          ],
        };
      }

      const compatibility = result.canonicalSurvey
        ? analyzeCompilationCompatibility(result.canonicalSurvey)
        : undefined;
      const compilationDiagnostics =
        compatibility?.questions.flatMap((question) =>
          question.diagnostics.map((diagnostic) => ({
            severity: diagnostic.severity,
            code: `compiler.${diagnostic.code}`,
            message: diagnostic.message,
            externalId: question.externalId,
          }))
        ) ?? [];
      const diagnostics = [...result.diagnostics, ...compilationDiagnostics];
      const job = await createOrGetImportJob({
        workspaceId: parsedInput.workspaceId,
        mode: "createSurvey",
        sourceChecksum: result.sourceChecksum,
        sourceFileName: fileName.slice(0, 255),
        createdBy: ctx.user.id,
      });

      await recordImportValidation({
        workspaceId: parsedInput.workspaceId,
        importJobId: job.id,
        canonicalSurvey: result.canonicalSurvey,
        canonicalChecksum: result.canonicalChecksum,
        diagnostics,
      });

      ctx.auditLoggingCtx.organizationId = organizationId;
      ctx.auditLoggingCtx.workspaceId = parsedInput.workspaceId;

      const hasBlockingDiagnostics = diagnostics.some(
        (diagnostic) => diagnostic.severity === "error" || diagnostic.severity === "manualReview"
      );

      return {
        code: hasBlockingDiagnostics
          ? ("AI_LAB_IMPORT_VALIDATION_FAILED" as const)
          : ("AI_LAB_IMPORT_VALIDATED" as const),
        importJobId: job.id,
        sourceChecksum: result.sourceChecksum,
        canonicalChecksum: result.canonicalChecksum,
        canonicalSurvey: result.canonicalSurvey,
        compatibility,
        diagnostics,
      };
    } catch (err) {
      if (err instanceof AuthorizationError || err instanceof AuthenticationError) {
        throw err;
      }
      logger.error(err, "Unexpected error in validateAiLabCsvImportAction");
      return {
        code: "AI_LAB_IMPORT_VALIDATION_FAILED" as const,
        importJobId: "",
        sourceChecksum: "",
        canonicalChecksum: "",
        canonicalSurvey: undefined,
        compatibility: undefined,
        diagnostics: [
          {
            severity: "error" as const,
            code: "server.unexpected_error",
            message: err instanceof Error ? err.message : "Đã xảy ra lỗi không xác định trên máy chủ",
            externalId: undefined,
          },
        ],
      };
    }
  });

export const commitAiLabCsvImportAction = authenticatedActionClient
  .inputSchema(ZCommitAiLabCsvImportAction)
  .action(async ({ ctx, parsedInput }) => {
    try {
      const organizationId = await authorizeWorkspaceWrite(ctx.user.id, parsedInput.workspaceId);

      const result = await commitValidatedImport({
        workspaceId: parsedInput.workspaceId,
        importJobId: parsedInput.importJobId,
        expectedCanonicalChecksum: parsedInput.expectedCanonicalChecksum,
      });

      ctx.auditLoggingCtx.organizationId = organizationId;
      ctx.auditLoggingCtx.workspaceId = parsedInput.workspaceId;
      ctx.auditLoggingCtx.surveyId = result.surveyId;

      return {
        code: result.reused ? ("AI_LAB_IMPORT_COMMIT_REUSED" as const) : ("AI_LAB_IMPORT_COMMITTED" as const),
        importJobId: result.jobId,
        registryId: result.registryId,
        versionId: result.versionId,
        surveyId: result.surveyId,
        reused: result.reused,
      };
    } catch (error) {
      if (error instanceof AuthorizationError || error instanceof AuthenticationError) {
        throw error;
      }
      logger.error(error, "Error committing AI LAB CSV import");
      return {
        code: "AI_LAB_IMPORT_COMMIT_FAILED" as const,
        importJobId: parsedInput.importJobId,
        registryId: undefined,
        versionId: undefined,
        surveyId: undefined,
        reused: false,
        message: error instanceof Error ? error.message : "Đã xảy ra lỗi không xác định khi tạo bản nháp",
      };
    }
  });
