import type { ConfirmOfxImportInput, OfxPreviewResult } from "@financas/shared";
import { api } from "../lib/api";

export const ofxApi = {
  preview: (accountId: string, file: File) => {
    const form = new FormData();
    form.append("accountId", accountId);
    form.append("file", file);
    return api.post<OfxPreviewResult>("/ofx/preview", form).then((r) => r.data);
  },
  confirm: (input: ConfirmOfxImportInput) =>
    api.post<{ imported: number; skippedDuplicates: number }>("/ofx/confirm", input).then((r) => r.data),
};
