"use client";

import { DownloadIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { commitAiLabCsvImportAction, validateAiLabCsvImportAction } from "@/modules/ai-lab-survey/actions";
import { MAX_AI_LAB_IMPORT_FILE_SIZE } from "@/modules/ai-lab-survey/actions.schema";
import {
  isAllowedImportFileName,
  isAllowedImportFileType,
  resolveActionError,
} from "@/modules/ai-lab-survey/lib/import-file-guard";
import { Alert, AlertDescription, AlertTitle } from "@/modules/ui/components/alert";
import { Badge } from "@/modules/ui/components/badge";
import { Button } from "@/modules/ui/components/button";
import { FileDropZone } from "@/modules/ui/components/file-drop-zone";

type TValidationData = NonNullable<
  NonNullable<Awaited<ReturnType<typeof validateAiLabCsvImportAction>>>["data"]
>;

interface ImportReviewProps {
  workspaceId: string;
  isReadOnly: boolean;
}

const Metric = ({
  label,
  value,
  tone = "default",
}: Readonly<{
  label: string;
  value: number;
  tone?: "default" | "success" | "warning" | "error";
}>) => {
  const toneClass = {
    default: "text-slate-900",
    success: "text-emerald-700",
    warning: "text-amber-700",
    error: "text-red-700",
  }[tone];

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
};

export const ImportReview = ({ workspaceId, isReadOnly }: Readonly<ImportReviewProps>) => {
  const { t } = useTranslation();
  const router = useRouter();
  const [isValidating, setIsValidating] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [validation, setValidation] = useState<TValidationData>();

  const handleDownloadTemplate = () => {
    const link = document.createElement("a");
    link.href = "/sample-csv/AILAB_120Q_Advanced_Adaptive_2026_Master_Template.xlsx";
    link.download = "AILAB_120Q_Advanced_Adaptive_2026_Master_Template.xlsx";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadSkill = () => {
    const link = document.createElement("a");
    link.href = "/sample-csv/AI_LAB_SURVEY_IMPORT_SKILL.md";
    link.download = "AI_LAB_SURVEY_IMPORT_SKILL.md";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const diagnosticCounts = useMemo(() => {
    const diagnostics = validation?.diagnostics ?? [];
    return {
      errors: diagnostics.filter(({ severity }) => severity === "error").length,
      warnings: diagnostics.filter(({ severity }) => severity === "warning").length,
      manualReview: diagnostics.filter(({ severity }) => severity === "manualReview").length,
    };
  }, [validation]);

  const isBlocked =
    !validation ||
    validation.code !== "AI_LAB_IMPORT_VALIDATED" ||
    diagnosticCounts.errors > 0 ||
    diagnosticCounts.manualReview > 0;
  const severityLabel = (severity: "error" | "warning" | "manualReview") =>
    severity === "manualReview"
      ? t("workspace.surveys.ai_lab_import.manual_review")
      : t(`workspace.surveys.ai_lab_import.${severity === "error" ? "errors" : "warnings"}`);

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result?.split(",")[1];
        if (base64) resolve(base64);
        else reject(new Error("Không thể đọc nội dung file"));
      };
      reader.onerror = () => reject(reader.error ?? new Error("Lỗi khi đọc file"));
      reader.readAsDataURL(file);
    });
  };

  const handleFileSelect = async (file: File) => {
    setIsValidating(true);
    setValidation(undefined);

    const validationFallback = t("workspace.surveys.ai_lab_import.validation_failed");

    if (!isAllowedImportFileName(file.name) || !isAllowedImportFileType(file)) {
      toast.error("Định dạng file không hợp lệ. Vui lòng chọn file .csv, .xlsx, hoặc .xls");
      setIsValidating(false);
      return;
    }

    if (file.size > MAX_AI_LAB_IMPORT_FILE_SIZE) {
      toast.error("File vượt quá dung lượng tối đa 10 MiB.");
      setIsValidating(false);
      return;
    }

    try {
      const fileBase64 = await readFileAsBase64(file);

      const response = await validateAiLabCsvImportAction({
        workspaceId,
        fileName: file.name,
        fileBase64,
      }).catch((err) => ({
        serverError: resolveActionError(err, validationFallback),
        data: undefined,
        validationErrors: undefined,
      }));
      if (response?.validationErrors) {
        const valErrors = response.validationErrors as Record<string, unknown>;
        const messages = Object.values(valErrors)
          .flatMap((err) => {
            if (typeof err === "string") return [err];
            if (Array.isArray(err)) return err;
            if (err && typeof err === "object" && "_errors" in err && Array.isArray(err._errors))
              return err._errors as string[];
            return [];
          })
          .filter(Boolean);
        toast.error(messages.length > 0 ? messages.join("; ") : validationFallback);
        return;
      }
      if (response?.serverError || !response?.data) {
        toast.error(resolveActionError(response?.serverError, validationFallback));
        return;
      }

      setValidation(response.data);
      if (response.data.code === "AI_LAB_IMPORT_VALIDATED") {
        toast.success(t("workspace.surveys.ai_lab_import.validation_ready"));
      } else if (response.data.diagnostics?.length) {
        const firstError = response.data.diagnostics.find(
          (d) => d.severity === "error" || d.severity === "manualReview"
        );
        if (firstError) {
          toast.error(firstError.message || validationFallback);
        }
      }
    } catch (error) {
      toast.error(resolveActionError(error, validationFallback));
    } finally {
      setIsValidating(false);
    }
  };

  const handleCommit = async () => {
    if (isBlocked || !validation?.canonicalChecksum || isReadOnly || isCommitting) {
      return;
    }

    const commitFallback = t("workspace.surveys.ai_lab_import.commit_failed");

    setIsCommitting(true);
    try {
      const response = await commitAiLabCsvImportAction({
        workspaceId,
        importJobId: validation.importJobId,
        expectedCanonicalChecksum: validation.canonicalChecksum,
      }).catch((err) => ({
        serverError: resolveActionError(err, commitFallback),
        data: undefined,
      }));
      if (response?.serverError || !response?.data) {
        toast.error(resolveActionError(response?.serverError, commitFallback));
        return;
      }
      if (response.data.code === "AI_LAB_IMPORT_COMMIT_FAILED") {
        toast.error(
          "message" in response.data && response.data.message ? response.data.message : commitFallback
        );
        return;
      }

      router.push(`/workspaces/${workspaceId}/surveys/${response.data.surveyId}/edit`);
    } catch (error) {
      toast.error(resolveActionError(error, commitFallback));
    } finally {
      setIsCommitting(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      {isReadOnly ? (
        <Alert variant="warning" role="status">
          <AlertTitle>{t("workspace.surveys.ai_lab_import.read_only")}</AlertTitle>
        </Alert>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <FileDropZone
          id="ai-lab-survey-csv"
          accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/octet-stream,application/zip,application/x-zip-compressed,text/plain,application/csv,text/x-csv,text/comma-separated-values,application/x-excel,application/excel,application/x-msexcel"
          disabled={isReadOnly}
          isLoading={isValidating}
          onFileSelect={handleFileSelect}
          primaryText={t("workspace.surveys.ai_lab_import.upload")}
          secondaryText={t("workspace.surveys.ai_lab_import.or_drag_and_drop")}
          helpText={t("workspace.surveys.ai_lab_import.file_help")}
          loadingText={t("workspace.surveys.ai_lab_import.reviewing")}
        />

        <div className="mt-4 flex flex-col items-start justify-between gap-4 rounded-lg border border-blue-100 bg-blue-50/60 p-4 sm:flex-row sm:items-center">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-800">
              Tải Mẫu File Excel / CSV Chuẩn (LimeSurvey / Adaptive Engine v2.0)
            </p>
            <p className="text-xs text-slate-600">
              File mẫu chuẩn chứa đầy đủ cấu trúc Nhóm (G), Câu hỏi (Q), Biến số (V), Biểu thức LimeScript AST
              và ma trận điểm SPSS. Nếu dùng ChatGPT/Agent tạo file nhập, hãy tải kèm Skill.md để file tạo ra
              đúng chuẩn.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDownloadSkill}
              className="border-blue-200 bg-white font-medium text-blue-700 hover:bg-slate-50">
              <DownloadIcon className="mr-2 h-4 w-4" />
              Tải Skill.md
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDownloadTemplate}
              className="border-blue-200 bg-white font-medium text-blue-700 hover:bg-slate-50">
              <DownloadIcon className="mr-2 h-4 w-4" />
              Tải CSV Mẫu
            </Button>
          </div>
        </div>
      </section>

      {validation ? (
        <>
          <section
            className="rounded-xl border border-slate-200 bg-slate-50 p-6"
            aria-labelledby="ai-lab-preview-title">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 id="ai-lab-preview-title" className="text-lg font-semibold text-slate-900">
                  {t("workspace.surveys.ai_lab_import.preview")}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  {validation.canonicalSurvey?.title[validation.canonicalSurvey.defaultLanguage] ??
                    validation.canonicalSurvey?.externalId}
                </p>
              </div>
              <Badge
                type={isBlocked ? "warning" : "success"}
                size="normal"
                text={
                  isBlocked
                    ? t("workspace.surveys.ai_lab_import.manual_review")
                    : t("workspace.surveys.ai_lab_import.validation_ready")
                }
              />
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric
                label={t("workspace.surveys.ai_lab_import.groups")}
                value={validation.canonicalSurvey?.groups.length ?? 0}
              />
              <Metric
                label={t("workspace.surveys.ai_lab_import.questions")}
                value={validation.canonicalSurvey?.questions.length ?? 0}
              />
              <Metric
                label={t("workspace.surveys.ai_lab_import.languages")}
                value={validation.canonicalSurvey?.languages.length ?? 0}
              />
              <Metric
                label={t("workspace.surveys.ai_lab_import.total")}
                value={validation.compatibility?.summary.total ?? 0}
              />
            </div>

            <dl className="mt-5 grid gap-3 text-xs text-slate-500 md:grid-cols-2">
              <div>
                <dt className="font-medium">{t("workspace.surveys.ai_lab_import.source_checksum")}</dt>
                <dd className="mt-1 font-mono break-all">{validation.sourceChecksum}</dd>
              </div>
              <div>
                <dt className="font-medium">{t("workspace.surveys.ai_lab_import.canonical_checksum")}</dt>
                <dd className="mt-1 font-mono break-all">{validation.canonicalChecksum}</dd>
              </div>
            </dl>
          </section>

          <section
            className="rounded-xl border border-slate-200 bg-white p-6"
            aria-labelledby="ai-lab-compatibility-title">
            <h2 id="ai-lab-compatibility-title" className="text-lg font-semibold text-slate-900">
              {t("workspace.surveys.ai_lab_import.compatibility")}
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Metric
                label={t("workspace.surveys.ai_lab_import.supported")}
                value={validation.compatibility?.summary.supported ?? 0}
                tone="success"
              />
              <Metric
                label={t("workspace.surveys.ai_lab_import.manual_review")}
                value={validation.compatibility?.summary.manualReview ?? 0}
                tone="warning"
              />
              <Metric
                label={t("workspace.surveys.ai_lab_import.invalid")}
                value={validation.compatibility?.summary.invalid ?? 0}
                tone="error"
              />
            </div>
          </section>

          <section
            className="rounded-xl border border-slate-200 bg-white p-6"
            aria-labelledby="ai-lab-diagnostics-title">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="ai-lab-diagnostics-title" className="text-lg font-semibold text-slate-900">
                {t("workspace.surveys.ai_lab_import.diagnostics")}
              </h2>
              <div className="flex flex-wrap gap-2">
                <Badge
                  type={diagnosticCounts.errors > 0 ? "error" : "gray"}
                  size="tiny"
                  text={`${t("workspace.surveys.ai_lab_import.errors")}: ${diagnosticCounts.errors}`}
                />
                <Badge
                  type={diagnosticCounts.manualReview > 0 ? "warning" : "gray"}
                  size="tiny"
                  text={`${t("workspace.surveys.ai_lab_import.manual_review")}: ${diagnosticCounts.manualReview}`}
                />
                <Badge
                  type={diagnosticCounts.warnings > 0 ? "info" : "gray"}
                  size="tiny"
                  text={`${t("workspace.surveys.ai_lab_import.warnings")}: ${diagnosticCounts.warnings}`}
                />
              </div>
            </div>

            {validation.diagnostics.length === 0 ? (
              <p className="mt-4 text-sm text-slate-600">
                {t("workspace.surveys.ai_lab_import.no_diagnostics")}
              </p>
            ) : (
              <ul className="mt-4 max-h-80 space-y-2 overflow-y-auto" aria-live="polite">
                {validation.diagnostics.map((diagnostic, index) => (
                  <li
                    key={`${diagnostic.code}-${diagnostic.externalId ?? "survey"}-${index}`}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        type={
                          diagnostic.severity === "error"
                            ? "error"
                            : diagnostic.severity === "manualReview"
                              ? "warning"
                              : "info"
                        }
                        size="tiny"
                        text={severityLabel(diagnostic.severity)}
                      />
                      <code className="text-xs text-slate-500">{diagnostic.code}</code>
                      {diagnostic.externalId ? (
                        <span className="text-xs font-medium text-slate-600">{diagnostic.externalId}</span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-slate-700">
                      {t("workspace.surveys.ai_lab_import.diagnostic_message", {
                        message: diagnostic.message,
                      })}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {isBlocked ? (
            <Alert variant="warning" role="status">
              <AlertTitle>{t("workspace.surveys.ai_lab_import.blocking_title")}</AlertTitle>
              <AlertDescription>{t("workspace.surveys.ai_lab_import.blocking_description")}</AlertDescription>
            </Alert>
          ) : (
            <Alert variant="success" role="status">
              <AlertTitle>{t("workspace.surveys.ai_lab_import.validation_ready")}</AlertTitle>
              <AlertDescription>{t("workspace.surveys.ai_lab_import.commit_ready")}</AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end">
            <Button
              type="button"
              onClick={handleCommit}
              disabled={isBlocked || isReadOnly}
              loading={isCommitting}>
              {isCommitting
                ? t("workspace.surveys.ai_lab_import.committing")
                : t("workspace.surveys.ai_lab_import.commit")}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
};
