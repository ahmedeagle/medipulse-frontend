import client from './client';

export interface PreviewRow {
  rowNumber: number;
  productName: string;
  quantity: number;
  matchedName?: string;
  matchScore?: number;
  matchReason?: string;
  status: 'auto_matched' | 'needs_review' | 'unmatched';
}

export interface MigrationPreviewResponse {
  total: number;
  autoMatched: number;
  needsReview: number;
  unmatched: number;
  preview: PreviewRow[];
  csvPayload: string;
  fileName: string;
  recognizedColumns?: string[];
  ignoredColumns?: string[];
}

export interface BatchStatus {
  id: string;
  status: 'queued' | 'matching' | 'completed' | 'failed' | 'cancelled';
  total: number;
  processed: number;
  imported: number;
  updated: number;
  skipped: number;
  autoLinked: number;
  suggested: number;
  unlinked: number;
  errors?: Array<{ row: number; reason: string }>;
}

export const migrationApi = {
  previewExcel: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return client.post<MigrationPreviewResponse>('/migration/preview', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  startImport: (csvPayload: string, fileName: string) =>
    client.post<{ batchId: string; total: number }>('/migration/import', { csvPayload, fileName }),

  getBatchStatus: (batchId: string) =>
    client.get<BatchStatus>(`/migration/batch/${batchId}`),
};
