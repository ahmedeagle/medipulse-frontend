import client from './client';

export interface SalesHistoryUploadItem {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string | null;
  kind: string;
  note: string | null;
  status: string;
  createdAt: string;
}

export const salesHistoryApi = {
  upload: (files: File[], kind: string, note?: string) => {
    const form = new FormData();
    files.forEach((f) => form.append('files', f));
    form.append('kind', kind);
    if (note) form.append('note', note);
    return client.post<{ uploaded: number; ids: string[] }>(
      '/pharmacy/sales-history/upload',
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
  },

  list: () => client.get<SalesHistoryUploadItem[]>('/pharmacy/sales-history'),
};
