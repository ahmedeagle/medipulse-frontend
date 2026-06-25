import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  TrendingUp, DollarSign, ShoppingCart, BarChart2,
  RefreshCw, Search, SlidersHorizontal, X, Plus,
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

type ProdColDef = { key: ColKey; label: string; group: string; isNumeric?: boolean }

const ALL_COLS: ProdColDef[] = [
  { key: 'saleDate',            label: 'التاريخ',                             group: 'أساسي' },
  { key: 'productCode',         label: 'كود الصنف',                           group: 'أساسي' },
  { key: 'productName',         label: 'اسم الصنف',                           group: 'أساسي' },
  { key: 'category',            label: 'الفئة',                               group: 'أساسي' },
  { key: 'qtySold',             label: 'إجمالي الكمية المباعة',                group: 'كميات',   isNumeric: true },
  { key: 'qtyReturned',         label: 'إجمالي الكمية المرتجعة',               group: 'كميات',   isNumeric: true },
  { key: 'invoiceCount',        label: 'إجمالي الفواتير',                     group: 'فواتير',  isNumeric: true },
  { key: 'avgInvoiceValue',     label: 'متوسط قيمة الفاتورة',                 group: 'فواتير',  isNumeric: true },
  { key: 'avgQtyPerInvoice',    label: 'متوسط عدد الأصناف في الفاتورة',       group: 'فواتير',  isNumeric: true },
  { key: 'totalSales',          label: 'صافي إجمالي المبيعات',                group: 'مبيعات',  isNumeric: true },
  { key: 'salesBeforeDiscount', label: 'إجمالي المبيعات قبل الخصومات',        group: 'مبيعات',  isNumeric: true },
  { key: 'totalReturns',        label: 'قيمة المرتجعات',                      group: 'مبيعات',  isNumeric: true },
  { key: 'totalDiscounts',      label: 'قيمة الخصومات',                       group: 'مبيعات',  isNumeric: true },
  { key: 'netSales',            label: 'صافي الإيرادات',                      group: 'مبيعات',  isNumeric: true },
  { key: 'cogs',                label: 'إجمالي قيمة التكلفة',                 group: 'ربحية',   isNumeric: true },
  { key: 'grossMargin',         label: 'إجمالي الربح',                        group: 'ربحية',   isNumeric: true },
  { key: 'grossMarginPct',      label: 'نسبة هامش الربح الإجمالي',            group: 'ربحية',   isNumeric: true },
]
const DEFAULT_VISIBLE = new Set<ColKey>([
  'saleDate', 'productName', 'category', 'qtySold', 'qtyReturned',
  'netSales', 'cogs', 'grossMargin', 'grossMarginPct',
])
const PAGE_SIZE = 50

const PRESETS: { key: Preset; label: string }[] = [
  { key: 'today',     label: 'اليوم' },
  { key: 'yesterday', label: 'أمس' },
  { key: 'week',      label: 'هذا الأسبوع' },
  { key: 'month',     label: 'هذا الشهر' },
  { key: 'year',      label: 'هذا العام' },
  { key: 'custom',    label: 'مخصص' },
]

// ── Column filter panel ───────────────────────────────────────────────────────

type FilterEntry = { key: string; label: string; value: string; isNumeric: boolean }

function AddFilterPanel({
  allCols, active, onAdd, onRemove, onChangeValue,
}: {
  allCols: ProdColDef[]
  active: FilterEntry[]
  onAdd: (col: ProdColDef) => void
  onRemove: (key: string) => void
  onChangeValue: (key: string, value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRefs   = useRef<Map<string, HTMLInputElement>>(new Map())
  const [focusKey, setFocusKey] = useState<string | null>(null)

  useEffect(() => {
    if (!focusKey) return
    const el = inputRefs.current.get(focusKey)
    if (el) { el.focus(); el.select() }
    setFocusKey(null)
  }, [focusKey, active])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const activeKeys = new Set(active.map(f => f.key))
  const available  = allCols.filter(c => !activeKeys.has(c.key))

  function handleAdd(col: ProdColDef) {
    onAdd(col)
    setFocusKey(col.key)
    setOpen(false)
  }

  return (
    <div className="flex items-center flex-wrap gap-2">
      {active.map(f => (
        <div key={f.key}
          className="flex items-center gap-0 bg-white border-2 border-teal-400 rounded-xl overflow-hidden shadow-sm">
          <span className="bg-teal-500 text-white text-xs font-semibold px-2.5 py-1.5 whitespace-nowrap select-none">
            {f.label}
          </span>
          <span className="text-xs text-gray-400 px-1.5 select-none whitespace-nowrap">
            {f.isNumeric ? '≥' : 'يحتوي'}
          </span>
          <input
            ref={el => { if (el) inputRefs.current.set(f.key, el); else inputRefs.current.delete(f.key) }}
            type={f.isNumeric ? 'number' : 'text'}
            value={f.value}
            onChange={e => onChangeValue(f.key, e.target.value)}
            placeholder={f.isNumeric ? 'أدخل رقماً...' : 'اكتب هنا...'}
            className="text-sm px-2 py-1.5 bg-white text-gray-800 placeholder-gray-400 focus:outline-none focus:bg-teal-50 transition-colors w-28"
            dir="ltr"
          />
          <button
            onClick={() => onRemove(f.key)}
            className="px-2 py-1.5 text-gray-400 hover:text-white hover:bg-red-500 transition-colors"
          >
            <X size={13} />
          </button>
        </div>
      ))}

      {available.length > 0 && (
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setOpen(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border-2 transition-all ${
              open
                ? 'bg-teal-500 border-teal-500 text-white'
                : 'border-dashed border-gray-300 text-gray-500 hover:border-teal-400 hover:text-teal-600 hover:bg-teal-50'
            }`}
          >
            <Plus size={13} /> إضافة فلتر
          </button>
          {open && (
            <div className="absolute top-full mt-1.5 z-40 bg-white rounded-2xl border border-gray-200 shadow-2xl w-64 py-1.5 max-h-72 overflow-y-auto" style={{ right: 0 }}>
              <p className="px-3 pt-1 pb-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                اختر حقلاً للتصفية
              </p>
              {available.map(col => (
                <button
                  key={col.key}
                  onClick={() => handleAdd(col)}
                  className="w-full text-right px-3 py-2.5 text-sm hover:bg-teal-50 hover:text-teal-700 transition-colors flex items-center justify-between gap-2"
                >
                  <span className="font-medium">{col.label}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                    col.isNumeric ? 'bg-teal-100 text-teal-600' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {col.isNumeric ? 'رقم' : 'نص'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {active.length > 0 && (
        <button
          onClick={() => active.forEach(f => onRemove(f.key))}
          className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 px-2.5 py-1.5 rounded-xl hover:bg-red-50 border border-transparent hover:border-red-200 transition-all font-medium"
        >
          <X size={11} /> مسح الكل
        </button>
      )}
    </div>
  )
}

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
  return dir === 'asc' ? <ChevronUp size={12} className="text-teal-600" /> : <ChevronDown size={12} className="text-teal-600" />
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
              className={`w-7 h-7 rounded-lg text-xs font-medium transition-colors ${p === page ? 'bg-teal-600 text-white' : 'hover:bg-gray-100 text-gray-600'}`}>
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

// ── Margin badge ──────────────────────────────────────────────────────────────

function MarginBadge({ pct }: { pct: number }) {
  const color =
    pct >= 30 ? 'bg-emerald-100 text-emerald-700' :
    pct >= 15 ? 'bg-amber-100 text-amber-700' :
                'bg-red-100 text-red-700'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${color}`}>
      {pct.toFixed(1)}%
    </span>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ProfitabilityByProductPage() {
  const { fmt } = useCurrency()
  const fmtN = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 })

  // Filters
  const [preset,     setPreset]     = useState<Preset>('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo,   setCustomTo]   = useState('')
  const [search,     setSearch]     = useState('')
  const [category,   setCategory]   = useState('')

  // Table
  const [sortKey, setSortKey] = useState<ColKey>('grossMargin')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [page,    setPage]    = useState(1)

  // Column filters
  const [filters, setFilters] = useState<FilterEntry[]>([])
  function addFilter(col: ProdColDef) {
    setFilters(prev => [...prev, { key: col.key, label: col.label, value: '', isNumeric: !!col.isNumeric }])
  }
  function removeFilter(key: string) {
    setFilters(prev => prev.filter(f => f.key !== key))
  }
  function updateFilterValue(key: string, value: string) {
    setFilters(prev => prev.map(f => f.key === key ? { ...f, value } : f))
  }

  // Column picker
  const [colPickerOpen, setColPickerOpen] = useState(false)
  const { visible: visibleCols, order: colOrder, displayCols, toggleCol, setOrder, reset: resetCols } =
    useColState(ALL_COLS, 'profitabilityByProduct')

  useEffect(() => setPage(1), [sortKey, sortDir, search, category, preset, customFrom, customTo, filters])

  const { dateFrom, dateTo } = getDateRange(preset, customFrom, customTo)

  const { data: queryData, isLoading, refetch } = useQuery({
    queryKey: ['profitability-by-product', dateFrom, dateTo, search, category],
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
    qtyReturned:         acc.qtyReturned         + r.qtyReturned,
    cogs:                acc.cogs                + r.cogs,
    grossMargin:         acc.grossMargin         + r.grossMargin,
  }), { invoiceCount: 0, totalSales: 0, salesBeforeDiscount: 0, totalReturns: 0, netSales: 0, totalDiscounts: 0, qtySold: 0, qtyReturned: 0, cogs: 0, grossMargin: 0 }), [rows])

  const categories = useMemo(() => [...new Set(rows.map(r => r.category).filter(Boolean))].sort(), [rows])
  const marginPct  = totals.netSales > 0 ? (totals.grossMargin / totals.netSales) * 100 : 0

  // ── Sort + paginate ───────────────────────────────────────────────────────
  const sortedRows = useMemo(() => {
    let result = [...rows]
    for (const f of filters) {
      if (!f.value) continue
      const col = ALL_COLS.find(c => c.key === f.key)
      if (!col) continue
      if (col.isNumeric) {
        const min = parseFloat(f.value)
        if (!isNaN(min)) result = result.filter(r => {
          const v = r[f.key as ColKey]
          return typeof v === 'number' && v >= min
        })
      } else {
        const q = f.value.toLowerCase()
        result = result.filter(r => String(r[f.key as ColKey] ?? '').toLowerCase().includes(q))
      }
    }
    return result.sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey]
      if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av
      return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
    })
  }, [rows, sortKey, sortDir, filters])

  const pagedRows = sortedRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function toggleSort(key: ColKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  // ── Cell formatter ────────────────────────────────────────────────────────
  function fmtCell(row: ProductSalesRow, key: ColKey): string {
    switch (key) {
      case 'saleDate':            return row.saleDate
      case 'productCode':         return row.productCode
      case 'productName':         return row.productName
      case 'category':            return row.category
      case 'qtySold':             return fmtN(row.qtySold)
      case 'qtyReturned':         return fmtN(row.qtyReturned)
      case 'invoiceCount':        return fmtN(row.invoiceCount)
      case 'avgInvoiceValue':     return fmt(row.avgInvoiceValue)
      case 'totalSales':          return fmt(row.totalSales)
      case 'salesBeforeDiscount': return fmt(row.salesBeforeDiscount)
      case 'totalReturns':        return fmt(row.totalReturns)
      case 'totalDiscounts':      return fmt(row.totalDiscounts)
      case 'netSales':            return fmt(row.netSales)
      case 'cogs':                return fmt(row.cogs)
      case 'grossMargin':         return fmt(row.grossMargin)
      case 'grossMarginPct':      return `${row.grossMarginPct.toFixed(1)}%`
      // fallback for any unused ProductSalesRow keys
      default: {
        const v = row[key]
        return typeof v === 'number' ? fmtN(v) : String(v ?? '')
      }
    }
  }

  function fmtTotalCell(key: ColKey): string {
    switch (key) {
      case 'saleDate':            return 'الإجمالي'
      case 'productCode':         return ''
      case 'productName':         return ''
      case 'category':            return ''
      case 'qtySold':             return fmtN(totals.qtySold)
      case 'qtyReturned':         return fmtN(totals.qtyReturned)
      case 'invoiceCount':        return fmtN(totals.invoiceCount)
      case 'avgInvoiceValue':     return ''
      case 'totalSales':          return fmt(totals.totalSales)
      case 'salesBeforeDiscount': return fmt(totals.salesBeforeDiscount)
      case 'totalReturns':        return fmt(totals.totalReturns)
      case 'totalDiscounts':      return fmt(totals.totalDiscounts)
      case 'netSales':            return fmt(totals.netSales)
      case 'cogs':                return fmt(totals.cogs)
      case 'grossMargin':         return fmt(totals.grossMargin)
      case 'grossMarginPct':      return `${marginPct.toFixed(1)}%`
      default:                    return ''
    }
  }

  function handleExport() {
    const headers = displayCols.map(c => c.label)
    const rowData = sortedRows.map(r => displayCols.map(c => fmtCell(r, c.key as ColKey)))
    rowData.push(displayCols.map(c => fmtTotalCell(c.key as ColKey)))
    downloadCsv(`profitability-by-product-${dateFrom}-${dateTo}.csv`, headers, rowData)
  }

  return (
    <DomainShell
      icon={TrendingUp} iconColor="text-teal-600" iconBg="bg-teal-50"
      title="الربحية حسب المنتج"
      subtitle="ربحية كل صنف على حدة — الكميات المباعة والمرتجعة، هامش الربح الإجمالي، وتكلفة البضاعة مقارنةً بصافي الإيرادات"
    >
    <div className="space-y-5 pb-8" dir="rtl">

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="إجمالي الفواتير"   value={totals.invoiceCount}  formatFn={fmtN} icon={ShoppingCart}  accent="border-l-teal-400" />
        <KpiCard label="صافي الإيرادات"    value={totals.netSales}      formatFn={fmt}  icon={TrendingUp}   accent="border-l-emerald-400" />
        <KpiCard label="إجمالي التكلفة"    value={totals.cogs}          formatFn={fmt}  icon={DollarSign}   accent="border-l-amber-400" />
        <KpiCard label="إجمالي الربح"      value={totals.grossMargin}   formatFn={fmt}  icon={BarChart2}    accent="border-l-teal-600" />
      </div>

      {/* ── Filter bar ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 flex flex-wrap items-center gap-2">
        {/* Presets */}
        <div className="flex bg-gray-50 rounded-xl p-0.5 gap-0.5 overflow-x-auto flex-shrink-0">
          {PRESETS.map(p => (
            <button key={p.key} onClick={() => setPreset(p.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                preset === p.key ? 'bg-white text-teal-700 shadow font-semibold' : 'text-gray-500 hover:text-gray-700'
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
              <h3 className="text-sm font-semibold text-gray-700">تفاصيل الربحية</h3>
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
                    colPickerOpen ? 'bg-teal-50 border-teal-300 text-teal-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}>
                  <SlidersHorizontal size={13} />
                  الأعمدة
                  {visibleCols.size < ALL_COLS.length && (
                    <span className="bg-teal-600 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold">
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
                    checkboxBg="bg-teal-600"
                  />
                )}
              </div>
            </div>
          </div>

          {/* Column filter panel */}
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/60">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-gray-500">تصفية النتائج:</span>
              {filters.filter(f => f.value).length > 0 && (
                <span className="text-[10px] bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full font-medium">
                  {filters.filter(f => f.value).length} فلتر نشط
                </span>
              )}
            </div>
            <AddFilterPanel
              allCols={ALL_COLS}
              active={filters}
              onAdd={addFilter}
              onRemove={removeFilter}
              onChangeValue={updateFilterValue}
            />
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
                    className={`border-t border-gray-50 hover:bg-teal-50/30 transition-colors ${i % 2 === 1 ? 'bg-gray-50/30' : ''}`}>
                    {displayCols.map(col => (
                      <td key={col.key}
                        className={`px-3 py-2.5 text-right whitespace-nowrap text-xs ${
                          col.key === 'productName'    ? 'font-medium text-gray-900 max-w-[200px] truncate' :
                          col.key === 'productCode'    ? 'font-mono text-gray-600' :
                          col.key === 'saleDate'       ? 'font-medium text-gray-900' :
                          col.key === 'grossMarginPct' ? '' :
                          typeof row[col.key as ColKey] === 'number' && (row[col.key as ColKey] as number) < 0 ? 'text-red-600 font-medium' :
                          col.key === 'netSales' || col.key === 'grossMargin' ? 'font-bold text-gray-900' :
                          typeof row[col.key as ColKey] === 'number' ? 'font-medium text-gray-700' :
                          'text-gray-600'
                        }`}>
                        {col.key === 'grossMarginPct'
                          ? <MarginBadge pct={row.grossMarginPct} />
                          : fmtCell(row, col.key as ColKey)
                        }
                      </td>
                    ))}
                  </tr>
                ))}
                {/* Totals footer */}
                {page === Math.ceil(sortedRows.length / PAGE_SIZE) || Math.ceil(sortedRows.length / PAGE_SIZE) <= 1 ? (
                  <tr className="border-t-2 border-teal-200 bg-teal-50/60 font-semibold">
                    {displayCols.map((col, ci) => (
                      <td key={col.key}
                        className={`px-3 py-3 text-right text-xs whitespace-nowrap ${
                          ci === 0 ? 'font-bold text-teal-800' :
                          col.key === 'netSales' || col.key === 'grossMargin' ? 'font-bold text-teal-900' :
                          col.key === 'grossMarginPct' ? (marginPct >= 30 ? 'font-bold text-emerald-700' : marginPct >= 15 ? 'font-bold text-amber-700' : 'font-bold text-red-600') :
                          'font-bold text-gray-700'
                        }`}>
                        {col.key === 'grossMarginPct'
                          ? `${marginPct.toFixed(1)}%`
                          : fmtTotalCell(col.key as ColKey)
                        }
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
          <TrendingUp size={36} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm">لا توجد بيانات في هذه الفترة</p>
        </div>
      )}
    </div>
    </DomainShell>
  )
}

