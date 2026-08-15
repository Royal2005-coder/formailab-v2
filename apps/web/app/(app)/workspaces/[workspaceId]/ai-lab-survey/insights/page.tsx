import type { Metadata } from "next";
import { InsightsDashboard } from "@/modules/ai-lab-survey/components/insights-dashboard";
import { getAILabWorkspaceStats } from "@/modules/ai-lab-survey/lib/service";
import { PageContentWrapper } from "@/modules/ui/components/page-content-wrapper";
import { getWorkspaceAuth } from "@/modules/workspaces/lib/utils";

export const generateMetadata = async (): Promise<Metadata> => {
  return { title: "AI LAB Survey — Adaptive Response Dashboard" };
};

const AiLabSurveyInsightsPage = async ({
  params,
}: Readonly<{
  params: Promise<{ workspaceId: string }>;
}>) => {
  const { workspaceId } = await params;
  await getWorkspaceAuth(workspaceId);

  const stats = await getAILabWorkspaceStats(workspaceId);

  return (
    <PageContentWrapper>
      <InsightsDashboard workspaceId={workspaceId} stats={stats} />
    </PageContentWrapper>
  );
};

export default AiLabSurveyInsightsPage;
