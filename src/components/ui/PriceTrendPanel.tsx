import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { TrendingUp, ArrowUpRight, AlertTriangle } from 'lucide-react'
import { analyticsApi, PriceIntelligenceResult } from '../../api/analytics.api'
import { PriceMiniChart, PriceMiniChartSkeleton, PricePoint } from './PriceMiniChart'

const RANGES = [
  { label: '30 يوم', days: 30 },
  { label: '90 يوم', days: 90 },
  { label: '180 يوم', days: 180 },
]

interface Props {
  productId: string
  /** If omitted, the panel auto-selects the first available supplier */
  supplierTenantId?: string
  /** Used to build a deep-link to the Price Intelligence page */
  productName?: string
  title?: string
}

interface RegionalPrice {
  supplierTenantId: string
  region: string
  latestPrice: number
  currency: string
  priceChange30d: number
}

export function PriceTrendPanel({ productId, supplierTenantId: supplierProp, productName, title }: Props) {
  const [days, setDays] = useState(90)
  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null)

  const { data: regional, isLoading: loadingRegional } = useQuery<RegionalPrice[]>({
    queryKey: ['regional-pricing', productId],
    queryFn: () => analyticsApi.getRegionalPricing(productId).then(r => r.data),
    enabled: !supplierProp && !!productId,
    staleTime: 5 * 60_000,
  })

  const resolvedSupplier = supplierProp ?? selectedSupplier ?? regional?.[0]?.supplierTenantId
  const currency = regional?.find(r => r.supplierTenantId === resolvedSupplier)?.currency
    ?? regional?.[0]?.currency ?? 'EGP'

  const { data: trend, isLoading: loadingTrend } = useQuery<PricePoint[]>({
    queryKey: ['price-trend', productId, resolvedSupplier, days],
    queryFn: () =>
      analyticsApi
        .getPriceTrend(productId, resolvedSupplier!, days)
        .then(r => r.data),
    enabled: !!resolvedSupplier && !!productId,
    staleTime: 5 * 60_000,
  })

  // Pull the overpayment signal from the same backend the full page uses —
  // so the drawer never disagrees with the page on whether the pharmacy is
  // paying too much. Cheap call, indexed query, fully cached for 5 min.
  const { data: intel } = useQuery<PriceIntelligenceResult>({
    queryKey: ['price-intel-mini', productId],
    queryFn: () => analyticsApi.getPriceHistory(productId, 90).then(r => r.data),
    enabled: !!productId,
    staleTime: 5 * 60_000,
  })

  const isLoading = loadingRegional || loadingTrend
  const noData = !isLoading && !resolvedSupplier
  const multipleSuppliers = !supplierProp && (regional?.length ?? 0) > 1

  // Build deep-link to Price Intelligence page
  const piParams = new URLSearchParams({ productId })
  if (productName) piParams.set('productName', productName)
  const piLink = `/pharmacy/price-intelligence?${piParams.toString()}`

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-3 space-y-2.5">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <TrendingUp size={13} className="text-emerald-600 shrink-0" />
          <span className="text-[11px] font-semibold text-gray-700">
            {title ?? 'تاريخ السعر'}
          </span>
          {multipleSuppliers && (
            <span className="text-[10px] text-gray-400">— مورد واحد في المرة</span>
          )}
        </div>

        {/* Range toggle */}
        <div className="flex gap-1">
          {RANGES.map(r => (
            <button
              key={r.days}
              onClick={() => setDays(r.days)}
              disabled={!resolvedSupplier}
              className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
                days === r.days
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              } disabled:opacity-40`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Supplier switcher — shown only when multiple suppliers exist */}
      {multipleSuppliers && regional && (
        <div className="flex flex-wrap gap-1.5">
          {regional.map((s, i) => {
            const isActive = resolvedSupplier === s.supplierTenantId
            return (
              <button
                key={s.supplierTenantId}
                onClick={() => setSelectedSupplier(s.supplierTenantId)}
                className={`px-2 py-1 rounded-lg text-[10px] font-medium transition-colors border ${
                  isActive
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                مورد {i + 1}
                <span className="ms-1 font-bold tabular-nums">
                  {Number(s.latestPrice).toFixed(1)} {s.currency || 'ج.م'}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* Chart body */}
      {noData ? (
        <div className="flex items-center justify-center h-16 rounded-lg bg-gray-50">
          <p className="text-[11px] text-gray-400">لا توجد بيانات سعرية لهذا المنتج</p>
        </div>
      ) : isLoading ? (
        <PriceMiniChartSkeleton />
      ) : (
        <PriceMiniChart points={trend ?? []} currency={currency} />
      )}

      {/* Overpayment strip — matches the full page exactly (same endpoint,
          same threshold). Sits between data and CTA so the pharmacist sees
          it just before clicking "open in price intelligence". */}
      {intel?.overpaymentWarning && (
        <Link
          to={piLink}
          className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 transition-colors"
        >
          <AlertTriangle size={12} className="text-red-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold text-red-800 leading-tight">
              تدفع +{intel.overpaymentPct}% فوق المتوسط
              <span className="text-[10px] text-red-500 font-medium ms-1">
                (الحد: {intel.overpaymentThresholdPct}%)
              </span>
            </p>
            {intel.marketplaceBestPrice !== null && (
              <p className="text-[10px] text-red-600 truncate">
                أرخص بديل على السوق المفتوح: {intel.marketplaceBestPrice.toFixed(2)} {currency || 'ج.م'}
              </p>
            )}
          </div>
          <ArrowUpRight size={11} className="text-red-500 shrink-0" />
        </Link>
      )}

      {/* Deep-link to full cross-supplier comparison */}
      {!noData && (
        <Link
          to={piLink}
          className="flex items-center justify-between gap-2 mt-1 pt-2 border-t border-gray-100 text-[11px] text-violet-600 hover:text-violet-800 font-medium group"
        >
          <span>
            {multipleSuppliers
              ? `مقارنة جميع الموردين (${regional?.length}) في صفحة ذكاء الأسعار`
              : 'عرض المقارنة الشاملة مع كل الموردين'}
          </span>
          <ArrowUpRight size={12} className="group-hover:translate-x-[-2px] group-hover:translate-y-[-2px] transition-transform" />
        </Link>
      )}
    </div>
  )
}
