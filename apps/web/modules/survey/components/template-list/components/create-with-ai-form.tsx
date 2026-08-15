"use client";

import { FileTextIcon, SparklesIcon, UploadIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { type ChangeEvent, type KeyboardEvent, type ReactNode, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TUserLocale } from "@formbricks/types/user";
import { useWorkspace } from "@/app/(app)/workspaces/[workspaceId]/context/workspace-context";
import { getAIUnavailableAction } from "@/lib/ai/availability";
import type { TAIUnavailableReason } from "@/lib/ai/service";
import { useCreateSurveyWithAI } from "@/modules/survey/components/template-list/hooks/use-create-survey-with-ai";
import {
  AI_SURVEY_PROMPT_MAX_LENGTH,
  getHelperPrompts,
  getUnavailableMessageKey,
} from "@/modules/survey/components/template-list/lib/ai-create-utils";
import {
  type ParsedDocumentResult,
  parseDocumentFile,
} from "@/modules/survey/components/template-list/lib/document-parser";
import { Alert, AlertButton, AlertDescription, AlertTitle } from "@/modules/ui/components/alert";
import { Button } from "@/modules/ui/components/button";

export type TCreateWithAIFormFooterProps = {
  isBusy: boolean;
  canCreate: boolean;
  submitLabel: string;
};

type CreateWithAIFormProps = {
  workspaceId: string;
  language: TUserLocale;
  isAIAvailable: boolean;
  aiUnavailableReason?: TAIUnavailableReason;
  onSuccess: (surveyId: string) => void;
  onCancel?: () => void;
  showCancel?: boolean;
  renderFooter?: (props: TCreateWithAIFormFooterProps) => ReactNode;
  promptInputRef?: React.Ref<HTMLTextAreaElement>;
};

export const CreateWithAIForm = ({
  workspaceId,
  language,
  isAIAvailable,
  aiUnavailableReason,
  onSuccess,
  onCancel,
  showCancel = true,
  renderFooter,
  promptInputRef,
}: Readonly<CreateWithAIFormProps>) => {
  const { t } = useTranslation();
  const { workspace } = useWorkspace();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isParsingFile, setIsParsingFile] = useState(false);
  const [attachedFile, setAttachedFile] = useState<ParsedDocumentResult | null>(null);

  const { prompt, setPrompt, isBusy, canCreate, errorMessage, handleGenerate, clearError, submitLabel } =
    useCreateSurveyWithAI({
      workspaceId,
      language,
      isAIAvailable,
      onSuccess,
    });

  const unavailableAction = workspace?.organizationId
    ? getAIUnavailableAction(aiUnavailableReason, workspace.organizationId)
    : undefined;
  let unavailableActionLabel: string | undefined;
  if (unavailableAction?.type === "enable_ai") {
    unavailableActionLabel = t("workspace.surveys.ai_create.enable_ai_in_settings");
  } else if (unavailableAction?.type === "upgrade_plan") {
    unavailableActionLabel = t("workspace.surveys.ai_create.upgrade_plan");
  }

  const helperPrompts = useMemo(() => getHelperPrompts(t), [t]);

  const handlePromptKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    setIsParsingFile(true);
    clearError();

    try {
      const parsed = await parseDocumentFile(file);
      setAttachedFile(parsed);
      const prefix = `[Imported Document: ${parsed.fileName}]\n\n`;
      setPrompt((prev) =>
        prev ? `${prev}\n\n${prefix}${parsed.extractedText}` : `${prefix}${parsed.extractedText}`
      );
    } catch (err) {
      console.error("Failed to parse file", err);
    } finally {
      setIsParsingFile(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemoveFile = () => {
    setAttachedFile(null);
  };

  const defaultFooter = (
    <div className="flex justify-end gap-2">
      {showCancel && onCancel && (
        <Button type="button" variant="secondary" disabled={isBusy} onClick={onCancel}>
          {t("common.cancel")}
        </Button>
      )}
      <Button type="submit" loading={isBusy || isParsingFile} disabled={!canCreate || isParsingFile}>
        {!isBusy && !isParsingFile && <SparklesIcon />}
        {submitLabel}
      </Button>
    </div>
  );

  const footerContent = renderFooter
    ? renderFooter({ isBusy: isBusy || isParsingFile, canCreate, submitLabel })
    : defaultFooter;

  return (
    <form className="flex w-full flex-col space-y-4" onSubmit={handleGenerate}>
      {!isAIAvailable && (
        <Alert variant="info" role="status">
          <AlertTitle>{t("workspace.surveys.ai_create.ai_not_available")}</AlertTitle>
          <AlertDescription>{t(getUnavailableMessageKey(aiUnavailableReason))}</AlertDescription>
          {unavailableAction && unavailableActionLabel && (
            <AlertButton asChild>
              <Link href={unavailableAction.href}>{unavailableActionLabel}</Link>
            </AlertButton>
          )}
        </Alert>
      )}

      {errorMessage && (
        <Alert variant="error">
          <AlertTitle>{t("common.error")}</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <textarea
          ref={promptInputRef}
          id="ai-survey-prompt"
          className="min-h-32 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-400 focus:ring-offset-1 focus:outline-hidden disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
          maxLength={AI_SURVEY_PROMPT_MAX_LENGTH}
          placeholder={t("workspace.surveys.ai_create.prompt_placeholder")}
          value={prompt}
          disabled={isBusy || !isAIAvailable}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={handlePromptKeyDown}
          aria-label={t("workspace.surveys.ai_create.prompt_label")}
        />

        {/* Document Upload Zone & Attached File Badge */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".docx,.doc,.pdf,.txt,.csv,.md,.json"
              className="hidden"
              onChange={handleFileChange}
              disabled={isBusy || !isAIAvailable || isParsingFile}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isBusy || !isAIAvailable || isParsingFile}
              onClick={() => fileInputRef.current?.click()}>
              <UploadIcon className="size-3.5 text-slate-500" />
              <span>{isParsingFile ? "Reading document..." : "Import DOCX / PDF / Text"}</span>
            </Button>

            {attachedFile && (
              <div className="flex items-center gap-1.5 rounded-md bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
                <FileTextIcon className="size-3.5 text-slate-500" />
                <span className="font-medium">{attachedFile.fileName}</span>
                <span className="text-slate-400">({(attachedFile.fileSize / 1024).toFixed(1)} KB)</span>
                <button
                  type="button"
                  className="ml-1 rounded-full p-0.5 hover:bg-slate-200"
                  onClick={handleRemoveFile}>
                  <XIcon className="size-3 text-slate-500" />
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>
              {prompt.length.toLocaleString()} / {AI_SURVEY_PROMPT_MAX_LENGTH.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {isAIAvailable && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700">{t("workspace.surveys.ai_create.try_prompt")}</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {helperPrompts.map((helperPrompt) => (
              <Button
                key={helperPrompt.label}
                type="button"
                variant="secondary"
                size="sm"
                className="group w-full min-w-0 justify-start text-left"
                disabled={isBusy}
                title={helperPrompt.prompt}
                aria-label={`${helperPrompt.label}. ${helperPrompt.prompt}`}
                onClick={() => {
                  setPrompt(helperPrompt.prompt);
                  clearError();
                }}>
                <helperPrompt.Icon className="size-3.5 shrink-0 text-slate-500 transition-colors group-hover:text-primary" />
                <span className="min-w-0 truncate">{helperPrompt.label}</span>
              </Button>
            ))}
          </div>
        </div>
      )}

      {footerContent}
    </form>
  );
};
