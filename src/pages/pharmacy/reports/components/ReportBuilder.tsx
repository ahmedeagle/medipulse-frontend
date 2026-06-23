import { useState } from 'react'
import { Filter, ChevronDown, ChevronUp } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import clsx from 'clsx'

export type DateRange  = 'today' | 'week' | 'month' | '3months' | 'custom'
export type Granularity = 'daily' | 'weekly' | 'monthly'

const DATE_OPTS: { value: DateRange; label: string }[] = [
  { value: 'today',   label: 'اليوم'       },
  { value: 'week',    label: 'هذا الأسبوع' },
  { value: 'month',   label: 'هذا الشهر'   },
  { value: '3months', label: 'آخر 3 أشهر'  },
  { value: 'custom',  label: 'مخصص'        },
]

interface Props { categories?: string[] }

export function ReportBuilder({ categories = [] }: Props) {
  const [params, setParams]       = useSearchParams()
  const [open, setOpen] = useState(false)

  const dateRange  = (params.get('dateRange') as DateRange) ?? 'month'
  const category   = params.get('category') ?? ''
  const customFrom = params.get('customFrom') ?? ''
  const customTo   = params.get('customTo') ?? ''

  const set = (key: string, value: string) => {
    setParams(prev => { const n = new URLSearchParams(prev); if (value) n.set(key, value); else n.delete(key); return n })
  }

  const hasFilters = dateRange !== 'month' || !!category

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 w-full px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <Filter size={15} className={hasFilters ? 'text-violet-600' : 'text-gray-400'} />
        <span>أدوات الفلترة</span>
        {hasFilters && (
          <span className="ms-1 px-1.5 py-0.5 text-[10px] font-bold bg-violet-600 text-white rounded-full">نشط</span>
        )}
        <span className="ms-auto text-gray-400">{open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</span>
      </button>

      {open && (
        <div className="border-t border-gray-100 p-4 space-y-4 bg-gray-50/40">

          {/* Date range */}
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2">الفترة الزمنية</p>
            <div className="flex flex-wrap gap-2">
              {DATE_OPTS.map(o => (
                <button
                  key={o.value}
                  onClick={() => set('dateRange', o.value)}
                  className={clsx(
                    'px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors',
                    dateRange === o.value
                      ? 'border-violet-500 bg-violet-50 text-violet-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>

            {dateRange === 'custom' && (
              <div className="flex items-center gap-2 mt-3">
                <div className="flex-1">
                  <p className="text-[10px] text-gray-400 mb-1">من</p>
                  <input type="date" value={customFrom} onChange={e => set('customFrom', e.target.value)}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-violet-400 bg-white" />
                </div>
                <div className="flex-1">
                  <p className="text-[10px] text-gray-400 mb-1">إلى</p>
                  <input type="date" value={customTo} onChange={e => set('customTo', e.target.value)}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-violet-400 bg-white" />
                </div>
              </div>
            )}
          </div>

          {/* Category filter */}
          {categories.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">الفئة</p>
              <select value={category} onChange={e => set('category', e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-violet-400 bg-white">
                <option value="">جميع الفئات</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}

        </div>
      )}
    </div>
  )
}

export function useDateRange() {
  const [params] = useSearchParams()
  const range      = (params.get('dateRange') as DateRange) ?? 'month'
  const customFrom = params.get('customFrom') ?? ''
  const customTo   = params.get('customTo')   ?? ''

  const now = new Date()
  let from: Date
  let to: Date = new Date(now)

  switch (range) {
    case 'today':
      from = new Date(now.toDateString())
      break
    case 'week':
      from = new Date(now)
      from.setDate(now.getDate() - 7)
      break
    case '3months':
      from = new Date(now)
      from.setMonth(now.getMonth() - 3)
      break
    case 'custom':
      if (customFrom) {
        from = new Date(customFrom)
      } else {
        from = new Date(now)
        from.setMonth(now.getMonth() - 1)
      }
      if (customTo) to = new Date(customTo)
      break
    default: // month
      from = new Date(now)
      from.setMonth(now.getMonth() - 1)
  }

  return {
    dateFrom: from.toISOString().split('T')[0],
    dateTo:   to.toISOString().split('T')[0],
    granularity: (params.get('granularity') as Granularity) ?? 'daily',
    category:    params.get('category') ?? '',
  }
}

