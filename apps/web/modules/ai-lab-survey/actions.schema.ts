import { z } from "zod";
import { ZId } from "@formbricks/types/common";

export const MAX_AI_LAB_IMPORT_FILE_SIZE = 10 * 1024 * 1024; // 10 MiB

export const ZValidateAiLabCsvImportAction = z
  .object({
    workspaceId: ZId,
    fileName: z.string().optional(),
    fileBase64: z.string().optional(),
    file: z.instanceof(File).optional(),
  })
  .refine((data) => Boolean(data.file || (data.fileName && data.fileBase64)), {
    message: "Phải cung cấp file hoặc nội dung file (fileName và fileBase64)",
  })
  .refine(
    (data) => {
      const name = data.file?.name ?? data.fileName;
      return Boolean(name && /\.(csv|xlsx|xls)$/i.test(name));
    },
    { message: "Tên file phải có đuôi .csv, .xlsx, hoặc .xls" }
  )
  .refine(
    (data) => {
      if (data.file) {
        return data.file.size <= MAX_AI_LAB_IMPORT_FILE_SIZE;
      }
      if (data.fileBase64) {
        const padding = data.fileBase64.endsWith("==") ? 2 : data.fileBase64.endsWith("=") ? 1 : 0;
        const sizeInBytes = (data.fileBase64.length * 3) / 4 - padding;
        return sizeInBytes <= MAX_AI_LAB_IMPORT_FILE_SIZE;
      }
      return false;
    },
    { message: "Dung lượng file không được vượt quá 10 MiB" }
  );

export const ZCommitAiLabCsvImportAction = z.object({
  workspaceId: ZId,
  importJobId: ZId,
  expectedCanonicalChecksum: z.string().regex(/^[a-f0-9]{64}$/),
});
