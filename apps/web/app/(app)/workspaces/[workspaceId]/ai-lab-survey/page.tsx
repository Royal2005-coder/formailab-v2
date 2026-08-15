import type { Metadata } from "next";
import { getTranslate } from "@/lingodotdev/server";
import { ImportReview } from "@/modules/ai-lab-survey/components/import-review";
import { PageContentWrapper } from "@/modules/ui/components/page-content-wrapper";
import { PageHeader } from "@/modules/ui/components/page-header";
import { getWorkspaceAuth } from "@/modules/workspaces/lib/utils";

export const generateMetadata = async (): Promise<Metadata> => {
  const t = await getTranslate();
  return { title: t("workspace.surveys.ai_lab_import.title", { defaultValue: "AI LAB Survey Import" }) };
};

const AiLabSurveyPage = async ({
  params,
}: Readonly<{
  params: Promise<{ workspaceId: string }>;
}>) => {
  const [{ workspaceId }, t] = await Promise.all([params, getTranslate()]);
  const { isReadOnly } = await getWorkspaceAuth(workspaceId);

  return (
    <PageContentWrapper>
      <PageHeader
        pageTitle={t("workspace.surveys.ai_lab_import.title", {
          defaultValue: "AI LAB Survey Import & Verification",
        })}>
        <p className="max-w-3xl pb-4 text-sm text-slate-600">
          {t("workspace.surveys.ai_lab_import.description", {
            defaultValue:
              "Tải lên, xem trước diff và xuất bản các bản khảo sát thích ứng (CSV / XLSX / LimeSurvey).",
          })}
        </p>
      </PageHeader>
      <ImportReview workspaceId={workspaceId} isReadOnly={isReadOnly} />
    </PageContentWrapper>
  );
};

export default AiLabSurveyPage;
