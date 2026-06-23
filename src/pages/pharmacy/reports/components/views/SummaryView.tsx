import { LucideIcon } from 'lucide-react'
import clsx from 'clsx'

export interface KpiCard {
  title: string
  value: string | number
  icon: LucideIcon
  iconColor?: string
  iconBg?: string   // kept for API compat, ignored in render
  trend?: string
  trendUp?: boolean
  sub?: string
}

interface Props { cards: KpiCard[] }

function deriveBorder(iconColor = '', isRisk?: boolean): string {
  if (isRisk === true) return 'border-l-red-400'
  if (iconColor.includes('teal'))    return 'border-l-violet-400'
  if (iconColor.includes('emerald')) return 'border-l-emerald-400'
  if (iconColor.includes('amber'))   return 'border-l-amber-400'
  if (iconColor.includes('red'))     return 'border-l-red-400'
  if (iconColor.includes('blue'))    return 'border-l-blue-400'
  if (iconColor.includes('violet'))  return 'border-l-violet-400'
  if (iconColor.includes('slate'))   return 'border-l-slate-400'
  if (iconColor.includes('orange'))  return 'border-l-orange-400'
  return 'border-l-gray-300'
}

export function SummaryView({ cards }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, i) => {
        const Icon      = card.icon
        const isRisk    = card.trendUp === false
        const borderCls = deriveBorder(card.iconColor, isRisk)
        const iconCls   = isRisk ? 'text-red-500' : (card.iconColor ?? 'text-violet-600')

        return (
          <div key={i} className={clsx(
            'bg-white rounded-2xl border border-gray-100 border-l-4 shadow-sm p-5 flex items-start gap-4',
            borderCls,
          )}>
            <div className="shrink-0 mt-0.5">
              <Icon className={clsx('w-5 h-5', iconCls)} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-400 leading-tight">{card.title}</p>
              <p className={clsx(
                'text-2xl font-bold mt-1 leading-none',
                isRisk ? 'text-red-600' : 'text-gray-900',
              )}>
                {card.value}
              </p>
              {card.trend && (
                <p className={clsx('text-xs mt-1.5 font-medium', card.trendUp ? 'text-emerald-600' : 'text-red-500')}>
                  {card.trend}
                </p>
              )}
              {card.sub && <p className="text-xs text-gray-400 mt-1 leading-snug">{card.sub}</p>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

