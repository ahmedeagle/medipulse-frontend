import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { importsApi, type ImportBatch, type ImportBatchStatus } from '../api/imports.api'

const TERMINAL: ReadonlySet<ImportBatchStatus> = new Set(['completed', 'failed', 'cancelled'])

const LS_KEY = 'medipulse:activeImportBatchId'

/** Persist the current batch id so a page reload keeps the toast alive. */
export function rememberActiveBatch(id: string | null): void {
  try {
    if (id) localStorage.setItem(LS_KEY, id)
    else localStorage.removeItem(LS_KEY)
  } catch {
    /* private-mode browsers — ignore */
  }
}

export function getRememberedBatch(): string | null {
  try { return localStorage.getItem(LS_KEY) } catch { return null }
}

/**
 * Polls one import batch every 2 s while it's in `queued` or `matching` state.
 * Stops polling automatically when the batch reaches a terminal status, and
 * invalidates the inventory cache so the table reflects newly-linked items.
 *
 * Returns helpers (percent, isTerminal, isPending) so the toast component
 * stays declarative.
 */
export function useImportProgress(batchId: string | null | undefined) {
  const qc = useQueryClient()
  const lastStatusRef = useRef<ImportBatchStatus | null>(null)

  const query = useQuery<ImportBatch>({
    queryKey:        ['import-batch', batchId],
    queryFn:         () => importsApi.get(batchId!),
    enabled:         !!batchId,
    refetchInterval: (q) => {
      const data = q.state.data as ImportBatch | undefined
      if (!data) return 2_000
      return TERMINAL.has(data.status) ? false : 2_000
    },
    refetchOnWindowFocus: false,
    staleTime:            1_000,
  })

  // When the batch becomes terminal, refresh the inventory table once so
  // newly auto-linked rows show their green badge immediately.
  useEffect(() => {
    const status = query.data?.status
    if (status && TERMINAL.has(status) && lastStatusRef.current !== status) {
      qc.invalidateQueries({ queryKey: ['inventory'] })
      qc.invalidateQueries({ queryKey: ['notifications'] })
    }
    lastStatusRef.current = status ?? null
  }, [query.data?.status, qc])

  const batch = query.data
  const percent = batch
    ? Math.min(100, Math.round((batch.processed / Math.max(1, batch.total)) * 100))
    : 0

  return {
    batch,
    isLoading:  query.isLoading,
    isPending:  !!batch && (batch.status === 'queued' || batch.status === 'matching'),
    isTerminal: !!batch && TERMINAL.has(batch.status),
    isComplete: batch?.status === 'completed',
    isFailed:   batch?.status === 'failed',
    isCancelled: batch?.status === 'cancelled',
    percent,
    refetch:    query.refetch,
  }
}
