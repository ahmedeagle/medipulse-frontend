import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ShoppingBag, TrendingUp, Users, Truck, Download, RefreshCw, Award, Sparkles,
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts'
import { analyticsApi, type ProcurementSummary } from '../../../../api/analytics.api'
import { useCurrency } from '../../../../hooks/useCurrency'
import { DomainShell } from '../components/DomainShell'
import { downloadCsv } from '../../../../utils/export'

const CHANNEL_LABELS: Record<string, string> = {
  invoices: 'فواتير الموردين',
  orders:   'طلبيات الشبكة',
  p2p:      'صفقات P2P',
}
const CHANNEL_COLORS: Record<string, string> = {
  invoices: '#8b5cf6', // violet
  orders:   '#3b82f6', // blue
  p2p:      '#10b981', // emerald
}

function todayIso(offsetDays = 0) {
  const d = new Date(); d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

function KpiCard({
  icon: Icon, label, value, sub, color = 'violet',
}: { icon: any; label: string; value: string; sub?: string; color?: string }) {
  const tone: Record<string, string> = {
    violet:  'bg-violet-50 text-violet-600',
    blue:    'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber:   'bg-amber-50 text-amber-600',
  }
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-4">
      <div className="flex items-center gap-2.5 mb-2">
        <div className={`p-2 rounded-lg ${tone[color] ?? tone.violet}`}>
          <Icon size={16} />
        </div>
        <span className="text-xs font-semibold text-gray-500">{label}</span>
      </div>
      <div className="text-xl font-bold text-gray-900">{value}</div>
      {sub && <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>}
    </div>
  )
}

export default function ProcurementSpendPage() {
  const { fmt } = useCurrency()
  const [dateFrom, setDateFrom] = useState(todayIso(-90))
  const [dateTo, setDateTo] = useState(todayIso(0))
  const [channel, setChannel] = useState<'all'|'invoices'|'orders'|'p2p'>('all')

  const q = useQuery({
    queryKey: ['report-procurement-summary', dateFrom, dateTo, channel],
    queryFn: () => analyticsApi.getProcurementSummary({ dateFrom, dateTo, channel }),
    staleTime: 60_000,
  })

  const data: ProcurementSummary | undefined = q.data

  const channelMix = useMemo(() => {
    if (!data) return []
    return Object.entries(data.totals.byChannel).map(([k, v]) => ({
      name: CHANNEL_LABELS[k] ?? k,
      key: k,
      value: v.total,
      count: v.count,
    })).filter(x => x.value > 0)
  }, [data])

  const trendByMonth = useMemo(() => {
    if (!data) return []
    const map = new Map<string, any>()
    for (const row of data.trend) {
      const key = row.month.slice(0, 10)
      if (!map.has(key)) map.set(key, { month: key, invoices: 0, orders: 0, p2p: 0 })
      map.get(key)[row.channel] = Number(row.total) || 0
    }
    return [...map.values()].sort((a, b) => a.month.localeCompare(b.month))
  }, [data])

  const exportCsv = () => {
    if (!data) return
    const headers = ['المورد', 'إجمالي الإنفاق', 'عدد الطلبات']
    const rows = data.topSuppliers.map(s => [
      String(s.supplierName),
      s.totalSpend.toFixed(2),
      String(s.orderCount),
    ])
    downloadCsv('procurement-spend.csv', headers, rows)
  }

  return (
    <DomainShell
      icon={ShoppingBag}
      iconColor="text-violet-600"
      iconBg="bg-violet-50"
      title="تقرير الإنفاق على المشتريات"
      subtitle="رؤية موحدة لكل ما اشترته الصيدلية: فواتير الموردين، طلبيات الشبكة، وصفقات P2P — مع توفير صفقات الند-للند."
      hint="استخدم الفلاتر لمقارنة قنوات الشراء وتحديد أعلى الموردين تكلفة. وفّر تكلفة فعلية بالمقارنة بسعر الموردين عند الشراء من P2P."
    >
      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold text-gray-500 uppercase">من تاريخ</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold text-gray-500 uppercase">إلى تاريخ</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold text-gray-500 uppercase">القناة</label>
          <select value={channel} onChange={e => setChannel(e.target.value as any)}
            className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs">
            <option value="all">كل القنوات</option>
            <option value="invoices">فواتير الموردين</option>
            <option value="orders">طلبيات الشبكة</option>
            <option value="p2p">صفقات P2P</option>
          </select>
        </div>
        <div className="grow" />
        <button onClick={() => q.refetch()}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-gray-200 rounded-xl text-xs text-gray-600 hover:bg-gray-50">
          <RefreshCw size={13} className={q.isFetching ? 'animate-spin' : ''} />
          تحديث
        </button>
        <button onClick={exportCsv} disabled={!data}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-violet-600 text-white rounded-xl text-xs font-medium hover:bg-violet-700 disabled:opacity-40">
          <Download size={13} />
          تصدير CSV
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={ShoppingBag} label="إجمالي الإنفاق" value={fmt(data?.totals.totalSpend ?? 0)}
          sub={`${data?.totals.totalCount ?? 0} عملية شراء`} color="violet" />
        <KpiCard icon={TrendingUp} label="متوسط قيمة العملية" value={fmt(data?.totals.avgOrderValue ?? 0)} color="blue" />
        <KpiCard icon={Users} label="P2P" value={fmt(data?.totals.byChannel.p2p.total ?? 0)}
          sub={`${data?.totals.byChannel.p2p.count ?? 0} صفقة`} color="emerald" />
        <KpiCard icon={Sparkles} label="توفير محقق من P2P" value={fmt(data?.totals.p2pSavings ?? 0)}
          sub="مقارنة بسعر الموردين" color="amber" />
      </div>

      {/* Trend & Mix */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-100 rounded-2xl p-4 lg:col-span-2">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">الإنفاق الشهري حسب القناة</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendByMonth}>
                <defs>
                  <linearGradient id="gInv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHANNEL_COLORS.invoices} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={CHANNEL_COLORS.invoices} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gOrd" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHANNEL_COLORS.orders} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={CHANNEL_COLORS.orders} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gP2p" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHANNEL_COLORS.p2p} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={CHANNEL_COLORS.p2p} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="month" fontSize={11} tickFormatter={(v: string) => v.slice(0, 7)} />
                <YAxis fontSize={11} tickFormatter={(v: number) => v >= 1000 ? `${(v/1000).toFixed(0)}K` : `${v}`} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="invoices" name="فواتير" stroke={CHANNEL_COLORS.invoices} fill="url(#gInv)" />
                <Area type="monotone" dataKey="orders"   name="طلبيات" stroke={CHANNEL_COLORS.orders}   fill="url(#gOrd)" />
                <Area type="monotone" dataKey="p2p"      name="P2P"   stroke={CHANNEL_COLORS.p2p}      fill="url(#gP2p)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-2xl p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">مزيج قنوات الشراء</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={channelMix} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={3}>
                  {channelMix.map((c) => (
                    <Cell key={c.key} fill={CHANNEL_COLORS[c.key]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Top suppliers */}
      <div className="bg-white border border-gray-100 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Award size={15} className="text-violet-600" />
            أعلى 10 موردين
          </h3>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data?.topSuppliers ?? []} layout="vertical" margin={{ left: 100 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis type="number" fontSize={11} tickFormatter={(v: number) => v >= 1000 ? `${(v/1000).toFixed(0)}K` : `${v}`} />
              <YAxis dataKey="supplierName" type="category" fontSize={11} width={150} />
              <Tooltip formatter={(v: number) => fmt(v)} />
              <Bar dataKey="totalSpend" fill="#8b5cf6" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </DomainShell>
  )
}
