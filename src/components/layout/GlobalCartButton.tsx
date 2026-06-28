import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ShoppingCart, Zap, ChevronLeft } from 'lucide-react'
import clsx from 'clsx'
import { procurementApi } from '../../api/procurement.api'
import { useManualCart, manualCartItemCount, manualCartTotal } from '../../store/manualCart.store'
import { useCartUi } from '../../store/cartUi.store'
import { ProcurementCartDrawer } from '../pharmacy/ProcurementCartDrawer'
import { ManualCartDrawer } from '../pharmacy/ManualCartDrawer'

const fmtEGP = (n: number) =>
  `${new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 0 }).format(Math.round(n))} ج.م`

/**
 * Persistent cart entry-point for pharmacy users — lives in the top nav so a
 * saved cart is reachable from every page (not just the catalog). Shows a
 * combined item-count badge and a popover that lets the pharmacist open either
 * the smart-plan cart or the manual purchase cart.
 */
export function GlobalCartButton() {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const { openSmart, openManual, smartOpen, manualOpen, closeSmart, closeManual } = useCartUi()

  // Manual cart — localStorage-backed, always available
  const manualGroups = useManualCart((s) => s.groups)
  const manualCount = manualCartItemCount(manualGroups)
  const manualSum = manualCartTotal(manualGroups)

  // Smart plan cart — server-persisted; kept in sync via the shared query key
  const cartQuery = useQuery({
    queryKey: ['procurement-cart'],
    queryFn: () => procurementApi.getCart().then((r) => r.data),
    staleTime: 30_000,
    refetchInterval: 120_000,
  })
  const smartCount = cartQuery.data?.items.length ?? 0
  const smartSum = cartQuery.data?.totalCost ?? 0
  const smartHasStale = cartQuery.data?.hasStaleItems ?? false

  const totalCount = manualCount + smartCount

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <>
      <div ref={menuRef} className="relative">
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="relative p-2 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
          aria-label="السلة"
          title="السلة"
        >
          <ShoppingCart size={20} />
          {totalCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-emerald-600 text-white text-[10px] font-bold px-1">
              {totalCount}
            </span>
          )}
          {smartHasStale && (
            <span className="absolute top-0.5 left-0.5 w-2 h-2 rounded-full bg-amber-400 ring-2 ring-white" title="بعض الأسعار تحتاج تحديث" />
          )}
        </button>

        {menuOpen && (
          <div className="absolute left-0 mt-2 w-72 bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden z-50" dir="rtl">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-sm font-bold text-gray-900">سلاتك المحفوظة</p>
              <p className="text-[11px] text-gray-500 mt-0.5">محفوظة تلقائياً — لن تفقد أصنافك</p>
            </div>

            {/* Smart plan cart */}
            <button
              onClick={() => { setMenuOpen(false); openSmart() }}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-emerald-50 transition-colors text-right"
            >
              <span className="p-2 rounded-lg bg-emerald-100 text-emerald-700 shrink-0">
                <Zap size={16} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-gray-900">الخطة الذكية</span>
                <span className="block text-[11px] text-gray-500">
                  {smartCount > 0 ? `${smartCount} صنف · ${fmtEGP(smartSum)}` : 'فارغة'}
                  {smartHasStale && smartCount > 0 && <span className="text-amber-600"> · تحتاج تحديث</span>}
                </span>
              </span>
              {smartCount > 0 && (
                <span className="min-w-[20px] h-5 flex items-center justify-center rounded-full bg-emerald-600 text-white text-[10px] font-bold px-1.5 shrink-0">
                  {smartCount}
                </span>
              )}
              <ChevronLeft size={16} className="text-gray-400 shrink-0" />
            </button>

            {/* Manual cart */}
            <button
              onClick={() => { setMenuOpen(false); openManual() }}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-right border-t border-gray-100"
            >
              <span className="p-2 rounded-lg bg-gray-100 text-gray-700 shrink-0">
                <ShoppingCart size={16} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-gray-900">سلة الشراء</span>
                <span className="block text-[11px] text-gray-500">
                  {manualCount > 0 ? `${manualCount} صنف · ${fmtEGP(manualSum)}` : 'فارغة'}
                </span>
              </span>
              {manualCount > 0 && (
                <span className="min-w-[20px] h-5 flex items-center justify-center rounded-full bg-gray-700 text-white text-[10px] font-bold px-1.5 shrink-0">
                  {manualCount}
                </span>
              )}
              <ChevronLeft size={16} className="text-gray-400 shrink-0" />
            </button>

            {totalCount === 0 && (
              <div className="px-4 py-3 border-t border-gray-100">
                <p className="text-[11px] text-gray-400 text-center leading-relaxed">
                  أضف أصنافاً من <span className="font-semibold text-gray-600">سوق الأدوية</span> وستظهر هنا
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Drawers mounted globally so they open from any page */}
      <ProcurementCartDrawer open={smartOpen} onClose={closeSmart} />
      <ManualCartDrawer open={manualOpen} onClose={closeManual} />
    </>
  )
}
