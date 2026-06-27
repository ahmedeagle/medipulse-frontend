import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Truck, Search, Download, RefreshCw, CheckCircle2, XCircle, Clock,
  ChevronLeft, ChevronRight,
} from 'lucide-react'
import { analyticsApi, type SupplierPerformanceRow } from '../../../../api/analytics.api'
import { useCurrency } from '../../../../hooks/useCurrency'
import { DomainShell } from '../components/DomainShell'
import { downloadCsv } from '../../../../utils/export'

function todayIso(offset = 0) {
  const d = new Date(); d.setDate(d.getDate() + offset)
  return d.toISOString().slice(0, 10)
}

function pctChip(v: number | null, opts: { good: number; bad: number }) {
  if (v == null) return <span className="text-gray-300 text-xs">—</span>
  const cls = v >= opts.good
    ? 'bg-emerald-50 text-emerald-700'
    : v >= opts.bad
      ? 'bg-amber-50 text-amber-700'
      : 'bg-red-50 text-red-700'
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${cls}`}>{v.toFixed(0)}%</span>
}

export default function SupplierPerformancePage() {
  const { fmt } = useCurrency()
  const [dateFrom, setDateFrom] = useState(todayIso(-180))
  const [dateTo, setDateTo] = useState(todayIso(0))
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 30

  const q = useQuery({
    queryKey: ['report-supplier-perf', dateFrom, dateTo, search, page],
    queryFn: () => analyticsApi.getSupplierPerformance({ dateFrom, dateTo, search: search || undefined, page, pageSize }),
    staleTime: 60_000,
  })

  const rows = q.data?.data ?? []
  const total = q.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / pageSize))

  const aggregates = useMemo(() => {
    const totalSpend = rows.reduce((s, r) => s + Number(r.totalSpend ?? 0), 0)
    const avgFill = rows.filter(r => r.fillRatePct != null)
      .reduce((acc, r, _, a) => acc + (Number(r.fillRatePct) / a.length), 0)
    const avgLead = rows.filter(r => r.avgLeadDays != null)
      .reduce((acc, r, _, a) => acc + (Number(r.avgLeadDays) / a.length), 0)
    return { totalSpend, avgFill, avgLead }
  }, [rows])

  const exportCsv = () => {
    const headers = ['المورد', 'إجمالي الإنفاق', 'عدد طلبات الشبكة', 'عدد الفواتير', 'نسبة التوريد %', 'نسبة الرفض %', 'متوسط أيام التوصيل', 'نسبة السداد %', 'آخر طلب']
    const csvRows = rows.map(r => [
      String(r.supplierName),
      Number(r.totalSpend).toFixed(2),
      String(r.poCount),
      String(r.invoiceCount),
      r.fillRatePct?.toFixed(1) ?? '',
      r.rejectionRatePct?.toFixed(1) ?? '',
      r.avgLeadDays?.toFixed(1) ?? '',
      r.paidRatePct?.toFixed(1) ?? '',
      r.lastOrderAt ?? '',
    ])
    downloadCsv('supplier-performance.csv', headers, csvRows)
  }

  return (
    <DomainShell
      icon={Truck}
      iconColor="text-blue-600"
      iconBg="bg-blue-50"
      title="أداء الموردين"
      subtitle="بطاقة أداء لكل مورد: نسبة التوريد، الرفض، متوسط زمن التوصيل، نسبة السداد وإجمالي الإنفاق."
      hint="ركّز على الموردين ذوي نسبة توريد منخفضة أو زمن توصيل طويل — وفّر وقتك بإيجاد بديل أسرع."
    >
      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold text-gray-500 uppercase">من تاريخ</label>
          <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1) }}
            className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold text-gray-500 uppercase">إلى تاريخ</label>
          <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1) }}
            className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs" />
        </div>
        <div className="flex flex-col gap-1 grow min-w-[200px]">
          <label className="text-[10px] font-semibold text-gray-500 uppercase">بحث بالمورد</label>
          <div className="relative">
            <Search size={13} className="absolute right-2 top-2 text-gray-400" />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder="اسم المورد..."
              className="w-full border border-gray-200 rounded-xl px-3 py-1.5 text-xs pr-7" />
          </div>
        </div>
        <button onClick={() => q.refetch()}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-gray-200 rounded-xl text-xs text-gray-600 hover:bg-gray-50">
          <RefreshCw size={13} className={q.isFetching ? 'animate-spin' : ''} />
          تحديث
        </button>
        <button onClick={exportCsv} disabled={!rows.length}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 text-white rounded-xl text-xs font-medium hover:bg-blue-700 disabled:opacity-40">
          <Download size={13} />
          تصدير CSV
        </button>
      </div>

      {/* Aggregate strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white border border-gray-100 rounded-2xl p-4">
          <div className="text-xs text-gray-500 mb-1">إجمالي الإنفاق (الصفحة الحالية)</div>
          <div className="text-xl font-bold text-gray-900">{fmt(aggregates.totalSpend)}</div>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4">
          <div className="text-xs text-gray-500 mb-1">متوسط نسبة التوريد</div>
          <div className="text-xl font-bold text-emerald-600">{aggregates.avgFill ? aggregates.avgFill.toFixed(1) : '—'}%</div>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4">
          <div className="text-xs text-gray-500 mb-1">متوسط زمن التوصيل</div>
          <div className="text-xl font-bold text-blue-600">{aggregates.avgLead ? aggregates.avgLead.toFixed(1) : '—'} يوم</div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs">المورد</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs">إجمالي الإنفاق</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs">طلبات الشبكة</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs">الفواتير</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs">التوريد</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs">الرفض</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs">زمن التوصيل</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs">السداد</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs">آخر طلب</th>
              </tr>
            </thead>
            <tbody>
              {q.isLoading ? (
                <tr><td colSpan={9} className="text-center py-10 text-gray-400 text-sm">جاري التحميل...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-10 text-gray-400 text-sm">لا توجد بيانات للفترة المختارة</td></tr>
              ) : rows.map((r: SupplierPerformanceRow) => (
                <tr key={r.supplierId} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-medium text-gray-800">{r.supplierName}</td>
                  <td className="px-4 py-3 text-gray-700 font-semibold">{fmt(Number(r.totalSpend))}</td>
                  <td className="px-4 py-3 text-gray-600">
                    <span className="inline-flex items-center gap-1">
                      <CheckCircle2 size={12} className="text-emerald-500" />
                      {r.deliveredCount}/{r.poCount}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{r.invoiceCount}</td>
                  <td className="px-4 py-3">{pctChip(r.fillRatePct, { good: 90, bad: 70 })}</td>
                  <td className="px-4 py-3">{r.rejectionRatePct == null ? <span className="text-gray-300 text-xs">—</span> :
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                      r.rejectionRatePct <= 5 ? 'bg-emerald-50 text-emerald-700' :
                      r.rejectionRatePct <= 15 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'
                    }`}>{Number(r.rejectionRatePct).toFixed(0)}%</span>}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">
                    {r.avgLeadDays == null ? '—' : (
                      <span className="inline-flex items-center gap-1">
                        <Clock size={11} className="text-blue-500" />
                        {Number(r.avgLeadDays).toFixed(1)} يوم
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">{pctChip(r.paidRatePct, { good: 80, bad: 50 })}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {r.lastOrderAt ? new Date(r.lastOrderAt).toLocaleDateString('en-US') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <span className="text-xs text-gray-500">{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} من {total}</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30">
                <ChevronRight size={16} />
              </button>
              <span className="text-xs text-gray-600 px-2">{page} / {pages}</span>
              <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}
                className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30">
                <ChevronLeft size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </DomainShell>
  )
}
