import type { TImportDiagnostic } from "./contracts";

export const SURVEY_LIFECYCLE_STATUSES = [
  "draft",
  "underReview",
  "approved",
  "published",
  "active",
  "paused",
  "closed",
  "archived",
] as const;
export type TSurveyLifecycleStatus = (typeof SURVEY_LIFECYCLE_STATUSES)[number];

const TRANSITIONS: Readonly<Record<TSurveyLifecycleStatus, readonly TSurveyLifecycleStatus[]>> = {
  draft: ["underReview", "archived"],
  underReview: ["draft", "approved"],
  approved: ["draft", "published"],
  published: ["active", "archived"],
  active: ["paused", "closed"],
  paused: ["active", "closed"],
  closed: ["archived"],
  archived: [],
};

export class SurveyLifecycleError extends Error {
  constructor(
    readonly code: "INVALID_TRANSITION" | "PUBLICATION_BLOCKED" | "VERSION_IMMUTABLE",
    message: string
  ) {
    super(message);
    this.name = "SurveyLifecycleError";
  }
}

export const assertLifecycleTransition = (from: TSurveyLifecycleStatus, to: TSurveyLifecycleStatus): void => {
  if (!TRANSITIONS[from].includes(to)) {
    throw new SurveyLifecycleError(
      "INVALID_TRANSITION",
      `Cannot transition survey from '${from}' to '${to}'`
    );
  }
};

export const assertVersionMutable = (
  status: "draft" | "underReview" | "approved" | "published" | "superseded"
): void => {
  if (status === "published" || status === "superseded") {
    throw new SurveyLifecycleError("VERSION_IMMUTABLE", `Survey version in '${status}' status is immutable`);
  }
};

export const assertPublicationReady = (diagnostics: readonly TImportDiagnostic[]): void => {
  const blocking = diagnostics.filter((diagnostic) => diagnostic.severity === "error");
  if (blocking.length > 0) {
    throw new SurveyLifecycleError(
      "PUBLICATION_BLOCKED",
      `Publication is blocked by ${blocking.length} error${blocking.length === 1 ? "" : "s"}`
    );
  }
};

export const createImportIdempotencyKey = (
  input: Readonly<{
    workspaceId: string;
    sourceChecksum: string;
    mode: string;
    registryId?: string;
  }>
): string => [input.workspaceId, input.registryId ?? "new", input.mode, input.sourceChecksum].join(":");
