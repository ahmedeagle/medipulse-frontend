import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  TrendingDown, TrendingUp, Search, AlertTriangle, Loader2, BarChart2, X, LineChart, CheckCircle2, Calendar,
} from 'lucide-react'
import { analyticsApi, PriceIntelligenceResult } from '../../api/analytics.api'
import { inventoryApi } from '../../api/inventory.api'

const PALETTE = [
  '#0d9488', '#7c3aed', '#ea580c', '#0284c7',
  '#db2777', '#65a30d', '#d97706', '#475569',
]

// ─── Inline SVG line chart ────────────────────────────────────────────────────

interface ChartPoint { date: string; price: number }

function MiniLineChart({
  series, height = 160,
}: {
  series: Array<{ supplierName: string; points: ChartPoint[]; color: string }>
  height?: number
}) {
  if (!series.length || series.every((s) => !s.points.length)) return null

  const allPrices = series.flatMap((s) => s.points.map((p) => p.price))
  const minP = Math.min(...allPrices) * 0.97
  const maxP = Math.max(...allPrices) * 1.03
  const allDates = [...new Set(series.flatMap((s) => s.points.map((p) => p.date)))].sort()
  const W = 600; const H = height
  const PAD = { t: 10, r: 10, b: 28, l: 52 }
  const innerW = W - PAD.l - PAD.r
  const innerH = H - PAD.t - PAD.b

  const xScale = (date: string) => {
    const idx = allDates.indexOf(date)
    return PAD.l + (idx / Math.max(allDates.length - 1, 1)) * innerW
  }
  const yScale = (price: number) =>
    PAD.t + innerH - ((price - minP) / (maxP - minP || 1)) * innerH

  const yTicks = 4
  const yStep = (maxP - minP) / yTicks

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }} aria-label="مخطط سعر المنتج">
      {Array.from({ length: yTicks + 1 }, (_, i) => {
        const price = minP + i * yStep
        const y = yScale(price)
        return (
          <g key={i}>
            <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} stroke="#f1f5f9" strokeWidth={1} />
            <text x={PAD.l - 6} y={y + 4} fontSize={9} fill="#94a3b8" textAnchor="end">{price.toFixed(0)}</text>
          </g>
        )
      })}
      {[0, Math.floor(allDates.length / 2), allDates.length - 1].map((idx) => {
        const d = allDates[idx]
        if (!d) return null
        return (
          <text key={d} x={xScale(d)} y={H - 6} fontSize={9} fill="#94a3b8" textAnchor="middle">
            {d.slice(5)}
          </text>
        )
      })}
      {series.map((s) => {
        if (s.points.length < 2) return null
        const d = s.points
          .map((p, i) => `${i === 0 ? 'M' : 'L'}${xScale(p.date).toFixed(1)},${yScale(p.price).toFixed(1)}`)
          .join(' ')
        return (
          <path key={s.supplierName} d={d} fill="none" stroke={s.color}
            strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        )
      })}
      {series.map((s) => {
        const last = s.points[s.points.length - 1]
        if (!last) return null
        return (
          <circle key={`dot-${s.supplierName}`}
            cx={xScale(last.date)} cy={yScale(last.price)}
            r={3.5} fill={s.color} stroke="white" strokeWidth={1.5} />
        )
      })}
    </svg>
  )
}

// ─── Product search combobox ──────────────────────────────────────────────────

interface ProductOption { id: string; name: string; genericName?: string; category?: string }

function useDebounce<T>(value: T, delay: number): T {
  const [d, setD] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setD(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return d
}

function ProductCombobox({
  value, onChange,
}: {
  value: ProductOption | null
  onChange: (p: ProductOption | null) => void
}) {
  const [input, setInput] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const debouncedInput = useDebounce(input, 300)

  const { data: results, isFetching } = useQuery({
    queryKey: ['product-search', debouncedInput],
    queryFn: () => inventoryApi.getProducts(debouncedInput).then((r: any) => {
      const d = r.data
      return (Array.isArray(d) ? d : (d?.data ?? [])) as ProductOption[]
    }),
    enabled: debouncedInput.length >= 2,
    staleTime: 30_000,
  })

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  if (value) {
    return (
      <div className="flex items-center gap-2 px-3 py-2.5 border border-teal-300 bg-teal-50 rounded-xl text-sm min-w-[280px]">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-teal-900 truncate">{value.name}</p>
          {value.genericName && <p className="text-[11px] text-teal-600 truncate">{value.genericName}</p>}
        </div>
        <button type="button" onClick={() => onChange(null)} className="shrink-0 p-0.5 text-teal-500 hover:text-teal-800">
          <X size={14} />
        </button>
      </div>
    )
  }

  return (
    <div ref={ref} className="relative min-w-[280px]">
      <div className="relative">
        <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="ابحث باسم المنتج أو المادة الفعّالة…"
          value={input}
          onChange={(e) => { setInput(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          className="w-full border border-gray-200 rounded-xl pr-9 pl-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
        />
        {isFetching && (
          <Loader2 size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-teal-500 animate-spin" />
        )}
      </div>

      {open && debouncedInput.length >= 2 && (
        <div className="absolute top-full mt-1 w-full bg-white rounded-xl border border-gray-200 shadow-lg z-50 max-h-64 overflow-y-auto">
          {!results?.length ? (
            <p className="px-4 py-3 text-sm text-gray-400 text-center">
              {isFetching ? 'جارٍ البحث…' : 'لا توجد نتائج'}
            </p>
          ) : (
            results.slice(0, 10).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => { onChange(p); setOpen(false); setInput('') }}
                className="w-full text-right px-4 py-2.5 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0"
              >
                <p className="text-sm font-medium text-gray-900">{p.name}</p>
                {p.genericName && <p className="text-[11px] text-gray-400">{p.genericName}</p>}
                {p.category && <p className="text-[10px] text-gray-300">{p.category}</p>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PriceIntelligencePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [product, setProduct] = useState<ProductOption | null>(() => {
    // Pre-select when navigated from inventory drawer deep-link
    const id   = searchParams.get('productId')
    const name = searchParams.get('productName')
    if (id && name) return { id, name }
    return null
  })
  const [days, setDays] = useState(90)
  // Custom from/to override the relative `days` selector when both are set.
  // We render an explicit "مخصّص" pill that toggles a date-range row.
  const [customMode, setCustomMode] = useState(false)
  const todayISO = new Date().toISOString().slice(0, 10)
  const ninetyDaysAgoISO = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10)
  const [fromDate, setFromDate] = useState<string>(ninetyDaysAgoISO)
  const [toDate,   setToDate]   = useState<string>(todayISO)
  const rangeValid = customMode && !!fromDate && !!toDate && fromDate <= toDate

  // Clean the URL params once consumed so back-navigation works cleanly
  useEffect(() => {
    if (searchParams.get('productId')) {
      setSearchParams({}, { replace: true })
    }
  // only on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const query = useQuery({
    queryKey: ['price-intelligence', product?.id, days, customMode ? fromDate : null, customMode ? toDate : null],
    queryFn: () => analyticsApi
      .getPriceHistory(product!.id, days, rangeValid ? { from: fromDate, to: toDate } : undefined)
      .then((r) => r.data),
    enabled: !!product && (!customMode || rangeValid),
    staleTime: 5 * 60_000,
  })

  const data: PriceIntelligenceResult | undefined = query.data
  // Marketplace gets a distinctive purple — easy to spot in the chart vs suppliers.
  const MARKETPLACE_COLOR = '#9333ea'
  const chartSeries = data
    ? data.series.map((s, i) => ({
        ...s,
        color: s.isMarketplace ? MARKETPLACE_COLOR : PALETTE[i % PALETTE.length],
      }))
    : []

  return (
    <div className="space-y-5">
      {/* Hero card */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="flex items-start justify-between gap-5 p-6 flex-wrap">
          <div className="flex items-start gap-5 min-w-0">
            <div className="p-4 rounded-2xl shrink-0 bg-violet-50">
              <LineChart size={26} className="text-violet-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-violet-500 uppercase tracking-wider mb-1">ذكاء الأسعار</p>
              <h1 className="text-2xl font-bold text-gray-900">مقارنة أسعار الموردين</h1>
              <p className="text-gray-500 mt-1.5 text-sm leading-relaxed max-w-xl">
                ابحث عن أي منتج لترى كيف تغير سعره عبر الوقت عند كل مورد — وهل تدفع أكثر من اللازم مقارنةً بمتوسط السوق.
              </p>
              <div className="flex flex-wrap gap-4 mt-3">
                {[
                  { icon: BarChart2, text: 'مقارنة الأسعار عبر الموردين' },
                  { icon: TrendingDown, text: 'كشف الدفع الزائد تلقائياً' },
                  { icon: CheckCircle2, text: 'تحديد أفضل سعر متاح الآن' },
                ].map(({ icon: Icon, text }) => (
                  <div key={text} className="flex items-center gap-1.5 text-xs text-gray-500">
                    <Icon size={12} className="text-violet-500 shrink-0" />
                    <span>{text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Days / custom-range selector */}
          <div className="flex flex-col gap-2 shrink-0 self-start mt-1">
            <div className="flex items-center gap-0 border border-gray-200 rounded-xl overflow-hidden text-xs">
              {[30, 60, 90, 180].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => { setDays(d); setCustomMode(false) }}
                  className={`px-3.5 py-2 transition-colors font-medium ${
                    !customMode && days === d ? 'bg-teal-600 text-white' : 'text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {d} يوم
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCustomMode(true)}
                className={`px-3.5 py-2 transition-colors font-medium border-r border-gray-200 ${
                  customMode ? 'bg-teal-600 text-white' : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                <Calendar size={11} className="inline -mt-0.5 ms-1" />
                مخصّص
              </button>
            </div>
            {customMode && (
              <div className="flex items-center gap-2 text-xs justify-end">
                <label className="flex items-center gap-1 text-gray-500">
                  من
                  <input
                    type="date"
                    value={fromDate}
                    max={toDate || todayISO}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </label>
                <label className="flex items-center gap-1 text-gray-500">
                  إلى
                  <input
                    type="date"
                    value={toDate}
                    min={fromDate}
                    max={todayISO}
                    onChange={(e) => setToDate(e.target.value)}
                    className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </label>
                {!rangeValid && (
                  <span className="text-[10px] text-red-500">من ≤ إلى</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3 flex-wrap">
        <ProductCombobox value={product} onChange={setProduct} />
        {query.isFetching && product && (
          <div className="flex items-center gap-2 text-sm text-teal-600">
            <Loader2 size={15} className="animate-spin" />
            <span>جارٍ التحليل…</span>
          </div>
        )}
      </div>

      {/* Empty state */}
      {!product && (
        <div className="bg-white rounded-2xl border border-gray-200 p-10 flex flex-col items-center gap-3 text-center">
          <div className="w-14 h-14 rounded-2xl bg-teal-50 flex items-center justify-center">
            <BarChart2 size={26} className="text-teal-600" />
          </div>
          <p className="text-base font-semibold text-gray-700">ابحث عن منتج لعرض تحليل الأسعار</p>
          <p className="text-sm text-gray-400 max-w-sm">
            اكتب اسم المنتج أو المادة الفعّالة في حقل البحث أعلاه — سيظهر لك مقارنة الأسعار عبر جميع الموردين.
          </p>
        </div>
      )}

      {data && (
        <>
          {/* Overpayment warning */}
          {data.overpaymentWarning && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-red-200 bg-red-50">
              <AlertTriangle size={16} className="text-red-600 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-800">
                  تدفع {data.overpaymentPct}% أكثر من متوسط السوق
                  <span className="text-[10px] font-medium text-red-500 ms-2">
                    (الحد المسموح: {data.overpaymentThresholdPct}%)
                  </span>
                </p>
                <p className="text-xs text-red-700 mt-0.5">
                  آخر سعر: {data.lastPricePaid?.toFixed(2)} ج.م — متوسط السوق: {data.avgPrice?.toFixed(2)} ج.م
                  {data.marketplaceBestPrice !== null && (
                    <>
                      {' '}— أرخص عرض على السوق المفتوح:{' '}
                      <span className="font-bold">{data.marketplaceBestPrice.toFixed(2)} ج.م</span>
                    </>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              {
                label: 'أفضل سعر متاح الآن',
                value: data.bestPriceNow?.toFixed(2),
                color: 'text-emerald-700',
                suffix: 'ج.م',
                hint: data.marketplaceBestPrice !== null && data.bestPriceNow === data.marketplaceBestPrice
                  ? 'من السوق المفتوح'
                  : 'من المورّدين',
              },
              { label: 'متوسط السوق', value: data.avgPrice?.toFixed(2), color: 'text-gray-900', suffix: 'ج.م' },
              {
                label: 'آخر سعر دفعته',
                value: data.lastPricePaid?.toFixed(2) ?? '—',
                color: data.overpaymentPct > 0 ? 'text-red-700' : 'text-gray-900',
                suffix: data.lastPricePaid ? 'ج.م' : '',
                badge: data.overpaymentPct !== 0 && data.lastPricePaid ? (
                  <span className={`text-xs font-bold ms-1 ${data.overpaymentPct > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {data.overpaymentPct > 0 ? <TrendingUp size={11} className="inline" /> : <TrendingDown size={11} className="inline" />}
                    {data.overpaymentPct > 0 ? '+' : ''}{data.overpaymentPct}%
                  </span>
                ) : null,
              },
              { label: 'عدد الموردين', value: String(data.series.length), color: 'text-gray-900', suffix: '' },
            ].map((card, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-200 p-4">
                <p className="text-[11px] text-gray-500 mb-1">{card.label}</p>
                <p className={`text-xl font-bold tabular-nums ${card.color}`}>
                  {card.value ?? '—'}{card.suffix ? ` ${card.suffix}` : ''}
                  {'badge' in card && card.badge}
                </p>
                {'hint' in card && card.hint && (
                  <p className="text-[10px] text-gray-400 mt-1">{card.hint}</p>
                )}
              </div>
            ))}
          </div>

          {/* Chart */}
          {chartSeries.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-4">
                <BarChart2 size={16} className="text-teal-600" />
                <h3 className="text-sm font-semibold text-gray-800">تطور الأسعار — {days} يوم</h3>
              </div>
              <MiniLineChart series={chartSeries} height={190} />
              <div className="flex flex-wrap gap-4 mt-4 pt-3 border-t border-gray-50">
                {chartSeries.map((s) => (
                  <div key={s.supplierName} className="flex items-center gap-2 text-xs text-gray-600">
                    <span className="inline-block rounded-full" style={{ backgroundColor: s.color, height: 3, width: 16 }} />
                    {s.supplierName}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Supplier breakdown */}
          {data.supplierBreakdown.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-800">مقارنة الموردين</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500">
                    <tr>
                      <th className="px-5 py-2.5 text-right font-medium">المورد</th>
                      <th className="px-5 py-2.5 text-right font-medium">آخر سعر</th>
                      <th className="px-5 py-2.5 text-right font-medium">الأدنى</th>
                      <th className="px-5 py-2.5 text-right font-medium">الأعلى</th>
                      <th className="px-5 py-2.5 text-right font-medium">المتوسط</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {[...data.supplierBreakdown]
                      .sort((a, b) => a.latestPrice - b.latestPrice)
                      .map((s) => {
                        const isBest = s.latestPrice === data.bestPriceNow
                        const isMarket = s.isMarketplace === true
                        return (
                          <tr
                            key={s.supplierId}
                            className={
                              isMarket
                                ? 'bg-purple-50/50 hover:bg-purple-50'
                                : isBest
                                  ? 'bg-emerald-50/50'
                                  : 'hover:bg-gray-50/60'
                            }
                          >
                            <td className="px-5 py-3 font-medium text-gray-900">
                              {s.supplierName}
                              {isMarket && (
                                <span className="ms-2 px-1.5 py-0.5 rounded-md bg-purple-100 text-purple-700 text-[10px] font-bold">
                                  سوق مفتوح
                                </span>
                              )}
                              {isBest && !isMarket && (
                                <span className="ms-2 px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-700 text-[10px] font-bold">
                                  أفضل
                                </span>
                              )}
                              {isBest && isMarket && (
                                <span className="ms-2 px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-700 text-[10px] font-bold">
                                  أفضل
                                </span>
                              )}
                            </td>
                            <td className="px-5 py-3 tabular-nums font-semibold text-gray-900">{s.latestPrice.toFixed(2)}</td>
                            <td className="px-5 py-3 tabular-nums text-emerald-700 font-medium">{s.minPrice.toFixed(2)}</td>
                            <td className="px-5 py-3 tabular-nums text-gray-500">{s.maxPrice.toFixed(2)}</td>
                            <td className="px-5 py-3 tabular-nums text-gray-700">{s.avgPrice.toFixed(2)}</td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* No data for selected product */}
          {data.series.length === 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center text-sm text-gray-400">
              لا توجد بيانات أسعار لهذا المنتج في الفترة المحددة
            </div>
          )}
        </>
      )}
    </div>
  )
}
