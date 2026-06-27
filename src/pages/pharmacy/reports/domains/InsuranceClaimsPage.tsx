import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Shield, FileText, Users, DollarSign,
  Search, SlidersHorizontal, Download, X,
  ChevronLeft, ChevronRight, ChevronUp, ChevronDown, RefreshCw,
  Filter,
} from 'lucide-react'
import { analyticsApi, type InsuranceClaimsRow } from '../../../../api/analytics.api'
import { useCurrency } from '../../../../hooks/useCurrency'
import { useColState } from '../../../../hooks/useColState'
import { ColPicker, type ColDef } from '../../../../components/reports/ColPicker'
import { DomainShell } from '../components/DomainShell'
import { downloadCsv } from '../../../../utils/export'

type ColKey = keyof InsuranceClaimsRow

const ALL_COLS: ColDef[] = [
  { key: 'invoiceDate',            label: 'تاريخ الفاتورة',                   group: 'أساسي' },
  { key: 'insuranceCompany',       label: 'شركة التأمين',                     group: 'أساسي' },
  { key: 'patientCount',           label: 'عدد المرضى',                       group: 'مطالبات' },
  { key: 'invoiceCount',           label: 'عدد الفواتير',                     group: 'مطالبات' },
  { key: 'totalSales',             label: 'إجمالي قيمة المبيعات',             group: 'مبالغ' },
  { key: 'insuranceCoveredAmount', label: 'إجمالي المبلغ المغطّى من التأمين', group: 'مبالغ' },
  { key: 'patientDueAmount',       label: 'إجمالي المبلغ المستحق على المريض', group: 'مبالغ' },
  { key: 'reimbursementAmount',    label: 'إجمالي مبلغ التعويض',              group: 'مبالغ' },
  { key: 'pendingAmount',          label: 'المبلغ المعلّق',                    group: 'مبالغ' },
  { key: 'insuranceCompanyId',     label: 'الرقم التعريفي',                    group: 'أساسي' },
]

const PAGE_SIZE = 30

const pad = (n: number) => String(n).padStart(2, '0')
const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <ChevronUp size={12} className="text-gray-300" />
  return dir === 'asc'
    ? <ChevronUp size={12} className="text-emerald-600" />
    : <ChevronDown size={12} className="text-emerald-600" />
}

function Pagination({ page, total, onChange }: { page: number; total: number; onChange: (p: number) => void }) {
  const pages = Math.ceil(total / PAGE_SIZE)
  if (pages <= 1) return null
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
      <span className="text-xs text-gray-500">{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} من {total}</span>
      <div className="flex items-center gap-1">
        <button onClick={() => onChange(page - 1)} disabled={page === 1}
          className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">
          <ChevronRight size={16} className="text-gray-600" />
        </button>
        {Array.from({ length: Math.min(pages, 7) }, (_, i) => {
          const p = pages <= 7 ? i + 1 : page <= 4 ? i + 1 : page >= pages - 3 ? pages - 6 + i : page - 3 + i
          return (
            <button key={p} onClick={() => onChange(p)}
              className={`w-7 h-7 rounded-lg text-xs font-medium ${p === page ? 'bg-emerald-600 text-white' : 'hover:bg-gray-100 text-gray-600'}`}>
              {p}
            </button>
          )
        })}
        <button onClick={() => onChange(page + 1)} disabled={page === pages}
          className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">
          <ChevronLeft size={16} className="text-gray-600" />
        </button>
      </div>
    </div>
  )
}

function FilterInput({ label, value, onChange, type = 'text', placeholder = '' }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{label}</label>
      <div className="relative">
        <input
          type={type} value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full border border-gray-200 rounded-xl px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400"
        />
        {value && (
          <button onClick={() => onChange('')} className="absolute left-2 top-1/2 -translate-y-1/2">
            <X size={11} className="text-gray-400 hover:text-gray-600" />
          </button>
        )}
      </div>
    </div>
  )
}

export default function InsuranceClaimsPage() {
  const { fmt } = useCurrency()
  const fmtN = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 })

  const now = new Date()
  const firstOfMonth = isoDate(new Date(now.getFullYear(), now.getMonth(), 1))
  const today = isoDate(now)

  // -- Backend filters -------------------------------------------------------
  const [dateFrom,           setDateFrom]           = useState(firstOfMonth)
  const [dateTo,             setDateTo]             = useState(today)
  const [insuranceCompanyId, setInsuranceCompanyId] = useState('')

  // -- Client-side column filters --------------------------------------------
  const [fCompany, setFCompany] = useState('')
  const [fId,      setFId]      = useState('')

  // -- UI state --------------------------------------------------------------
  const [filtersOpen,   setFiltersOpen]   = useState(false)
  const [sortKey,       setSortKey]       = useState<ColKey>('invoiceDate')
  const [sortDir,       setSortDir]       = useState<'asc' | 'desc'>('desc')
  const [page,          setPage]          = useState(1)
  const [colPickerOpen, setColPickerOpen] = useState(false)

  const { visible, order, displayCols, toggleCol, setOrder, reset } =
    useColState(ALL_COLS, 'insuranceClaims')

  // -- Data fetch ------------------------------------------------------------
  const { data: queryData, isLoading, refetch } = useQuery({
    queryKey: ['insurance-claims', dateFrom, dateTo, insuranceCompanyId],
    queryFn: () => analyticsApi.getInsuranceClaimsReport({
      dateFrom:           dateFrom           || undefined,
      dateTo:             dateTo             || undefined,
      insuranceCompanyId: insuranceCompanyId || undefined,
      pageSize: 9999,
    }),
    staleTime: 2 * 60_000,
  })
  const rawRows = queryData?.data ?? []

  // -- Client-side filtering -------------------------------------------------
  const rows = useMemo(() => rawRows.filter(r => {
    const lc = (s: string) => s.toLowerCase()
    if (fCompany && !lc(r.insuranceCompany).includes(lc(fCompany))) return false
    if (fId      && !lc(r.insuranceCompanyId).includes(lc(fId)))    return false
    return true
  }), [rawRows, fCompany, fId])

  const companies = useMemo(() =>
    [...new Map(rawRows.map(r => [r.insuranceCompanyId, r.insuranceCompany])).entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [rawRows]
  )

  const totals = useMemo(() => rows.reduce(
    (acc, r) => ({
      invoices:  acc.invoices  + r.invoiceCount,
      patients:  acc.patients  + r.patientCount,
      sales:     acc.sales     + r.totalSales,
      covered:   acc.covered   + r.insuranceCoveredAmount,
      pending:   acc.pending   + r.pendingAmount,
    }),
    { invoices: 0, patients: 0, sales: 0, covered: 0, pending: 0 }
  ), [rows])

  const activeFilterCount = [dateFrom, dateTo, insuranceCompanyId, fCompany, fId].filter(Boolean).length

  const sorted = useMemo(() => [...rows].sort((a, b) => {
    const av = a[sortKey], bv = b[sortKey]
    if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av
    return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
  }), [rows, sortKey, sortDir])

  const paged = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function toggleSort(key: ColKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
    setPage(1)
  }

  function clearFilters() {
    setDateFrom(firstOfMonth); setDateTo(today)
    setInsuranceCompanyId(''); setFCompany(''); setFId('')
    setPage(1)
  }

  function fmtCell(row: InsuranceClaimsRow, key: ColKey): string {
    switch (key) {
      case 'invoiceDate':            return row.invoiceDate
      case 'insuranceCompany':       return row.insuranceCompany
      case 'insuranceCompanyId':     return row.insuranceCompanyId
      case 'patientCount':           return fmtN(row.patientCount)
      case 'invoiceCount':           return fmtN(row.invoiceCount)
      case 'totalSales':             return fmt(row.totalSales)
      case 'insuranceCoveredAmount': return fmt(row.insuranceCoveredAmount)
      case 'patientDueAmount':       return fmt(row.patientDueAmount)
      case 'reimbursementAmount':    return fmt(row.reimbursementAmount)
      case 'pendingAmount':          return fmt(row.pendingAmount)
    }
  }

  function handleExport() {
    const headers = displayCols.map(c => c.label)
    const rowData = sorted.map(r => displayCols.map(c => fmtCell(r, c.key as ColKey)))
    downloadCsv(`insurance-claims-${dateFrom}-${dateTo}.csv`, headers, rowData)
  }

  const PRESETS = [
    { label: 'هذا الشهر', from: firstOfMonth, to: today },
    { label: 'هذا العام',  from: `${now.getFullYear()}-01-01`, to: today },
    { label: 'آخر 30 يوم', from: isoDate(new Date(now.getTime() - 30 * 86400000)), to: today },
    { label: 'آخر 90 يوم', from: isoDate(new Date(now.getTime() - 90 * 86400000)), to: today },
  ]

  return (
    <DomainShell
      icon={Shield} iconColor="text-emerald-600" iconBg="bg-emerald-50"
      title="ملخص مطالبات التأمين"
      subtitle="ملخص لمطالبات التأمين وحالات السداد المستحقة وضمان دقة التسوية المالية مع شركات التأمين"
    >
    <div className="space-y-5 pb-8">

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white rounded-2xl p-4 border border-gray-100 border-l-4 border-l-emerald-300 shadow-sm">
          <span className="text-xs text-gray-500 font-medium flex items-center gap-1"><FileText size={12} />عدد الفواتير</span>
          <p className="text-lg font-bold text-gray-900 mt-1">{fmtN(totals.invoices)}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-100 border-l-4 border-l-emerald-400 shadow-sm">
          <span className="text-xs text-gray-500 font-medium flex items-center gap-1"><Users size={12} />عدد المرضى</span>
          <p className="text-lg font-bold text-gray-900 mt-1">{fmtN(totals.patients)}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-100 border-l-4 border-l-emerald-500 shadow-sm">
          <span className="text-xs text-gray-500 font-medium flex items-center gap-1"><DollarSign size={12} />إجمالي المبيعات</span>
          <p className="text-lg font-bold text-gray-900 mt-1">{fmt(totals.sales)}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-100 border-l-4 border-l-emerald-400 shadow-sm">
          <span className="text-xs text-gray-500 font-medium flex items-center gap-1"><Shield size={12} />المغطّى من التأمين</span>
          <p className="text-lg font-bold text-emerald-700 mt-1">{fmt(totals.covered)}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-100 border-l-4 border-l-orange-400 shadow-sm">
          <span className="text-xs text-gray-500 font-medium flex items-center gap-1"><DollarSign size={12} />إجمالي المبيعات</span>
          <p className="text-lg font-bold text-orange-600 mt-1">{fmt(totals.pending)}</p>
        </div>
      </div>

      {/* Quick date presets + filter bar */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="p-3 flex items-center gap-2 flex-wrap">
          {/* Preset chips */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {PRESETS.map(p => (
              <button key={p.label}
                onClick={() => { setDateFrom(p.from); setDateTo(p.to); setPage(1) }}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                  dateFrom === p.from && dateTo === p.to
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'border-gray-200 text-gray-600 hover:border-emerald-300'
                }`}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="w-px h-5 bg-gray-200 hidden sm:block" />
          <div className="relative">
            <Search size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text" value={fCompany}
              onChange={e => { setFCompany(e.target.value); setPage(1) }}
              placeholder="بحث بشركة التأمين..."
              className="border border-gray-200 rounded-xl pr-8 pl-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400 w-48"
            />
            {fCompany && (
              <button onClick={() => setFCompany('')} className="absolute left-2 top-1/2 -translate-y-1/2">
                <X size={11} className="text-gray-400 hover:text-gray-600" />
              </button>
            )}
          </div>
          <button
            onClick={() => setFiltersOpen(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
              filtersOpen || activeFilterCount > 0
                ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                : 'border-gray-200 text-gray-600 hover:border-gray-300'
            }`}>
            <Filter size={13} />
            إضافة فلاتر
            {activeFilterCount > 0 && (
              <span className="bg-emerald-600 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold">
                {activeFilterCount}
              </span>
            )}
          </button>
          <button onClick={() => refetch()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-all">
            <RefreshCw size={12} /> تحديث
          </button>
          <span className="text-xs text-gray-400 hidden sm:block mr-auto">{rows.length} سجل</span>
        </div>

        {/* Collapsible filter panel */}
        {filtersOpen && (
          <div className="border-t border-gray-100 p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <FilterInput label="تاريخ الفاتورة من" value={dateFrom} onChange={v => { setDateFrom(v); setPage(1) }} type="date" />
              <FilterInput label="تاريخ الفاتورة إلى" value={dateTo}  onChange={v => { setDateTo(v);   setPage(1) }} type="date" />
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">شركة التأمين</label>
                <select value={insuranceCompanyId} onChange={e => { setInsuranceCompanyId(e.target.value); setPage(1) }}
                  className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400">
                  <option value="">كل الشركات</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <FilterInput label="الرقم التعريفي" value={fId} onChange={v => { setFId(v); setPage(1) }} placeholder="ابحث بالرقم التعريفي..." />
            </div>
            {activeFilterCount > 0 && (
              <div className="mt-3 flex justify-start">
                <button onClick={clearFilters}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border border-red-200 text-red-600 hover:bg-red-50 transition-all">
                  <X size={12} /> مسح جميع الفلاتر ({activeFilterCount})
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-gray-100 animate-pulse rounded-2xl" />)}
        </div>
      ) : rows.length > 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
          {/* Table toolbar */}
          <div className="p-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-semibold text-gray-700">تفاصيل المطالبات</h3>
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{rows.length} سجل</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleExport}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-all">
                <Download size={13} /> تنزيل CSV
              </button>
              <div className="relative">
                <button onClick={() => setColPickerOpen(v => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                    colPickerOpen ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}>
                  <SlidersHorizontal size={13} /> تعديل الجدول
                  {visible.size < ALL_COLS.length && (
                    <span className="bg-emerald-600 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold">
                      {ALL_COLS.length - visible.size}
                    </span>
                  )}
                </button>
                {colPickerOpen && (
                  <ColPicker
                    allCols={ALL_COLS}
                    visible={visible}
                    order={order}
                    onToggle={toggleCol}
                    onReorder={setOrder}
                    onReset={reset}
                    onClose={() => setColPickerOpen(false)}
                    checkboxBg="bg-emerald-600"
                  />
                )}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm" dir="rtl">
              <thead className="bg-gray-50">
                <tr>
                  {displayCols.map(col => (
                    <th key={col.key} onClick={() => toggleSort(col.key as ColKey)}
                      className="px-3 py-3 text-right text-xs font-semibold text-gray-600 whitespace-nowrap cursor-pointer hover:bg-gray-100 select-none">
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        <SortIcon active={sortKey === col.key} dir={sortDir} />
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((row, i) => (
                  <tr key={`${row.invoiceDate}-${row.insuranceCompanyId}`}
                    className={`border-t border-gray-50 transition-colors ${i % 2 === 1 ? 'bg-gray-50/30 hover:bg-gray-50' : 'hover:bg-gray-50'}`}>
                    {displayCols.map(col => (
                      <td key={col.key}
                        className={`px-3 py-2.5 text-right whitespace-nowrap text-xs ${
                          col.key === 'insuranceCompany'       ? 'font-medium text-gray-900' :
                          col.key === 'insuranceCompanyId'     ? 'font-mono text-gray-400 text-[10px]' :
                          col.key === 'insuranceCoveredAmount' ? 'font-medium text-emerald-700' :
                          col.key === 'pendingAmount'          ? 'font-medium text-orange-600' :
                          typeof row[col.key as ColKey] === 'number' && (row[col.key as ColKey] as number) < 0 ? 'text-red-600 font-medium' :
                          col.key === 'totalSales'             ? 'font-medium text-gray-900' :
                          'text-gray-600'
                        }`}>
                        {fmtCell(row, col.key as ColKey)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination page={page} total={sorted.length} onChange={setPage} />
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center shadow-sm">
          <Shield size={36} className="mx-auto mb-3 text-emerald-200" />
          {rawRows.length > 0 ? (
            <>
              <p className="text-sm text-gray-500">لا توجد نتائج مطابقة للفلاتر المحددة</p>
              <button onClick={clearFilters} className="mt-3 text-xs text-emerald-600 hover:underline">
                مسح الفلاتر
              </button>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-gray-700 mb-1">لا توجد مطالبات تأمين في هذه الفترة</p>
              <p className="text-xs text-gray-400 max-w-xs mx-auto leading-relaxed">
                لعرض البيانات هنا، تأكد من:<br />
                1. ربط العميل بشركة التأمين عند إضافته<br />
                2. وجود مبيعات تأمين خلال الفترة المختارة<br />
                3. توسيع نطاق الفلاتر ليشمل تاريخ أوسع
              </p>
            </>
          )}
        </div>
      )}
    </div>
    </DomainShell>
  )
}

