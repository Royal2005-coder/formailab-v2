const SPREADSHEET_EXTENSION_PATTERN = /\.(csv|xlsx|xls)$/i;

// MIME types browsers/OSes can assign to .csv/.xlsx/.xls files. Windows and many Linux
// distributions report spreadsheets as application/octet-stream, and macOS commonly
// reports .xlsx/.xls archives as application/zip or application/x-zip-compressed — all of
// these must be accepted when the file name carries a valid spreadsheet extension.
const SPREADSHEET_MIME_TYPES = new Set([
  "text/csv",
  "text/x-csv",
  "text/comma-separated-values",
  "text/plain",
  "application/csv",
  "application/x-csv",
  "application/vnd.ms-excel",
  "application/x-excel",
  "application/excel",
  "application/x-msexcel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.template",
  "application/vnd.ms-excel.sheet.macroenabled.12",
  "application/octet-stream",
  "application/zip",
  "application/x-zip-compressed",
]);

export const isAllowedImportFileName = (name: string | undefined): boolean =>
  Boolean(name && SPREADSHEET_EXTENSION_PATTERN.test(name));

// A file is accepted when its extension is a spreadsheet extension AND its MIME type is a
// known spreadsheet type, an OS "unknown" bucket (octet-stream / zip), empty, or otherwise
// unrelated to media. Only a MIME type that is clearly a different kind of content
// (image/audio/video) rejects the file despite a valid extension.
export const isAllowedImportFileType = (file: Readonly<{ name: string; type: string }>): boolean => {
  if (!isAllowedImportFileName(file.name)) {
    return false;
  }
  const mimeType = (file.type ?? "").trim().toLowerCase();
  if (!mimeType || SPREADSHEET_MIME_TYPES.has(mimeType)) {
    return true;
  }
  return !mimeType.startsWith("image/") && !mimeType.startsWith("audio/") && !mimeType.startsWith("video/");
};

// Normalizes any server-action rejection value — including `undefined` (the classic
// "Unhandled Rejection: undefined" symptom of a non-serializable server error) — into a
// human-readable message so the UI can always show an accurate Toast instead of crashing.
export const resolveActionError = (error: unknown, fallback: string): string => {
  if (error instanceof Error) {
    return error.message || fallback;
  }
  if (typeof error === "string") {
    return error || fallback;
  }
  if (
    error !== null &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    return (error as { message: string }).message || fallback;
  }
  return fallback;
};
