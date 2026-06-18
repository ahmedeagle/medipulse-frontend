import { type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, type LucideIcon } from 'lucide-react'

interface Props {
  icon: LucideIcon
  iconColor: string
  iconBg: string
  title: string
  subtitle: string
  hint?: string
  children: ReactNode
}

export function DomainShell({ icon: Icon, iconColor, iconBg, title, subtitle, hint, children }: Props) {
  return (
    <div className="space-y-5">
      {/* Back navigation — always visible, prominent */}
      <div className="flex items-center gap-3">
        <Link
          to="/pharmacy/reports"
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-teal-600 hover:border-teal-200 transition-all shadow-sm"
        >
          <ArrowRight size={15} className="rtl:rotate-0 ltr:rotate-180" />
          رجوع للتقارير
        </Link>
        <span className="text-gray-300 select-none">/</span>
        <span className="text-sm text-gray-500 font-medium">{title}</span>
      </div>

      {/* Hero header */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="flex items-start gap-5 p-6">
          <div className={`p-4 rounded-2xl shrink-0 ${iconBg}`}>
            <Icon size={28} className={iconColor} />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
            <p className="text-gray-500 mt-1.5 text-sm leading-relaxed max-w-2xl">{subtitle}</p>
            {hint && (
              <div className="mt-3 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 max-w-2xl">
                <span className="text-base leading-none mt-0.5 shrink-0">💡</span>
                <span className="leading-relaxed">{hint}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {children}
    </div>
  )
}
