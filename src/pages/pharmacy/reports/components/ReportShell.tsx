import { useState, type ReactNode } from 'react'
import { BarChart2, TrendingUp, Table2, Star, Bookmark, Check, Lightbulb } from 'lucide-react'
import clsx from 'clsx'
import { useSearchParams } from 'react-router-dom'
import { ExportButton } from './ExportButton'
import { InsightPanel, type Insight } from './views/InsightPanel'
import { useReportHistory } from '../hooks/useReportHistory'
import type { ViewType } from '../hooks/useReportHistory'

export type { ViewType }

const VIEW_TABS: { key: ViewType; label: string; Icon: React.ElementType }[] = [
  { key: 'summary',  label: 'ملخص',     Icon: BarChart2  },
  { key: 'trend',    label: 'الاتجاه',  Icon: TrendingUp },
  { key: 'table',    label: 'جدول',     Icon: Table2     },
  { key: 'ranking',  label: 'ترتيب',   Icon: Star       },
]

interface Props {
  domain: string
  domainLabel: string
  children: (view: ViewType) => ReactNode
  exportRows?: Record<string, unknown>[]
  exportFilename?: string
  loading?: boolean
  insights?: Insight[]
}

export function ReportShell({ domain, domainLabel, children, exportRows = [], exportFilename, loading, insights }: Props) {
  const [params, setParams] = useSearchParams()
  const [showInsight, setShowInsight] = useState(false)
  const [saved, setSaved]             = useState(false)
  const { trackVisit, saveNamed }     = useReportHistory()

  const view      = (params.get('view') as ViewType) ?? 'summary'
  const fromAlert = params.get('from') === 'alert'

  const setView = (v: ViewType) => {
    setParams(prev => { const n = new URLSearchParams(prev); n.set('view', v); return n })
    trackVisit({ domain, domainLabel, name: domainLabel, filters: Object.fromEntries(params.entries()), view: v })
  }

  const handleSave = () => {
    const name = window.prompt(`اسم التقرير المحفوظ (${domainLabel}):`)
    if (!name?.trim()) return
    saveNamed(name.trim(), { domain, domainLabel, filters: Object.fromEntries(params.entries()), view })
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="space-y-4">
      {/* Alert banner */}
      {fromAlert && (
        <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-2xl text-sm text-amber-800">
          <span className="text-base leading-none">⚠️</span>
          <span className="font-medium">تنبيه:</span>
          تم فتح هذا التقرير من تنبيه نظام — البيانات مُصفَّاة تلقائياً.
        </div>
      )}

      {/* Toolbar */}
      <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3 flex items-center gap-3 flex-wrap">
        {/* View tabs */}
        <div className="flex items-center bg-gray-100 rounded-xl p-0.5 gap-0.5">
          {VIEW_TABS.map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-all',
                view === key ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500 hover:text-gray-700',
              )}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 ms-auto flex-wrap">
          {/* Insight toggle — only shown if parent passes insights */}
          {insights && insights.length > 0 && (
            <button
              onClick={() => setShowInsight(o => !o)}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-xl border transition-colors',
                showInsight
                  ? 'bg-teal-600 border-teal-600 text-white'
                  : 'bg-teal-50 border-teal-200 text-teal-700 hover:bg-teal-100',
              )}
            >
              <Lightbulb size={14} />
              ملاحظات
              <span className={clsx('text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center', showInsight ? 'bg-white text-teal-700' : 'bg-teal-600 text-white')}>
                {insights.length}
              </span>
            </button>
          )}

          {/* Save */}
          <button
            onClick={handleSave}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-xl border transition-colors',
              saved ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50',
            )}
          >
            {saved ? <Check size={14} /> : <Bookmark size={14} />}
            {saved ? 'تم الحفظ' : 'حفظ'}
          </button>

          <ExportButton
            rows={exportRows}
            filename={exportFilename ?? `${domain}-report`}
            disabled={loading || exportRows.length === 0}
          />
        </div>
      </div>

      {/* View content */}
      <div>{children(view)}</div>

      {/* Data insights modal */}
      {showInsight && insights && insights.length > 0 && (
        <InsightPanel insights={insights} domainLabel={domainLabel} onClose={() => setShowInsight(false)} />
      )}

    </div>
  )
}
