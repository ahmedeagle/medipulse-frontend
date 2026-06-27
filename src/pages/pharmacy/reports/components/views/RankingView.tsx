import { useState } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import clsx from 'clsx'

export interface RankItem {
  label: string
  value: number
  sub?: string
  badge?: string
  badgeColor?: string
}

interface Props {
  items: RankItem[]
  valueLabel?: string
  showBottom?: boolean
  limit?: number
}

export function RankingView({ items, valueLabel = 'القيمة', showBottom = true, limit = 10 }: Props) {
  const [mode, setMode] = useState<'top' | 'bottom'>('top')

  const sorted = [...items].sort((a, b) => b.value - a.value)
  const displayed = mode === 'top' ? sorted.slice(0, limit) : [...sorted].reverse().slice(0, limit)
  const max = sorted[0]?.value ?? 1

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      {showBottom && (
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
          <button
            onClick={() => setMode('top')}
            className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors', mode === 'top' ? 'bg-emerald-50 text-emerald-700' : 'text-gray-500 hover:bg-gray-50')}
          >
            <TrendingUp size={14} /> الأعلى
          </button>
          <button
            onClick={() => setMode('bottom')}
            className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors', mode === 'bottom' ? 'bg-red-50 text-red-600' : 'text-gray-500 hover:bg-gray-50')}
          >
            <TrendingDown size={14} /> الأدنى
          </button>
          <span className="ms-auto text-xs text-gray-400">{valueLabel}</span>
        </div>
      )}

      <div className="divide-y divide-gray-50">
        {displayed.length === 0 ? (
          <p className="py-12 text-center text-gray-400 text-sm">لا توجد بيانات</p>
        ) : (
          displayed.map((item, i) => {
            const pct = max > 0 ? Math.round((item.value / max) * 100) : 0
            return (
              <div key={i} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50/50 transition-colors">
                <span className={clsx(
                  'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
                  i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-gray-100 text-gray-600' : i === 2 ? 'bg-orange-100 text-orange-600' : 'bg-gray-50 text-gray-500',
                )}>
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-sm font-medium text-gray-900 truncate">{item.label}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      {item.badge && (
                        <span className={clsx('text-xs px-2 py-0.5 rounded-full', item.badgeColor ?? 'bg-gray-100 text-gray-600')}>
                          {item.badge}
                        </span>
                      )}
                      <span className="text-sm font-semibold text-gray-900">{item.value.toLocaleString('en-US')}</span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={clsx('h-full rounded-full transition-all', mode === 'top' ? 'bg-emerald-500' : 'bg-red-400')}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {item.sub && <p className="text-xs text-gray-400 mt-0.5">{item.sub}</p>}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
