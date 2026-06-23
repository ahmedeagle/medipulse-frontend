import { useState, useRef, useLayoutEffect, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { Search, X, Package, AlertTriangle } from 'lucide-react'
import clsx from 'clsx'
import type { ProductSearchResult } from '../../../api/purchases.api'

interface Props {
  value: string
  onSelect: (p: ProductSearchResult) => void
  queryFn: (q: string) => Promise<ProductSearchResult[]>
  queryKey: unknown[]
  placeholder?: string
}

function expiryWarning(dateStr?: string | null) {
  if (!dateStr) return null
  const days = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000)
  if (days <= 0)  return { cls: 'bg-red-50 text-red-600',    label: 'منتهي الصلاحية' }
  if (days <= 30) return { cls: 'bg-red-50 text-red-600',    label: `ينتهي خلال ${days} يوم` }
  if (days <= 90) return { cls: 'bg-amber-50 text-amber-600', label: `ينتهي خلال ${Math.ceil(days / 30)} شهر` }
  return null
}

export function ProductSearchCombobox({ value, onSelect, queryFn, queryKey, placeholder }: Props) {
  const [q, setQ] = useState(value)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, right: 0, width: 0 })
  const inputRef = useRef<HTMLInputElement>(null)

  const { data: results = [], isFetching } = useQuery({
    queryKey: [...queryKey, q],
    queryFn: () => queryFn(q),
    enabled: q.trim().length >= 1,
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  })

  const updatePos = () => {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect()
      setPos({
        top: rect.bottom + 6,
        right: window.innerWidth - rect.right,
        width: Math.max(rect.width, 340),
      })
    }
  }

  useLayoutEffect(() => {
    if (open) updatePos()
  }, [open, q])

  useEffect(() => {
    if (!open) return
    window.addEventListener('scroll', updatePos, true)
    window.addEventListener('resize', updatePos)
    return () => {
      window.removeEventListener('scroll', updatePos, true)
      window.removeEventListener('resize', updatePos)
    }
  }, [open])

  const handleSelect = (p: ProductSearchResult) => {
    setQ(p.name)
    setOpen(false)
    onSelect(p)
  }

  const clear = () => {
    setQ('')
    setOpen(false)
    inputRef.current?.focus()
  }

  const showDropdown = open && q.trim().length >= 1

  return (
    <div className="relative">
      <div className="relative">
        <Search
          size={13}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
        />
        <input
          ref={inputRef}
          type="text"
          value={q}
          placeholder={placeholder ?? 'ابحث بالاسم أو الباركود…'}
          onChange={e => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          className={clsx(
            'w-full pr-7 py-1.5 text-xs rounded-lg border border-gray-200',
            'focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-400',
            q ? 'pl-6' : 'pl-2',
          )}
        />
        {isFetching && q.length >= 1 ? (
          <span className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none">
            <span className="block w-3 h-3 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" />
          </span>
        ) : q ? (
          <button
            tabIndex={-1}
            onMouseDown={e => { e.preventDefault(); clear() }}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X size={12} />
          </button>
        ) : null}
      </div>

      {/* Portal — escapes table overflow-x-auto, anchored to input's right edge (RTL) */}
      {showDropdown && createPortal(
        <div
          dir="rtl"
          style={{
            position: 'fixed',
            top: pos.top,
            right: pos.right,
            minWidth: pos.width,
            zIndex: 9999,
          }}
          className="bg-white rounded-2xl border border-gray-200 shadow-2xl overflow-hidden"
        >
          {isFetching && results.length === 0 ? (
            <div className="py-8 flex justify-center">
              <div className="w-5 h-5 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" />
            </div>
          ) : results.length === 0 ? (
            <div className="py-10 text-center px-4">
              <Package size={28} className="text-gray-200 mx-auto mb-2" />
              <p className="text-gray-500 text-sm font-medium">لا توجد نتائج</p>
              <p className="text-gray-400 text-xs mt-1">جرّب كلمة بحث مختلفة</p>
            </div>
          ) : (
            <div className="max-h-72 overflow-y-auto">
              {results.map((p, idx) => {
                const inStock = Number(p.currentStock) > 0
                const warn = expiryWarning(p.expiryDate)

                return (
                  <button
                    key={p.inventoryItemId ?? p.id}
                    onMouseDown={() => handleSelect(p)}
                    className={clsx(
                      'w-full text-right flex items-center gap-3 px-4 py-3.5 transition-colors border-b border-gray-50 last:border-0 hover:bg-gray-50',
                      idx === 0 && 'bg-emerald-50/40',
                    )}
                  >
                    {/* Icon */}
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gray-100 to-gray-50 flex items-center justify-center shrink-0 border border-gray-100">
                      <Package size={16} className="text-gray-400" />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-800 text-sm truncate">{p.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {p.barcode && (
                          <span className="text-gray-400 text-[11px] font-mono bg-gray-100 px-1.5 py-0.5 rounded">
                            {p.barcode}
                          </span>
                        )}
                        <span className={clsx(
                          'text-[11px] px-2 py-0.5 rounded-full font-semibold',
                          inStock ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600',
                        )}>
                          {inStock ? `المخزون: ${p.currentStock} علبة` : 'غير متوفر'}
                        </span>
                        {warn && (
                          <span className={clsx('text-[11px] px-2 py-0.5 rounded-full font-semibold flex items-center gap-0.5', warn.cls)}>
                            <AlertTriangle size={9} /> {warn.label}
                          </span>
                        )}
                        {p.expiryDate && !warn && (
                          <span className="text-[11px] text-gray-400">
                            ينتهي {new Date(p.expiryDate).toLocaleDateString('ar-EG', { month: 'short', year: 'numeric' })}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Price */}
                    {(p.lastCostPrice ?? 0) > 0 && (
                      <div className="shrink-0 text-left">
                        <p className="font-black text-gray-900 tabular-nums text-sm">
                          {Number(p.lastCostPrice).toFixed(2)}
                          <span className="text-xs font-normal text-gray-400 ms-1">ر.س</span>
                        </p>
                        {p.lastSupplierName && (
                          <p className="text-[10px] text-gray-400 truncate max-w-[90px]">{p.lastSupplierName}</p>
                        )}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>,
        document.body,
      )}
    </div>
  )
}
