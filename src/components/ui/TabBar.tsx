import React from 'react'
import clsx from 'clsx'

export interface TabItem<T extends string = string> {
  key: T
  labelAr: string
  labelEn: string
  icon?: React.ElementType
  badge?: number
}

interface TabBarProps<T extends string = string> {
  tabs: TabItem<T>[]
  active: T
  onChange: (key: T) => void
  isRTL?: boolean
  /** 'emerald' for pharmacy/P2P, 'violet' for AI features. Default: 'emerald' */
  color?: 'emerald' | 'violet'
}

const COLOR = {
  emerald: {
    pill:   'bg-emerald-600 text-white shadow-sm',
    badge:  'bg-white text-emerald-700',
    bdgInactive: 'bg-emerald-100 text-emerald-700',
  },
  violet: {
    pill:   'bg-violet-600 text-white shadow-sm',
    badge:  'bg-white text-violet-700',
    bdgInactive: 'bg-violet-100 text-violet-700',
  },
}

export function TabBar<T extends string>({
  tabs,
  active,
  onChange,
  isRTL = false,
  color = 'emerald',
}: TabBarProps<T>) {
  const c = COLOR[color]

  return (
    <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-2xl p-1 overflow-x-auto shrink-0">
      {tabs.map(tab => {
        const Icon = tab.icon
        const isActive = active === tab.key
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={clsx(
              'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap',
              isActive ? c.pill : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
            )}
          >
            {Icon && <Icon size={15} />}
            {isRTL ? tab.labelAr : tab.labelEn}
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className={clsx(
                'ms-1 min-w-[20px] h-5 px-1.5 rounded-full text-[11px] flex items-center justify-center font-bold',
                isActive ? c.badge : c.bdgInactive,
              )}>
                {tab.badge > 99 ? '99+' : tab.badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
