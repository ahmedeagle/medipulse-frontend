import { Link } from 'react-router-dom'
import { Clock, Trash2, BarChart2, Package, TrendingUp, DollarSign, ShieldCheck, AlertTriangle } from 'lucide-react'
import type { SavedReport } from '../hooks/useReportHistory'
import clsx from 'clsx'

const DOMAIN_ICON: Record<string, React.ElementType> = {
  sales: TrendingUp, inventory: Package, expiry: AlertTriangle,
  financial: DollarSign, compliance: ShieldCheck, operational: BarChart2,
}

const DOMAIN_COLOR: Record<string, string> = {
  sales: 'text-emerald-600 bg-emerald-50',
  inventory: 'text-blue-600 bg-blue-50',
  expiry: 'text-amber-600 bg-amber-50',
  financial: 'text-violet-600 bg-violet-50',
  compliance: 'text-slate-600 bg-slate-100',
  operational: 'text-orange-600 bg-orange-50',
}

interface Props {
  history: SavedReport[]
  onRemove: (id: string) => void
}

export function ReportHistory({ history, onRemove }: Props) {
  if (!history.length) return null

  return (
    <div>
      <h2 className="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">
        <Clock size={16} className="text-gray-400" />
        التقارير الأخيرة
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {history.slice(0, 6).map(r => {
          const Icon = DOMAIN_ICON[r.domain] ?? BarChart2
          const colorCls = DOMAIN_COLOR[r.domain] ?? 'text-gray-600 bg-gray-100'
          const params = new URLSearchParams(r.filters).toString()
          const href = `/pharmacy/reports/${r.domain}${params ? `?${params}` : ''}`

          return (
            <div key={r.id} className="relative group bg-white rounded-xl border border-gray-200 p-4 hover:border-gray-300 hover:shadow-sm transition-all">
              <Link to={href} className="flex items-start gap-3">
                <div className={clsx('p-2 rounded-lg shrink-0', colorCls.split(' ')[1])}>
                  <Icon size={15} className={colorCls.split(' ')[0]} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{r.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{r.domainLabel} · {r.view === 'summary' ? 'ملخص' : r.view === 'trend' ? 'اتجاه' : r.view === 'table' ? 'جدول' : 'ترتيب'}</p>
                  <p className="text-xs text-gray-400">{new Date(r.savedAt).toLocaleDateString('ar-EG')}</p>
                </div>
              </Link>
              <button
                onClick={() => onRemove(r.id)}
                className="absolute top-2 end-2 p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
              >
                <Trash2 size={13} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
