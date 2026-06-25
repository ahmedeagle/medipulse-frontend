import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Clock, Package, DollarSign, AlertTriangle,
  Search, SlidersHorizontal, Download, X,
  ChevronLeft, ChevronRight, ChevronUp, ChevronDown, RefreshCw,
  Filter,
} from 'lucide-react'
import { analyticsApi, type ExpiryReportRow } from '../../../../api/analytics.api'
import { useCurrency } from '../../../../hooks/useCurrency'
import { useColState } from '../../../../hooks/useColState'
import { ColPicker, type ColDef } from '../../../../components/reports/ColPicker'
import { DomainShell } from '../components/DomainShell'
import { downloadCsv } from '../../../../utils/export'

type ColKey = keyof ExpiryReportRow

const ALL_COLS: ColDef[] = [
  { key: 'productCode',     label: 'كود الصنف',                  group: 'أساسي' },
  { key: 'productName',     label: 'اسم الصنف',                  group: 'أساسي' },
  { key: 'barcode',         label: 'الباركود',                   group: 'أساسي' },
  { key: 'batchNumber',     label: 'رقم التشغيلة',               group: 'أساسي' },
  { key: 'expiryDate',      label: 'تاريخ الانتهاء',             group: 'صلاحية' },
  { key: 'daysUntilExpiry', label: 'عدد الأيام حتى الانتهاء',    group: 'صلاحية' },
  { key: 'quantity',        label: 'الكمية',                     group: 'مخزون' },
  { key: 'costPrice',       label: 'متوسط سعر التكلفة',          group: 'أسعار' },
  { key: 'sellingPrice',    label: 'متوسط سعر البيع',            group: 'أسعار' },
  { key: 'costValue',       label: 'قيمة المخزون بسعر التكلفة',  group: 'أسعار' },
  { key: 'category',        label: 'الفئة',                      group: 'أساسي' },
  { key: 'inventoryItemId', label: 'الرقم التعريفي',              group: 'أساسي' },
]

const PAGE_SIZE = 30

const STATUS_OPTS = [
  { value: '',            label: 'كل الحالات' },
  { value: 'expired',     label: 'منتهي الصلاحية' },
  { value: 'near_expiry', label: 'قريب الانتهاء (90 يوم)' },
  { value: 'active',      label: 'صالح' },
]

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <ChevronUp size={12} className="text-gray-300" />
  return dir === 'asc'
    ? <ChevronUp size={12} className="text-amber-600" />
    : <ChevronDown size={12} className="text-amber-600" />
}

function DaysChip({ days }: { days: number }) {
  if (days < 0)
    return <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">{days} يوم</span>
  if (days <= 30)
    return <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-700">{days} يوم</span>
  if (days <= 90)
    return <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">{days} يوم</span>
  return <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-700">{days} يوم</span>
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
              className={`w-7 h-7 rounded-lg text-xs font-medium ${p === page ? 'bg-amber-600 text-white' : 'hover:bg-gray-100 text-gray-600'}`}>
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
          className="w-full border border-gray-200 rounded-xl px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-amber-400 pr-3"
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

export default function ExpiryReportPage() {
  const { fmt } = useCurrency()
  const fmtN = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 })

  // ── Backend filters (sent to server) ──────────────────────────────────────
  const [dateFrom,  setDateFrom]  = useState('')
  const [dateTo,    setDateTo]    = useState('')
  const [status,    setStatus]    = useState('')
  const [daysAhead, setDaysAhead] = useState('')
  const [category,  setCategory]  = useState('')

  // ── Client-side column filters (applied after fetch) ──────────────────────
  const [fCode,    setFCode]    = useState('')
  const [fName,    setFName]    = useState('')
  const [fBarcode, setFBarcode] = useState('')
  const [fBatch,   setFBatch]   = useState('')
  const [fId,      setFId]      = useState('')

  // ── UI state ──────────────────────────────────────────────────────────────
  const [filtersOpen,   setFiltersOpen]   = useState(false)
  const [sortKey,       setSortKey]       = useState<ColKey>('daysUntilExpiry')
  const [sortDir,       setSortDir]       = useState<'asc' | 'desc'>('asc')
  const [page,          setPage]          = useState(1)
  const [colPickerOpen, setColPickerOpen] = useState(false)

  const { visible, order, displayCols, toggleCol, setOrder, reset } =
    useColState(ALL_COLS, 'expiryReport')

  // ── Data fetch ────────────────────────────────────────────────────────────
  const { data: queryData, isLoading, refetch } = useQuery({
    queryKey: ['expiry-report', dateFrom, dateTo, status, daysAhead, category],
    queryFn: () => analyticsApi.getExpiryReport({
      dateFrom:  dateFrom  || undefined,
      dateTo:    dateTo    || undefined,
      status:    status    || undefined,
      daysAhead: daysAhead ? Number(daysAhead) : undefined,
      category:  category  || undefined,
      pageSize: 9999,
    }),
    staleTime: 2 * 60_000,
  })
  const rawRows = queryData?.data ?? []

  // ── Client-side column filtering ──────────────────────────────────────────
  const rows = useMemo(() => rawRows.filter(r => {
    const lc = (s: string) => s.toLowerCase()
    if (fCode    && !lc(r.productCode).includes(lc(fCode)))       return false
    if (fName    && !lc(r.productName).includes(lc(fName)))       return false
    if (fBarcode && !lc(r.barcode).includes(lc(fBarcode)))        return false
    if (fBatch   && !lc(r.batchNumber).includes(lc(fBatch)))      return false
    if (fId      && !lc(r.inventoryItemId).includes(lc(fId)))     return false
    return true
  }), [rawRows, fCode, fName, fBarcode, fBatch, fId])

  const categories = useMemo(() => [...new Set(rawRows.map(r => r.category).filter(Boolean))].sort(), [rawRows])

  const totals = useMemo(() => rows.reduce(
    (acc, r) => ({ qty: acc.qty + r.quantity, costValue: acc.costValue + r.costValue }),
    { qty: 0, costValue: 0 }
  ), [rows])

  const expiredCount    = useMemo(() => rows.filter(r => r.daysUntilExpiry < 0).length, [rows])
  const nearExpiryCount = useMemo(() => rows.filter(r => r.daysUntilExpiry >= 0 && r.daysUntilExpiry <= 90).length, [rows])

  const backendFilterCount = [dateFrom, dateTo, status, daysAhead, category].filter(Boolean).length
  const clientFilterCount  = [fCode, fName, fBarcode, fBatch, fId].filter(Boolean).length
  const activeFilterCount  = backendFilterCount + clientFilterCount

  const sorted = useMemo(() => [...rows].sort((a, b) => {
    const av = a[sortKey], bv = b[sortKey]
    if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av
    return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
  }), [rows, sortKey, sortDir])

  const paged = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function toggleSort(key: ColKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
    setPage(1)
  }

  function clearFilters() {
    setDateFrom(''); setDateTo(''); setStatus(''); setDaysAhead(''); setCategory('')
    setFCode(''); setFName(''); setFBarcode(''); setFBatch(''); setFId('')
    setPage(1)
  }

  function fmtCell(row: ExpiryReportRow, key: ColKey): string {
    switch (key) {
      case 'productCode':     return row.productCode
      case 'productName':     return row.productName
      case 'barcode':         return row.barcode
      case 'batchNumber':     return row.batchNumber
      case 'expiryDate':      return row.expiryDate
      case 'daysUntilExpiry': return String(row.daysUntilExpiry)
      case 'quantity':        return fmtN(row.quantity)
      case 'costPrice':       return row.costPrice.toFixed(4)
      case 'sellingPrice':    return row.sellingPrice.toFixed(4)
      case 'costValue':       return fmt(row.costValue)
      case 'category':        return row.category
      case 'inventoryItemId': return row.inventoryItemId
    }
  }

  function handleExport() {
    const headers = displayCols.map(c => c.label)
    const rowData = sorted.map(r => displayCols.map(c => fmtCell(r, c.key as ColKey)))
    downloadCsv(`expiry-report-${new Date().toISOString().split('T')[0]}.csv`, headers, rowData)
  }

  return (
    <DomainShell
      icon={Clock} iconColor="text-amber-600" iconBg="bg-amber-50"
      title="تقرير الأصناف قريبة الانتهاء"
      subtitle="تواريخ انتهاء صلاحية كل تشغيلة — تسهيل تصريف الأصناف وتقليل الخسائر المالية"
    >
    <div className="space-y-5 pb-8">

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl p-4 border border-gray-100 border-l-4 border-l-amber-400 shadow-sm">
          <span className="text-xs text-gray-500 font-medium flex items-center gap-1"><Package size={12} />عدد الأصناف</span>
          <p className="text-lg font-bold text-gray-900 mt-1">{fmtN(rows.length)}</p>
          {rows.length !== rawRows.length && (
            <p className="text-[10px] text-gray-400 mt-0.5">من {fmtN(rawRows.length)} إجمالي</p>
          )}
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-100 border-l-4 border-l-blue-400 shadow-sm">
          <span className="text-xs text-gray-500 font-medium flex items-center gap-1"><Package size={12} />إجمالي الكمية</span>
          <p className="text-lg font-bold text-gray-900 mt-1">{fmtN(totals.qty)}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-100 border-l-4 border-l-red-400 shadow-sm">
          <span className="text-xs text-gray-500 font-medium flex items-center gap-1"><AlertTriangle size={12} />منتهي الصلاحية</span>
          <p className="text-lg font-bold text-red-600 mt-1">{fmtN(expiredCount)}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-100 border-l-4 border-l-orange-400 shadow-sm">
          <span className="text-xs text-gray-500 font-medium flex items-center gap-1"><DollarSign size={12} />قيمة التكلفة</span>
          <p className="text-lg font-bold text-gray-900 mt-1">{fmt(totals.costValue)}</p>
          <p className="text-[10px] text-orange-500 mt-0.5">{fmtN(nearExpiryCount)} قريب الانتهاء</p>
        </div>
      </div>

      {/* Search + filter toggle bar */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="p-3 flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text" value={fName}
              onChange={e => { setFName(e.target.value); setPage(1) }}
              placeholder="بحث سريع باسم الصنف..."
              className="w-full border border-gray-200 rounded-xl pr-8 pl-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-amber-400"
            />
            {fName && (
              <button onClick={() => { setFName(''); setPage(1) }} className="absolute left-3 top-1/2 -translate-y-1/2">
                <X size={12} className="text-gray-400 hover:text-gray-600" />
              </button>
            )}
          </div>
          <button
            onClick={() => setFiltersOpen(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
              filtersOpen || activeFilterCount > 0
                ? 'bg-amber-50 border-amber-300 text-amber-700'
                : 'border-gray-200 text-gray-600 hover:border-gray-300'
            }`}>
            <Filter size={13} />
            إضافة فلاتر
            {activeFilterCount > 0 && (
              <span className="bg-amber-600 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold">
                {activeFilterCount}
              </span>
            )}
          </button>
          <button onClick={() => refetch()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border border-gray-200 text-gray-600 hover:border-gray-300 transition-all">
            <RefreshCw size={12} /> تحديث
          </button>
          <span className="text-xs text-gray-400 hidden sm:block mr-auto">{rows.length} تشغيلة</span>
        </div>

        {/* Collapsible per-column filter panel */}
        {filtersOpen && (
          <div className="border-t border-gray-100 p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <FilterInput label="كود الصنف"    value={fCode}    onChange={v => { setFCode(v);    setPage(1) }} placeholder="ابحث بالكود..." />
              <FilterInput label="اسم الصنف"    value={fName}    onChange={v => { setFName(v);    setPage(1) }} placeholder="ابحث بالاسم..." />
              <FilterInput label="الباركود"     value={fBarcode} onChange={v => { setFBarcode(v); setPage(1) }} placeholder="ابحث بالباركود..." />
              <FilterInput label="رقم التشغيلة" value={fBatch}   onChange={v => { setFBatch(v);   setPage(1) }} placeholder="ابحث برقم التشغيلة..." />
              <FilterInput label="تاريخ الانتهاء من" value={dateFrom} onChange={v => { setDateFrom(v); setPage(1) }} type="date" />
              <FilterInput label="تاريخ الانتهاء إلى" value={dateTo}  onChange={v => { setDateTo(v);   setPage(1) }} type="date" />
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">عدد الأيام حتى الانتهاء</label>
                <select value={daysAhead} onChange={e => { setDaysAhead(e.target.value); setPage(1) }}
                  className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-amber-400">
                  <option value="">كل التواريخ</option>
                  <option value="7">خلال 7 أيام</option>
                  <option value="30">خلال 30 يوم</option>
                  <option value="60">خلال 60 يوم</option>
                  <option value="90">خلال 90 يوم</option>
                  <option value="180">خلال 180 يوم</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">حالة الصلاحية</label>
                <select value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}
                  className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-amber-400">
                  {STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">الفئة</label>
                <select value={category} onChange={e => { setCategory(e.target.value); setPage(1) }}
                  className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-amber-400">
                  <option value="">كل الفئات</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
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
              <h3 className="text-sm font-semibold text-gray-700">تفاصيل الانتهاء</h3>
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{rows.length} تشغيلة</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleExport}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border border-gray-200 text-gray-600 hover:border-gray-300 transition-all">
                <Download size={13} /> تنزيل CSV
              </button>
              <div className="relative">
                <button onClick={() => setColPickerOpen(v => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                    colPickerOpen ? 'bg-amber-50 border-amber-300 text-amber-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}>
                  <SlidersHorizontal size={13} /> تعديل الجدول
                  {visible.size < ALL_COLS.length && (
                    <span className="bg-amber-600 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold">
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
                    checkboxBg="bg-amber-600"
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
                  <tr key={row.inventoryItemId}
                    className={`border-t border-gray-50 transition-colors ${
                      row.daysUntilExpiry < 0   ? 'bg-red-50/50 hover:bg-red-50' :
                      row.daysUntilExpiry <= 30  ? 'bg-orange-50/50 hover:bg-orange-50' :
                      row.daysUntilExpiry <= 90  ? 'bg-amber-50/30 hover:bg-amber-50' :
                      i % 2 === 1 ? 'bg-gray-50/30 hover:bg-gray-50' : 'hover:bg-gray-50'
                    }`}>
                    {displayCols.map(col => (
                      <td key={col.key}
                        className={`px-3 py-2.5 text-right whitespace-nowrap text-xs ${
                          col.key === 'productName'     ? 'font-medium text-gray-900 max-w-[200px] truncate' :
                          col.key === 'productCode'     ? 'font-mono text-gray-600' :
                          col.key === 'inventoryItemId' ? 'font-mono text-gray-400 text-[10px]' :
                          typeof row[col.key as ColKey] === 'number' && (row[col.key as ColKey] as number) < 0 ? 'text-red-600 font-medium' :
                          col.key === 'costValue'       ? 'font-medium text-gray-900' :
                          'text-gray-600'
                        }`}>
                        {col.key === 'daysUntilExpiry'
                          ? <DaysChip days={row.daysUntilExpiry} />
                          : fmtCell(row, col.key as ColKey)
                        }
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
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400 shadow-sm">
          <Clock size={36} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm">
            {rawRows.length > 0
              ? 'لا توجد نتائج مطابقة للفلاتر المحددة'
              : 'لا توجد أصناف بتواريخ انتهاء صلاحية'}
          </p>
          {activeFilterCount > 0 && (
            <button onClick={clearFilters} className="mt-3 text-xs text-amber-600 hover:underline">
              مسح الفلاتر
            </button>
          )}
        </div>
      )}
    </div>
    </DomainShell>
  )
}
