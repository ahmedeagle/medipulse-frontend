import { useState } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import clsx from 'clsx'

export interface TableCol<T> {
  key: keyof T | string
  label: string
  render?: (row: T) => React.ReactNode
  sortable?: boolean
  align?: 'start' | 'end' | 'center'
}

interface Props<T extends object> {
  rows: T[]
  cols: TableCol<T>[]
  pageSize?: number
  emptyText?: string
}

export function TableView<T extends object>({ rows, cols, pageSize = 20, emptyText = 'لا توجد بيانات' }: Props<T>) {
  const [page, setPage] = useState(1)
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const sorted = sortKey
    ? [...rows].sort((a, b) => {
        const av = (a as Record<string, unknown>)[sortKey] as string | number
        const bv = (b as Record<string, unknown>)[sortKey] as string | number
        if (av === bv) return 0
        const cmp = av > bv ? 1 : -1
        return sortDir === 'asc' ? cmp : -cmp
      })
    : rows

  const total = sorted.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const p = Math.min(page, totalPages)
  const slice = sorted.slice((p - 1) * pageSize, p * pageSize)

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
    setPage(1)
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/70">
              {cols.map(col => (
                <th
                  key={String(col.key)}
                  className={clsx(
                    'px-4 py-3 font-semibold text-gray-600 whitespace-nowrap',
                    col.align === 'end' ? 'text-end' : col.align === 'center' ? 'text-center' : 'text-start',
                    col.sortable && 'cursor-pointer select-none hover:text-gray-900',
                  )}
                  onClick={() => col.sortable && toggleSort(String(col.key))}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {col.sortable && sortKey === String(col.key) && (
                      sortDir === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.length === 0 ? (
              <tr>
                <td colSpan={cols.length} className="py-12 text-center text-gray-400">{emptyText}</td>
              </tr>
            ) : (
              slice.map((row, i) => (
                <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                  {cols.map(col => (
                    <td key={String(col.key)} className={clsx('px-4 py-3', col.align === 'end' ? 'text-end' : col.align === 'center' ? 'text-center' : 'text-start')}>
                      {col.render ? col.render(row) : String((row as Record<string, unknown>)[String(col.key)] ?? '')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-500">
          <span>{(p - 1) * pageSize + 1}–{Math.min(p * pageSize, total)} من {total}</span>
          <div className="flex items-center gap-1">
            <button disabled={p === 1} onClick={() => setPage(p - 1)} className="px-2.5 py-1 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50">‹</button>
            <span className="px-3">{p} / {totalPages}</span>
            <button disabled={p === totalPages} onClick={() => setPage(p + 1)} className="px-2.5 py-1 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50">›</button>
          </div>
        </div>
      )}
    </div>
  )
}
