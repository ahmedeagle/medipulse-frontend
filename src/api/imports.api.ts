import client from './client'

/**
 * Status flow:
 *   queued → matching → completed
 *                    ↘ failed
 *                    ↘ cancelled
 */
export type ImportBatchStatus =
  | 'queued'
  | 'matching'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type ImportBatchKind =
  | 'csv_upload'
  | 'tenant_rematch'
  | 'admin_cascade'

export interface ImportBatch {
  id:           string
  tenantId:     string
  userId:       string | null
  kind:         ImportBatchKind
  status:       ImportBatchStatus
  sourceFile:   string | null
  total:        number
  processed:    number
  imported:     number
  updated:      number
  skipped:      number
  autoLinked:   number
  suggested:    number
  unlinked:     number
  errorMessage: string | null
  errors:       Array<{ row: number; reason: string }> | null
  createdAt:    string
  startedAt:    string | null
  completedAt:  string | null
  updatedAt:    string
}

export interface IngestResponse {
  batchId: string
  total:   number
}

/**
 * All endpoints for the async catalog-matching pipeline.
 * Kept separate from inventory.api.ts because every screen with a long-running
 * operation (CSV upload, Smart Link, admin cascade) shares the same polling UX.
 */
export const importsApi = {
  /** List the 20 most recent import batches for the current pharmacy. */
  list: () =>
    client.get<ImportBatch[]>('/inventory/imports').then(r => r.data),

  /** Live progress + counters for one batch — polled every 2 s by the toast. */
  get: (id: string) =>
    client.get<ImportBatch>(`/inventory/imports/${id}`).then(r => r.data),

  /** Cancel an in-flight batch. Worker checks status before each chunk. */
  cancel: (id: string) =>
    client.post<ImportBatch>(`/inventory/imports/${id}/cancel`).then(r => r.data),

  /** Upload a CSV — returns { batchId, total } immediately (HTTP-async). */
  ingestCsv: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return client
      .post<IngestResponse>('/inventory/import', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then(r => r.data)
  },

  /** Smart Link — enqueue a tenant-wide rematch. Returns { batchId, total }. */
  runMatching: () =>
    client.post<IngestResponse>('/inventory/run-matching').then(r => r.data),
}
