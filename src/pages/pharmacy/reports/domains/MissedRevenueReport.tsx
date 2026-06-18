import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { TrendingDown, Package, AlertTriangle, Info } from 'lucide-react'
import { posApi } from '../../../../api/pos.api'
import { useCurrency } from '../../../../hooks/useCurrency'

const DAYS_OPTIONS = [7, 14, 30, 90]

function StatCard({ label, value, sub, color = 'text-gray-900' }: {
  label: string; value: string; sub?: string; color?: string
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-black tabular-nums ${color}`}>{value}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

export default function MissedRevenueReport() {
  const { fmt } = useCurrency()
  const [days, setDays] = useState(30)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['missed-demand-report', days],
    queryFn: () => posApi.getMissedDemandReport(days),
    staleTime: 5 * 60_000,
  })

  const maxMiss = useMemo(
    () => Math.max(...(data?.topMissedProducts ?? []).map(p => p.missCount), 1),
    [data],
  )

  return (
    <div className="space-y-6 pb-10" dir="rtl">
      {/* Header */}
      <div className="bg-gradient-to-br from-rose-600 to-rose-700 rounded-2xl p-6 text-white">
        <div className="flex items-center gap-2 mb-2">
          <TrendingDown size={18} className="text-rose-200" />
          <span className="text-rose-200 text-sm font-medium">خسائر الإيراد الضائع</span>
        </div>
        <h1 className="text-2xl font-bold mb-1">طلبات لم تتمكن من تلبيتها</h1>
        <p className="text-rose-100 text-sm leading-relaxed max-w-xl">
          كل مرة يطلب عميل منتجاً غير متوفر ويُسجَّل ذلك من الكاشير — يُحتسب هنا.
          هذه الأرقام تُظهر الإيراد الذي خرج من الباب ولم يُسجَّل في المبيعات.
        </p>

        {/* Why register notice */}
        <div className="mt-4 bg-white/15 rounded-xl px-4 py-3 flex items-start gap-3">
          <Info size={16} className="text-rose-100 shrink-0 mt-0.5" />
          <div className="text-sm text-white/90 leading-relaxed">
            <span className="font-semibold text-white">لماذا تسجّل الطلبات غير المتوفرة؟</span>
            {' '}كل تسجيل من الكاشير يُعلّم النظام ماذا يطلب العملاء — فيُحسّن طلبات الشراء المستقبلية
            ويمنع تكرار نفس الخسارة.
          </div>
        </div>
      </div>

      {/* Period picker */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500 shrink-0">آخر:</span>
        <div className="flex gap-1.5">
          {DAYS_OPTIONS.map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                days === d
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {d} يوم
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 bg-gray-100 animate-pulse rounded-2xl" />
          ))}
        </div>
      )}

      {isError && (
        <div className="p-5 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
          <AlertTriangle size={16} /> تعذّر تحميل البيانات — تأكد من تسجيل الدخول وأعد المحاولة.
        </div>
      )}

      {data && (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard
              label="إجمالي طلبات لم تُلَبَّ"
              value={data.totalMissedEntries.toLocaleString('ar-EG')}
              sub={`خلال ${days} يوم`}
              color="text-rose-700"
            />
            <StatCard
              label="إيراد ضائع مقدَّر"
              value={fmt(data.totalEstimatedLoss)}
              sub="بناءً على سعر بيع كل منتج"
              color="text-rose-700"
            />
            <StatCard
              label="متوسط الخسارة اليومية"
              value={fmt(data.totalEstimatedLoss / Math.max(days, 1))}
              sub="الأيام التي سُجّل فيها نشاط"
            />
          </div>

          {/* Zero state */}
          {data.totalMissedEntries === 0 && (
            <div className="p-8 rounded-2xl bg-gray-50 border border-gray-200 text-center">
              <Package size={32} className="text-gray-300 mx-auto mb-3" />
              <p className="font-semibold text-gray-700 mb-1">لا توجد تسجيلات خلال هذه الفترة</p>
              <p className="text-sm text-gray-500 max-w-sm mx-auto">
                لتفعيل هذا التقرير: عندما يطلب عميل منتجاً غير متوفر في الكاشير، اضغط "سجّل طلب العميل" بجانب المنتج.
              </p>
            </div>
          )}

          {/* Top missed products */}
          {data.topMissedProducts.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                <TrendingDown size={16} className="text-rose-600" />
                <h2 className="font-semibold text-gray-900">أكثر المنتجات المطلوبة والغائبة</h2>
              </div>
              <div className="divide-y divide-gray-50">
                {data.topMissedProducts.map((p, i) => {
                  const pct = Math.round((p.missCount / maxMiss) * 100)
                  return (
                    <div key={`${p.productId}-${i}`} className="px-5 py-3.5 flex items-center gap-4">
                      <span className="text-xs font-bold text-gray-400 w-5 shrink-0">#{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-800 text-sm truncate">{p.productName}</p>
                        <div className="mt-1.5 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-rose-400 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-rose-700 tabular-nums">{p.missCount} مرة</p>
                        {p.estimatedLoss > 0 && (
                          <p className="text-[11px] text-gray-400 tabular-nums">{fmt(p.estimatedLoss)}</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Daily trend */}
          {data.dailyTrend.length > 1 && (
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900">الطلبات الضائعة يومياً</h2>
              </div>
              <div className="p-5">
                <div className="flex items-end gap-1 h-24">
                  {data.dailyTrend.map((row, i) => {
                    const maxCount = Math.max(...data.dailyTrend.map(r => r.missCount), 1)
                    const h = Math.max(4, Math.round((row.missCount / maxCount) * 88))
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                        <div
                          className="w-full bg-rose-200 hover:bg-rose-400 rounded transition-colors cursor-default"
                          style={{ height: `${h}px` }}
                          title={`${row.date}: ${row.missCount} طلب`}
                        />
                        {i % Math.ceil(data.dailyTrend.length / 6) === 0 && (
                          <span className="text-[9px] text-gray-400 tabular-nums rotate-45 origin-right">
                            {row.date.slice(5)}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* CTA to POS */}
          <div className="p-5 rounded-2xl bg-rose-50 border border-rose-200 flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
              <Info size={18} />
            </div>
            <div>
              <p className="font-semibold text-rose-900 text-sm mb-1">هل هذه الأرقام أقل مما تتوقع؟</p>
              <p className="text-rose-800/80 text-sm leading-relaxed">
                تذكير للكاشير: عند طلب منتج غير متوفر، اضغط <strong>"سجّل طلب العميل"</strong> في شاشة البحث
                داخل كاشير الصيدلية — خمس ثوانٍ تُحوّل طلباً ضائعاً إلى بيانات تُحسّن المخزون.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
