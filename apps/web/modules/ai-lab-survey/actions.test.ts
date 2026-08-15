import { File } from "node:buffer";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { AuthorizationError } from "@formbricks/types/errors";
import { commitAiLabCsvImportAction, validateAiLabCsvImportAction } from "./actions";
import { ZCommitAiLabCsvImportAction, ZValidateAiLabCsvImportAction } from "./actions.schema";

const mocks = vi.hoisted(() => ({
  analyzeCompilationCompatibility: vi.fn(),
  checkAuthorizationUpdated: vi.fn(),
  commitValidatedImport: vi.fn(),
  createOrGetImportJob: vi.fn(),
  getOrganizationIdFromWorkspaceId: vi.fn(),
  importLegacyCsv: vi.fn(),
  importCanonicalWorkbook: vi.fn(),
  recordImportValidation: vi.fn(),
}));

vi.mock("@/lib/utils/action-client", () => ({
  authenticatedActionClient: {
    inputSchema: vi.fn(() => ({
      action: vi.fn((callback) => callback),
    })),
  },
}));

vi.mock("@/lib/utils/action-client/action-client-middleware", () => ({
  checkAuthorizationUpdated: mocks.checkAuthorizationUpdated,
}));

vi.mock("@/lib/utils/helper", () => ({
  getOrganizationIdFromWorkspaceId: mocks.getOrganizationIdFromWorkspaceId,
}));

vi.mock("@formbricks/survey-compiler/server", () => ({
  importCanonicalWorkbook: mocks.importCanonicalWorkbook,
  importLegacyCsv: mocks.importLegacyCsv,
}));

Object.defineProperty(globalThis, "File", { configurable: true, value: File });

vi.mock("@formbricks/survey-compiler", () => ({
  analyzeCompilationCompatibility: mocks.analyzeCompilationCompatibility,
}));

vi.mock("./lib/service", () => ({
  commitValidatedImport: mocks.commitValidatedImport,
  createOrGetImportJob: mocks.createOrGetImportJob,
  recordImportValidation: mocks.recordImportValidation,
}));

const workspaceId = "cm9gptbhg0000192zceq9ayuc";
const importJobId = "cm9gptbhg0001192zceq9ayud";
const canonicalChecksum = "a".repeat(64);
const sourceChecksum = "b".repeat(64);

const createCtx = () => ({
  user: { id: "user_1" },
  auditLoggingCtx: {},
});

describe("AI LAB survey import actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOrganizationIdFromWorkspaceId.mockResolvedValue("organization_1");
    mocks.checkAuthorizationUpdated.mockResolvedValue(true);
    mocks.createOrGetImportJob.mockResolvedValue({ id: importJobId });
    mocks.recordImportValidation.mockResolvedValue({ id: importJobId });
    mocks.analyzeCompilationCompatibility.mockReturnValue({
      questions: [],
      summary: { total: 1, supported: 1, manualReview: 0, invalid: 0, errors: 0 },
    });
  });

  test("validates CSV file constraints at the action boundary", () => {
    expect(
      ZValidateAiLabCsvImportAction.safeParse({
        workspaceId,
        file: new File(["class,name,text\nS,survey,Demo"], "survey.csv", { type: "text/csv" }),
      }).success
    ).toBe(true);
    expect(
      ZValidateAiLabCsvImportAction.safeParse({
        workspaceId,
        file: new File([new Uint8Array([80, 75, 3, 4])], "survey.xlsx", {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      }).success
    ).toBe(true);
    expect(
      ZValidateAiLabCsvImportAction.safeParse({
        workspaceId,
        file: new File(["not csv"], "survey.exe", { type: "application/octet-stream" }),
      }).success
    ).toBe(false);
    expect(
      ZValidateAiLabCsvImportAction.safeParse({
        workspaceId,
        file: new File([new Uint8Array(10 * 1024 * 1024 + 1)], "survey.csv", { type: "text/csv" }),
      }).success
    ).toBe(false);
  });

  test("requires ids and a SHA-256 checksum for commit", () => {
    expect(
      ZCommitAiLabCsvImportAction.safeParse({
        workspaceId,
        importJobId,
        expectedCanonicalChecksum: canonicalChecksum,
      }).success
    ).toBe(true);
    expect(
      ZCommitAiLabCsvImportAction.safeParse({
        workspaceId,
        importJobId,
        expectedCanonicalChecksum: "not-a-checksum",
      }).success
    ).toBe(false);
  });

  test("authorizes workspace write, imports on the server and persists validation", async () => {
    const file = new File(["class,name,text\nS,survey,Demo"], "survey.csv", { type: "text/csv" });
    const canonicalSurvey = { schemaVersion: 1, externalId: "DEMO" };
    mocks.importLegacyCsv.mockReturnValue({
      mode: "previewOnly",
      sourceChecksum,
      canonicalChecksum,
      canonicalSurvey,
      diagnostics: [],
    });
    const ctx = createCtx();

    const result = await validateAiLabCsvImportAction({
      ctx,
      parsedInput: { workspaceId, file },
    } as never);

    expect(mocks.checkAuthorizationUpdated).toHaveBeenCalledWith({
      userId: "user_1",
      organizationId: "organization_1",
      access: [
        { type: "organization", roles: ["owner", "manager"] },
        { type: "workspaceTeam", minPermission: "readWrite", workspaceId },
      ],
    });
    expect(mocks.importLegacyCsv).toHaveBeenCalledWith(expect.any(Uint8Array), {
      mode: "previewOnly",
    });
    expect(mocks.createOrGetImportJob).toHaveBeenCalledWith({
      workspaceId,
      mode: "createSurvey",
      sourceChecksum,
      sourceFileName: "survey.csv",
      createdBy: "user_1",
    });
    expect(mocks.recordImportValidation).toHaveBeenCalledWith({
      workspaceId,
      importJobId,
      canonicalSurvey,
      canonicalChecksum,
      diagnostics: [],
    });
    expect(ctx.auditLoggingCtx).toEqual({
      organizationId: "organization_1",
      workspaceId,
    });
    expect(result).toMatchObject({
      code: "AI_LAB_IMPORT_VALIDATED",
      importJobId,
      canonicalChecksum,
      compatibility: {
        summary: { total: 1, supported: 1, manualReview: 0, invalid: 0, errors: 0 },
      },
    });
  });

  test("persists failed validation diagnostics without committing a survey", async () => {
    const diagnostics = [
      {
        severity: "error",
        code: "csv.parse.invalid",
        message: "Invalid CSV",
      },
    ];
    mocks.importLegacyCsv.mockReturnValue({
      mode: "previewOnly",
      sourceChecksum,
      diagnostics,
    });

    const result = await validateAiLabCsvImportAction({
      ctx: createCtx(),
      parsedInput: {
        workspaceId,
        file: new File(["broken"], "broken.csv", { type: "text/csv" }),
      },
    } as never);

    expect(mocks.recordImportValidation).toHaveBeenCalledWith({
      workspaceId,
      importJobId,
      canonicalSurvey: undefined,
      canonicalChecksum: undefined,
      diagnostics,
    });
    expect(result).toMatchObject({
      code: "AI_LAB_IMPORT_VALIDATION_FAILED",
      importJobId,
    });
    expect(mocks.commitValidatedImport).not.toHaveBeenCalled();
  });

  test("blocks validation when compiler compatibility requires manual review", async () => {
    const canonicalSurvey = { schemaVersion: 1, externalId: "DEMO" };
    mocks.importLegacyCsv.mockReturnValue({
      mode: "previewOnly",
      sourceChecksum,
      canonicalChecksum,
      canonicalSurvey,
      diagnostics: [],
    });
    mocks.analyzeCompilationCompatibility.mockReturnValue({
      questions: [
        {
          externalId: "Q109",
          diagnostics: [
            {
              severity: "manualReview",
              code: "expression.unsupported",
              message: "Expression requires the extended runtime",
            },
          ],
        },
      ],
      summary: { total: 1, supported: 0, manualReview: 1, invalid: 0, errors: 0 },
    });

    const result = await validateAiLabCsvImportAction({
      ctx: createCtx(),
      parsedInput: {
        workspaceId,
        file: new File(["class,name,text"], "survey.csv", { type: "text/csv" }),
      },
    } as never);

    expect(mocks.recordImportValidation).toHaveBeenCalledWith({
      workspaceId,
      importJobId,
      canonicalSurvey,
      canonicalChecksum,
      diagnostics: [
        {
          severity: "manualReview",
          code: "compiler.expression.unsupported",
          message: "Expression requires the extended runtime",
          externalId: "Q109",
        },
      ],
    });
    expect(result).toMatchObject({
      code: "AI_LAB_IMPORT_VALIDATION_FAILED",
      compatibility: {
        summary: { manualReview: 1 },
      },
    });
  });

  test("stops before parsing or persistence when authorization fails", async () => {
    mocks.checkAuthorizationUpdated.mockRejectedValueOnce(new AuthorizationError("Not authorized"));

    await expect(
      validateAiLabCsvImportAction({
        ctx: createCtx(),
        parsedInput: {
          workspaceId,
          file: new File(["class,name,text"], "survey.csv", { type: "text/csv" }),
        },
      } as never)
    ).rejects.toThrow(AuthorizationError);

    expect(mocks.importLegacyCsv).not.toHaveBeenCalled();
    expect(mocks.createOrGetImportJob).not.toHaveBeenCalled();
    expect(mocks.recordImportValidation).not.toHaveBeenCalled();
  });

  test("commits only trusted job identifiers and the optimistic checksum", async () => {
    mocks.commitValidatedImport.mockResolvedValue({
      kind: "createNewVersionAndSurvey",
      jobId: importJobId,
      registryId: "registry_1",
      versionId: "version_1",
      surveyId: "survey_1",
      reused: false,
    });
    const ctx = createCtx();

    const result = await commitAiLabCsvImportAction({
      ctx,
      parsedInput: {
        workspaceId,
        importJobId,
        expectedCanonicalChecksum: canonicalChecksum,
      },
    } as never);

    expect(mocks.commitValidatedImport).toHaveBeenCalledWith({
      workspaceId,
      importJobId,
      expectedCanonicalChecksum: canonicalChecksum,
    });
    expect(ctx.auditLoggingCtx).toEqual({
      organizationId: "organization_1",
      workspaceId,
      surveyId: "survey_1",
    });
    expect(result).toEqual({
      code: "AI_LAB_IMPORT_COMMITTED",
      importJobId,
      registryId: "registry_1",
      versionId: "version_1",
      surveyId: "survey_1",
      reused: false,
    });
  });

  test("does not call the commit service when workspace authorization fails", async () => {
    mocks.checkAuthorizationUpdated.mockRejectedValueOnce(new AuthorizationError("Not authorized"));

    await expect(
      commitAiLabCsvImportAction({
        ctx: createCtx(),
        parsedInput: {
          workspaceId,
          importJobId,
          expectedCanonicalChecksum: canonicalChecksum,
        },
      } as never)
    ).rejects.toThrow(AuthorizationError);

    expect(mocks.commitValidatedImport).not.toHaveBeenCalled();
  });

  test("returns a structured failure instead of throwing when the commit service fails", async () => {
    mocks.commitValidatedImport.mockRejectedValueOnce(new Error("Commit service exploded"));

    const result = await commitAiLabCsvImportAction({
      ctx: createCtx(),
      parsedInput: {
        workspaceId,
        importJobId,
        expectedCanonicalChecksum: canonicalChecksum,
      },
    } as never);

    expect(result).toMatchObject({
      code: "AI_LAB_IMPORT_COMMIT_FAILED",
      importJobId,
      surveyId: undefined,
      reused: false,
      message: "Commit service exploded",
    });
    expect(mocks.commitValidatedImport).toHaveBeenCalledTimes(1);
  });

  test("rejects non-serializable commit service failures as a structured message, not a raw throw", async () => {
    mocks.commitValidatedImport.mockRejectedValueOnce("boom");

    const result = await commitAiLabCsvImportAction({
      ctx: createCtx(),
      parsedInput: {
        workspaceId,
        importJobId,
        expectedCanonicalChecksum: canonicalChecksum,
      },
    } as never);

    expect(result).toMatchObject({
      code: "AI_LAB_IMPORT_COMMIT_FAILED",
      surveyId: undefined,
      message: "Đã xảy ra lỗi không xác định khi tạo bản nháp",
    });
  });

  test("validates the base64 payload against the 10 MiB boundary", () => {
    const base64ForSize = (sizeInBytes: number) =>
      Buffer.from(new Uint8Array(sizeInBytes)).toString("base64");

    expect(
      ZValidateAiLabCsvImportAction.safeParse({
        workspaceId,
        fileName: "survey.csv",
        fileBase64: base64ForSize(10 * 1024 * 1024),
      }).success
    ).toBe(true);
    expect(
      ZValidateAiLabCsvImportAction.safeParse({
        workspaceId,
        fileName: "survey.xlsx",
        fileBase64: base64ForSize(10 * 1024 * 1024 + 1),
      }).success
    ).toBe(false);
  });
});
