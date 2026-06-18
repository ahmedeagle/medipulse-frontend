import { X, AlertCircle, AlertTriangle, Info, CheckCircle, Zap } from 'lucide-react'
import { Link } from 'react-router-dom'

export type InsightSeverity = 'critical' | 'warning' | 'info' | 'ok'

export interface Insight {
  text: string
  severity: InsightSeverity
}

interface Props {
  insights: Insight[]
  domainLabel: string
  onClose: () => void
}

const SEV = {
  critical: { Icon: AlertCircle,  color: 'text-red-600',     bg: 'bg-red-50 border-red-200'     },
  warning:  { Icon: AlertTriangle, color: 'text-amber-600',  bg: 'bg-amber-50 border-amber-200' },
  info:     { Icon: Info,          color: 'text-blue-600',   bg: 'bg-blue-50 border-blue-200'   },
  ok:       { Icon: CheckCircle,   color: 'text-teal-600',   bg: 'bg-teal-50 border-teal-200'   },
}

export function InsightPanel({ insights, domainLabel, onClose }: Props) {
  const hasActionable = insights.some(i => i.severity === 'critical' || i.severity === 'warning')

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-6">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gradient-to-l from-teal-50 to-white">
          <div>
            <p className="font-bold text-gray-900 text-base">ملاحظات البيانات</p>
            <p className="text-sm text-gray-500 mt-0.5">{domainLabel}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3 max-h-[50vh] overflow-y-auto">
          {insights.map((ins, i) => {
            const { Icon, color, bg } = SEV[ins.severity]
            return (
              <div key={i} className={`flex items-start gap-3 px-4 py-4 rounded-xl border ${bg}`}>
                <Icon size={20} className={`${color} shrink-0 mt-0.5`} />
                <p className="text-base font-medium text-gray-900 leading-relaxed">{ins.text}</p>
              </div>
            )
          })}
        </div>

        {/* AI Center CTA — shown when there are actionable issues */}
        {hasActionable && (
          <div className="px-4 pb-4 pt-2 border-t border-gray-100">
            <p className="text-xs text-gray-400 text-center mb-2">
              قد يكون مركز الذكاء أنشأ مهام تنتظر موافقتك بناءً على هذه البيانات
            </p>
            <Link
              to="/pharmacy/ai-center?tab=tasks"
              onClick={onClose}
              className="flex items-center justify-center gap-2 w-full py-3 bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-colors font-semibold text-sm"
            >
              <Zap size={15} />
              راجع مهامك في مركز الذكاء
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
