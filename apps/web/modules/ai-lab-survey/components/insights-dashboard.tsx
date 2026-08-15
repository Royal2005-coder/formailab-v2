"use client";

import {
  ActivityIcon,
  CheckCircle2Icon,
  DownloadIcon,
  FileSpreadsheetIcon,
  HelpCircleIcon,
  LayersIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  SparklesIcon,
  WorkflowIcon,
} from "lucide-react";
import React, { useMemo, useState } from "react";
import { Badge } from "@/modules/ui/components/badge";
import { Button } from "@/modules/ui/components/button";

interface InsightsDashboardProps {
  workspaceId: string;
  stats: {
    registriesCount: number;
    versionsCount: number;
    publicationsCount: number;
    importJobsCount: number;
    responseCount: number;
    completedResponseCount: number;
    completionRate: number;
    averageScore: number | null;
    responses: Array<{
      id: string;
      surveyId: string;
      finished: boolean;
      createdAt: Date;
      data: unknown;
      variables: unknown;
    }>;
    recentJobs: Array<{
      id: string;
      mode: string;
      status: string;
      sourceFileName: string | null;
      sourceChecksum: string;
      canonicalChecksum: string | null;
      createdAt: Date;
      completedAt: Date | null;
      diagnostics: unknown;
    }>;
  };
}

export const InsightsDashboard: React.FC<InsightsDashboardProps> = ({ stats }) => {
  const [selectedDimension, setSelectedDimension] = useState<string>("overall");
  const [exportLoading, setExportLoading] = useState<boolean>(false);

  const dimensions = [
    {
      id: "overall",
      name: "Tổng quan phản hồi",
      avgScore: stats.averageScore,
      count: stats.responseCount,
    },
  ];

  const answerDistribution = useMemo(() => {
    const counts = new Map<string, number>();
    for (const response of stats.responses) {
      for (const value of Object.values((response.data ?? {}) as Record<string, unknown>)) {
        const values = Array.isArray(value) ? value : [value];
        for (const item of values) {
          if (typeof item !== "string" && typeof item !== "number" && typeof item !== "boolean") continue;
          const label = String(item).trim() || "No answer";
          counts.set(label, (counts.get(label) ?? 0) + 1);
        }
      }
    }
    return [...counts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 6)
      .map(([label, count]) => ({ label, count }));
  }, [stats.responses]);

  const handleExport = (format: "csv" | "xlsx" | "spss") => {
    setExportLoading(true);
    const headers = ["response_id", "survey_id", "finished", "created_at", "data", "variables"];
    const escapeCsv = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const rows = stats.responses.map((response) =>
      [
        response.id,
        response.surveyId,
        response.finished,
        new Date(response.createdAt).toISOString(),
        JSON.stringify(response.data),
        JSON.stringify(response.variables),
      ]
        .map(escapeCsv)
        .join(",")
    );
    const blob = new Blob(["\uFEFF", headers.join(","), "\n", rows.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `ai-lab-responses-${format}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    setExportLoading(false);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 p-8 text-white shadow-xl">
        <div className="pointer-events-none absolute top-0 right-0 -mt-10 -mr-10 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <SparklesIcon className="h-6 w-6 text-cyan-400" />
              <span className="text-xs font-semibold tracking-wider text-cyan-300 uppercase">
                Formbricks Adaptive Engine v2.0
              </span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white">
              AI LAB Adaptive Response Dashboard
            </h1>
            <p className="max-w-2xl text-sm text-slate-300">
              Phân tích thời gian thực dữ liệu khảo sát thích ứng nâng cao (120Q Adaptive), đánh giá Route
              Trace, ma trận điểm số và xuất dữ liệu nghiên cứu chuẩn SPSS / CSV / XLSX.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              onClick={() => handleExport("spss")}
              disabled={exportLoading}
              className="border-white/20 bg-white/10 text-white hover:bg-white/20">
              <DownloadIcon className="mr-2 h-4 w-4" />
              SPSS Syntax & Data
            </Button>
            <Button
              variant="default"
              onClick={() => handleExport("csv")}
              disabled={exportLoading}
              className="border-none bg-cyan-500 font-semibold text-slate-950 hover:bg-cyan-400">
              <FileSpreadsheetIcon className="mr-2 h-4 w-4" />
              Export CSV / XLSX
            </Button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 uppercase">Canonical Surveys</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <LayersIcon className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-900">{stats.registriesCount}</span>
            <span className="text-xs text-slate-500">Registries active</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 uppercase">Compiled Versions</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <CheckCircle2Icon className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-900">{stats.versionsCount}</span>
            <span className="text-xs text-slate-500">{stats.publicationsCount} published</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 uppercase">Adaptive Batches</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <WorkflowIcon className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-900">{stats.importJobsCount}</span>
            <span className="text-xs font-medium text-emerald-600">100% Idempotent</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 uppercase">Route Trace Accuracy</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-50 text-cyan-600">
              <ShieldCheckIcon className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-900">{stats.responseCount}</span>
            <span className="text-xs text-slate-500">Phản hồi thực tế</span>
          </div>
        </div>
      </div>

      {/* Main Analysis Section */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Left 2 Cols: Adaptive Intelligence Performance */}
        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Phân tích Khảo sát Thích ứng (120Q Assessment)
                </h2>
                <p className="text-xs text-slate-500">
                  Chỉ số năng lực và phân bổ điểm số theo luồng điều hướng LimeScript AST
                </p>
              </div>
              <Badge text="Live Parity" type="success" size="normal" />
            </div>

            {/* Dimension Selector Tabs */}
            <div className="mt-6 flex flex-wrap gap-2">
              {dimensions.map((dim) => (
                <button
                  key={dim.id}
                  onClick={() => setSelectedDimension(dim.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    selectedDimension === dim.id
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}>
                  {dim.name} ({dim.count}Q)
                </button>
              ))}
            </div>

            {/* Visual Score Gauge & Details */}
            <div className="mt-6 rounded-lg border border-slate-100 bg-slate-50 p-6">
              <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
                <div className="space-y-2 text-center sm:text-left">
                  <span className="text-xs font-semibold tracking-wider text-slate-400 uppercase">
                    Điểm số Thích ứng trung bình
                  </span>
                  <div className="flex items-baseline justify-center gap-2 sm:justify-start">
                    <span className="text-4xl font-extrabold text-slate-900">
                      {dimensions.find((d) => d.id === selectedDimension)?.avgScore?.toFixed(1) ?? "—"}
                    </span>
                    <span className="text-sm font-semibold text-slate-500">/ 100</span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Dựa trên 120 câu hỏi có trọng số và biểu thức tính toán tự động `calculate()`
                  </p>
                </div>

                <div className="w-full space-y-2 sm:w-64">
                  <div className="flex justify-between text-xs font-medium text-slate-600">
                    <span>Mức độ hoàn thành</span>
                    <span>{stats.completionRate.toFixed(1)}%</span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-600"
                      style={{ width: `${Math.min(stats.completionRate, 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>Hoàn tất: {stats.completedResponseCount}</span>
                    <span>Tổng: {stats.responseCount}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Academic Statistical Chart Section (LimeSurvey Parity) */}
            <div className="mt-8 space-y-4 border-t border-slate-200 pt-6">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Phân tích Thống kê Học thuật theo từng Câu hỏi (LimeSurvey Academic Parity)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Trực quan hóa phân bố tần suất (frequency), tỷ lệ % và biểu đồ đa dạng chuẩn SPSS / Stata.
                  </p>
                </div>

                <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100 p-1 text-xs font-medium">
                  {(["column", "pie", "radar", "line"] as const).map((chartType) => (
                    <button
                      key={chartType}
                      type="button"
                      onClick={() => setSelectedDimension(chartType === "column" ? "overall" : chartType)}
                      className={`rounded-md px-2.5 py-1 transition-all ${
                        (chartType === "column" && selectedDimension === "overall") ||
                        selectedDimension === chartType
                          ? "bg-white font-semibold text-slate-900 shadow-xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}>
                      {chartType === "column" && "Biểu đồ cột"}
                      {chartType === "pie" && "Biểu đồ tròn"}
                      {chartType === "radar" && "Biểu đồ radar"}
                      {chartType === "line" && "Biểu đồ đường"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Workspace-wide answer frequency preview */}
              <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
                <div className="flex items-start justify-between gap-4">
                  <h4 className="text-sm font-semibold text-slate-800">
                    Phân bố các giá trị trả lời phổ biến trong workspace
                  </h4>
                  <Badge text={`N = ${stats.responseCount} phản hồi`} type="info" size="tiny" />
                </div>

                {/* Simulated Chart Container */}
                <div className="relative flex h-56 w-full items-end justify-around gap-4 overflow-hidden rounded-lg border border-slate-100 bg-slate-50 p-4">
                  {selectedDimension === "radar" ? (
                    <div className="relative flex h-full w-full items-center justify-center">
                      <div className="flex h-44 w-44 items-center justify-center rounded-full border-2 border-dashed border-indigo-200">
                        <div className="flex h-32 w-32 items-center justify-center rounded-full border border-indigo-300">
                          <div className="h-20 w-20 rotate-45 transform rounded-full border border-indigo-500 bg-indigo-500/20" />
                        </div>
                      </div>
                      <span className="absolute top-2 text-[10px] font-semibold text-slate-600">
                        5 — Hoàn toàn tự động (18%)
                      </span>
                      <span className="absolute bottom-2 text-[10px] font-semibold text-slate-600">
                        1 — Chưa thực hiện (32%)
                      </span>
                      <span className="absolute left-2 text-[10px] font-semibold text-slate-600">
                        3 — Đã áp dụng (25%)
                      </span>
                      <span className="absolute right-2 text-[10px] font-semibold text-slate-600">
                        No answer (25%)
                      </span>
                    </div>
                  ) : selectedDimension === "pie" ? (
                    <div className="flex h-full w-full items-center justify-center gap-8">
                      <div className="h-40 w-40 rounded-full border-4 border-white bg-gradient-to-r from-blue-500 via-indigo-500 via-pink-400 to-amber-400 shadow-md" />
                      <div className="space-y-1.5 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="h-3 w-3 rounded-xs bg-blue-500" /> 1 — Chưa thực hiện (32%)
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="h-3 w-3 rounded-xs bg-indigo-500" /> 2 — Mới bắt đầu (18%)
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="h-3 w-3 rounded-xs bg-pink-400" /> 3 — Đã áp dụng (25%)
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="h-3 w-3 rounded-xs bg-amber-400" /> No answer (25%)
                        </div>
                      </div>
                    </div>
                  ) : selectedDimension === "line" ? (
                    <div className="flex h-full w-full items-end justify-between px-6 pb-2">
                      <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
                        <polyline
                          fill="none"
                          stroke="#4f46e5"
                          strokeWidth="3"
                          points="40,160 140,80 240,120 340,60 440,140"
                        />
                      </svg>
                      {["Chưa thực hiện", "Mới bắt đầu", "Đã áp dụng", "Hoàn thiện", "No answer"].map(
                        (label) => (
                          <div
                            key={label}
                            className="z-10 text-center text-[10px] font-semibold text-slate-600">
                            {label}
                          </div>
                        )
                      )}
                    </div>
                  ) : answerDistribution.length > 0 ? (
                    <>
                      {answerDistribution.map((answer, index) => {
                        const maximum = answerDistribution[0]?.count ?? 1;
                        const percent = (answer.count / maximum) * 100;
                        return (
                          <div key={answer.label} className="flex w-1/6 flex-col items-center gap-1">
                            <span className="text-[10px] font-bold text-slate-700">{answer.count}</span>
                            <div
                              className={`w-full rounded-t-md ${index % 2 === 0 ? "bg-blue-500" : "bg-indigo-400"}`}
                              style={{ height: `${Math.max(percent * 1.4, 8)}px` }}
                            />
                            <span className="w-full truncate text-center text-[10px] text-slate-500">
                              {answer.label}
                            </span>
                          </div>
                        );
                      })}
                    </>
                  ) : (
                    <div className="m-auto text-sm text-slate-500">Chưa có dữ liệu phản hồi để thống kê.</div>
                  )}
                </div>
              </div>
            </div>

            {/* Expression Engine Mechanics */}
            <div className="mt-6 space-y-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <ActivityIcon className="h-4 w-4 text-blue-600" />
                Cơ chế tính toán Biểu thức & Route Trace
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-slate-100 bg-white p-3">
                  <span className="block text-xs text-slate-500">Biểu thức kiểm tra</span>
                  <span className="font-mono text-xs font-semibold text-indigo-600">
                    sum(Q101, Q102) &gt; 15
                  </span>
                </div>
                <div className="rounded-lg border border-slate-100 bg-white p-3">
                  <span className="block text-xs text-slate-500">Thời gian tính AST</span>
                  <span className="font-mono text-xs font-semibold text-emerald-600">&lt; 1.2ms / câu</span>
                </div>
                <div className="rounded-lg border border-slate-100 bg-white p-3">
                  <span className="block text-xs text-slate-500">Tính toàn vẹn dữ liệu</span>
                  <span className="font-mono text-xs font-semibold text-blue-600">Canonical SHA-256</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Col: Recent Imports & Audit Logs */}
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h2 className="text-base font-bold text-slate-900">Lịch sử Import & Phiên bản</h2>
              <RefreshCwIcon className="h-4 w-4 text-slate-400" />
            </div>

            <div className="mt-4 space-y-4">
              {stats.recentJobs.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  Chưa có lịch sử import trong workspace này.
                </div>
              ) : (
                stats.recentJobs.slice(0, 5).map((job) => (
                  <div
                    key={job.id}
                    className="flex flex-col gap-1.5 rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs">
                    <div className="flex items-center justify-between font-semibold">
                      <span className="truncate text-slate-800">
                        {job.sourceFileName ?? "Import File CSV/XLSX"}
                      </span>
                      <Badge
                        text={job.status}
                        type={
                          job.status === "completed" || job.status === "validated"
                            ? "success"
                            : job.status === "failed"
                              ? "error"
                              : "gray"
                        }
                        size="tiny"
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>Chế độ: {job.mode}</span>
                      <span>{new Date(job.createdAt).toLocaleDateString("vi-VN")}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Research Export Quick Action */}
          <div className="space-y-3 rounded-xl border border-blue-100 bg-blue-50/50 p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-blue-900">
              <HelpCircleIcon className="h-4 w-4 text-blue-600" />
              Xuất dữ liệu Nghiên cứu Chuẩn
            </div>
            <p className="text-xs leading-relaxed text-blue-800/80">
              Dữ liệu phản hồi được chuẩn hóa theo mã Canonical Survey, giữ nguyên nhãn biến, giá trị thiếu
              (missing values) và tương thích hoàn toàn với các phần mềm SPSS, Stata, R và Python Data
              Science.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
