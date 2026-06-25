import { useState, useCallback } from 'react'

export type ViewType = 'summary' | 'trend' | 'table' | 'ranking'

export interface SavedReport {
  id: string
  name: string
  domain: string
  domainLabel: string
  filters: Record<string, string>
  view: ViewType
  savedAt: string
  version: number
}

const STORAGE_KEY = 'pulse_report_history'
const MAX_AUTO = 10

function isValidReport(r: unknown): r is SavedReport {
  if (!r || typeof r !== 'object') return false
  const o = r as Record<string, unknown>
  return (
    typeof o.id === 'string' &&
    typeof o.name === 'string' &&
    typeof o.domain === 'string' &&
    typeof o.domainLabel === 'string' &&
    typeof o.savedAt === 'string' &&
    typeof o.version === 'number'
  )
}

function load(): SavedReport[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isValidReport)
  } catch {
    return []
  }
}

function save(reports: SavedReport[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(reports))
}

export function useReportHistory() {
  const [history, setHistory] = useState<SavedReport[]>(load)

  const trackVisit = useCallback((report: Omit<SavedReport, 'id' | 'savedAt' | 'version'>) => {
    setHistory(prev => {
      const existing = prev.find(r => r.domain === report.domain && JSON.stringify(r.filters) === JSON.stringify(report.filters))
      if (existing) return prev
      const entry: SavedReport = {
        ...report,
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        savedAt: new Date().toISOString(),
        version: 1,
      }
      const next = [entry, ...prev].slice(0, MAX_AUTO)
      save(next)
      return next
    })
  }, [])

  const saveNamed = useCallback((name: string, report: Omit<SavedReport, 'id' | 'savedAt' | 'version' | 'name'>) => {
    setHistory(prev => {
      const entry: SavedReport = {
        ...report,
        name,
        id: `saved-${Date.now()}`,
        savedAt: new Date().toISOString(),
        version: 1,
      }
      const next = [entry, ...prev].slice(0, 30)
      save(next)
      return next
    })
  }, [])

  const remove = useCallback((id: string) => {
    setHistory(prev => {
      const next = prev.filter(r => r.id !== id)
      save(next)
      return next
    })
  }, [])

  const clear = useCallback(() => {
    save([])
    setHistory([])
  }, [])

  return { history, trackVisit, saveNamed, remove, clear }
}
