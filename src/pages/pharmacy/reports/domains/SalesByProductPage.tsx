import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  TrendingUp, TrendingDown, DollarSign, ShoppingCart, BarChart2,
  ArrowDownRight, RefreshCw, Search, SlidersHorizontal, X,
  ChevronUp, ChevronDown, Download,
  ChevronLeft, ChevronRight, type LucideIcon,
} from 'lucide-react'
import { analyticsApi, type ProductSalesRow } from '../../../../api/analytics.api'
import { useCurrency } from '../../../../hooks/useCurrency'
import { useColState } from '../../../../hooks/useColState'
import { ColPicker } from '../../../../components/reports/ColPicker'
import { downloadCsv } from '../../../../utils/export'
import { DomainShell } from '../components/DomainShell'

// ── Date helpers ──────────────────────────────────────────────────────────────

type Preset = 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'custom'
const pad = (n: number) => String(n).padStart(2, '0')
const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

function getDateRange(preset: Preset, customFrom?: string, customTo?: string) {
  const now = new Date()
  switch (preset) {
    case 'today':     return { dateFrom: isoDate(now), dateTo: isoDate(now) }
    case 'yesterday': { const y = new Date(now); y.setDate(y.getDate() - 1); return { dateFrom: isoDate(y), dateTo: isoDate(y) } }
    case 'week':      { const d = new Date(now); const day = d.getDay(); d.setDate(d.getDate() - (day === 0 ? 6 : day - 1)); return { dateFrom: isoDate(d), dateTo: isoDate(now) } }
    case 'month':     return { dateFrom: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), dateTo: isoDate(now) }
    case 'year':      return { dateFrom: `${now.getFullYear()}-01-01`, dateTo: isoDate(now) }
    case 'custom':    return { dateFrom: customFrom ?? isoDate(now), dateTo: customTo ?? isoDate(now) }
  }
}

// ── Column definitions ────────────────────────────────────────────────────────

type ColKey = keyof ProductSalesRow
type SortDir = 'asc' | 'desc'

type ColDef = { key: ColKey; label: string; group: string }

const ALL_COLS: ColDef[] = [
  { key: 'saleDate',           label: 'التاريخ',                       group: 'أساسي' },
  { key: 'productCode',        label: 'كود الصنف',                     group: 'أساسي' },
  { key: 'productName',        label: 'اسم الصنف',                     group: 'أساسي' },
  { key: 'category',           label: 'الفئة',                         group: 'أساسي' },
  { key: 'qtySold',            label: 'الكمية المباعة',                 group: 'كميات' },
  { key: 'avgQtyPerInvoice',   label: 'متوسط الكمية لكل فاتورة',       group: 'كميات' },
  { key: 'invoiceCount',       label: 'إجمالي الفواتير',               group: 'فواتير' },
  { key: 'totalDiscounts',     label: 'إجمالي الخصومات',               group: 'مبيعات' },
  { key: 'totalSales',         label: 'إجمالي مبلغ المبيعات',          group: 'مبيعات' },
  { key: 'salesBeforeDiscount',label: 'إجمالي المبيعات قبل الخصم',     group: 'مبيعات' },
  { key: 'totalReturns',       label: 'قيمة المرتجعات',                group: 'مبيعات' },
  { key: 'netSales',           label: 'صافي المبيعات',                 group: 'مبيعات' },
  { key: 'totalTax',           label: 'إجمالي ضريبة القيمة المضافة',   group: 'ضرائب' },
  { key: 'cogs',               label: 'تكلفة البضاعة المباعة',         group: 'ربحية' },
  { key: 'grossMargin',        label: 'إجمالي هامش الربح',             group: 'ربحية' },
  { key: 'grossMarginPct',     label: 'نسبة هامش الربح %',             group: 'ربحية' },
]

const COL_GROUPS = ['أساسي', 'كميات', 'فواتير', 'مبيعات', 'ضرائب', 'ربحية']
const DEFAULT_VISIBLE = new Set<ColKey>(ALL_COLS.map(c => c.key))
const PAGE_SIZE = 30

const PRESETS: { key: Preset; label: string }[] = [
  { key: 'today',     label: 'اليوم' },
  { key: 'yesterday', label: 'أمس' },
  { key: 'week',      label: 'هذا الأسبوع' },
  { key: 'month',     label: 'هذا الشهر' },
  { key: 'year',      label: 'هذا العام' },
  { key: 'custom',    label: 'مخصص' },
]

// ── Small components ──────────────────────────────────────────────────────────

function KpiCard({ label, value, formatFn, icon: Icon, accent }: {
  label: string; value: number; formatFn: (n: number) => string
  icon: LucideIcon; accent: string
}) {
  return (
    <div className={`bg-white rounded-2xl p-4 border border-gray-100 border-l-4 ${accent} flex flex-col gap-2 shadow-sm`}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500 font-medium">{label}</span>
        <Icon size={14} className="text-gray-400" />
      </div>
      <p className="text-lg font-bold text-gray-900 leading-none">{formatFn(value)}</p>
    </div>
  )
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ChevronUp size={12} className="text-gray-300" />
  return dir === 'asc' ? <ChevronUp size={12} className="text-violet-600" /> : <ChevronDown size={12} className="text-violet-600" />
}

// ── Pagination ────────────────────────────────────────────────────────────────

function Pagination({ page, total, pageSize, onChange }: { page: number; total: number; pageSize: number; onChange: (p: number) => void }) {
  const pages = Math.ceil(total / pageSize)
  if (pages <= 1) return null
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
      <span className="text-xs text-gray-500">{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} من {total}</span>
      <div className="flex items-center gap-1">
        <button onClick={() => onChange(page - 1)} disabled={page === 1}
          className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">
          <ChevronRight size={16} className="text-gray-600" />
        </button>
        {Array.from({ length: Math.min(pages, 7) }, (_, i) => {
          const p = pages <= 7 ? i + 1 : page <= 4 ? i + 1 : page >= pages - 3 ? pages - 6 + i : page - 3 + i
          return (
            <button key={p} onClick={() => onChange(p)}
              className={`w-7 h-7 rounded-lg text-xs font-medium transition-colors ${p === page ? 'bg-violet-600 text-white' : 'hover:bg-gray-100 text-gray-600'}`}>
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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SalesByProductPage() {
  const { fmt } = useCurrency()
  const fmtN = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 })
  const fmtQ = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 4 })

  // Filters
  const [preset,     setPreset]     = useState<Preset>('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo,   setCustomTo]   = useState('')
  const [search,     setSearch]     = useState('')
  const [category,   setCategory]   = useState('')

  // Table
  const [sortKey, setSortKey] = useState<ColKey>('saleDate')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [page,    setPage]    = useState(1)

  // Column picker
  const [colPickerOpen, setColPickerOpen] = useState(false)
  const { visible: visibleCols, order: colOrder, displayCols, toggleCol, setOrder, reset: resetCols } =
    useColState(ALL_COLS, 'salesByProduct')

  useEffect(() => setPage(1), [sortKey, sortDir, search, category, preset, customFrom, customTo])

  const { dateFrom, dateTo } = getDateRange(preset, customFrom, customTo)

  const { data: queryData, isLoading, refetch } = useQuery({
    queryKey: ['sales-by-product', dateFrom, dateTo, search, category],
    queryFn:  () => analyticsApi.getSalesByProduct({
      dateFrom, dateTo,
      search:   search   || undefined,
      category: category || undefined,
      pageSize: 9999,
    }),
    staleTime: 2 * 60_000,
  })
  const rows = queryData?.data ?? []

  // ── Derived ──────────────────────────────────────────────────────────────
  const totals = useMemo(() => rows.reduce((acc, r) => ({
    invoiceCount:        acc.invoiceCount        + r.invoiceCount,
    totalSales:          acc.totalSales          + r.totalSales,
    salesBeforeDiscount: acc.salesBeforeDiscount + r.salesBeforeDiscount,
    totalReturns:        acc.totalReturns        + r.totalReturns,
    netSales:            acc.netSales            + r.netSales,
    totalDiscounts:      acc.totalDiscounts      + r.totalDiscounts,
    qtySold:             acc.qtySold             + r.qtySold,
    cogs:                acc.cogs                + r.cogs,
    grossMargin:         acc.grossMargin         + r.grossMargin,
  }), { invoiceCount: 0, totalSales: 0, salesBeforeDiscount: 0, totalReturns: 0, netSales: 0, totalDiscounts: 0, qtySold: 0, cogs: 0, grossMargin: 0 }), [rows])

  const categories = useMemo(() => [...new Set(rows.map(r => r.category).filter(Boolean))].sort(), [rows])
  const marginPct  = totals.netSales > 0 ? (totals.grossMargin / totals.netSales) * 100 : 0

  // ── Sort + paginate ───────────────────────────────────────────────────────
  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey]
      if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av
      return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
    })
  }, [rows, sortKey, sortDir])

  const pagedRows = sortedRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function toggleSort(key: ColKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  // ── Cell formatter ────────────────────────────────────────────────────────
  function fmtCell(row: ProductSalesRow, key: ColKey): string {
    switch (key) {
      case 'saleDate':           return row.saleDate
      case 'productCode':        return row.productCode
      case 'productName':        return row.productName
      case 'category':           return row.category
      case 'qtySold':            return fmtN(row.qtySold)
      case 'avgQtyPerInvoice':   return fmtQ(row.avgQtyPerInvoice)
      case 'invoiceCount':       return fmtN(row.invoiceCount)
      case 'totalDiscounts':     return fmt(row.totalDiscounts)
      case 'totalSales':         return fmt(row.totalSales)
      case 'salesBeforeDiscount':return fmt(row.salesBeforeDiscount)
      case 'totalReturns':       return fmt(row.totalReturns)
      case 'netSales':           return fmt(row.netSales)
      case 'totalTax':           return fmt(row.totalTax)
      case 'cogs':               return fmt(row.cogs)
      case 'grossMargin':        return fmt(row.grossMargin)
      case 'grossMarginPct':     return `${row.grossMarginPct.toFixed(1)}%`
    }
  }

  function fmtTotalCell(key: ColKey): string {
    switch (key) {
      case 'saleDate':           return 'الإجمالي'
      case 'productCode':        return ''
      case 'productName':        return ''
      case 'category':           return ''
      case 'qtySold':            return fmtN(totals.qtySold)
      case 'avgQtyPerInvoice':   return ''
      case 'invoiceCount':       return fmtN(totals.invoiceCount)
      case 'totalDiscounts':     return fmt(totals.totalDiscounts)
      case 'totalSales':         return fmt(totals.totalSales)
      case 'salesBeforeDiscount':return fmt(totals.salesBeforeDiscount)
      case 'totalReturns':       return fmt(totals.totalReturns)
      case 'netSales':           return fmt(totals.netSales)
      case 'totalTax':           return '—'
      case 'cogs':               return fmt(totals.cogs)
      case 'grossMargin':        return fmt(totals.grossMargin)
      case 'grossMarginPct':     return `${marginPct.toFixed(1)}%`
    }
  }

  function handleExport() {
    const headers = displayCols.map(c => c.label)
    const rowData = sortedRows.map(r => displayCols.map(c => fmtCell(r, c.key as ColKey)))
    rowData.push(displayCols.map(c => fmtTotalCell(c.key as ColKey)))
    downloadCsv(`sales-by-product-${dateFrom}-${dateTo}.csv`, headers, rowData)
  }

  return (
    <DomainShell
      icon={BarChart2} iconColor="text-indigo-600" iconBg="bg-indigo-50"
      title="المبيعات حسب الصنف"
      subtitle="تحليل أداء كل صنف على حدة — الكميات المباعة، هامش الربح، المرتجعات، وتكلفة البضاعة يومياً"
    >
    <div className="space-y-5 pb-8">

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="إجمالي الفواتير"          value={totals.invoiceCount}        formatFn={fmtN} icon={ShoppingCart}  accent="border-l-indigo-400" />
        <KpiCard label="إجمالي المبيعات"           value={totals.totalSales}          formatFn={fmt}  icon={TrendingUp}   accent="border-l-emerald-400" />
        <KpiCard label="المبيعات قبل الخصم"        value={totals.salesBeforeDiscount} formatFn={fmt}  icon={DollarSign}   accent="border-l-violet-400" />
        <KpiCard label="قيمة المرتجعات"            value={totals.totalReturns}        formatFn={fmt}  icon={ArrowDownRight} accent="border-l-red-400" />
      </div>

      {/* ── Filter bar ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 flex flex-wrap items-center gap-2">
        {/* Presets */}
        <div className="flex bg-gray-50 rounded-xl p-0.5 gap-0.5 overflow-x-auto flex-shrink-0">
          {PRESETS.map(p => (
            <button key={p.key} onClick={() => setPreset(p.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                preset === p.key ? 'bg-white text-indigo-700 shadow font-semibold' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {p.label}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="flex items-center gap-2">
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs bg-white" />
            <span className="text-gray-400 text-xs">←</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs bg-white" />
          </div>
        )}
        <div className="w-px h-6 bg-gray-200 hidden sm:block" />
        {/* Search */}
        <div className="relative flex-1 min-w-[180px]">
          <Search size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="بحث باسم أو كود الصنف..."
            className="w-full border border-gray-200 rounded-xl pr-8 pl-3 py-1.5 text-xs bg-white"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute left-3 top-1/2 -translate-y-1/2">
              <X size={12} className="text-gray-400 hover:text-gray-600" />
            </button>
          )}
        </div>
        {/* Category filter */}
        <select value={category} onChange={e => setCategory(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs bg-white min-w-[120px]">
          <option value="">كل الفئات</option>
          {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
        </select>
        <div className="flex-1" />
        <span className="text-xs text-gray-400 hidden sm:block">{rows.length} سجل</span>
        <button onClick={() => refetch()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border border-gray-200 text-gray-600 hover:border-gray-300 transition-all">
          <RefreshCw size={12} /> تحديث
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-gray-100 animate-pulse rounded-2xl" />)}
        </div>
      ) : rows.length > 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
          {/* Toolbar */}
          <div className="p-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-semibold text-gray-700">تفاصيل المبيعات</h3>
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{rows.length} سجل</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleExport}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border border-gray-200 text-gray-600 hover:border-gray-300 transition-all">
                <Download size={13} /> تنزيل CSV
              </button>
              <div className="relative">
                <button onClick={() => setColPickerOpen(v => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                    colPickerOpen ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}>
                  <SlidersHorizontal size={13} />
                  الأعمدة
                  {visibleCols.size < ALL_COLS.length && (
                    <span className="bg-indigo-600 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold">
                      {ALL_COLS.length - visibleCols.size}
                    </span>
                  )}
                </button>
                {colPickerOpen && (
                  <ColPicker
                    allCols={ALL_COLS}
                    visible={visibleCols}
                    order={colOrder}
                    onToggle={toggleCol}
                    onReorder={setOrder}
                    onReset={resetCols}
                    onClose={() => setColPickerOpen(false)}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Table */}
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
                {pagedRows.map((row, i) => (
                  <tr key={`${row.productCode}-${row.saleDate}-${i}`}
                    className={`border-t border-gray-50 hover:bg-indigo-50/30 transition-colors ${i % 2 === 1 ? 'bg-gray-50/30' : ''}`}>
                    {displayCols.map(col => (
                      <td key={col.key}
                        className={`px-3 py-2.5 text-right whitespace-nowrap text-xs ${
                          col.key === 'productName'    ? 'font-medium text-gray-900 max-w-[200px] truncate' :
                          col.key === 'productCode'    ? 'font-mono text-gray-600' :
                          col.key === 'saleDate'       ? 'font-medium text-gray-900' :
                          col.key === 'grossMarginPct' ? (
                            row.grossMarginPct >= 20 ? 'text-emerald-700 font-semibold' :
                            row.grossMarginPct >= 10 ? 'text-amber-700' : 'text-red-600'
                          ) :
                          typeof row[col.key as ColKey] === 'number' && (row[col.key as ColKey] as number) < 0 ? 'text-red-600 font-medium' :
                          col.key === 'netSales' || col.key === 'grossMargin' ? 'font-bold text-gray-900' :
                          typeof row[col.key as ColKey] === 'number' ? 'font-medium text-gray-700' :
                          'text-gray-600'
                        }`}>
                        {fmtCell(row, col.key as ColKey)}
                      </td>
                    ))}
                  </tr>
                ))}
                {/* Totals footer */}
                {page === Math.ceil(sortedRows.length / PAGE_SIZE) || Math.ceil(sortedRows.length / PAGE_SIZE) <= 1 ? (
                  <tr className="border-t-2 border-indigo-200 bg-indigo-50/60 font-semibold">
                    {displayCols.map((col, ci) => (
                      <td key={col.key}
                        className={`px-3 py-3 text-right text-xs whitespace-nowrap ${
                          ci === 0 ? 'font-bold text-indigo-800' :
                          col.key === 'netSales' || col.key === 'grossMargin' ? 'font-bold text-indigo-900' :
                          col.key === 'grossMarginPct' ? (marginPct >= 20 ? 'font-bold text-emerald-700' : marginPct >= 10 ? 'font-bold text-amber-700' : 'font-bold text-red-600') :
                          'font-bold text-gray-700'
                        }`}>
                        {fmtTotalCell(col.key as ColKey)}
                      </td>
                    ))}
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <Pagination page={page} total={sortedRows.length} pageSize={PAGE_SIZE} onChange={setPage} />
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400 shadow-sm">
          <BarChart2 size={36} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm">لا توجد مبيعات في هذه الفترة</p>
        </div>
      )}
    </div>
    </DomainShell>
  )
}

