import type { Metadata } from "next";
import { getTranslate } from "@/lingodotdev/server";
import { ImportReview } from "@/modules/ai-lab-survey/components/import-review";
import { PageContentWrapper } from "@/modules/ui/components/page-content-wrapper";
import { PageHeader } from "@/modules/ui/components/page-header";
import { getWorkspaceAuth } from "@/modules/workspaces/lib/utils";

export const generateMetadata = async (): Promise<Metadata> => {
  const t = await getTranslate();
  return { title: t("workspace.surveys.ai_lab_import.title") };
};

const AiLabSurveyImportPage = async ({
  params,
}: Readonly<{
  params: Promise<{ workspaceId: string }>;
}>) => {
  const [{ workspaceId }, t] = await Promise.all([params, getTranslate()]);
  const { isReadOnly } = await getWorkspaceAuth(workspaceId);

  return (
    <PageContentWrapper>
      <PageHeader pageTitle={t("workspace.surveys.ai_lab_import.title")}>
        <p className="max-w-3xl pb-4 text-sm text-slate-600">
          {t("workspace.surveys.ai_lab_import.description")}
        </p>
      </PageHeader>
      <ImportReview workspaceId={workspaceId} isReadOnly={isReadOnly} />
    </PageContentWrapper>
  );
};

export default AiLabSurveyImportPage;
