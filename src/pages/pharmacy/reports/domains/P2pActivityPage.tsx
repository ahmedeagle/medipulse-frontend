import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Users, TrendingUp, TrendingDown, ShoppingCart, Store, Download, RefreshCw, Sparkles, Award,
} from 'lucide-react'
import {
  AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts'
import { analyticsApi, type P2pActivityReport } from '../../../../api/analytics.api'
import { useCurrency } from '../../../../hooks/useCurrency'
import { DomainShell } from '../components/DomainShell'
import { downloadCsv } from '../../../../utils/export'

function todayIso(offset = 0) {
  const d = new Date(); d.setDate(d.getDate() + offset)
  return d.toISOString().slice(0, 10)
}

function StatCard({ icon: Icon, label, value, sub, color }: any) {
  const tone: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-600',
    blue:    'bg-blue-50 text-blue-600',
    rose:    'bg-rose-50 text-rose-600',
    violet:  'bg-violet-50 text-violet-600',
    amber:   'bg-amber-50 text-amber-600',
  }
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-4">
      <div className="flex items-center gap-2.5 mb-2">
        <div className={`p-2 rounded-lg ${tone[color]}`}><Icon size={16} /></div>
        <span className="text-xs font-semibold text-gray-500">{label}</span>
      </div>
      <div className="text-xl font-bold text-gray-900">{value}</div>
      {sub && <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>}
    </div>
  )
}

export default function P2pActivityPage() {
  const { fmt } = useCurrency()
  const [dateFrom, setDateFrom] = useState(todayIso(-90))
  const [dateTo, setDateTo] = useState(todayIso(0))

  const q = useQuery({
    queryKey: ['report-p2p-activity', dateFrom, dateTo],
    queryFn: () => analyticsApi.getP2pActivity({ dateFrom, dateTo }),
    staleTime: 60_000,
  })

  const data: P2pActivityReport | undefined = q.data
  const netPos = Number(data?.netPosition ?? 0)

  const exportCsv = () => {
    if (!data) return
    const headers = ['الصيدلية الشريكة', 'عدد الصفقات', 'قيمة الصفقات', 'كمشترٍ', 'كبائع']
    const rows = data.topPeers.map(p => [
      String(p.peerName),
      String(p.tradeCount),
      Number(p.tradeValue).toFixed(2),
      String(p.asBuyer),
      String(p.asSeller),
    ])
    downloadCsv('p2p-activity.csv', headers, rows)
  }

  return (
    <DomainShell
      icon={Users}
      iconColor="text-emerald-600"
      iconBg="bg-emerald-50"
      title="نشاط شبكة P2P"
      subtitle="حركة الند-للند بين صيدليتك وبقية شبكة Pulse: عمليات الشراء، البيع، صافي المركز، الصفقات النشطة."
      hint="موجب = صدّرت أكثر مما اشتريت (مكسب). سالب = اشتريت أكثر — راجع الموردين البديل."
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
        <div className="grow" />
        <button onClick={() => q.refetch()}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-gray-200 rounded-xl text-xs text-gray-600 hover:bg-gray-50">
          <RefreshCw size={13} className={q.isFetching ? 'animate-spin' : ''} />
          تحديث
        </button>
        <button onClick={exportCsv} disabled={!data}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 text-white rounded-xl text-xs font-medium hover:bg-emerald-700 disabled:opacity-40">
          <Download size={13} />
          تصدير CSV
        </button>
      </div>

      {/* KPIs split: Buyer / Seller / Net */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-100 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <ShoppingCart size={15} className="text-blue-600" />
            كمشترٍ
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <div className="text-[11px] text-gray-500">إجمالي الإنفاق</div>
              <div className="font-bold text-gray-900">{fmt(Number(data?.buyer.totalSpend ?? 0))}</div>
            </div>
            <div>
              <div className="text-[11px] text-gray-500">صفقات</div>
              <div className="font-bold text-gray-900">{data?.buyer.totalOrders ?? 0}</div>
            </div>
            <div>
              <div className="text-[11px] text-gray-500">مكتملة</div>
              <div className="font-bold text-emerald-600">{data?.buyer.completedOrders ?? 0}</div>
            </div>
            <div>
              <div className="text-[11px] text-gray-500">موردين معتمدين</div>
              <div className="font-bold text-gray-900">{data?.buyer.uniquePeers ?? 0}</div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Store size={15} className="text-emerald-600" />
            كبائع
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <div className="text-[11px] text-gray-500">إجمالي الإيرادات</div>
              <div className="font-bold text-gray-900">{fmt(Number(data?.seller.totalRevenue ?? 0))}</div>
            </div>
            <div>
              <div className="text-[11px] text-gray-500">صفقات</div>
              <div className="font-bold text-gray-900">{data?.seller.totalOrders ?? 0}</div>
            </div>
            <div>
              <div className="text-[11px] text-gray-500">مكتملة</div>
              <div className="font-bold text-emerald-600">{data?.seller.completedOrders ?? 0}</div>
            </div>
            <div>
              <div className="text-[11px] text-gray-500">عملاء</div>
              <div className="font-bold text-gray-900">{data?.seller.uniquePeers ?? 0}</div>
            </div>
          </div>
        </div>

        <div className={`rounded-2xl p-4 border-2 ${netPos >= 0 ? 'border-emerald-200 bg-emerald-50/40' : 'border-rose-200 bg-rose-50/40'}`}>
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
            {netPos >= 0
              ? <TrendingUp size={15} className="text-emerald-600" />
              : <TrendingDown size={15} className="text-rose-600" />}
            صافي المركز
          </div>
          <div className={`text-3xl font-bold ${netPos >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
            {netPos >= 0 ? '+' : ''}{fmt(netPos)}
          </div>
          <div className="text-[11px] text-gray-500 mt-2">
            إيرادات البيع − تكلفة الشراء عبر شبكة P2P
          </div>
        </div>
      </div>

      {/* Listings snapshot */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={Sparkles} label="إعلانات أنشأتها" value={data?.listings.total ?? 0} color="violet" />
        <StatCard icon={TrendingUp} label="نشطة" value={data?.listings.active ?? 0} color="emerald" />
        <StatCard icon={Award} label="نفدت" value={data?.listings.sold ?? 0} color="blue" />
        <StatCard icon={Users} label="صفقات إجمالية" value={(data?.buyer.totalOrders ?? 0) + (data?.seller.totalOrders ?? 0)} color="amber" />
      </div>

      {/* Trend */}
      <div className="bg-white border border-gray-100 rounded-2xl p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">قيمة النشاط اليومية</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data?.trend ?? []}>
              <defs>
                <linearGradient id="gBuy" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gSell" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="day" fontSize={11} />
              <YAxis fontSize={11} tickFormatter={(v: number) => v >= 1000 ? `${(v/1000).toFixed(0)}K` : `${v}`} />
              <Tooltip formatter={(v: number) => fmt(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="buyValue" name="شراء" stroke="#3b82f6" fill="url(#gBuy)" />
              <Area type="monotone" dataKey="sellValue" name="بيع" stroke="#10b981" fill="url(#gSell)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top peers */}
      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">أعلى الصيدليات الشريكة</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-right px-4 py-2.5 font-semibold text-gray-600 text-xs">الصيدلية</th>
              <th className="text-right px-4 py-2.5 font-semibold text-gray-600 text-xs">صفقات</th>
              <th className="text-right px-4 py-2.5 font-semibold text-gray-600 text-xs">القيمة</th>
              <th className="text-right px-4 py-2.5 font-semibold text-gray-600 text-xs">كمشترٍ</th>
              <th className="text-right px-4 py-2.5 font-semibold text-gray-600 text-xs">كبائع</th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading ? (
              <tr><td colSpan={5} className="text-center py-10 text-gray-400 text-sm">جاري التحميل...</td></tr>
            ) : !data?.topPeers.length ? (
              <tr><td colSpan={5} className="text-center py-10 text-gray-400 text-sm">لا توجد بيانات</td></tr>
            ) : data.topPeers.map(p => (
              <tr key={p.peerId} className="border-b border-gray-50 hover:bg-gray-50/50">
                <td className="px-4 py-2.5 font-medium text-gray-800">{p.peerName}</td>
                <td className="px-4 py-2.5 text-gray-700">{p.tradeCount}</td>
                <td className="px-4 py-2.5 text-gray-700 font-semibold">{fmt(Number(p.tradeValue))}</td>
                <td className="px-4 py-2.5 text-blue-600 font-medium">{p.asBuyer}</td>
                <td className="px-4 py-2.5 text-emerald-600 font-medium">{p.asSeller}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DomainShell>
  )
}
