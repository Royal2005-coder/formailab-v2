import {
  ZCanonicalSurvey,
  ZImportDiagnostic,
  compileCanonicalToFormbricksArtifact,
} from "@formbricks/survey-compiler";
import { createCanonicalChecksum } from "@formbricks/survey-compiler/server";

type TPrepareValidatedImportInput = Readonly<{
  canonicalSnapshot: unknown;
  storedCanonicalChecksum: string;
  expectedCanonicalChecksum: string;
  diagnostics: unknown;
}>;

export const prepareValidatedImport = (input: TPrepareValidatedImportInput) => {
  const canonicalSurvey = ZCanonicalSurvey.parse(input.canonicalSnapshot);
  const diagnostics = ZImportDiagnostic.array().parse(input.diagnostics);

  if (
    diagnostics.some(
      (diagnostic) => diagnostic.severity === "error" || diagnostic.severity === "manualReview"
    )
  ) {
    throw new Error("Import has unresolved publish-blocking diagnostics");
  }

  const canonicalChecksum = createCanonicalChecksum(canonicalSurvey);
  if (
    input.storedCanonicalChecksum !== input.expectedCanonicalChecksum ||
    input.storedCanonicalChecksum !== canonicalChecksum
  ) {
    throw new Error("Canonical survey checksum mismatch");
  }

  const artifact = compileCanonicalToFormbricksArtifact(canonicalSurvey);

  return {
    canonicalSurvey,
    canonicalChecksum,
    artifact,
    payload: artifact.payload,
    idCrosswalk: artifact.idCrosswalk,
    diagnostics,
  };
};
