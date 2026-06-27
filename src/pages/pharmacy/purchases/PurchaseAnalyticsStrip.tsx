import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import { TrendingUp, PieChart as PieIcon, Building2 } from 'lucide-react'
import { purchasesApi, type PurchaseInvoice } from '../../../api/purchases.api'

const fmtMoney = (n: number) =>
  Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })

const fmtMoneyShort = (n: number) => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(Math.round(n))
}

const ARABIC_WEEKDAY = ['أحد', 'إثن', 'ثلا', 'أرب', 'خمي', 'جمع', 'سبت']

export interface AnalyticsFilters {
  q?: string
  status?: string
  paymentStatus?: string
  supplierId?: string
  dateFrom?: string
  dateTo?: string
}

interface Props { filters: AnalyticsFilters }

export default function PurchaseAnalyticsStrip({ filters }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['purchase-invoices-analytics', filters],
    queryFn: () => purchasesApi.getInvoices({ ...filters, page: 1, limit: 500 }),
    staleTime: 60_000,
  })

  const items: PurchaseInvoice[] = data?.items ?? []

  // ── Spend trend (daily for last 30 days, or bucketed if range > 90d) ─────
  const trend = useMemo(() => {
    if (!items.length) return []
    const now = new Date()
    const start = new Date(now); start.setDate(start.getDate() - 29); start.setHours(0, 0, 0, 0)
    const buckets = new Map<string, number>()
    for (let i = 0; i < 30; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i)
      const k = d.toISOString().slice(0, 10)
      buckets.set(k, 0)
    }
    for (const inv of items) {
      if (inv.status === 'cancelled') continue
      const d = inv.invoiceDate ?? inv.createdAt
      if (!d) continue
      const k = new Date(d).toISOString().slice(0, 10)
      if (buckets.has(k)) {
        buckets.set(k, (buckets.get(k) ?? 0) + Number(inv.grandTotal || 0))
      }
    }
    return Array.from(buckets.entries()).map(([date, value]) => {
      const d = new Date(date)
      return {
        date,
        label: `${d.getDate()}/${d.getMonth() + 1}`,
        weekday: ARABIC_WEEKDAY[d.getDay()],
        value: Math.round(value),
      }
    })
  }, [items])

  const trendTotal = useMemo(() => trend.reduce((s, p) => s + p.value, 0), [trend])

  // ── Payment status (by value, excluding cancelled) ────────────────────────
  const paymentMix = useMemo(() => {
    let paid = 0
    let pending = 0
    for (const inv of items) {
      if (inv.status === 'cancelled') continue
      const v = Number(inv.grandTotal || 0)
      if (inv.paymentStatus === 'paid') paid += v
      else pending += v
    }
    const total = paid + pending
    return { paid, pending, total }
  }, [items])

  const paymentData = paymentMix.total > 0
    ? [
        { name: 'مدفوع', value: paymentMix.paid, color: '#059669' },
        { name: 'معلق', value: paymentMix.pending, color: '#f59e0b' },
      ].filter(d => d.value > 0)
    : []

  // ── Top suppliers by spend ────────────────────────────────────────────────
  const topSuppliers = useMemo(() => {
    const map = new Map<string, number>()
    for (const inv of items) {
      if (inv.status === 'cancelled') continue
      const name = inv.supplierName || 'غير محدد'
      map.set(name, (map.get(name) ?? 0) + Number(inv.grandTotal || 0))
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5)
  }, [items])

  const supplierMax = topSuppliers[0]?.value ?? 1

  const empty = !isLoading && items.length === 0

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* ── Spend trend ─────────────────────────────────────────────────── */}
      <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700">
              <TrendingUp size={14} />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">اتجاه الإنفاق</p>
              <p className="text-[11px] text-gray-400">آخر 30 يوماً (حسب التصفية)</p>
            </div>
          </div>
          <div className="text-left">
            <p className="text-[10px] text-gray-400">الإجمالي</p>
            <p className="text-sm font-bold text-emerald-700 tabular-nums">
              {fmtMoney(trendTotal)} <span className="text-[10px] text-gray-400">ر.س</span>
            </p>
          </div>
        </div>

        <div className="h-32">
          {isLoading ? (
            <div className="h-full flex items-center justify-center text-xs text-gray-400">
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-emerald-600 border-t-transparent" />
            </div>
          ) : empty ? (
            <div className="h-full flex items-center justify-center text-xs text-gray-400">
              لا توجد بيانات لعرضها
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                  interval={Math.max(0, Math.floor(trend.length / 6) - 1)}
                  reversed
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                  tickFormatter={fmtMoneyShort}
                  orientation="right"
                />
                <Tooltip
                  contentStyle={{
                    background: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: 10,
                    fontSize: 12,
                    direction: 'rtl',
                  }}
                  labelFormatter={(_, payload) => {
                    const p = payload?.[0]?.payload
                    return p ? `${p.weekday} ${p.label}` : ''
                  }}
                  formatter={(v: number) => [`${fmtMoney(v)} ر.س`, 'إنفاق']}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#059669"
                  strokeWidth={2}
                  fill="url(#spendGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Payment mix + Top suppliers ─────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-amber-50 text-amber-700">
            <PieIcon size={14} />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-800">حالة الدفع</p>
            <p className="text-[11px] text-gray-400">نسبة القيمة المالية</p>
          </div>
        </div>

        {paymentMix.total === 0 ? (
          <div className="h-20 flex items-center justify-center text-xs text-gray-400">
            لا توجد بيانات
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-20 h-20 shrink-0 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={paymentData}
                    dataKey="value"
                    innerRadius={26}
                    outerRadius={38}
                    paddingAngle={2}
                    stroke="none"
                  >
                    {paymentData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <p className="text-[10px] font-bold text-gray-700 tabular-nums">
                  {paymentMix.total > 0
                    ? Math.round((paymentMix.paid / paymentMix.total) * 100)
                    : 0}%
                </p>
              </div>
            </div>
            <div className="flex-1 space-y-1.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-gray-600">
                  <span className="w-2 h-2 rounded-full bg-emerald-600" />
                  مدفوع
                </span>
                <span className="font-semibold text-gray-800 tabular-nums">{fmtMoney(paymentMix.paid)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-gray-600">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  معلق
                </span>
                <span className="font-semibold text-gray-800 tabular-nums">{fmtMoney(paymentMix.pending)}</span>
              </div>
            </div>
          </div>
        )}

        <div className="border-t border-gray-100 pt-3 flex-1">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-lg bg-violet-50 text-violet-700">
              <Building2 size={13} />
            </div>
            <p className="text-sm font-semibold text-gray-800">أعلى الموردين</p>
          </div>
          {topSuppliers.length === 0 ? (
            <p className="text-[11px] text-gray-400 text-center py-3">لا توجد بيانات</p>
          ) : (
            <div className="space-y-1.5">
              {topSuppliers.map((s) => (
                <div key={s.name} className="space-y-0.5">
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-gray-600 truncate" title={s.name}>{s.name}</span>
                    <span className="font-semibold text-gray-700 tabular-nums shrink-0">
                      {fmtMoneyShort(s.value)}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-l from-emerald-500 to-emerald-400"
                      style={{ width: `${Math.max(4, (s.value / supplierMax) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
