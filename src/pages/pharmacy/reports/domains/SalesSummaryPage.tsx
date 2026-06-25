import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  TrendingUp, TrendingDown, DollarSign, ShoppingCart, BarChart2,
  ArrowUpRight, ArrowDownRight, Sparkles, Receipt, Percent,
  RefreshCw, ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  Download, SlidersHorizontal, Check, X, Plus, type LucideIcon,
} from 'lucide-react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { analyticsApi, type SalesSummaryRow } from '../../../../api/analytics.api'
import { useCurrency } from '../../../../hooks/useCurrency'
import { useColState } from '../../../../hooks/useColState'
import { ColPicker } from '../../../../components/reports/ColPicker'
import { downloadCsv } from '../../../../utils/export'
import { DomainShell } from '../components/DomainShell'

// ── Types ─────────────────────────────────────────────────────────────────────

type Preset      = 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'custom'
type Granularity = 'daily' | 'weekly' | 'monthly'
type SortDir     = 'asc' | 'desc'
type AllColKey   = keyof SalesSummaryRow

// ── Date helpers ──────────────────────────────────────────────────────────────

const pad     = (n: number) => String(n).padStart(2, '0')
const isoDate = (d: Date)   => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

function getDateRange(preset: Preset, customFrom?: string, customTo?: string) {
  const now = new Date()
  switch (preset) {
    case 'today':     return { dateFrom: isoDate(now), dateTo: isoDate(now) }
    case 'yesterday': { const y = new Date(now); y.setDate(y.getDate() - 1); return { dateFrom: isoDate(y), dateTo: isoDate(y) } }
    case 'week':      { const d = new Date(now); const day = d.getDay(); d.setDate(d.getDate() - (day === 0 ? 6 : day - 1)); return { dateFrom: isoDate(d), dateTo: isoDate(now) } }
    case 'month':     return { dateFrom: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), dateTo: isoDate(now) }
    case 'year':      return { dateFrom: `${now.getFullYear()}-01-01`, dateTo: isoDate(now) }
    case 'custom':    return { dateFrom: customFrom || isoDate(now), dateTo: customTo || isoDate(now) }
  }
}

function getPriorRange(dateFrom: string, dateTo: string) {
  const from     = new Date(dateFrom), to = new Date(dateTo)
  const duration = to.getTime() - from.getTime() + 86_400_000
  const priorTo  = new Date(from.getTime() - 86_400_000)
  return { dateFrom: isoDate(new Date(priorTo.getTime() - duration + 86_400_000)), dateTo: isoDate(priorTo) }
}

function sumRows(rows: SalesSummaryRow[]) {
  return rows.reduce(
    (a, r) => ({
      salesBeforeDiscount: a.salesBeforeDiscount + r.salesBeforeDiscount,
      totalSales:          a.totalSales          + r.totalSales,
      totalReturns:        a.totalReturns        + r.totalReturns,
      netSales:            a.netSales            + r.netSales,
      invoiceCount:        a.invoiceCount        + r.invoiceCount,
      totalDiscounts:      a.totalDiscounts      + r.totalDiscounts,
      totalTax:            a.totalTax            + r.totalTax,
      cogs:                a.cogs                + r.cogs,
      grossMargin:         a.grossMargin         + r.grossMargin,
    }),
    { salesBeforeDiscount: 0, totalSales: 0, totalReturns: 0, netSales: 0, invoiceCount: 0, totalDiscounts: 0, totalTax: 0, cogs: 0, grossMargin: 0 },
  )
}

// ── Column definitions (EXACT match to user spec — no grossMarginPct) ─────────

type ColDef = { key: AllColKey; label: string; group: string; isNumeric?: boolean; isDate?: boolean }

const METRIC_COLS: ColDef[] = [
  { key: 'totalSales',          label: 'إجمالي مبلغ المبيعات',         group: 'مبيعات', isNumeric: true },
  { key: 'salesBeforeDiscount', label: 'إجمالي المبيعات قبل الخصم',    group: 'مبيعات', isNumeric: true },
  { key: 'totalReturns',        label: 'قيمة المرتجعات',               group: 'مبيعات', isNumeric: true },
  { key: 'netSales',            label: 'صافي المبيعات',                group: 'مبيعات', isNumeric: true },
  { key: 'invoiceCount',        label: 'إجمالي الفواتير',              group: 'فواتير', isNumeric: true },
  { key: 'avgInvoice',          label: 'متوسط قيمة الفاتورة',          group: 'فواتير', isNumeric: true },
  { key: 'totalDiscounts',      label: 'إجمالي الخصومات',              group: 'مبيعات', isNumeric: true },
  { key: 'totalTax',            label: 'إجمالي ضريبة القيمة المضافة',  group: 'ضرائب',  isNumeric: true },
  { key: 'cogs',                label: 'تكلفة البضاعة المباعة',        group: 'ربحية',  isNumeric: true },
  { key: 'grossMargin',         label: 'إجمالي هامش الربح',            group: 'ربحية',  isNumeric: true },
]

const PERIOD_COLS: Record<Granularity, ColDef[]> = {
  daily: [
    { key: 'period',      label: 'التاريخ',              group: 'أساسي', isDate: true },
  ],
  weekly: [
    { key: 'weekStart',   label: 'تاريخ بداية الأسبوع',  group: 'أساسي', isDate: true },
    { key: 'weekEnd',     label: 'تاريخ نهاية الأسبوع',  group: 'أساسي', isDate: true },
    { key: 'year',        label: 'السنة',                group: 'أساسي', isNumeric: true },
    { key: 'weekNumber',  label: 'رقم الأسبوع',           group: 'أساسي', isNumeric: true },
  ],
  monthly: [
    { key: 'monthStart',  label: 'تاريخ بداية الشهر',    group: 'أساسي', isDate: true },
    { key: 'monthEnd',    label: 'تاريخ نهاية الشهر',    group: 'أساسي', isDate: true },
    { key: 'year',        label: 'السنة',                group: 'أساسي', isNumeric: true },
    { key: 'monthNumber', label: 'رقم الشهر',             group: 'أساسي', isNumeric: true },
    { key: 'period',      label: 'تنسيق سنة / شهر',      group: 'أساسي', isDate: true },
  ],
}

function getAllCols(gran: Granularity): ColDef[] {
  return [...PERIOD_COLS[gran], ...METRIC_COLS]
}

const PAGE_SIZE = 30

const PRESETS: { key: Preset; label: string }[] = [
  { key: 'today',     label: 'اليوم' },
  { key: 'yesterday', label: 'أمس' },
  { key: 'week',      label: 'هذا الأسبوع' },
  { key: 'month',     label: 'هذا الشهر' },
  { key: 'year',      label: 'هذا العام' },
  { key: 'custom',    label: 'مخصص' },
]

const GRANULARITIES: { key: Granularity; label: string }[] = [
  { key: 'daily',   label: 'يومي'   },
  { key: 'weekly',  label: 'أسبوعي' },
  { key: 'monthly', label: 'شهري'   },
]

// ── Small components ──────────────────────────────────────────────────────────

function DeltaBadge({ current, prior }: { current: number; prior: number }) {
  if (prior === 0) return null
  const pct = ((current - prior) / Math.abs(prior)) * 100
  const up  = pct >= 0
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded-full ${up ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
      {up ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
      {Math.abs(pct).toFixed(1)}%
    </span>
  )
}

function KpiCard({ label, value, prior, formatFn, icon: Icon, accent }: {
  label: string; value: number; prior: number
  formatFn: (n: number) => string; icon: LucideIcon; accent: string
}) {
  return (
    <div className={`bg-white rounded-2xl p-4 border border-gray-100 border-l-4 ${accent} flex flex-col gap-2 shadow-sm`}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500 font-medium">{label}</span>
        <Icon size={14} className="text-gray-400" />
      </div>
      <p className="text-lg font-bold text-gray-900 leading-none truncate">{formatFn(value)}</p>
      <DeltaBadge current={value} prior={prior} />
    </div>
  )
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ChevronUp size={12} className="text-gray-300" />
  return dir === 'asc' ? <ChevronUp size={12} className="text-violet-600" /> : <ChevronDown size={12} className="text-violet-600" />
}

function Pagination({ page, total, onChange }: { page: number; total: number; onChange: (p: number) => void }) {
  const pages = Math.ceil(total / PAGE_SIZE)
  if (pages <= 1) return null
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
      <span className="text-xs text-gray-500">
        صفحة {page} من {pages} — ({(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} من {total})
      </span>
      <div className="flex items-center gap-1">
        <button onClick={() => onChange(page - 1)} disabled={page === 1}
          className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">
          <ChevronRight size={16} className="text-gray-600" />
        </button>
        {Array.from({ length: Math.min(pages, 7) }, (_, i) => {
          const p = pages <= 7 ? i + 1 : page <= 4 ? i + 1 : page >= pages - 3 ? pages - 6 + i : page - 3 + i
          return (
            <button key={p} onClick={() => onChange(p)}
              className={`w-7 h-7 rounded-lg text-xs font-medium ${p === page ? 'bg-violet-600 text-white' : 'hover:bg-gray-100 text-gray-600'}`}>
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

// ── Smart filter panel ────────────────────────────────────────────────────────

type FilterEntry = { key: AllColKey; label: string; value: string; isNumeric: boolean; isDate: boolean }

function AddFilterPanel({
  allCols,
  active,
  onAdd,
  onRemove,
  onChangeValue,
}: {
  allCols: ColDef[]
  active: FilterEntry[]
  onAdd: (col: ColDef) => void
  onRemove: (key: AllColKey) => void
  onChangeValue: (key: AllColKey, value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const dropdownRef  = useRef<HTMLDivElement>(null)
  const inputRefs    = useRef<Map<string, HTMLInputElement>>(new Map())
  const [focusKey, setFocusKey] = useState<string | null>(null)

  // Auto-focus the input when a filter is freshly added
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

  function handleAdd(col: ColDef) {
    onAdd(col)
    setFocusKey(col.key)
    setOpen(false)
  }

  return (
    <div className="flex items-center flex-wrap gap-2">
      {/* Active filter chips */}
      {active.map(f => (
        <div key={f.key}
          className="flex items-center gap-0 bg-white border-2 border-violet-400 rounded-xl overflow-hidden shadow-sm">
          {/* Label badge */}
          <span className="bg-violet-500 text-white text-xs font-semibold px-2.5 py-1.5 whitespace-nowrap select-none">
            {f.label}
          </span>
          {/* Operator */}
          <span className="text-xs text-gray-400 px-1.5 select-none whitespace-nowrap">
            {f.isDate ? '=' : f.isNumeric ? '≥' : 'يحتوي'}
          </span>
          {/* Input — highly visible */}
          <input
            ref={el => { if (el) inputRefs.current.set(f.key, el); else inputRefs.current.delete(f.key) }}
            type={f.isDate ? 'date' : f.isNumeric ? 'number' : 'text'}
            value={f.value}
            onChange={e => onChangeValue(f.key, e.target.value)}
            placeholder={f.isNumeric ? 'أدخل رقماً...' : 'اكتب هنا...'}
            className={`text-sm px-2 py-1.5 bg-white text-gray-800 placeholder-gray-400 focus:outline-none focus:bg-violet-50 transition-colors ${f.isDate ? 'w-36' : 'w-28'}`}
            dir="ltr"
          />
          {/* Remove */}
          <button
            onClick={() => onRemove(f.key)}
            className="px-2 py-1.5 text-gray-400 hover:text-white hover:bg-red-500 transition-colors"
            title="إزالة الفلتر"
          >
            <X size={13} />
          </button>
        </div>
      ))}

      {/* Add filter button */}
      {available.length > 0 && (
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setOpen(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border-2 transition-all ${
              open
                ? 'bg-violet-500 border-violet-500 text-white'
                : 'border-dashed border-gray-300 text-gray-500 hover:border-violet-400 hover:text-violet-600 hover:bg-violet-50'
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
                  className="w-full text-right px-3 py-2.5 text-sm hover:bg-violet-50 hover:text-violet-700 transition-colors flex items-center justify-between gap-2"
                >
                  <span className="font-medium">{col.label}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                    col.isNumeric ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'
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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SalesSummaryPage() {
  const { fmt } = useCurrency()
  const fmtN = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 })

  const [preset,       setPreset]       = useState<Preset>('month')
  const [granularity,  setGranularity]  = useState<Granularity>('daily')
  const [customFrom,   setCustomFrom]   = useState('')
  const [customTo,     setCustomTo]     = useState('')
  const [hideZeroRows, setHideZeroRows] = useState(false)
  const [sortKey,      setSortKey]      = useState<AllColKey>('period')
  const [sortDir,      setSortDir]      = useState<SortDir>('asc')
  const [page,         setPage]         = useState(1)
  const [colPickerOpen, setColPickerOpen] = useState(false)

  // Smart filters
  const [filters, setFilters] = useState<FilterEntry[]>([])

  // Extract server-side cashierName filter
  const cashierFilter = filters.find(f => f.key === 'cashierName' as AllColKey)?.value ?? ''

  const ALL_COLS = useMemo(() => getAllCols(granularity), [granularity])
  const { visible: visibleCols, order: colOrder, displayCols, toggleCol, setOrder, reset: resetCols } =
    useColState(ALL_COLS, `salesSummary-${granularity}`)

  useEffect(() => {
    if (!ALL_COLS.some(c => c.key === sortKey)) setSortKey('period')
    // Reset custom date state when granularity changes so blank dates don't reach the API
    setPreset('month')
    setCustomFrom('')
    setCustomTo('')
  }, [granularity]) // eslint-disable-line react-hooks/exhaustive-deps

  // Clear filters that don't exist in current granularity columns
  useEffect(() => {
    const validKeys = new Set(ALL_COLS.map(c => c.key))
    setFilters(prev => prev.filter(f => validKeys.has(f.key)))
  }, [granularity, ALL_COLS])

  const { dateFrom, dateTo } = getDateRange(preset, customFrom, customTo)
  const prior = getPriorRange(dateFrom, dateTo)

  useEffect(() => setPage(1), [sortKey, sortDir, dateFrom, dateTo, hideZeroRows, filters])

  const { data: queryData, isLoading, refetch } = useQuery({
    queryKey: ['sales-summary', granularity, dateFrom, dateTo, cashierFilter, hideZeroRows],
    queryFn:  () => analyticsApi.getSalesSummary({
      granularity, dateFrom, dateTo, hideZeroRows, pageSize: 9999,
      ...(cashierFilter ? { cashierName: cashierFilter } : {}),
    }),
    staleTime: 2 * 60_000,
  })
  const rows = queryData?.data ?? []

  const { data: priorData } = useQuery({
    queryKey: ['sales-summary', granularity, prior.dateFrom, prior.dateTo],
    queryFn:  () => analyticsApi.getSalesSummary({ granularity, dateFrom: prior.dateFrom, dateTo: prior.dateTo, pageSize: 9999 }),
    staleTime: 5 * 60_000,
  })
  const priorRows = priorData?.data ?? []

  const totals      = useMemo(() => sumRows(rows),      [rows])
  const priorTotals = useMemo(() => sumRows(priorRows), [priorRows])

  const avgInvoice      = totals.invoiceCount      > 0 ? totals.netSales      / totals.invoiceCount      : 0
  const priorAvgInvoice = priorTotals.invoiceCount > 0 ? priorTotals.netSales / priorTotals.invoiceCount : 0
  const marginPct       = totals.netSales > 0 ? (totals.grossMargin / totals.netSales) * 100 : 0
  const priorMarginPct  = priorTotals.netSales > 0 ? (priorTotals.grossMargin / priorTotals.netSales) * 100 : 0
  const discountRate    = totals.salesBeforeDiscount > 0 ? (totals.totalDiscounts / totals.salesBeforeDiscount) * 100 : 0

  const bestRow  = rows.length ? rows.reduce((b, r) => r.netSales > b.netSales ? r : b, rows[0]) : null
  const worstRow = rows.length > 1 ? rows.reduce((w, r) => r.netSales < w.netSales ? r : w, rows[0]) : null

  // Apply client-side filters (hideZeroRows is now server-side via HAVING clause)
  const sortedRows = useMemo(() => {
    let result = [...rows]

    for (const f of filters) {
      if (!f.value) continue
      const col = ALL_COLS.find(c => c.key === f.key)
      if (!col) continue
      if (col.isNumeric) {
        const min = parseFloat(f.value)
        if (!isNaN(min)) result = result.filter(r => {
          const v = r[f.key]
          return typeof v === 'number' && v >= min
        })
      } else {
        const q = f.value.toLowerCase()
        result = result.filter(r => String(r[f.key] ?? '').toLowerCase().includes(q))
      }
    }

    return result.sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey]
      if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av
      return sortDir === 'asc'
        ? String(av ?? '').localeCompare(String(bv ?? ''))
        : String(bv ?? '').localeCompare(String(av ?? ''))
    })
  }, [rows, sortKey, sortDir, hideZeroRows, filters, ALL_COLS])

  const totalPages = Math.ceil(sortedRows.length / PAGE_SIZE)
  const pagedRows  = sortedRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function toggleSort(key: AllColKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  function addFilter(col: ColDef) {
    setFilters(prev => [...prev, { key: col.key, label: col.label, value: '', isNumeric: !!col.isNumeric, isDate: !!col.isDate }])
  }

  function removeFilter(key: AllColKey) {
    setFilters(prev => prev.filter(f => f.key !== key))
  }

  function updateFilterValue(key: AllColKey, value: string) {
    setFilters(prev => prev.map(f => f.key === key ? { ...f, value } : f))
  }

  function fmtCell(row: SalesSummaryRow, key: AllColKey): string {
    switch (key) {
      case 'period':              return row.period ?? '—'
      case 'monthStart':          return row.monthStart  ?? '—'
      case 'monthEnd':            return row.monthEnd    ?? '—'
      case 'weekStart':           return row.weekStart   ?? '—'
      case 'weekEnd':             return row.weekEnd     ?? '—'
      case 'year':                return row.year        != null ? String(row.year)        : '—'
      case 'monthNumber':         return row.monthNumber != null ? String(row.monthNumber) : '—'
      case 'weekNumber':          return row.weekNumber  != null ? String(row.weekNumber)  : '—'
      case 'totalSales':          return fmt(row.totalSales)
      case 'salesBeforeDiscount': return fmt(row.salesBeforeDiscount)
      case 'totalReturns':        return fmt(row.totalReturns)
      case 'netSales':            return fmt(row.netSales)
      case 'invoiceCount':        return fmtN(row.invoiceCount)
      case 'avgInvoice':          return fmt(row.avgInvoice)
      case 'totalDiscounts':      return fmt(row.totalDiscounts)
      case 'totalTax':            return fmt(row.totalTax)
      case 'cogs':                return fmt(row.cogs)
      case 'grossMargin':         return fmt(row.grossMargin)
      default:                    return '—'
    }
  }

  function fmtTotal(key: AllColKey): string {
    switch (key) {
      case 'period':
      case 'monthStart': case 'monthEnd':
      case 'weekStart':  case 'weekEnd':
      case 'year': case 'monthNumber': case 'weekNumber': return 'الإجمالي'
      case 'totalSales':          return fmt(totals.totalSales)
      case 'salesBeforeDiscount': return fmt(totals.salesBeforeDiscount)
      case 'totalReturns':        return fmt(totals.totalReturns)
      case 'netSales':            return fmt(totals.netSales)
      case 'invoiceCount':        return fmtN(totals.invoiceCount)
      case 'avgInvoice':          return fmt(avgInvoice)
      case 'totalDiscounts':      return fmt(totals.totalDiscounts)
      case 'totalTax':            return fmt(totals.totalTax)
      case 'cogs':                return fmt(totals.cogs)
      case 'grossMargin':         return fmt(totals.grossMargin)
      default:                    return '—'
    }
  }

  function handleExport() {
    const headers = displayCols.map(c => c.label)
    const rowData = sortedRows.map(r => displayCols.map(c => fmtCell(r, c.key as AllColKey)))
    rowData.push(displayCols.map(c => fmtTotal(c.key as AllColKey)))
    downloadCsv(`sales-summary-${dateFrom}-${dateTo}.csv`, headers, rowData)
  }

  const periodLabel = granularity === 'daily' ? 'يوم' : granularity === 'weekly' ? 'أسبوع' : 'شهر'

  function rowLabel(r: SalesSummaryRow) {
    if (granularity === 'weekly')  return r.weekStart ?? r.period
    if (granularity === 'monthly') return r.period
    return r.period.length > 7 ? r.period.slice(5) : r.period
  }

  const chartData = rows.map(r => ({
    name:          rowLabel(r),
    'صافي المبيعات': r.netSales,
    'هامش %':       totals.netSales > 0 ? Math.round((r.grossMargin / r.netSales) * 1000) / 10 : 0,
  }))

  return (
    <DomainShell
      icon={BarChart2} iconColor="text-violet-600" iconBg="bg-violet-50"
      title="تقرير المبيعات الشامل"
      subtitle="يومي · أسبوعي · شهري — صافي المبيعات، هامش الربح، تكلفة البضاعة، مقارنة بالفترة السابقة"
    >
    <div className="space-y-4 pb-8">

      {/* ── Filter bar ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 flex flex-wrap items-center gap-2">

        {/* Period presets */}
        <div className="flex bg-gray-50 rounded-xl p-0.5 gap-0.5 overflow-x-auto flex-shrink-0">
          {PRESETS.map(p => (
            <button key={p.key} onClick={() => setPreset(p.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                preset === p.key ? 'bg-white text-violet-700 shadow font-semibold' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {p.label}
            </button>
          ))}
        </div>

        <div className="w-px h-6 bg-gray-200 hidden sm:block" />

        {/* Granularity */}
        <div className="flex bg-gray-50 rounded-xl p-0.5 gap-0.5 flex-shrink-0">
          {GRANULARITIES.map(g => (
            <button key={g.key} onClick={() => setGranularity(g.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                granularity === g.key ? 'bg-white text-violet-700 shadow font-semibold' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {g.label}
            </button>
          ))}
        </div>

        {preset === 'custom' && (
          <>
            <div className="w-px h-6 bg-gray-200 hidden sm:block" />
            <div className="flex items-center gap-2">
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs bg-white" />
              <span className="text-gray-400 text-xs">←</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs bg-white" />
            </div>
          </>
        )}

        <div className="w-px h-6 bg-gray-200 hidden sm:block" />

        <button
          onClick={() => setHideZeroRows(v => !v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
            hideZeroRows ? 'bg-violet-50 border-violet-200 text-violet-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'
          }`}
        >
          <div className={`w-3 h-3 rounded border flex items-center justify-center ${hideZeroRows ? 'bg-violet-600 border-violet-600' : 'border-gray-400'}`}>
            {hideZeroRows && <Check size={8} className="text-white" strokeWidth={3} />}
          </div>
          إخفاء أيام الصفر
        </button>

        <div className="flex-1" />

        <span className="text-xs text-gray-400 hidden sm:block">
          {rows.length} {periodLabel} — مقارنةً بالفترة السابقة
        </span>
        <button onClick={() => refetch()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border border-gray-200 text-gray-600 hover:border-gray-300 transition-all">
          <RefreshCw size={12} /> تحديث
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-gray-100 animate-pulse rounded-2xl" />)}
        </div>
      ) : (
        <>
          {/* ── KPI cards ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="إجمالي المبيعات"  value={totals.totalSales}     prior={priorTotals.totalSales}     formatFn={fmt}  icon={TrendingUp}     accent="border-l-emerald-400" />
            <KpiCard label="صافي المبيعات"    value={totals.netSales}       prior={priorTotals.netSales}       formatFn={fmt}  icon={DollarSign}    accent="border-l-violet-400" />
            <KpiCard label="هامش الربح"       value={totals.grossMargin}    prior={priorTotals.grossMargin}    formatFn={fmt}  icon={Percent}       accent="border-l-violet-400" />
            <KpiCard label="هامش %"           value={marginPct}             prior={priorMarginPct}             formatFn={n => `${n.toFixed(1)}%`} icon={BarChart2} accent="border-l-blue-400" />
            <KpiCard label="عدد الفواتير"     value={totals.invoiceCount}   prior={priorTotals.invoiceCount}   formatFn={fmtN} icon={Receipt}       accent="border-l-indigo-400" />
            <KpiCard label="متوسط الفاتورة"   value={avgInvoice}            prior={priorAvgInvoice}            formatFn={fmt}  icon={ShoppingCart}  accent="border-l-cyan-400" />
            <KpiCard label="إجمالي الخصومات"  value={totals.totalDiscounts} prior={priorTotals.totalDiscounts} formatFn={fmt}  icon={TrendingDown}  accent="border-l-amber-400" />
            <KpiCard label="المرتجعات"        value={totals.totalReturns}   prior={priorTotals.totalReturns}   formatFn={fmt}  icon={ArrowDownRight} accent="border-l-red-400" />
          </div>

          {/* ── AI Insight strip ── */}
          {rows.length > 0 && (
            <div className="bg-gradient-to-r from-violet-50 to-blue-50 rounded-2xl p-4 border border-violet-100 flex flex-wrap items-center gap-x-6 gap-y-2">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-violet-600" />
                <span className="text-xs font-semibold text-violet-700">تحليل ذكي</span>
              </div>
              {bestRow && (
                <p className="text-xs text-gray-700">
                  <span className="font-semibold text-emerald-700">أفضل فترة:</span>{' '}
                  {rowLabel(bestRow)} — {fmt(bestRow.netSales)}
                </p>
              )}
              <p className="text-xs text-gray-700">
                <span className="font-semibold text-amber-700">معدل الخصم:</span>{' '}
                {discountRate.toFixed(1)}% من المبيعات
              </p>
              <p className="text-xs text-gray-700">
                <span className={`font-semibold ${marginPct >= 20 ? 'text-emerald-700' : marginPct >= 10 ? 'text-amber-700' : 'text-red-600'}`}>
                  هامش الربح: {marginPct.toFixed(1)}%
                </span>
                {' '}{marginPct >= 20 ? '— ممتاز' : marginPct >= 10 ? '— مقبول' : '— يحتاج مراجعة'}
              </p>
              <p className="text-xs text-gray-700">
                <span className="font-semibold text-gray-600">تكلفة البضاعة:</span>{' '}
                {fmt(totals.cogs)} ({totals.netSales > 0 ? ((totals.cogs / totals.netSales) * 100).toFixed(1) : 0}% من الصافي)
              </p>
            </div>
          )}

          {/* ── Detail table ── */}
          {rows.length > 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
              {/* Toolbar */}
              <div className="p-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-semibold text-gray-700">تفاصيل الفترة</h3>
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                    {sortedRows.length} {periodLabel}
                  </span>
                  {sortedRows.length < rows.length && (
                    <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium">
                      {rows.length - sortedRows.length} مخفية بالفلاتر
                    </span>
                  )}
                  <span className="text-xs text-gray-400">
                    صفحة {page} من {Math.max(1, totalPages)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={handleExport}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border border-gray-200 text-gray-600 hover:border-gray-300 transition-all">
                    <Download size={13} /> تنزيل CSV
                  </button>
                  <div className="relative">
                    <button onClick={() => setColPickerOpen(v => !v)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                        colPickerOpen ? 'bg-violet-50 border-violet-300 text-violet-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}>
                      <SlidersHorizontal size={13} />
                      الأعمدة
                      {visibleCols.size < ALL_COLS.length && (
                        <span className="bg-violet-600 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold">
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

              {/* ── Filter panel — directly above the table ── */}
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/60">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold text-gray-500">تصفية النتائج:</span>
                  {filters.filter(f => f.value).length > 0 && (
                    <span className="text-[10px] bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium">
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
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      {displayCols.map(col => (
                        <th key={col.key} onClick={() => toggleSort(col.key as AllColKey)}
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
                    {pagedRows.map((row, i) => {
                      const isBest  = bestRow?.period  === row.period
                      const isWorst = worstRow?.period === row.period
                      return (
                        <tr key={row.period}
                          className={`border-t border-gray-50 transition-colors hover:bg-violet-50/40 ${
                            isBest  ? 'bg-emerald-50' :
                            isWorst ? 'bg-red-50/40'  :
                            i % 2 === 1 ? 'bg-gray-50/30' : ''
                          }`}>
                          {displayCols.map(col => {
                            const key = col.key as AllColKey
                            const val = row[key]
                            return (
                              <td key={col.key}
                                className={`px-3 py-2.5 text-right whitespace-nowrap ${
                                  key === 'period' || key === 'monthStart' || key === 'monthEnd' ||
                                  key === 'weekStart' || key === 'weekEnd'
                                    ? 'font-medium text-gray-900' :
                                  key === 'year' || key === 'monthNumber' || key === 'weekNumber'
                                    ? 'text-gray-700' :
                                  typeof val === 'number' && val < 0 ? 'text-red-600 font-medium' :
                                  key === 'netSales' || key === 'grossMargin' ? 'font-bold text-gray-900' :
                                  typeof val === 'number' ? 'font-medium text-gray-700' :
                                  'text-gray-600'
                                }`}>
                                {fmtCell(row, key)}
                                {isBest && key === 'netSales' && (
                                  <span className="mr-1.5 text-[10px] bg-emerald-100 text-emerald-700 px-1 py-0.5 rounded font-bold">★</span>
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                    {/* Totals footer */}
                    {page === totalPages || totalPages <= 1 ? (
                      <tr className="border-t-2 border-violet-200 bg-violet-50/80 sticky bottom-0">
                        {displayCols.map((col, ci) => (
                          <td key={col.key}
                            className={`px-3 py-3 text-right text-sm whitespace-nowrap font-semibold ${
                              ci === 0 ? 'font-bold text-violet-800' :
                              col.key === 'netSales' || col.key === 'grossMargin' ? 'font-bold text-violet-900' :
                              'font-bold text-gray-700'
                            }`}>
                            {fmtTotal(col.key as AllColKey)}
                          </td>
                        ))}
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              <Pagination page={page} total={sortedRows.length} onChange={setPage} />
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400 shadow-sm">
              <BarChart2 size={36} className="mx-auto mb-3 opacity-20" />
              <p className="text-sm">لا توجد مبيعات في هذه الفترة</p>
            </div>
          )}

          {/* ── Trend chart — end of page ── */}
          {chartData.length > 1 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                <BarChart2 size={16} className="text-violet-600" />
                اتجاه المبيعات وهامش الربح
              </h3>
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={chartData} margin={{ top: 4, right: 32, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="left"  tickFormatter={n => `${(n / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="right" orientation="right" tickFormatter={n => `${n}%`} tick={{ fontSize: 11 }} domain={[0, 100]} />
                  <Tooltip formatter={(val: number, name: string) =>
                    name === 'هامش %' ? [`${Number(val).toFixed(1)}%`, name] : [fmt(Number(val)), name]
                  } />
                  <Legend />
                  <Bar  yAxisId="left"  dataKey="صافي المبيعات" fill="#6D28D9" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="هامش %" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
    </DomainShell>
  )
}

