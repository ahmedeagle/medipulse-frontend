import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { TrendingUp } from 'lucide-react'
import { analyticsApi } from '../../api/analytics.api'
import { PriceMiniChart, PriceMiniChartSkeleton, PricePoint } from './PriceMiniChart'

const RANGES = [
  { label: '30 يوم', days: 30 },
  { label: '90 يوم', days: 90 },
  { label: '180 يوم', days: 180 },
]

interface Props {
  productId: string
  /** Optional: if omitted, the panel auto-selects the first available supplier */
  supplierTenantId?: string
  title?: string
}

interface RegionalPrice {
  supplierTenantId: string
  region: string
  latestPrice: number
  currency: string
  priceChange30d: number
}

export function PriceTrendPanel({ productId, supplierTenantId: supplierProp, title }: Props) {
  const [days, setDays] = useState(90)

  // Step 1: if no supplier given, fetch available suppliers for this product
  const { data: regional, isLoading: loadingRegional } = useQuery<RegionalPrice[]>({
    queryKey: ['regional-pricing', productId],
    queryFn: () => analyticsApi.getRegionalPricing(productId).then(r => r.data),
    enabled: !supplierProp && !!productId,
    staleTime: 5 * 60_000,
  })

  const resolvedSupplier = supplierProp ?? regional?.[0]?.supplierTenantId
  const currency = regional?.[0]?.currency ?? 'EGP'

  // Step 2: fetch trend for resolved supplier
  const { data: trend, isLoading: loadingTrend } = useQuery<PricePoint[]>({
    queryKey: ['price-trend', productId, resolvedSupplier, days],
    queryFn: () =>
      analyticsApi
        .getPriceTrend(productId, resolvedSupplier!, days)
        .then(r => r.data),
    enabled: !!resolvedSupplier && !!productId,
    staleTime: 5 * 60_000,
  })

  const isLoading = loadingRegional || loadingTrend
  const noData = !isLoading && !resolvedSupplier

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-3 space-y-2.5">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <TrendingUp size={13} className="text-emerald-600 shrink-0" />
          <span className="text-[11px] font-semibold text-gray-700">
            {title ?? 'تاريخ السعر'}
          </span>
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
    </div>
  )
}
